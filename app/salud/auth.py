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


def new_api_token(base, username):
    """Token personal para scripts/Claude: cabecera «Authorization: Bearer <token>». Se guarda solo su hash."""
    token = "sal_" + secrets.token_urlsafe(32)
    with _LOCK:
        users = list_users(base)
        if username not in users:
            raise AuthError("No existe la cuenta")
        users[username]["api_token"] = hashlib.sha256(token.encode()).hexdigest()
        users[username]["api_token_at"] = time.strftime("%Y-%m-%d %H:%M")
        users[username]["api_token_at_ts"] = time.time()
        users[username].pop("api_token_used", None)
        users[username].pop("api_token_used_ts", None)
        _write(users_path(base), users)
    return token


def revoke_api_token(base, username):
    with _LOCK:
        users = list_users(base)
        if username in users:
            for k in ("api_token", "api_token_at", "api_token_at_ts", "api_token_used", "api_token_used_ts"):
                users[username].pop(k, None)
            _write(users_path(base), users)


def token_user(base, token):
    if not token or not token.startswith("sal_"):
        return None
    h = hashlib.sha256(token.encode()).hexdigest()
    for k, v in list_users(base).items():
        if v.get("api_token") and hmac.compare_digest(v["api_token"], h):
            _touch_token(base, k, v)
            return k
    return None


def _touch_token(base, username, info):
    """Apunta cuándo se usó el token por última vez (como mucho una escritura por minuto): así la web sabe que el agente está conectado."""
    now = time.time()
    if now - info.get("api_token_used_ts", 0) < 60:
        return
    with _LOCK:
        users = list_users(base)
        if username in users:
            users[username]["api_token_used_ts"] = now
            users[username]["api_token_used"] = time.strftime("%Y-%m-%d %H:%M")
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
