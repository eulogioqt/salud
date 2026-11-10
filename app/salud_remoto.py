"""Cliente de la CLI contra el servidor (HTTPS + token personal). Lo usa Claude (Cowork) en la nube o en el ordenador.

Solo biblioteca estándar. Cada token da acceso únicamente a la cuenta de su dueño.

    python3 app/salud_remoto.py comprobar                # ¿este entorno llega a la web? (si no, explica qué activar)
    python3 app/salud_remoto.py login sal_xxxxx --agente codex   # guarda el token (~/.salud_token) y quién eres (claude, chatgpt, codex…)
    python3 app/salud_remoto.py yo                     # comprobar de quién es el token
    python3 app/salud_remoto.py contexto               # notas personales para Claude (leer al empezar)
    python3 app/salud_remoto.py hoy
    python3 app/salud_remoto.py add avena 60 g -c desayuno
    python3 app/salud_remoto.py entreno --archivo entreno.json          # entreno transcrito de capturas de Hevy
    python3 app/salud_remoto.py importar-hevy hevy_20261110.json        # JSON (o CSV) de Hevy
    python3 app/salud_remoto.py contexto-guardar --archivo notas.md     # sustituir las notas personales

Configuración: SALUD_URL (por defecto https://salud.eulogioqt.com) y SALUD_TOKEN (o el fichero ~/.salud_token).
"""
import json
import os
import sys
import urllib.error
import urllib.request

URL = os.environ.get("SALUD_URL", "https://salud.eulogioqt.com").rstrip("/")
TOKEN_FILE = os.path.join(os.path.expanduser("~"), ".salud_token")
AGENT_FILE = os.path.join(os.path.expanduser("~"), ".salud_agente")


def agent():
    a = os.environ.get("SALUD_AGENTE")
    if not a and os.path.exists(AGENT_FILE):
        with open(AGENT_FILE, encoding="utf-8") as f:
            a = f.read().strip()
    return a or "desconocido"


def token():
    t = os.environ.get("SALUD_TOKEN")
    if not t and os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, encoding="utf-8") as f:
            t = f.read().strip()
    if not t:
        sys.exit("Falta el token: python3 app/salud_remoto.py login <token>  (o variable SALUD_TOKEN)")
    return t


def req(method, path, body=None, tok=None):
    data = None if body is None else json.dumps(body).encode()
    r = urllib.request.Request(URL + path, data=data, method=method,
                               headers={"Content-Type": "application/json", "Authorization": "Bearer " + (tok or token()),
                                        "User-Agent": "salud-remoto/1.0", "X-Salud-Agent": agent()})  # Cloudflare bloquea el de Python
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        sys.exit("HTTP %s: %s" % (e.code, e.read().decode(errors="replace")))


SETUP = """PASO DE CONFIGURACIÓN PENDIENTE (no es un error):
Tu entorno no tiene permiso para conectarse a {host}.
Dile al usuario, tal cual, que lo active y te avise:
  · Claude (app o web): Ajustes → Capacidades → «Acceso a la red» (o «Ejecución de código y archivos»):
    añade {host} y github.com a los dominios permitidos, o elige «Todos los dominios».
    Si es una cuenta de empresa/equipo, lo cambia el administrador de la organización.
  · Otros agentes (Codex, Antigravity…): permite el acceso a internet a {host} en su configuración.
Después, en este mismo chat, vuelve a ejecutar: python3 app/salud_remoto.py comprobar"""


def check():
    """¿Llega este entorno a la web? (ruta pública, sin token). Devuelve None si sí, o el motivo."""
    r = urllib.request.Request(URL + "/api/cuentas", headers={"User-Agent": "salud-remoto/1.0"})
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            json.loads(resp.read().decode())
            return None
    except urllib.error.HTTPError as e:
        return "HTTP %s" % e.code
    except Exception as e:  # sin red, DNS o proxy que corta la conexión
        return str(e)


def main(args):
    if not args or args[0] in ("-h", "--help", "ayuda"):
        print(__doc__)
        if args:
            args = ["--help"]
        else:
            return
    if args[0] == "comprobar":
        why = check()
        if why:
            host = URL.split("//")[-1]
            sys.exit(SETUP.format(host=host) + "\n(detalle técnico: %s)" % why)
        print("Conexión con %s: OK" % URL)
        return
    if args[0] == "login" and len(args) in (2, 4):
        why = check()
        if why:
            sys.exit(SETUP.format(host=URL.split("//")[-1]) + "\n(detalle técnico: %s)" % why)
        if len(args) == 4 and args[2] == "--agente":
            with open(AGENT_FILE, "w", encoding="utf-8") as f:
                f.write(args[3].strip().lower())
        me = req("GET", "/api/me", tok=args[1].strip())
        with open(TOKEN_FILE, "w", encoding="utf-8") as f:
            f.write(args[1].strip())
        try:
            os.chmod(TOKEN_FILE, 0o600)
        except OSError:
            pass
        print("Token guardado. Cuenta: %s (@%s) · agente: %s" % (me.get("nombre"), me.get("usuario"), agent()))
        return
    if args[0] == "yo":
        print(json.dumps(req("GET", "/api/me"), ensure_ascii=False))
        return
    if args[0] == "importar-hevy" and len(args) == 2:
        with open(args[1], encoding="utf-8") as f:
            print(json.dumps(req("POST", "/api/hevy/import-csv", {"csv": f.read()}), ensure_ascii=False))
        return
    if args[0] == "api" and len(args) in (3, 4):  # llamada HTTP directa a la API (incluye rutas solo del servidor)
        body = json.loads(args[3]) if len(args) == 4 else None
        print(json.dumps(req(args[1].upper(), args[2], body), ensure_ascii=False, indent=1))
        return
    if "--archivo" in args:  # el servidor no lee ficheros: se manda el contenido
        i = args.index("--archivo")
        with open(args[i + 1], encoding="utf-8") as f:
            args = args[:i] + ["--contenido=" + f.read()] + args[i + 2:]
    r = req("POST", "/api/cli", {"args": args})
    sys.stdout.write(r.get("stdout", ""))
    sys.stderr.write(r.get("stderr", ""))
    sys.exit(r.get("code", 0))


if __name__ == "__main__":
    main(sys.argv[1:])
