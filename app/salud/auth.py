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
    return [{k: t.get(k) for k in ("id", "kind", "agent", "created", "used")} for t in _tokens(dict(u))]


def new_api_token(base, username, kind=None):
    """Token personal para un agente: cabecera «Authorization: Bearer <token>». Se guarda solo su hash."""
    token = "sal_" + secrets.token_urlsafe(32)
    with _LOCK:
        users = list_users(base)
        if username not in users:
            raise AuthError("No existe la cuenta")
        ts = _tokens(users[username])
        ts[:] = [t for t in ts if t.get("used") or time.time() - t.get("created_ts", 0) < 86400]  # sin usar en 24 h: fuera
        if kind and kind != "otro":  # un agente de cada tipo: el nuevo sustituye al anterior
            ts[:] = [t for t in ts if t.get("kind") != kind and t.get("agent") != kind]
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


def token_user(base, token, agent=None):
    if not token or not token.startswith("sal_"):
        return None
    h = hashlib.sha256(token.encode()).hexdigest()
    for k, v in list_users(base).items():
        for t in _tokens(dict(v)):
            if hmac.compare_digest(t["hash"], h):
                _touch_token(base, k, t, agent)
                return k
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
