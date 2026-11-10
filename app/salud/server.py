"""Servidor web local (solo biblioteca estándar de Python)."""
from __future__ import annotations

import argparse
import ipaddress
import json
import mimetypes
import os
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, unquote, urlencode, urlparse

from . import auth, core, mcp
from .api import ApiError, dispatch
from .db import APP_DIR, DEFAULT_DB, connect, now_local
from .importer import init_db
from .training import photo_dir

WEB_DIR = os.path.join(APP_DIR, "web")
LOCK = threading.Lock()
# Windows a veces asocia .js a text/plain en el registro: tipos fijados a mano.
MIME = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".json": "application/json"}
CONN = None
# Modo servidor (varias cuentas): directorio de datos con usuarios.json y una BD por persona.
MULTI = None
CTX = {}          # usuario → (conn, lock)
CTX_LOCK = threading.Lock()
RATE = auth.RateLimit()
CLI_LOCK = threading.Lock()  # redirect_stdout es global: un comando de CLI a la vez
COOKIE = "salud_s"

OAUTH_CSS = """
:root{color-scheme:light dark;--bg:#f4f1ea;--card:#fff;--fg:#1d2026;--mut:#6b7079;--line:#e6e2d8;--acc:#1f7a5c}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--card:#1b1e22;--fg:#eceef1;--mut:#9aa0a8;--line:#2b2f35;--acc:#3fb58a}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);
font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px 24px;max-width:430px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.06)}
.logos{display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:14px}
.logos img,.gen{width:52px;height:52px;border-radius:14px;display:grid;place-items:center;background:var(--bg);font-size:26px;object-fit:cover}
.dots{color:var(--mut);font-size:22px}h1{font-size:20px;line-height:1.3;margin:0 0 6px;text-align:center;font-weight:600}
.who{color:var(--mut);text-align:center;margin:0 0 16px;font-size:14px}.who a{color:var(--mut)}
ul{margin:0 0 14px;padding:14px 16px 14px 34px;background:var(--bg);border-radius:14px}li{margin:3px 0}
.small{color:var(--mut);font-size:13px;margin:0 0 18px}.warn{background:#fff4d6;color:#7a5600;border-radius:12px;padding:8px 12px;font-size:14px}
@media (prefers-color-scheme:dark){.warn{background:#3a3220;color:#f0d68a}}
.btns{display:flex;gap:10px}.b{flex:1;text-align:center;padding:12px;border-radius:12px;border:1px solid var(--line);color:var(--fg);text-decoration:none;font-weight:600}
.b.p{background:var(--acc);border-color:var(--acc);color:#fff}
"""


def user_ctx(username):
    with CTX_LOCK:
        if username not in CTX:
            conn = connect(auth.user_db(MULTI, username))
            core.ensure_defaults(conn)
            CTX[username] = (conn, threading.Lock())
        return CTX[username]


def _auto_backup(reason, conn=None):
    conn = conn or CONN
    age = core.last_backup_age_hours(conn)
    if age is None or age > 20:
        try:
            core.backup(conn, reason)
        except Exception as e:  # nunca bloquear el uso por una copia
            print("Aviso: no se pudo crear copia de seguridad:", e, file=sys.stderr)


def _hevy_loop():
    """Sincroniza Hevy al arrancar y cada 20 minutos si hay API key."""
    import time
    from . import hevy
    time.sleep(3)
    while True:
        ctxs = [(u,) + user_ctx(u) for u in auth.list_users(MULTI)] if MULTI else [("", CONN, LOCK)]
        for who, conn, lock in ctxs:
            try:
                with lock:
                    if hevy.api_key(conn):
                        r = hevy.sync(conn)
                        if r["created"] or r["updated"] or r["deleted"]:
                            print("Hevy %s: %d nuevos, %d actualizados, %d eliminados" % (who, r["created"], r["updated"], r["deleted"]), flush=True)
            except Exception as e:
                print("Hevy %s: %s" % (who, e), flush=True)
        time.sleep(20 * 60)


class Handler(BaseHTTPRequestHandler):
    server_version = "Salud/1.0"

    def log_message(self, fmt, *args):
        if os.environ.get("SALUD_DEBUG"):
            super().log_message(fmt, *args)

    def _send(self, status, payload, ctype="application/json; charset=utf-8", extra_headers=None):
        data = payload if isinstance(payload, (bytes, bytearray)) else json.dumps(
            payload, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        if "Cache-Control" not in (extra_headers or {}):
            self.send_header("Cache-Control", "no-store")
        for k, v in (extra_headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    # ---- sesión (solo en modo servidor)
    def _cookie_token(self):
        for part in (self.headers.get("Cookie") or "").split(";"):
            k, _, v = part.strip().partition("=")
            if k == COOKIE:
                return v
        return None

    def _client_ip(self):
        ip = self.client_address[0]
        if ip in ("127.0.0.1", "::1"):  # detrás de nginx
            ip = (self.headers.get("X-Forwarded-For") or ip).split(",")[0].strip()
        return ip

    def _ctx(self):
        """(conn, lock, usuario) de la petición, o None si hace falta iniciar sesión."""
        if not MULTI:
            return CONN, LOCK, None
        user = auth.session_user(MULTI, self._cookie_token())
        bearer = (self.headers.get("Authorization") or "")
        if not user and bearer.startswith("Bearer "):
            user = auth.token_user(MULTI, bearer[7:].strip(), self.headers.get("X-Salud-Agent"))
        if not user:
            return None
        conn, lock = user_ctx(user)
        return conn, lock, user

    def _auth_api(self, path, body):
        if path == "/api/login":
            ip = self._client_ip()
            if RATE.blocked(ip):
                return self._send(429, {"error": "Demasiados intentos. Espera 15 minutos."})
            user = (body.get("usuario") or "").strip().lower()
            if not auth.verify(MULTI, user, body.get("password") or ""):
                RATE.fail(ip)
                return self._send(401, {"error": "Usuario o contraseña incorrectos"})
            token = auth.new_session(MULTI, user)
            secure = "; Secure" if (self.headers.get("X-Forwarded-Proto") == "https") else ""
            return self._send(200, {"ok": True, "usuario": user}, extra_headers={
                "Set-Cookie": "%s=%s; Path=/; HttpOnly; SameSite=Lax; Max-Age=%d%s" % (COOKIE, token, auth.SESSION_DAYS * 86400, secure)})
        if path == "/api/logout":
            auth.end_session(MULTI, self._cookie_token())
            return self._send(200, {"ok": True}, extra_headers={"Set-Cookie": "%s=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" % COOKIE})
        return False

    @staticmethod
    def _agent_info(user):
        ts = auth.list_tokens(MULTI, user)
        used = [t for t in ts if t["used"]]
        return {"tokens": ts, "connected": bool(used), "agents": used}

    CLI_BLOCKED = {"niveles-descargar", "usuario-crear", "usuario-password", "usuario-token", "usuarios", "foto", "init", "importar-hevy"}

    @classmethod
    def run_cli(cls, args, lock, user):
        """Ejecuta un comando de la CLI sobre la BD del usuario (lo usan /api/cli y el MCP). → (código, stdout, stderr)"""
        import contextlib
        import io
        from . import cli
        if args[0] in cls.CLI_BLOCKED or any(x in ("--db", "--usuario", "--datos", "--archivo") or x.startswith(("--db=", "--archivo=", "--usuario=", "--datos=")) for x in args):
            return 2, "", "Comando no permitido por HTTP"
        db = auth.user_db(MULTI, user) if MULTI else None
        out, err = io.StringIO(), io.StringIO()
        code = 0
        with CLI_LOCK, lock, contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                cli.main((["--db", db] if db else []) + args)
            except SystemExit as e:
                code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
                if isinstance(e.code, str):
                    err.write(e.code)
            except Exception as e:  # pragma: no cover
                code = 1
                err.write("Error: %s" % e)
        return code, out.getvalue(), err.getvalue()

    def _cli(self, body, lock, user):
        """Ejecuta un comando de la CLI sobre la BD del usuario de la sesión/token (así Claude opera por HTTPS)."""
        args = body.get("args")
        if not isinstance(args, list) or not args or not all(isinstance(x, str) for x in args):
            return self._send(400, {"error": "Formato: {\"args\": [\"hoy\"]}"})
        code, out, err = self.run_cli(args, lock, user)
        if code == 2 and err == "Comando no permitido por HTTP":
            return self._send(403, {"error": err})
        return self._send(200, {"code": code, "stdout": out, "stderr": err})

    def _api(self, method):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        body = {}
        if method in ("POST", "PUT", "DELETE"):
            n = int(self.headers.get("Content-Length") or 0)
            if n:
                try:
                    body = json.loads(self.rfile.read(n).decode("utf-8"))
                except ValueError:
                    return self._send(400, {"error": "JSON no válido"})
        if MULTI and u.path in ("/api/login", "/api/logout") and method == "POST":
            return self._auth_api(u.path, body)
        if MULTI and u.path == "/api/cuentas" and method == "GET":
            return self._send(200, [{"usuario": k, "nombre": v.get("name") or k} for k, v in auth.list_users(MULTI).items()])
        if MULTI and u.path == "/api/me":
            ctx = self._ctx()
            if not ctx:
                return self._send(401, {"error": "Sin sesión"})
            info = auth.list_users(MULTI).get(ctx[2], {})
            return self._send(200, {"usuario": ctx[2], "nombre": info.get("name"), "agente": self._agent_info(ctx[2])})
        if MULTI and u.path.startswith("/api/token"):
            # Tokens de agentes (Claude, Codex…): solo con la sesión de la web, nunca con otro token.
            user = auth.session_user(MULTI, self._cookie_token())
            if not user:
                return self._send(401, {"error": "Inicia sesión en la web para gestionar tus agentes", "login": True})
            if method == "GET" and u.path == "/api/token":
                return self._send(200, self._agent_info(user))
            if method == "POST" and u.path == "/api/token":
                kind = str(body.get("kind") or "")[:30] or None
                try:
                    return self._send(200, {"token": auth.new_api_token(MULTI, user, kind), "usuario": user})
                except auth.AuthError as e:
                    return self._send(409, {"error": str(e)})
            if method == "DELETE":
                tid = u.path[len("/api/token/"):] if u.path.startswith("/api/token/") else None
                auth.revoke_api_token(MULTI, user, tid)
                return self._send(200, {"ok": True})
        ctx = self._ctx()
        if not ctx:
            return self._send(401, {"error": "Inicia sesión", "login": True})
        conn, lock, _user = ctx
        if u.path.startswith("/api/strength/") and method == "GET":
            # Tablas de Strength Level bajo demanda (caché compartida en el directorio de datos)
            from . import strengthlevel as SL
            datadir = MULTI or os.path.dirname(os.path.abspath(conn.execute("PRAGMA database_list").fetchone()[2] or DEFAULT_DB))
            slug = u.path[len("/api/strength/"):]
            if slug == "adivinar":  # ?nombre=… → busca su página y, si la encuentra, la guarda en los ajustes del ejercicio
                from . import training as T
                name = q.get("nombre", "")
                with lock:
                    cur = T.exercise_settings(conn).get(T._norm_ex(name)) or {}
                if cur.get("sl_slug"):
                    return self._send(200, {"slug": cur["sl_slug"], "nuevo": False})
                d = SL.guess(datadir, name)
                if d:
                    with lock:
                        T.set_exercise_settings(conn, {"name": name, "sl_slug": d["slug"]}, "auto")
                return self._send(200, {"slug": d["slug"] if d else None, "nuevo": bool(d)})
            try:
                if slug == "":
                    return self._send(200, SL.index(datadir))
                if slug == "varias":
                    return self._send(200, SL.bulk(datadir, [x for x in q.get("slugs", "").split(",") if x]))
                return self._send(200, SL.get(datadir, slug))
            except SL.SLError as e:
                return self._send(404, {"error": str(e)})
        if u.path.startswith("/api/levels/") and method == "GET":
            # Estándares de cardio (Swimming/Running/Rowing/Cycling Level) desde la caché del servidor
            from . import xlevel as XL
            datadir = MULTI or os.path.dirname(os.path.abspath(conn.execute("PRAGMA database_list").fetchone()[2] or DEFAULT_DB))
            rest = [x for x in u.path[len("/api/levels/"):].split("/") if x]
            try:
                if not rest:
                    return self._send(200, XL.index(datadir))
                if len(rest) == 2:
                    return self._send(200, XL.get(datadir, rest[0], rest[1]))
            except Exception as e:
                return self._send(404, {"error": str(e)})
            return self._send(404, {"error": "Ruta no encontrada"})
        if u.path == "/api/cli" and method == "POST":
            return self._cli(body, lock, _user)
        if u.path == "/api/export.zip":
            with lock:
                data = core.export_zip_bytes(conn)
            fn = "salud_export_%s.zip" % now_local().strftime("%Y%m%d-%H%M%S")
            return self._send(200, data, "application/zip", {"Content-Disposition": 'attachment; filename="%s"' % fn})
        try:
            with lock:
                if method != "GET":
                    _auto_backup("auto", conn)
                res = dispatch(conn, method, u.path, q, body, "web")
            self._send(200, res)
        except ApiError as e:
            self._send(e.status, dict({"error": e.message}, **e.extra))
        except Exception as e:  # pragma: no cover
            import traceback
            traceback.print_exc()
            self._send(500, {"error": "Error interno: %s" % e})

    # ------------------------------------------------------------------ MCP + OAuth 2.1
    CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version, X-Salud-Agent",
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id"}

    def _base(self):
        host = self.headers.get("X-Forwarded-Host") or self.headers.get("Host") or "localhost"
        proto = self.headers.get("X-Forwarded-Proto") or "http"
        return "%s://%s" % (proto, host.split(",")[0].strip())

    def _json(self, status, payload, extra=None):
        return self._send(status, payload, extra_headers=dict(self.CORS, **(extra or {})))

    def _body_raw(self, limit=8 * 1024 * 1024):
        n = int(self.headers.get("Content-Length") or 0)
        if n > limit:
            raise ValueError("Petición demasiado grande")
        return self.rfile.read(n) if n else b""

    def _well_known(self, path):
        base = self._base()
        if path.startswith("/.well-known/oauth-protected-resource"):
            return self._json(200, {"resource": base + "/mcp", "authorization_servers": [base], "scopes_supported": ["salud"],
                                    "bearer_methods_supported": ["header"], "resource_name": "Salud"})
        return self._json(200, {
            "issuer": base, "authorization_endpoint": base + "/oauth/authorize", "token_endpoint": base + "/oauth/token",
            "registration_endpoint": base + "/oauth/register", "scopes_supported": ["salud"], "response_types_supported": ["code"],
            "response_modes_supported": ["query"], "grant_types_supported": ["authorization_code", "refresh_token"],
            "code_challenge_methods_supported": ["S256"],
            "token_endpoint_auth_methods_supported": ["none", "client_secret_post", "client_secret_basic"],
            "authorization_response_iss_parameter_supported": True, "service_documentation": base + "/"})

    def _oauth_register(self):
        try:
            meta = json.loads(self._body_raw(64 * 1024).decode("utf-8") or "{}")
            return self._json(201, auth.register_client(MULTI, meta))
        except (ValueError, auth.AuthError) as e:
            return self._json(400, {"error": "invalid_client_metadata", "error_description": str(e)})

    def _page(self, status, title, body):
        html = ("<!doctype html><html lang=es><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
                "<title>%s · Salud</title><style>%s</style></head><body><main class=card>%s</main></body></html>") % (title, OAUTH_CSS, body)
        return self._send(status, html.encode("utf-8"), "text/html; charset=utf-8")

    @staticmethod
    def _esc(x):
        import html
        return html.escape(str(x or ""), quote=True)

    def _csrf(self, q):
        import hashlib
        import hmac
        key = hashlib.sha256((self._cookie_token() or "").encode()).digest()
        msg = "|".join(q.get(k, "") for k in ("client_id", "redirect_uri", "code_challenge", "state")).encode()
        return hmac.new(key, msg, hashlib.sha256).hexdigest()[:32]

    def _oauth_authorize(self, q):
        import hmac
        client = auth.get_client(MULTI, q.get("client_id"))
        if not client:
            return self._page(400, "Error", "<h1>Conexión no válida</h1><p>Este agente no está registrado. Vuelve a añadir el conector desde tu agente.</p>")
        ru = q.get("redirect_uri") or (client["redirect_uris"][0] if len(client["redirect_uris"]) == 1 else "")
        if ru not in client["redirect_uris"]:
            return self._page(400, "Error", "<h1>Conexión no válida</h1><p>La dirección de vuelta no coincide con la registrada.</p>")

        def back(**params):
            if q.get("state"):
                params["state"] = q["state"]
            params["iss"] = self._base()
            self.send_response(302)
            self.send_header("Location", ru + ("&" if "?" in ru else "?") + urlencode(params))
            self.send_header("Content-Length", "0")
            self.end_headers()

        if q.get("response_type") != "code":
            return back(error="unsupported_response_type")
        if not q.get("code_challenge") or q.get("code_challenge_method", "plain") != "S256":
            return back(error="invalid_request", error_description="PKCE S256 obligatorio")
        user = auth.session_user(MULTI, self._cookie_token())
        if not user:
            self.send_response(302)
            self.send_header("Location", "/login?next=" + quote(self.path, safe=""))
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if q.get("denegar"):
            return back(error="access_denied", error_description="La persona no ha dado permiso")
        if q.get("aprobar") and hmac.compare_digest(q["aprobar"], self._csrf(q)):
            return back(code=auth.new_code(user, client["client_id"], ru, q["code_challenge"], q.get("scope")))
        kind = auth.kind_of(client["name"])
        logo = {"claude": "claude.png", "claude-code": "claude-code.png", "chatgpt": "chatgpt.png", "codex": "codex.svg", "antigravity": "antigravity.svg"}.get(kind)
        info = auth.list_users(MULTI).get(user, {})
        same = [t for t in auth.list_tokens(MULTI, user) if t.get("used") and kind != "otro" and (t.get("kind") == kind or t.get("agent") == kind)]
        qs = {k: v for k, v in q.items() if k not in ("aprobar", "denegar")}
        ok = "/oauth/authorize?" + urlencode(dict(qs, aprobar=self._csrf(q)))
        no = "/oauth/authorize?" + urlencode(dict(qs, denegar="1"))
        host = urlparse(ru).netloc or urlparse(ru).scheme
        body = (
            "<div class=logos>%s<span class=dots>⋯</span><img src='/logos/salud.svg' alt=''></div>"
            "<h1><b>%s</b> quiere conectarse a tu cuenta de Salud</h1>"
            "<p class=who>Sesión iniciada como <b>%s</b> (@%s) · <a href='/login?cambiar=1&next=%s'>no soy yo</a></p>"
            "<ul><li>Ver y apuntar tus comidas, peso, pasos y entrenos</li><li>Leer y actualizar tus objetivos y tus notas para el agente</li>"
            "<li>Solo tu cuenta: nunca ve tu contraseña ni las de otras personas</li></ul>"
            "%s<p class=small>Podrás desconectarlo cuando quieras: menú de tu nombre → Agentes. Volverás a <b>%s</b>.</p>"
            "<div class=btns><a class='b' href='%s'>Cancelar</a><a class='b p' href='%s'>Permitir</a></div>") % (
            "<img src='/logos/%s' alt=''>" % logo if logo else "<span class=gen>✦</span>", self._esc(client["name"]),
            self._esc(info.get("name") or user), self._esc(user), quote(self.path, safe=""),
            "<p class=warn>Ya tenías conectado este agente: la conexión nueva sustituirá a la anterior.</p>" if same else "",
            self._esc(host), self._esc(no), self._esc(ok))
        return self._page(200, "Conectar agente", body)

    def _oauth_token(self):
        import base64
        try:
            raw = self._body_raw(64 * 1024).decode("utf-8")
        except ValueError as e:
            return self._json(400, {"error": "invalid_request", "error_description": str(e)})
        if (self.headers.get("Content-Type") or "").startswith("application/json"):
            try:
                b = {k: str(v) for k, v in json.loads(raw or "{}").items()}
            except ValueError:
                return self._json(400, {"error": "invalid_request"})
        else:
            b = {k: v[0] for k, v in parse_qs(raw).items()}
        cid, secret = b.get("client_id"), b.get("client_secret")
        ah = self.headers.get("Authorization") or ""
        if ah.startswith("Basic "):
            try:
                u_, _, p_ = base64.b64decode(ah[6:]).decode().partition(":")
                cid, secret = unquote(u_), unquote(p_)
            except ValueError:
                pass
        client = auth.get_client(MULTI, cid)
        if not client or not auth.client_auth_ok(client, secret):
            return self._json(401, {"error": "invalid_client"})
        gt = b.get("grant_type")
        if gt == "authorization_code":
            c = auth.take_code(b.get("code"))
            if not c or c["client_id"] != cid or (b.get("redirect_uri") and b["redirect_uri"] != c["redirect_uri"]) \
                    or not auth.pkce_ok(b.get("code_verifier"), c["challenge"]):
                return self._json(400, {"error": "invalid_grant"})
            return self._json(200, auth.issue_oauth(MULTI, c["user"], client))
        if gt == "refresh_token":
            r = auth.refresh_oauth(MULTI, b.get("refresh_token"), cid)
            return self._json(200, r) if r else self._json(400, {"error": "invalid_grant"})
        return self._json(400, {"error": "unsupported_grant_type"})

    def _mcp(self, method):
        bearer = self.headers.get("Authorization") or ""
        user = auth.token_user(MULTI, bearer[7:].strip(), self.headers.get("X-Salud-Agent")) if bearer.startswith("Bearer ") else None
        if not user:
            return self._json(401, {"error": "invalid_token", "error_description": "Conecta el agente: inicia sesión en Salud"},
                              {"WWW-Authenticate": 'Bearer realm="salud", resource_metadata="%s/.well-known/oauth-protected-resource"' % self._base()})
        if method != "POST":
            return self._json(405, {"error": "Solo POST (Streamable HTTP sin SSE)"}, {"Allow": "POST"})
        try:
            msg = json.loads(self._body_raw().decode("utf-8"))
        except ValueError:
            return self._json(400, {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "JSON no válido"}})
        _conn, lock = user_ctx(user)
        run = lambda argv: self.run_cli(argv, lock, user)  # noqa: E731
        if isinstance(msg, list):
            res = [r for r in (mcp.handle(m, run) for m in msg) if r is not None]
        else:
            res = mcp.handle(msg, run)
        if not res:
            self.send_response(202)
            for k, v in self.CORS.items():
                self.send_header(k, v)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        return self._json(200, res)

    def _oauth_routes(self, method):
        """Rutas públicas del conector MCP. Devuelve True si la ha atendido."""
        if not MULTI:
            return False
        u = urlparse(self.path)
        if method == "OPTIONS" and (u.path.startswith(("/.well-known/", "/oauth/", "/mcp"))):
            self.send_response(204)
            for k, v in self.CORS.items():
                self.send_header(k, v)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return True
        if method == "GET" and (u.path.startswith(("/.well-known/oauth-", "/.well-known/openid-configuration"))):
            self._well_known(u.path)
            return True
        if u.path == "/oauth/register" and method == "POST":
            self._oauth_register()
            return True
        if u.path == "/oauth/authorize" and method == "GET":
            self._oauth_authorize({k: v[0] for k, v in parse_qs(u.query).items()})
            return True
        if u.path == "/oauth/token" and method == "POST":
            self._oauth_token()
            return True
        if u.path in ("/mcp", "/mcp/"):
            self._mcp(method)
            return True
        return False

    def _allowed(self):
        """Modo local: solo este ordenador y la red local. Modo servidor: lo protege el inicio de sesión."""
        if MULTI:
            return True
        try:
            ip = ipaddress.ip_address(self.client_address[0])
            if getattr(ip, "ipv4_mapped", None):
                ip = ip.ipv4_mapped
            ok = ip.is_loopback or ip.is_private or ip.is_link_local
        except ValueError:
            ok = False
        if not ok:
            self._send(403, {"error": "Acceso solo desde la red local"})
        return ok

    def do_OPTIONS(self):
        if not self._oauth_routes("OPTIONS"):
            self._send(404, {"error": "Ruta no encontrada"})

    def do_GET(self):
        if not self._allowed() or self._oauth_routes("GET"):
            return
        if self.path.startswith("/api/"):
            return self._api("GET")
        path = unquote(urlparse(self.path).path)
        public = path in ("/login", "/login.html", "/login.css", "/login.js", "/styles.css") or path.startswith("/logos/")
        ctx = self._ctx()
        if MULTI and not ctx and not public:
            self.send_response(302)
            self.send_header("Location", "/login")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if path == "/login":
            path = "/login.html"
        if path.startswith("/fotos/"):
            pdir = photo_dir(ctx[0])
            fp = os.path.normpath(os.path.join(pdir, path[len("/fotos/"):]))
            if not fp.startswith(pdir) or not os.path.isfile(fp):
                return self._send(404, {"error": "Foto no encontrada"})
            with open(fp, "rb") as f:
                data = f.read()
            return self._send(200, data, MIME.get(os.path.splitext(fp)[1].lower(), "application/octet-stream"),
                              {"Cache-Control": "max-age=31536000, immutable"})
        if path in ("/", ""):
            path = "/index.html"
        fp = os.path.normpath(os.path.join(WEB_DIR, path.lstrip("/")))
        if not fp.startswith(WEB_DIR) or not os.path.isfile(fp):
            fp = os.path.join(WEB_DIR, "index.html")
        with open(fp, "rb") as f:
            data = f.read()
        ext = os.path.splitext(fp)[1].lower()
        ctype = MIME.get(ext) or mimetypes.guess_type(fp)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith("javascript"):
            ctype += "; charset=utf-8"
        self._send(200, data, ctype)

    def do_POST(self):
        if self._allowed() and not self._oauth_routes("POST"):
            self._api("POST")

    def do_PUT(self):
        if self._allowed():
            self._api("PUT")

    def do_DELETE(self):
        if self._allowed() and not self._oauth_routes("DELETE"):
            self._api("DELETE")


def main(argv=None):
    global CONN, MULTI
    ap = argparse.ArgumentParser(description="Servidor local de Salud")
    ap.add_argument("--host", default="0.0.0.0", help="0.0.0.0 = ordenador + móvil en la misma wifi; 127.0.0.1 = solo este ordenador")
    ap.add_argument("--port", type=int, default=47823)
    ap.add_argument("--db", default=None)
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--multiusuario", metavar="DIR_DATOS",
                    help="Modo servidor con cuentas: una base de datos por usuario dentro de DIR_DATOS (ver salud/auth.py)")
    a = ap.parse_args(argv)
    if a.multiusuario:
        MULTI = os.path.abspath(a.multiusuario)
        users = auth.list_users(MULTI)
        if not users:
            print("No hay cuentas. Crea una con: python3 app/salud_cli.py usuario-crear <usuario> --datos %s" % MULTI)
            return
        for u in users:
            conn, _l = user_ctx(u)
            _auto_backup("inicio", conn)
        print("Salud (servidor) en http://%s:%d · cuentas: %s" % (a.host, a.port, ", ".join(users)), flush=True)
        srv = ThreadingHTTPServer((a.host, a.port), Handler)
        threading.Thread(target=_hevy_loop, daemon=True).start()
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            srv.server_close()
        return
    CONN = connect(a.db)
    n = init_db(CONN)
    if n:
        print("Catálogo importado: %d alimentos" % n)
    _auto_backup("inicio")
    url = "http://%s:%d" % ("localhost" if a.host in ("127.0.0.1", "0.0.0.0") else a.host, a.port)
    try:
        srv = ThreadingHTTPServer((a.host, a.port), Handler)
    except OSError:
        print("El puerto %d ya está en uso: probablemente Salud ya está en marcha. Abriendo %s" % (a.port, url))
        if not a.no_browser:
            webbrowser.open(url)
        return
    if a.host == "0.0.0.0":
        import socket
        try:
            s_ = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s_.connect(("10.255.255.255", 1))
            print("Desde el móvil (misma wifi): http://%s:%d" % (s_.getsockname()[0], a.port), flush=True)
            s_.close()
        except OSError:
            pass
    print("Salud en marcha: %s  (Ctrl+C para detener)" % url, flush=True)
    if a.host == "0.0.0.0":
        print("Acceso permitido solo desde este ordenador y tu red local. Si Windows pregunta, permite «Redes privadas».", flush=True)
    if not a.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    threading.Thread(target=_hevy_loop, daemon=True).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
        CONN.close()


if __name__ == "__main__":
    main()
