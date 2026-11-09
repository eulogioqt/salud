"""Cliente de la CLI contra el servidor (HTTPS + token personal). Lo usa Claude (Cowork) en la nube o en el ordenador.

Solo biblioteca estándar. Cada token da acceso únicamente a la cuenta de su dueño.

    python3 app/salud_remoto.py login sal_xxxxx        # guarda el token en ~/.salud_token (una vez por sesión/equipo)
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
                               headers={"Content-Type": "application/json", "Authorization": "Bearer " + (tok or token())})
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        sys.exit("HTTP %s: %s" % (e.code, e.read().decode(errors="replace")))


def main(args):
    if not args or args[0] in ("-h", "--help", "ayuda"):
        print(__doc__)
        if args:
            args = ["--help"]
        else:
            return
    if args[0] == "login" and len(args) == 2:
        me = req("GET", "/api/me", tok=args[1].strip())
        with open(TOKEN_FILE, "w", encoding="utf-8") as f:
            f.write(args[1].strip())
        try:
            os.chmod(TOKEN_FILE, 0o600)
        except OSError:
            pass
        print("Token guardado. Cuenta: %s (@%s)" % (me.get("nombre"), me.get("usuario")))
        return
    if args[0] == "yo":
        print(json.dumps(req("GET", "/api/me"), ensure_ascii=False))
        return
    if args[0] == "importar-hevy" and len(args) == 2:
        with open(args[1], encoding="utf-8") as f:
            print(json.dumps(req("POST", "/api/hevy/import-csv", {"csv": f.read()}), ensure_ascii=False))
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
