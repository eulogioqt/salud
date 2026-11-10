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
from urllib.parse import parse_qs, unquote, urlparse

from . import auth, core
from .api import ApiError, dispatch
from .db import APP_DIR, connect, now_local
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

    CLI_BLOCKED = {"usuario-crear", "usuario-password", "usuario-token", "usuarios", "foto", "init", "importar-hevy"}

    def _cli(self, body, lock, user):
        """Ejecuta un comando de la CLI sobre la BD del usuario de la sesión/token (así Claude opera por HTTPS)."""
        import contextlib
        import io
        from . import cli
        args = body.get("args")
        if not isinstance(args, list) or not args or not all(isinstance(x, str) for x in args):
            return self._send(400, {"error": "Formato: {\"args\": [\"hoy\"]}"})
        if args[0] in self.CLI_BLOCKED or any(x in ("--db", "--usuario", "--datos", "--archivo") or x.startswith("--db=") for x in args):
            return self._send(403, {"error": "Comando no permitido por HTTP"})
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
        return self._send(200, {"code": code, "stdout": out.getvalue(), "stderr": err.getvalue()})

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
                return self._send(200, {"token": auth.new_api_token(MULTI, user, kind), "usuario": user})
            if method == "DELETE":
                tid = u.path[len("/api/token/"):] if u.path.startswith("/api/token/") else None
                auth.revoke_api_token(MULTI, user, tid)
                return self._send(200, {"ok": True})
        ctx = self._ctx()
        if not ctx:
            return self._send(401, {"error": "Inicia sesión", "login": True})
        conn, lock, _user = ctx
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

    def do_GET(self):
        if not self._allowed():
            return
        if self.path.startswith("/api/"):
            return self._api("GET")
        path = unquote(urlparse(self.path).path)
        public = path in ("/login", "/login.html", "/login.css", "/login.js", "/styles.css")
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
        if self._allowed():
            self._api("POST")

    def do_PUT(self):
        if self._allowed():
            self._api("PUT")

    def do_DELETE(self):
        if self._allowed():
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
