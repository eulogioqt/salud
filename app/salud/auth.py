"""Cuentas y sesiones para el modo servidor (varias personas, cada una con su propia base de datos).

Estructura en el directorio de datos (p. ej. /var/lib/salud):
    usuarios.json                 cuentas (contraseñas con PBKDF2-SHA256, nunca en claro)
    sesiones.json                 sesiones abiertas (se guarda el hash del token, no el token)
    usuarios/<usuario>/salud.db   base de datos de cada persona (+ fotos/ y backups/ al lado)

Solo biblioteca estándar.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time

ITER = 310_000
SESSION_DAYS = 90
_LOCK = threading.Lock()
USER_RX = re.compile(r"^[a-z][a-z0-9_-]{1,31}$")


class AuthError(Exception):
    pass


def _read(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def _write(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def users_path(base):
    return os.path.join(base, "usuarios.json")


def sessions_path(base):
    return os.path.join(base, "sesiones.json")


def user_dir(base, username):
    if not USER_RX.match(username or ""):
        raise AuthError("Usuario no válido")
    return os.path.join(base, "usuarios", username)


def user_db(base, username):
    return os.path.join(user_dir(base, username), "salud.db")


def list_users(base):
    return _read(users_path(base), {})


def _hash(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), ITER).hex()


def set_password(base, username, password, display=None):
    if len(password or "") < 8:
        raise AuthError("La contraseña debe tener al menos 8 caracteres")
    user_dir(base, username)  # valida el nombre
    with _LOCK:
        users = list_users(base)
        salt = secrets.token_hex(16)
        u = users.get(username, {})
        u.update({"salt": salt, "hash": _hash(password, salt), "iter": ITER,
                  "name": display or u.get("name") or username.capitalize()})
        users[username] = u
        os.makedirs(base, exist_ok=True)
        _write(users_path(base), users)
        # al cambiar la contraseña se cierran sus sesiones
        sess = _read(sessions_path(base), {})
        _write(sessions_path(base), {k: v for k, v in sess.items() if v.get("user") != username})
    os.makedirs(user_dir(base, username), exist_ok=True)
    return u


def verify(base, username, password):
    u = list_users(base).get((username or "").strip().lower())
    if not u:
        _hash(password or "x", "00" * 16)  # mismo coste para no revelar si el usuario existe
        return False
    return hmac.compare_digest(_hash(password or "", u["salt"]), u["hash"])


def new_session(base, username):
    token = secrets.token_urlsafe(32)
    with _LOCK:
        sess = _read(sessions_path(base), {})
        now = time.time()
        sess = {k: v for k, v in sess.items() if v.get("exp", 0) > now}
        sess[hashlib.sha256(token.encode()).hexdigest()] = {"user": username, "exp": now + SESSION_DAYS * 86400}
        _write(sessions_path(base), sess)
    return token


def session_user(base, token):
    if not token:
        return None
    s = _read(sessions_path(base), {}).get(hashlib.sha256(token.encode()).hexdigest())
    if not s or s.get("exp", 0) < time.time():
        return None
    return s["user"] if s["user"] in list_users(base) else None


def end_session(base, token):
    if not token:
        return
    with _LOCK:
        sess = _read(sessions_path(base), {})
        sess.pop(hashlib.sha256(token.encode()).hexdigest(), None)
        _write(sessions_path(base), sess)


# ---- Tokens de agentes: uno por conexión (Claude, Codex…), cada uno con su nombre declarado y su último uso.
AGENT_RX = re.compile(r"[^a-z0-9 ._-]")


def _tokens(u):
    """Lista de tokens de la cuenta (convierte el formato antiguo de un solo token)."""
    ts = u.setdefault("tokens", [])
    if u.get("api_token"):
        ts.append({"id": secrets.token_hex(4), "hash": u.pop("api_token"), "kind": None, "agent": None,
                   "created": u.pop("api_token_at", None), "created_ts": u.pop("api_token_at_ts", 0),
                   "used": u.pop("api_token_used", None), "used_ts": u.pop("api_token_used_ts", 0)})
    for k in ("api_token", "api_token_at", "api_token_at_ts", "api_token_used", "api_token_used_ts"):
        u.pop(k, None)
    return ts


def list_tokens(base, username):
    u = list_users(base).get(username) or {}
    return [{k: t.get(k) for k in ("id", "kind", "agent", "created", "used", "via")} for t in _tokens(dict(u))]


def new_api_token(base, username, kind=None):
    """Token personal para un agente: cabecera «Authorization: Bearer <token>». Se guarda solo su hash."""
    token = "sal_" + secrets.token_urlsafe(32)
    with _LOCK:
        users = list_users(base)
        if username not in users:
            raise AuthError("No existe la cuenta")
        ts = _tokens(users[username])
        ts[:] = [t for t in ts if t.get("used") or time.time() - t.get("created_ts", 0) < 86400]  # sin usar en 24 h: fuera
        if kind == "pasos":  # pasos automáticos del móvil: un solo token, el nuevo sustituye al anterior
            ts[:] = [t for t in ts if t.get("kind") != "pasos"]
        elif kind and kind != "otro":  # un agente de cada tipo: si ya hay uno conectado hay que desconectarlo antes
            if any(t.get("used") and (t.get("kind") == kind or t.get("agent") == kind) for t in ts):
                raise AuthError("Ya tienes ese agente conectado: desconéctalo antes de conectar otro")
            ts[:] = [t for t in ts if t.get("kind") != kind]  # los generados y sin usar se sustituyen
        ts.append({"id": secrets.token_hex(4), "hash": hashlib.sha256(token.encode()).hexdigest(), "kind": kind, "agent": None,
                   "created": time.strftime("%Y-%m-%d %H:%M"), "created_ts": time.time(), "used": None, "used_ts": 0})
        _write(users_path(base), users)
    return token


def revoke_api_token(base, username, token_id=None):
    """Desconecta un agente (borra su token) o todos si no se indica cuál."""
    with _LOCK:
        users = list_users(base)
        if username in users:
            ts = _tokens(users[username])
            ts[:] = [t for t in ts if token_id and t["id"] != token_id]
            _write(users_path(base), users)


def token_user(base, token, agent=None, kinds=None):
    """Usuario del token. `kinds`: tipos admitidos (None = cualquiera salvo «pasos», que solo vale para enviar pasos)."""
    if not token or not token.startswith("sal_"):
        return None
    h = hashlib.sha256(token.encode()).hexdigest()
    for k, v in list_users(base).items():
        for t in _tokens(dict(v)):
            if hmac.compare_digest(t["hash"], h):
                if (t.get("kind") == "pasos") != (kinds is not None and "pasos" in kinds):
                    return None
                if t.get("exp_ts") and t["exp_ts"] < time.time():
                    return None  # token OAuth caducado: el agente lo renueva con su refresh_token
                _touch_token(base, k, t, agent if t.get("via") != "mcp" else None)
                return k
    return None


# ---- OAuth 2.1 (conectores MCP: Claude, ChatGPT, Codex…). Registro dinámico de clientes + código con PKCE.
# El token que recibe cada conector es un token de agente más (sale en «Agentes» y se desconecta igual).
ACCESS_DAYS = 30
_CODES = {}
KINDS = (("claude code", "claude-code"), ("claude", "claude"), ("chatgpt", "chatgpt"), ("openai", "chatgpt"),
         ("codex", "codex"), ("antigravity", "antigravity"), ("gemini", "antigravity"))


def kind_of(name):
    n = (name or "").lower()
    for k, v in KINDS:
        if k in n:
            return v
    return "otro"


def clients_path(base):
    return os.path.join(base, "oauth_clientes.json")


def _redirect_ok(uri):
    from urllib.parse import urlparse
    try:
        p = urlparse(uri)
    except ValueError:
        return False
    if not p.scheme or "#" in uri:
        return False
    if p.scheme == "https":
        return bool(p.netloc)
    if p.scheme == "http":
        return (p.hostname or "") in ("localhost", "127.0.0.1", "::1")
    return p.scheme not in ("javascript", "data", "file", "vbscript", "about", "blob")  # apps nativas (cursor://…)


def register_client(base, meta):
    uris = meta.get("redirect_uris")
    if not isinstance(uris, list) or not uris or len(uris) > 10 or not all(isinstance(u, str) and len(u) < 500 and _redirect_ok(u) for u in uris):
        raise AuthError("redirect_uris no válidas")
    method = meta.get("token_endpoint_auth_method") or "none"
    if method not in ("none", "client_secret_post", "client_secret_basic"):
        method = "none"
    name = str(meta.get("client_name") or "Agente")[:80]
    cid = "salc_" + secrets.token_urlsafe(16)
    secret = None if method == "none" else "sals_" + secrets.token_urlsafe(32)
    with _LOCK:
        cs = _read(clients_path(base), {})
        if len(cs) >= 500:  # tope: fuera los más antiguos que nunca se usaron
            for k in sorted((k for k, v in cs.items() if not v.get("used")), key=lambda k: cs[k].get("created_ts", 0))[:100]:
                cs.pop(k, None)
        cs[cid] = {"name": name, "redirect_uris": uris, "method": method, "created_ts": time.time(),
                   "secret_hash": hashlib.sha256(secret.encode()).hexdigest() if secret else None}
        _write(clients_path(base), cs)
    out = {"client_id": cid, "client_name": name, "redirect_uris": uris, "token_endpoint_auth_method": method,
           "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"], "client_id_issued_at": int(time.time())}
    if secret:
        out.update({"client_secret": secret, "client_secret_expires_at": 0})
    return out


_CIMD = {}


def _public_host(host):
    import ipaddress
    import socket
    try:
        for info in socket.getaddrinfo(host, 443):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
        return True
    except (OSError, ValueError):
        return False


def _cimd(cid, fetch=None):
    """Cliente identificado por URL (Client ID Metadata Document): Claude publica sus datos en una URL https."""
    import urllib.request
    from urllib.parse import urlparse
    now = time.time()
    hit = _CIMD.get(cid)
    if hit and hit[0] > now:
        return hit[1]
    p = urlparse(cid)
    if p.scheme != "https" or not p.hostname or p.path in ("", "/") or (fetch is None and not _public_host(p.hostname)):
        return None
    try:
        if fetch:
            raw = fetch(cid)
        else:
            req = urllib.request.Request(cid, headers={"Accept": "application/json", "User-Agent": "salud-oauth/1.0"})
            with urllib.request.urlopen(req, timeout=8) as r:
                raw = r.read(65536)
        meta = json.loads(raw)
    except Exception:
        return None
    uris = meta.get("redirect_uris")
    if meta.get("client_id") != cid or not isinstance(uris, list) or not uris or not all(isinstance(u, str) and _redirect_ok(u) for u in uris):
        return None
    c = {"name": str(meta.get("client_name") or p.hostname)[:80], "redirect_uris": uris[:10], "method": "none", "cimd": True}
    _CIMD[cid] = (now + 3600, c)
    return c


def get_client(base, cid, fetch=None):
    if (cid or "").startswith("https://"):
        c = _cimd(cid, fetch)
        return dict(c, client_id=cid) if c else None
    c = _read(clients_path(base), {}).get(cid or "")
    return dict(c, client_id=cid) if c else None


def client_auth_ok(client, secret):
    if client.get("method", "none") == "none":
        return True
    return bool(secret) and hmac.compare_digest(client.get("secret_hash") or "", hashlib.sha256(secret.encode()).hexdigest())


def new_code(username, client_id, redirect_uri, challenge, scope=None):
    code = "salk_" + secrets.token_urlsafe(32)
    now = time.time()
    with _LOCK:
        for k in [k for k, v in _CODES.items() if v["exp"] < now]:
            _CODES.pop(k, None)
        _CODES[code] = {"user": username, "client_id": client_id, "redirect_uri": redirect_uri, "challenge": challenge,
                        "scope": scope, "exp": now + 600}
    return code


def take_code(code):
    with _LOCK:
        c = _CODES.pop(code or "", None)
    return c if c and c["exp"] > time.time() else None


def pkce_ok(verifier, challenge):
    import base64
    if not verifier or not challenge:
        return False
    d = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return hmac.compare_digest(d, challenge)


def _new_pair():
    return "sal_" + secrets.token_urlsafe(32), "salr_" + secrets.token_urlsafe(40)


def issue_oauth(base, username, client):
    """Conecta el agente: crea su token (sustituye al anterior del mismo tipo) y devuelve la respuesta del endpoint /oauth/token."""
    kind = kind_of(client.get("name"))
    access, refresh = _new_pair()
    now = time.time()
    with _LOCK:
        users = list_users(base)
        if username not in users:
            raise AuthError("No existe la cuenta")
        ts = _tokens(users[username])
        ts[:] = [t for t in ts if t.get("client_id") != client["client_id"] and (kind == "otro" or (t.get("kind") != kind and t.get("agent") != kind))]
        ts.append({"id": secrets.token_hex(4), "hash": hashlib.sha256(access.encode()).hexdigest(),
                   "refresh_hash": hashlib.sha256(refresh.encode()).hexdigest(), "kind": kind,
                   "agent": kind if kind != "otro" else AGENT_RX.sub("", client.get("name", "").lower())[:40] or None,
                   "client_id": client["client_id"], "via": "mcp", "created": time.strftime("%Y-%m-%d %H:%M"), "created_ts": now,
                   "used": time.strftime("%Y-%m-%d %H:%M"), "used_ts": now, "exp_ts": now + ACCESS_DAYS * 86400})
        _write(users_path(base), users)
        cs = _read(clients_path(base), {})
        if client["client_id"] in cs:
            cs[client["client_id"]]["used"] = time.strftime("%Y-%m-%d %H:%M")
            _write(clients_path(base), cs)
    return {"access_token": access, "token_type": "Bearer", "expires_in": ACCESS_DAYS * 86400, "refresh_token": refresh, "scope": "salud"}


def refresh_oauth(base, refresh, client_id):
    if not refresh or not refresh.startswith("salr_"):
        return None
    h = hashlib.sha256(refresh.encode()).hexdigest()
    access, new_refresh = _new_pair()
    now = time.time()
    with _LOCK:
        users = list_users(base)
        for u in users.values():
            for t in _tokens(u):
                if t.get("refresh_hash") and hmac.compare_digest(t["refresh_hash"], h) and t.get("client_id") == client_id:
                    t.update({"hash": hashlib.sha256(access.encode()).hexdigest(), "refresh_hash": hashlib.sha256(new_refresh.encode()).hexdigest(),
                              "exp_ts": now + ACCESS_DAYS * 86400, "used": time.strftime("%Y-%m-%d %H:%M"), "used_ts": now})
                    _write(users_path(base), users)
                    return {"access_token": access, "token_type": "Bearer", "expires_in": ACCESS_DAYS * 86400,
                            "refresh_token": new_refresh, "scope": "salud"}
    return None


def _touch_token(base, username, tok, agent):
    """Apunta el último uso y quién dice ser el agente (como mucho una escritura por minuto si no cambia nada)."""
    agent = AGENT_RX.sub("", (agent or "").strip().lower())[:40] or None
    now = time.time()
    if now - (tok.get("used_ts") or 0) < 60 and (not agent or agent == tok.get("agent")):
        return
    with _LOCK:
        users = list_users(base)
        if username not in users:
            return
        for t in _tokens(users[username]):
            if t["hash"] == tok["hash"]:
                t["used_ts"], t["used"] = now, time.strftime("%Y-%m-%d %H:%M")
                if agent:
                    t["agent"] = agent
        _write(users_path(base), users)


class RateLimit:
    """Freno a la fuerza bruta: como mucho N intentos fallidos por IP cada 15 minutos."""

    def __init__(self, n=8, window=900):
        self.n, self.window, self.fails = n, window, {}

    def blocked(self, ip):
        now = time.time()
        xs = [t for t in self.fails.get(ip, []) if now - t < self.window]
        self.fails[ip] = xs
        return len(xs) >= self.n

    def fail(self, ip):
        self.fails.setdefault(ip, []).append(time.time())
