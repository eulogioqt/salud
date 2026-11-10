"""CLI para operar la base de datos desde el chat de Claude (misma lógica que la web).

Uso:  python app/salud_cli.py <comando> ...   (ver `python app/salud_cli.py -h`)
Todas las escrituras quedan registradas con origen «chat».
"""
from __future__ import annotations

import argparse
import json
import os
import sys

from . import core
from . import nutrition as N
from .api import ApiError, dispatch
from .db import DEFAULT_DB, connect, today, shift
from .importer import init_db

SRC = "chat"
BODY_FLAGS = (("peso", "weight_kg"), ("imc", "bmi"), ("grasa", "fat_pct"), ("grasa-kg", "fat_kg"), ("musculo", "muscle_kg"),
              ("musculo-pct", "muscle_pct"), ("esqueletico", "skeletal_muscle_kg"), ("magra", "lean_kg"), ("agua", "water_pct"),
              ("agua-kg", "water_kg"), ("proteina", "protein_pct"), ("proteina-kg", "protein_kg"), ("hueso", "bone_kg"),
              ("hueso-pct", "bone_pct"), ("visceral", "visceral_fat"), ("bmr", "bmr_kcal"), ("edad-corporal", "body_age"),
              ("cintura-cadera", "whr"), ("fc", "heart_rate"), ("puntuacion", "body_score"))


def f(x, nd=0):
    return core._fmt(x, nd)


def macro_line(n):
    m = set(n.get("missing") or [])
    s = lambda k: "*" if k in m and n[k] is not None else ""
    return "%s%s kcal · P %s%s · C %s%s · G %s%s" % (
        f(n["kcal"]), s("kcal"), f(n["protein_g"], 1), s("protein_g"), f(n["carbs_g"], 1), s("carbs_g"),
        f(n["fat_g"], 1), s("fat_g"))


def print_day(conn, d):
    st = core.day_state(conn, d)
    t, tg, en = st["totals"], st["target"] or {}, st["energy"]
    print("%s · %s%s" % (st["date"], st["status"].upper(), (" (%s)" % st["day"]["closed_at"]) if st["day"]["closed_at"] and st["status"] == "cerrado" else ""))
    print("Consumido: " + macro_line(t))
    if tg:
        print("Objetivo:  %s kcal · P %s · C %s · G %s–%s%s" % (f(tg["kcal"]), f(tg["protein_g"]), f(tg["carbs_g"]),
              f(tg["fat_min_g"]), f(tg["fat_max_g"]), " (provisional)" if tg["provisional"] else ""))
        if t["kcal"] is not None and tg["kcal"]:
            print("Restante:  %s kcal · P %s g" % (f(tg["kcal"] - t["kcal"]), f((tg["protein_g"] or 0) - (t["protein_g"] or 0), 1)))
    print("Gasto est.: %s kcal (BMR %s, TEF %s, NEAT %s, pasos %s, ejercicio %s)%s · Balance est.: %s" % (
        f(en["total"]), f(en["bmr"]), f(en["tef"]), f(en["neat"]), f(en["steps_kcal"]), f(en["exercise_kcal"]),
        "" if en["complete"] else " INCOMPLETO", f(st["balance"])))
    day = st["day"]
    print("Peso: %s kg%s · Media 7d: %s · Pasos: %s · %s" % (
        f(day["weight_kg"], 1), (" (%s)" % day["weight_time"]) if day["weight_time"] else "", f(st["avg7"], 2),
        f(day["steps"]), "; ".join("[a%d] %s %s min %s%s" % (a["id"], a["type"], f(a["minutes"]), a["intensity"],
                                    (" %s kcal manual" % f(a["kcal_net"])) if a["kcal_net"] is not None else "")
                                    for a in st["activities"]) or ("descanso" if day["rest_day"] == 1 else "sin actividad")))
    for m in core.MEALS:
        ml = st["meals"][m]
        if not ml["entries"]:
            continue
        print("\n%s — %s" % (ml["label"], macro_line(ml["totals"])))
        for e in ml["entries"]:
            print("  [%d] %s%s · %s · %s%s" % (e["id"], (e["time"] + " ") if e["time"] else "", e["name"], e["unit_label"],
                                            macro_line(e), "" if e["quality"] in ("etiqueta", "historico") else " [%s]" % e["quality"]))
    if t["missing"]:
        print("\n* = total mínimo: hay valores desconocidos")


def set_txt(kind, st):
    t = {"calentamiento": "W ", "fallo": "F ", "drop": "D "}.get(st["type"], "")
    if kind in ("cardio", "tiempo"):
        parts = [("%s m" % f(st["distance_m"])) if st["distance_m"] else None, ("%s s" % f(st["seconds"])) if st["seconds"] else None]
        return t + " ".join(x for x in parts if x)
    w = st["weight_kg"]
    if kind == "corporal" or w in (None, 0):
        return "%s%s reps" % (t, f(st["reps"]))
    sign = "+" if kind == "lastre" else ("-" if kind == "asistido" else "")
    return "%s%s%s kg × %s" % (t, sign, f(abs(w), 1), f(st["reps"]))


def print_workout(w):
    print("[w%d] %s %s · %s · %s min · %d series · volumen %s kg (%s)%s" % (
        w["id"], w["date"], w["start_time"] or "", w["title"], f(w["duration_min"]), w["sets_count"], f(w["volume_kg"]),
        w["volume_source"], (" · " + w["notes"]) if w["notes"] else ""))
    for ex in w["exercises"]:
        print("  %s: %s" % (ex["name"], " | ".join(set_txt(ex["kind"], st) for st in ex["sets"])))


def resolve_unit(conn, food, unit):
    opts = N.unit_options(conn, food)
    keys = {o["key"]: o for o in opts}
    if unit in keys:
        return unit
    alias = {"gr": "g", "gramos": "g", "racion": "rac", "ración": "rac", "raciones": "rac", "ud": None, "unidad": None}
    if unit in alias and alias[unit] in keys:
        return alias[unit]
    nu = core._norm(unit or "")
    cands = [o for o in opts if o["key"].startswith("p:") and nu and nu in core._norm(o["label"])]
    if len(cands) == 1:
        return cands[0]["key"]
    if not unit and len(opts) == 1:
        return opts[0]["key"]
    raise SystemExit("Unidad «%s» no válida para %s. Opciones: %s" % (
        unit, food["name"], "; ".join("%s = %s" % (o["key"], o["label"]) for o in opts)))


def _accounts(a):
    import getpass
    from . import auth
    if not a.datos:
        raise SystemExit("Falta --datos (o SALUD_DATOS) con el directorio de datos del servidor")
    if a.cmd == "usuarios":
        for k, v in auth.list_users(a.datos).items():
            print("%s · %s · %s" % (k, v.get("name"), auth.user_db(a.datos, k)))
        return
    exists = a.nuevo in auth.list_users(a.datos)
    if a.cmd == "usuario-token":
        if not exists:
            raise SystemExit("No existe la cuenta «%s»" % a.nuevo)
        print(auth.new_api_token(a.datos, a.nuevo))
        print("Guárdalo: no se vuelve a mostrar. Uso: curl -H 'Authorization: Bearer <token>' https://…/api/state", file=sys.stderr)
        return
    if a.cmd == "usuario-crear" and exists:
        raise SystemExit("Ya existe; para cambiar la contraseña usa usuario-password")
    if a.cmd == "usuario-password" and not exists:
        raise SystemExit("No existe la cuenta «%s»" % a.nuevo)
    pw = getpass.getpass("Contraseña para %s: " % a.nuevo)
    if pw != getpass.getpass("Repítela: "):
        raise SystemExit("No coinciden")
    try:
        auth.set_password(a.datos, a.nuevo, pw, getattr(a, "nombre", None))
    except auth.AuthError as e:
        raise SystemExit(str(e))
    conn = connect(auth.user_db(a.datos, a.nuevo))
    core.ensure_defaults(conn)
    if a.cmd == "usuario-crear":
        vals = {k: str(v) for k, v in {"sexo": a.sexo, "fecha_nacimiento": a.nacimiento, "altura_cm": a.altura}.items() if v is not None}
        if vals:
            core.update_settings(conn, vals, "alta")
        print("Cuenta «%s» creada · base de datos: %s" % (a.nuevo, auth.user_db(a.datos, a.nuevo)))
    else:
        print("Contraseña cambiada (sesiones cerradas)")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="salud_cli", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db")
    ap.add_argument("--usuario", default=os.environ.get("SALUD_USUARIO"),
                    help="Servidor con cuentas: usar la base de datos de este usuario (o variable SALUD_USUARIO)")
    ap.add_argument("--datos", default=os.environ.get("SALUD_DATOS"),
                    help="Directorio de datos del servidor (o variable SALUD_DATOS, p. ej. /var/lib/salud)")
    sp = ap.add_subparsers(dest="cmd", required=True)
    p = sp.add_parser("usuario-crear", help="Servidor: crear una cuenta (pide la contraseña)")
    p.add_argument("nuevo"); p.add_argument("--nombre"); p.add_argument("--sexo", choices=["H", "M"]); p.add_argument("--nacimiento", help="AAAA-MM-DD")
    p.add_argument("--altura", type=float)
    p = sp.add_parser("usuario-password", help="Servidor: cambiar la contraseña de una cuenta"); p.add_argument("nuevo")
    sp.add_parser("usuarios", help="Servidor: listar cuentas")
    p = sp.add_parser("usuario-token", help="Servidor: crear (y mostrar una vez) un token de API para Claude/scripts"); p.add_argument("nuevo")

    p = sp.add_parser("hoy", help="Resumen de un día"); p.add_argument("fecha", nargs="?")
    p = sp.add_parser("buscar", help="Buscar alimentos/recetas/comidas habituales"); p.add_argument("texto", nargs="*")
    p = sp.add_parser("add", help="Añadir alimento: add <alimento> <cantidad> [unidad] -c comida")
    p.add_argument("alimento"); p.add_argument("cantidad", type=float); p.add_argument("unidad", nargs="?", default="")
    p.add_argument("-c", "--comida", required=True); p.add_argument("--hora"); p.add_argument("--fecha"); p.add_argument("--nota")
    p = sp.add_parser("estimar", help="Comida fuera / estimación")
    p.add_argument("nombre"); p.add_argument("--kcal", type=float); p.add_argument("--p", type=float)
    p.add_argument("--ch", type=float); p.add_argument("--g", type=float); p.add_argument("--min", type=float)
    p.add_argument("--max", type=float); p.add_argument("-c", "--comida", required=True); p.add_argument("--hora")
    p.add_argument("--fecha"); p.add_argument("--nota")
    p = sp.add_parser("edit", help="Editar entrada"); p.add_argument("id", type=int)
    p.add_argument("--cantidad", type=float); p.add_argument("--unidad"); p.add_argument("-c", "--comida"); p.add_argument("--hora")
    p.add_argument("--kcal", type=float); p.add_argument("--p", type=float); p.add_argument("--ch", type=float); p.add_argument("--g", type=float)
    p.add_argument("--nota")
    p = sp.add_parser("del", help="Eliminar entrada (reversible)"); p.add_argument("id", type=int)
    p = sp.add_parser("undo", help="Restaurar entrada eliminada"); p.add_argument("id", type=int)
    p = sp.add_parser("habitual", help="Añadir una comida habitual")
    p.add_argument("nombre"); p.add_argument("-c", "--comida"); p.add_argument("--hora"); p.add_argument("--fecha")
    p.add_argument("--set", action="append", default=[], help="item_id=cantidad (solo esta vez)")
    p.add_argument("--skip", action="append", default=[], type=int)
    p = sp.add_parser("peso", help="Peso matutino"); p.add_argument("kg", type=float); p.add_argument("--fecha"); p.add_argument("--hora")
    p = sp.add_parser("pasos"); p.add_argument("n", type=int); p.add_argument("--fecha")
    p = sp.add_parser("descanso", help="Marcar día de descanso"); p.add_argument("--fecha"); p.add_argument("--no", action="store_true")
    p = sp.add_parser("act", help="Registrar actividad")
    p.add_argument("tipo", choices=core.ACTIVITY_TYPES); p.add_argument("--min", type=float); p.add_argument("--int", default="normal", choices=core.INTENSITIES)
    p.add_argument("--kcal", type=float, help="kcal NETAS si se conocen"); p.add_argument("--pasos", type=int, help="pasos de la sesión incluidos en el contador")
    p.add_argument("--desc"); p.add_argument("--fecha")
    p = sp.add_parser("check", help="Comprobar antes de cerrar"); p.add_argument("fecha", nargs="?")
    p = sp.add_parser("cerrar", help="Cerrar día"); p.add_argument("fecha", nargs="?"); p.add_argument("--forzar", action="store_true")
    p = sp.add_parser("reabrir"); p.add_argument("fecha", nargs="?"); p.add_argument("--motivo")
    p = sp.add_parser("resumen", help="Resumen guardado/actual de un día"); p.add_argument("fecha", nargs="?")
    p = sp.add_parser("semanas", help="Medias semanales y calibración"); p.add_argument("--n", type=int, default=8)
    p = sp.add_parser("historial"); p.add_argument("--dias", type=int, default=14)
    p = sp.add_parser("api", help="Llamada directa: api METHOD /api/ruta [json]")
    p.add_argument("method"); p.add_argument("path"); p.add_argument("json", nargs="?")
    p = sp.add_parser("sql", help="Consulta SQL de solo lectura"); p.add_argument("query")
    sp.add_parser("backup"); sp.add_parser("exportar"); sp.add_parser("init")
    p = sp.add_parser("entreno", help="Registrar entreno (JSON estilo Hevy)"); p.add_argument("json", nargs="?"); p.add_argument("--archivo"); p.add_argument("--contenido")
    p = sp.add_parser("entreno-editar", help="Editar entreno"); p.add_argument("id", type=int); p.add_argument("json", nargs="?"); p.add_argument("--archivo"); p.add_argument("--contenido")
    p = sp.add_parser("entreno-borrar"); p.add_argument("id", type=int)
    p = sp.add_parser("entrenos", help="Lista de entrenos"); p.add_argument("--n", type=int, default=10)
    p = sp.add_parser("ver-entreno"); p.add_argument("id", type=int)
    p = sp.add_parser("ejercicio", help="Histórico de un ejercicio"); p.add_argument("nombre")
    p = sp.add_parser("bascula", help="Medición báscula Xiaomi (estimaciones BIA)")
    for k, h in BODY_FLAGS:
        p.add_argument("--" + k, type=float, dest=h)
    p.add_argument("--fecha"); p.add_argument("--hora"); p.add_argument("--nota"); p.add_argument("--no-dia", action="store_true",
                   help="no copiar el peso al día"); p.add_argument("--sobrescribir-dia", action="store_true")
    p = sp.add_parser("contexto", help="Ver las notas personales para Claude (objetivos, perfil, forma de uso)")
    p.add_argument("--clave", default="claude")
    p = sp.add_parser("contexto-guardar", help="Sustituir las notas personales para Claude")
    p.add_argument("texto", nargs="?"); p.add_argument("--archivo"); p.add_argument("--contenido"); p.add_argument("--clave", default="claude")
    p = sp.add_parser("niveles-descargar", help="(servidor) Descargar todas las tablas de Strength Level a la caché")
    p.add_argument("--pausa", type=float, default=3.0)
    p = sp.add_parser("foto", help="Asignar foto a un alimento"); p.add_argument("alimento"); p.add_argument("ruta")
    p = sp.add_parser("importar-hevy", help="Importar el CSV exportado de Hevy o un JSON con formato de la API"); p.add_argument("ruta")

    a = ap.parse_args(argv)
    if a.cmd in ("usuario-crear", "usuario-password", "usuarios", "usuario-token"):
        return _accounts(a)
    if a.cmd == "niveles-descargar":
        from . import strengthlevel as SL
        datadir = a.datos or os.path.dirname(os.path.abspath(a.db or DEFAULT_DB))
        from . import xlevel as XL
        SL.download_all(datadir, a.pausa)
        return XL.download_all(datadir, a.pausa)
    if a.usuario:
        if not a.datos:
            raise SystemExit("Falta --datos (o SALUD_DATOS) con el directorio de datos del servidor")
        from . import auth
        if a.usuario not in auth.list_users(a.datos):
            raise SystemExit("No existe la cuenta «%s»" % a.usuario)
        a.db = auth.user_db(a.datos, a.usuario)
        from . import training as _T
        _T.GLOBAL_SL = os.path.join(os.path.abspath(a.datos), "sl_asociaciones.json")
    conn = connect(a.db)
    if a.cmd == "init":
        print("Importados: %d" % init_db(conn)); return
    if not a.usuario and not a.db and conn.execute("SELECT COUNT(*) FROM foods").fetchone()[0] == 0:
        init_db(conn)  # solo en la instalación local de un usuario (catálogo inicial)

    def call(method, path, body=None, query=None):
        try:
            return dispatch(conn, method, path, query or {}, body or {}, SRC)
        except ApiError as e:
            print("ERROR (%d): %s" % (e.status, e.message)); sys.exit(2)

    write_cmds = {"add", "estimar", "edit", "del", "undo", "habitual", "peso", "pasos", "descanso", "act", "cerrar", "reabrir",
                  "entreno", "entreno-editar", "entreno-borrar", "bascula", "foto", "importar-hevy", "contexto-guardar"}
    if a.cmd in write_cmds:
        age = core.last_backup_age_hours(conn)
        if age is None or age > 20:
            try:
                core.backup(conn, "auto-chat")
            except Exception as e:
                print("Aviso: copia no creada (%s)" % e)

    d = getattr(a, "fecha", None) or today()
    c = a.cmd
    if c == "hoy":
        print_day(conn, d)
    elif c == "buscar":
        term = core._norm(" ".join(a.texto))
        for fo in core.list_foods(conn, True):
            if term in core._norm(fo["name"]) or term in core._norm(fo.get("original_name") or ""):
                flags = "".join([" [oculto]" if fo["hidden"] else "", " [%s]" % fo["status"]])
                print("%d · %s (%s)%s" % (fo["id"], fo["name"], fo["kind"], flags))
                for u in fo["units"]:
                    per = u["per"]
                    if u["key"] in ("g", "ml"):
                        print("    %s: por 100 %s → %s  (%s)" % (u["key"], u["key"], macro_line(N.scale(per, 100)), u["basis"]))
                    else:
                        print("    %s: %s → %s [%s]" % (u["key"], u["label"], macro_line(per), u["quality"]))
        for t in core.list_templates(conn, True):
            if term in core._norm(t["name"]):
                print("H%d · %s (comida habitual) → %s" % (t["id"], t["name"], macro_line(t["nutr"]) if t["nutr"] else "—"))
                for it in t["items"]:
                    print("    item %d: %s · %s" % (it["id"], it["food_name"], it.get("unit_label", it["unit_key"])))
    elif c == "add":
        food = core.find_food(conn, a.alimento)
        uk = resolve_unit(conn, food, a.unidad)
        e = call("POST", "/api/entries", {"date": d, "meal": a.comida, "time": a.hora, "food_id": food["id"],
                                          "unit_key": uk, "quantity": a.cantidad, "note": a.nota})
        print("Añadido [%d] %s · %s · %s" % (e["id"], e["name"], e["unit_label"], macro_line(e)))
    elif c == "estimar":
        e = call("POST", "/api/entries", {"estimate": True, "date": d, "meal": a.comida, "time": a.hora, "name": a.nombre,
                                          "kcal": a.kcal, "protein_g": a.p, "carbs_g": a.ch, "fat_g": a.g,
                                          "kcal_min": a.min, "kcal_max": a.max, "note": a.nota})
        print("Estimación [%d] %s · %s" % (e["id"], e["name"], macro_line(e)))
    elif c == "edit":
        body = {}
        if a.cantidad is not None: body["quantity"] = a.cantidad
        if a.unidad:
            ent = core.get_entry(conn, a.id)
            body["unit_key"] = resolve_unit(conn, N.get_food(conn, ent["food_id"]), a.unidad)
        if a.comida: body["meal"] = a.comida
        if a.hora is not None: body["time"] = a.hora
        if a.nota is not None: body["note"] = a.nota
        for k, v in (("kcal", a.kcal), ("protein_g", a.p), ("carbs_g", a.ch), ("fat_g", a.g)):
            if v is not None: body[k] = v
        e = call("PUT", "/api/entries/%d" % a.id, body)
        print("Actualizado [%d] %s · %s · %s" % (e["id"], e["name"], e["unit_label"], macro_line(e)))
    elif c == "del":
        call("DELETE", "/api/entries/%d" % a.id); print("Eliminada entrada %d (restaurable con: undo %d)" % (a.id, a.id))
    elif c == "undo":
        e = call("POST", "/api/entries/%d/restore" % a.id); print("Restaurada [%d] %s" % (e["id"], e["name"]))
    elif c == "habitual":
        t = core.find_template(conn, a.nombre)
        items = [{"id": int(s.split("=")[0]), "quantity": float(s.split("=")[1])} for s in a.set]
        items += [{"id": i, "skip": True} for i in a.skip]
        r = call("POST", "/api/templates/%d/apply" % t["id"], {"date": d, "meal": a.comida, "time": a.hora, "items": items})
        print("Añadida «%s»: entradas %s" % (t["name"], r["entry_ids"]))
    elif c == "peso":
        call("PUT", "/api/days/%s" % d, {"weight_kg": a.kg, "weight_time": a.hora}); print("Peso %s: %s kg" % (d, f(a.kg, 1)))
    elif c == "pasos":
        call("PUT", "/api/days/%s" % d, {"steps": a.n}); print("Pasos %s: %s" % (d, f(a.n)))
    elif c == "descanso":
        call("PUT", "/api/days/%s" % d, {"rest_day": not a.no}); print("Descanso %s: %s" % (d, "no" if a.no else "sí"))
    elif c == "act":
        r = call("POST", "/api/activities", {"date": d, "type": a.tipo, "minutes": a.min, "intensity": a.int,
                                             "kcal_net": a.kcal, "steps_in_activity": a.pasos, "description": a.desc})
        print("Actividad [a%d] %s registrada" % (r["id"], r["type"]))
    elif c == "check":
        r = call("GET", "/api/days/%s/close-check" % d)
        for w in r["warnings"]:
            print("%s %s" % ("!" if w["level"] == "importante" else "·", w["text"]))
        print(); print(core.summary_text(r["summary"]))
    elif c == "cerrar":
        r = call("POST", "/api/days/%s/close" % d, {"force": a.forzar})
        if not r["closed"]:
            print("NO CERRADO. Faltan datos importantes (usa --forzar si quieres cerrar igualmente):")
            for w in r["warnings"]:
                print("%s %s" % ("!" if w["level"] == "importante" else "·", w["text"]))
        else:
            print("Día %s cerrado (versión %d)\n" % (d, r["version"])); print(core.summary_text(r["summary"]))
    elif c == "reabrir":
        call("POST", "/api/days/%s/reopen" % d, {"reason": a.motivo}); print("Día %s reabierto" % d)
    elif c == "resumen":
        st = core.day_state(conn, d)
        s = st["closure"]["summary"] if st["closure"] else core.build_summary(conn, d, st)
        print(("[Snapshot del cierre]\n" if st["closure"] else "[Día abierto: cálculo actual]\n") + core.summary_text(s))
    elif c == "semanas":
        for w in core.weekly(conn, a.n):
            print("Semana %s · %d/%d días registrados · %s kcal · P %s · peso %s (%s) · gasto %s · balance %s" % (
                w["week"], w["days_logged"], w["days"], f(w["kcal"]), f(w["protein_g"]), f(w["weight"], 2),
                ("%+.2f" % w["weight_delta"]) if w["weight_delta"] is not None else "—", f(w["tdee"]), f(w["balance"])))
        cal = core.calibration(conn)
        print("Calibración: " + (("mantenimiento observado ≈ %s kcal (ingesta %s, tendencia %+.2f kg/sem, modelo %s)" % (
            f(cal["observed_maintenance"]), f(cal["intake_avg"]), cal["slope_kg_week"], f(cal["model_tdee_avg"])))
            if cal["ready"] else cal["reason"]))
    elif c == "historial":
        for h in core.history(conn, shift(today(), -(a.dias - 1)), today()):
            print("%s %s · %s kcal · P %s · peso %s · media %s · pasos %s · gasto %s · bal %s" % (
                h["date"], "C" if h["status"] == "cerrado" else "A", f(h["kcal"]), f(h["protein_g"]), f(h["weight_kg"], 1),
                f(h["avg7"], 2), f(h["steps"]), f(h["tdee"]), f(h["balance"])))
    elif c in ("entreno", "entreno-editar"):
        raw = open(a.archivo, encoding="utf-8").read() if getattr(a, "archivo", None) else (getattr(a, "contenido", None) or a.json)
        data = json.loads(raw)
        w = call("POST", "/api/workouts", data) if c == "entreno" else call("PUT", "/api/workouts/%d" % a.id, data)
        print_workout(w)
    elif c == "contexto":
        n = call("GET", "/api/notes/" + a.clave)
        print(n["body"] or "(sin notas todavía: pregúntale al usuario sus objetivos y guárdalos con contexto-guardar)")
    elif c == "contexto-guardar":
        raw = open(a.archivo, encoding="utf-8").read() if a.archivo else (a.contenido if a.contenido is not None else a.texto)
        if raw is None:
            raise SystemExit("Falta el texto (o --archivo)")
        n = call("PUT", "/api/notes/" + a.clave, {"body": raw})
        print("Notas «%s» guardadas (%d caracteres, %s)" % (n["key"], len(n["body"]), n["updated_at"]))
    elif c == "entreno-borrar":
        call("DELETE", "/api/workouts/%d" % a.id); print("Entreno %d eliminado" % a.id)
    elif c == "entrenos":
        for w in call("GET", "/api/workouts", query={"limit": a.n})["workouts"]:
            print("[w%d] %s %s · %s · %s min · %d series · %s kg" % (w["id"], w["date"], w["start_time"] or "", w["title"],
                  f(w["duration_min"]), w["sets_count"], f(w["volume_kg"])))
    elif c == "ver-entreno":
        print_workout(call("GET", "/api/workouts/%d" % a.id))
    elif c == "ejercicio":
        for e in call("GET", "/api/exercises/history", query={"name": a.nombre}):
            print("%s · %s · %s" % (e["date"], e["title"], " | ".join(set_txt(e["kind"], st) for st in e["sets"])))
    elif c == "bascula":
        body = {h: getattr(a, h) for _k, h in BODY_FLAGS}
        body.update({"date": d, "time": a.hora, "notes": a.nota, "set_day_weight": not a.no_dia,
                     "override_day_weight": a.sobrescribir_dia})
        r = call("POST", "/api/body", body)
        print("Báscula %s guardada%s" % (d, " (peso copiado al día)" if r["day_weight_updated"] else ""))
    elif c == "foto":
        from . import training as T
        food = core.find_food(conn, a.alimento)
        r = T.set_food_image(conn, food["id"], file_path=a.ruta, source=SRC)
        print("Foto de %s: %s" % (food["name"], r["image"]))
    elif c == "importar-hevy":
        from . import training as T
        raw = open(a.ruta, encoding="utf-8-sig").read()
        if a.ruta.lower().endswith(".json"):
            from . import hevy as H
            r = H.import_json(conn, json.loads(raw), SRC)
        else:
            r = T.import_hevy_csv(conn, raw, SRC)
        print("Hevy CSV: %d nuevos, %d actualizados, %d en días cerrados, %d errores" % (r["created"], r["updated"], len(r["skipped"]), len(r["errors"])))
        for e in r["errors"][:10]:
            print("  !", e)
    elif c == "api":
        body = json.loads(a.json) if a.json else {}
        path, _, qs = a.path.partition("?")
        query = dict(p.split("=", 1) for p in qs.split("&") if "=" in p)
        print(json.dumps(call(a.method.upper(), path, body if a.method.upper() != "GET" else None, query),
                         ensure_ascii=False, indent=1, default=str))
    elif c == "sql":
        conn.execute("PRAGMA query_only=1")
        for r in conn.execute(a.query):
            print(dict(r))
    elif c == "backup":
        print(core.backup(conn, "manual-chat"))
    elif c == "exportar":
        print(core.export_to_folder(conn))


if __name__ == "__main__":
    main()
