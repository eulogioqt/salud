"""Lógica de negocio: alimentos, diario, actividad, gasto, cierres y estadísticas.

Todas las escrituras pasan por db.tx(): atómicas, auditadas en `events` y con
incremento de la revisión que la web vigila para refrescarse.
"""
from __future__ import annotations

import csv
import io
import json
import os
import re
import sqlite3
import unicodedata
import zipfile
from datetime import date, timedelta

from . import nutrition as N
from .db import (BACKUP_DIR, DEFAULT_DB, EXPORT_DIR, ClosedDayError, NotFound, ValidationError,
                 now_local, parse_date, rev, row, rows, shift, today, ts, tx)

MEALS = ["desayuno", "almuerzo", "merienda", "cena", "otro"]
MEAL_LABEL = {"desayuno": "Desayuno", "almuerzo": "Almuerzo", "merienda": "Merienda", "cena": "Cena", "otro": "Otro"}
ACTIVITY_TYPES = ["fuerza", "calistenia", "hyrox", "carrera", "bici", "natacion", "caminata", "otro"]
INTENSITIES = ["suave", "normal", "dura", "muy dura"]

# MET brutos (Compendium of Physical Activities, valores redondeados).
# Se usa (MET - 1) para obtener gasto NETO sobre reposo: el reposo ya está en el BMR.
MET = {
    "fuerza":     {"suave": 3.0, "normal": 3.5, "dura": 5.0, "muy dura": 6.0},
    "calistenia": {"suave": 3.0, "normal": 3.8, "dura": 5.0, "muy dura": 6.0},
    "hyrox":      {"suave": 6.0, "normal": 8.0, "dura": 9.5, "muy dura": 11.0},
    "carrera":    {"suave": 8.0, "normal": 9.8, "dura": 11.5, "muy dura": 12.8},
    "bici":       {"suave": 5.0, "normal": 7.0, "dura": 9.0, "muy dura": 11.0},
    "natacion":   {"suave": 5.8, "normal": 7.0, "dura": 9.8, "muy dura": 10.5},
    "caminata":   {"suave": 3.0, "normal": 3.5, "dura": 4.5, "muy dura": 5.5},
    "otro":       {"suave": 3.0, "normal": 4.5, "dura": 6.5, "muy dura": 8.0},
}
STEP_TYPES = ("carrera", "hyrox", "caminata")  # sesiones cuyos pasos suele contar el móvil/reloj

DEFAULT_SETTINGS = {
    "sexo": ("", "H/M para Mifflin-St Jeor y los niveles de fuerza"),
    "altura_cm": ("", "cm"),
    "edad": ("", "Solo si no hay fecha de nacimiento"),
    "fecha_nacimiento": ("", "AAAA-MM-DD; la edad se calcula sola cada día"),
    "peso_estimado_kg": ("", "Solo si no hay pesajes reales recientes"),
    "neat_base_kcal": ("150", "NEAT no procedente de pasos (en casa normal 100–200)"),
    "kcal_por_kg_km": ("0.5", "Coste NETO de caminar sobre reposo"),
    "factor_zancada": ("0.415", "Zancada = altura × factor"),
    "tef_pct": ("0.10", "Efecto térmico ≈ 10 % de la ingesta registrada"),
    "objetivo_pasos": ("8000", "Pasos al día que cuentan como objetivo cumplido (rachas)"),
    "revisar_agente": ("0", "1 = lo que crea el agente (productos, recetas, comidas habituales) queda «por revisar» en la Biblioteca"),
}
# Movimiento del día sin contar los pasos (estar de pie, tareas de casa…): se elige al cerrar el día
NEAT_LEVELS = (("cama", "En cama o enfermo", 0), ("casa", "Casi todo el día sentado", 50), ("ligero", "Algo de movimiento: recados, cocinar", 100),
               ("normal", "Normal", 150), ("activo", "Activo: mucho de pie o tareas", 250), ("muy", "Muy activo: trabajo físico", 350))


def neat_label(kcal):
    for k, l, v in NEAT_LEVELS:
        if kcal is not None and abs(kcal - v) < 1:
            return l
    return None


def supplements(conn):
    """Suplementos de la persona: productos con categoría «Suplemento» y dosis sin apenas kcal (creatina, vitaminas…)."""
    out = []
    for r in conn.execute("SELECT f.id, f.name, p.id AS pid, p.label, p.kcal FROM foods f LEFT JOIN portions p ON p.food_id=f.id AND p.is_default=1 "
                          "WHERE f.deleted=0 AND f.hidden=0 AND lower(COALESCE(f.category,'')) LIKE '%suplement%' ORDER BY f.name"):
        if r["kcal"] is not None and r["kcal"] < 20 and not re.search(r"prote|whey|case[ií]n|gainer|ganador", r["name"].lower()):
            # (la proteína en polvo no es suplemento aquí: se apunta en su comida con sus gramos)
            out.append({"id": r["id"], "name": r["name"], "portion_id": r["pid"], "dose": r["label"]})
    return out


def supplements_taken(conn, d):
    ids = {x["id"] for x in supplements(conn)}
    return {r["food_id"]: r["time"] for r in conn.execute("SELECT food_id, time FROM entries WHERE date=? AND deleted_at IS NULL AND food_id IS NOT NULL", (d,))
            if r["food_id"] in ids}


def accept_all_review(conn, source="web"):
    """Acepta de golpe todo lo que esté «por revisar» (productos, recetas y comidas habituales)."""
    with tx(conn, "accept_all_review", source):
        n = conn.execute("UPDATE foods SET reviewed=1, updated_at=? WHERE reviewed=0", (ts(),)).rowcount
        n += conn.execute("UPDATE templates SET reviewed=1, updated_at=? WHERE reviewed=0", (ts(),)).rowcount
    return {"ok": True, "aceptados": n}


def _auto_reviewed(conn, data, source):
    """Lo creado en la web ya está aceptado; lo del agente solo queda por revisar si la persona lo pidió en Ajustes."""
    if "reviewed" in data:
        return 1 if data["reviewed"] else 0
    if source == "web":
        return 1
    return 0 if settings(conn).get("revisar_agente") == "1" else 1


def _norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", s).strip()


def _num(v, name, lo=None, hi=None, allow_none=True):
    if v is None or v == "":
        if allow_none:
            return None
        raise ValidationError("Falta %s" % name)
    try:
        x = float(str(v).replace(",", "."))
    except ValueError:
        raise ValidationError("%s no es un número" % name)
    if (lo is not None and x < lo) or (hi is not None and x > hi):
        raise ValidationError("%s fuera de rango (%s–%s)" % (name, lo, hi))
    return x


def _date(d):
    d = d or today()
    try:
        parse_date(d)
    except Exception:
        raise ValidationError("Fecha no válida: %s (formato AAAA-MM-DD)" % d)
    return d


def _time(t):
    if t in (None, ""):
        return None
    if not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", t):
        raise ValidationError("Hora no válida: %s (HH:MM)" % t)
    return t


# ---------------------------------------------------------------- ajustes ---

def ensure_defaults(conn):
    with tx(conn, "init_settings", "sistema"):
        for k, (v, note) in DEFAULT_SETTINGS.items():
            conn.execute("INSERT OR IGNORE INTO settings(key,value,note,updated_at) VALUES(?,?,?,?)", (k, v, note, ts()))


def settings(conn):
    out = {k: v for k, (v, _n) in DEFAULT_SETTINGS.items()}
    for r in conn.execute("SELECT key,value FROM settings"):
        if r["key"] in DEFAULT_SETTINGS:
            out[r["key"]] = r["value"]
    return out


def update_settings(conn, data, source="web"):
    allowed = set(DEFAULT_SETTINGS)
    with tx(conn, "update_settings", source, payload=data):
        for k, v in data.items():
            if k not in allowed:
                raise ValidationError("Ajuste desconocido: %s" % k)
            if k == "fecha_nacimiento":
                if v and not re.match(r"^\d{4}-\d{2}-\d{2}$", str(v)):
                    raise ValidationError("Fecha de nacimiento: formato AAAA-MM-DD")
            elif k == "sexo":
                v = str(v or "").strip().upper()[:1]
                if v not in ("", "H", "M"):
                    raise ValidationError("Sexo: H (hombre) o M (mujer)")
            elif k in ("altura_cm", "edad", "peso_estimado_kg") and v in (None, ""):
                v = ""
            else:
                _num(v, k, 0, 10000, allow_none=False)
            conn.execute("INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) "
                         "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                         (k, str(v), ts()))
    return settings(conn)


def age_on(s, d):
    """Edad en la fecha d: a partir de la fecha de nacimiento si existe; si no, el ajuste «edad»."""
    fn = s.get("fecha_nacimiento")
    if fn:
        y, m, dd = map(int, fn.split("-"))
        Y, M, D = map(int, str(d)[:10].split("-"))
        return Y - y - ((M, D) < (m, dd))
    return float(s["edad"]) if s.get("edad") not in (None, "") else None


def get_setting(conn, key, default=None):
    r = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return r[0] if r and r[0] is not None else default


def set_setting(conn, key, value, source="sistema"):
    """Ajustes internos (Hevy, fechas de sincronización). No se validan como números."""
    with tx(conn, "set_setting", source, payload={"key": key, "value": "***" if "key" in key else value}):
        conn.execute("INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) "
                     "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at", (key, value, ts()))


TRACKING_START = "2026-11-09"


def tracking_start(conn):
    return get_setting(conn, "inicio_seguimiento", TRACKING_START)


def targets_list(conn):
    return rows(conn.execute("SELECT * FROM targets ORDER BY valid_from"))


def _carbs(t):
    fat_mid = ((t["fat_min_g"] or 0) + (t["fat_max_g"] or t["fat_min_g"] or 0)) / 2
    t["fat_mid_g"] = fat_mid
    t["carbs_g"] = None
    if t["kcal"] and t["protein_g"] is not None:
        t["carbs_g"] = round(max(0, (t["kcal"] - t["protein_g"] * 4 - fat_mid * 9) / 4))
    return t


def _avg_steps(conn, d, n=7):
    r = conn.execute("SELECT AVG(steps), COUNT(steps) FROM days WHERE date<? AND date>=date(?, ?) AND steps IS NOT NULL",
                     (d, d, "-%d days" % n)).fetchone()
    return (round(r[0]) if r and r[1] else None)


def resolve_dynamic(conn, d, t):
    """Objetivo «según tu gasto»: kcal = (gasto sin digestión + diferencia) / (1 − TEF), así lo comido menos el gasto queda en la diferencia.
    Si aún no hay pasos del día, usa la media de los últimos 7 días (se ajusta al apuntarlos)."""
    day = get_day_row(conn, d)
    acts = day_activities(conn, d)
    proj, no_steps = None, day["steps"] is None
    if no_steps:
        proj = _avg_steps(conn, d)
        day = dict(day, steps=proj if proj is not None else 0)
    if day["neat_kcal"] is None:  # el objetivo cuenta con un día «normal» hasta que se elija al cerrar
        day = dict(day, neat_kcal=float(settings(conn)["neat_base_kcal"]))
    en = energy(conn, d, 0, day, acts)
    tef = float(settings(conn)["tef_pct"])
    t = dict(t)
    if en["bmr"] is None or en["total"] is None:
        t.update({"kcal": None, "protein_g": None, "fat_min_g": None, "fat_max_g": None, "dynamic_error": "Completa tu perfil (peso, altura, edad y sexo) en Ajustes"})
        return _carbs(t)
    base = en["total"]  # sin TEF: se calculó con 0 kcal ingeridas
    kcal = round((base + (t["kcal_offset"] or 0)) / (1 - tef))
    kg = en["weight_used_kg"]
    t.update({"kcal": kcal, "base_kcal": round(base), "weight_kg": kg, "projected_steps": proj if no_steps else None, "steps_pending": no_steps,
              "protein_g": round((t["protein_per_kg"] or 2.0) * kg) if kg else None,
              "fat_min_g": round(kcal * (t["fat_min_pct"] or 25) / 100 / 9), "fat_max_g": round(kcal * (t["fat_max_pct"] or 35) / 100 / 9)})
    return _carbs(t)


def target_for(conn, d):
    t = conn.execute("SELECT * FROM targets WHERE valid_from<=? ORDER BY valid_from DESC LIMIT 1", (d,)).fetchone()
    if not t:
        t = conn.execute("SELECT * FROM targets ORDER BY valid_from LIMIT 1").fetchone()
    if not t:
        return None
    t = row(t)
    t["dynamic"] = t.get("mode") == "gasto"
    return resolve_dynamic(conn, d, t) if t["dynamic"] else _carbs(t)


def preview_target(conn, data, d=None):
    """Lo que saldría hoy con estos ajustes (sin guardar)."""
    d = _date(d)
    v = _target_values(data)
    t = {"valid_from": d, "provisional": 1, "note": None, **v}
    t["dynamic"] = v["mode"] == "gasto"
    return resolve_dynamic(conn, d, t) if t["dynamic"] else _carbs(t)


def _target_values(data):
    mode = data.get("mode") or "fijo"
    if mode not in ("fijo", "gasto"):
        raise ValidationError("Modo de objetivo no válido")
    if mode == "gasto":
        off = _num(data.get("kcal_offset"), "diferencia de kcal", -1500, 1500)
        ppk = _num(data.get("protein_per_kg"), "proteína por kg", 0.8, 3.5)
        a = _num(data.get("fat_min_pct"), "grasa mínima %", 10, 60)
        b = _num(data.get("fat_max_pct"), "grasa máxima %", 10, 60)
        if a is not None and b is not None and a > b:
            raise ValidationError("Grasa mínima mayor que máxima")
        return {"mode": "gasto", "kcal_offset": off or 0, "protein_per_kg": ppk or 2.0, "fat_min_pct": a or 25, "fat_max_pct": b or 35,
                "kcal": None, "protein_g": None, "fat_min_g": None, "fat_max_g": None}
    kcal = _num(data.get("kcal"), "kcal", 1000, 6000)
    p = _num(data.get("protein_g"), "proteína", 0, 400)
    fmin = _num(data.get("fat_min_g"), "grasa mínima", 0, 300)
    fmax = _num(data.get("fat_max_g"), "grasa máxima", 0, 300)
    if fmin is not None and fmax is not None and fmin > fmax:
        raise ValidationError("Grasa mínima mayor que máxima")
    if kcal and (p or 0) * 4 + (fmin or 0) * 9 > kcal:
        raise ValidationError("No cuadra: la proteína (%s kcal) y la grasa mínima (%s kcal) ya suman más que %s kcal"
                              % (_fmt((p or 0) * 4), _fmt((fmin or 0) * 9), _fmt(kcal)))
    return {"mode": "fijo", "kcal_offset": None, "protein_per_kg": None, "fat_min_pct": None, "fat_max_pct": None,
            "kcal": kcal, "protein_g": p, "fat_min_g": fmin, "fat_max_g": fmax}


def set_target(conn, data, source="web"):
    vf = _date(data.get("valid_from"))
    v = _target_values(data)
    with tx(conn, "set_target", source, vf, payload=data):
        conn.execute(
            "INSERT INTO targets(valid_from,kcal,protein_g,fat_min_g,fat_max_g,provisional,note,created_at,mode,kcal_offset,protein_per_kg,fat_min_pct,fat_max_pct) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(valid_from) DO UPDATE SET kcal=excluded.kcal, "
            "protein_g=excluded.protein_g, fat_min_g=excluded.fat_min_g, fat_max_g=excluded.fat_max_g, "
            "provisional=excluded.provisional, note=excluded.note, mode=excluded.mode, kcal_offset=excluded.kcal_offset, "
            "protein_per_kg=excluded.protein_per_kg, fat_min_pct=excluded.fat_min_pct, fat_max_pct=excluded.fat_max_pct",
            (vf, v["kcal"], v["protein_g"], v["fat_min_g"], v["fat_max_g"], 1 if data.get("provisional", True) else 0, data.get("note"), ts(),
             v["mode"], v["kcal_offset"], v["protein_per_kg"], v["fat_min_pct"], v["fat_max_pct"]))
    return target_for(conn, vf)


# --------------------------------------------------------------- alimentos ---

def food_summary(conn, f, with_options=True):
    out = dict(f)
    if with_options:
        try:
            opts = N.unit_options(conn, f)
        except ValidationError as e:
            opts, out["error"] = [], str(e)
        g = next((o for o in opts if o["key"] in ("g", "ml")), None)
        out["per100"] = N.rounded(N.scale(g["per"], 100), 1) if g else None
        for o in opts:
            o["per"] = N.rounded(o["per"], 6, 6)
        out["units"] = opts
        out["per100_unit"] = g["key"] if g else None
    if f["kind"] == "producto":
        out["portions"] = N.get_portions(conn, f["id"])
    else:
        out["items"] = N.recipe_items(conn, f["id"])
    return out


def list_foods(conn, include_hidden=False):
    q = "SELECT * FROM foods WHERE deleted=0" + ("" if include_hidden else " AND hidden=0") + " ORDER BY name COLLATE NOCASE"
    foods = [food_summary(conn, f) for f in rows(conn.execute(q))]
    since = shift(today(), -60)
    freq = {r["food_id"]: r["n"] for r in conn.execute(
        "SELECT food_id, COUNT(*) n FROM entries WHERE deleted_at IS NULL AND food_id IS NOT NULL AND date>=? GROUP BY food_id", (since,))}
    last = {}
    for r in conn.execute(
            "SELECT food_id, unit_key, quantity FROM entries WHERE deleted_at IS NULL AND food_id IS NOT NULL ORDER BY id"):
        last[r["food_id"]] = {"unit_key": r["unit_key"], "quantity": r["quantity"]}
    for f in foods:
        f["uses_60d"] = freq.get(f["id"], 0)
        f["last"] = last.get(f["id"])
    return foods


def find_food(conn, ref):
    """Resuelve id numérico, código (alimento_02) o nombre aproximado."""
    if isinstance(ref, int) or (isinstance(ref, str) and ref.isdigit()):
        return N.get_food(conn, int(ref))
    r = conn.execute("SELECT * FROM foods WHERE code=?", (ref,)).fetchone()
    if r:
        return row(r)
    q = _norm(ref)
    cands = [f for f in rows(conn.execute("SELECT * FROM foods WHERE deleted=0")) if q in _norm(f["name"])]
    if len(cands) == 1:
        return cands[0]
    if not cands:
        raise NotFound("Ningún alimento coincide con «%s»" % ref)
    raise ValidationError("«%s» es ambiguo: %s" % (ref, "; ".join("%d %s" % (c["id"], c["name"]) for c in cands)))


def _portion_values(p):
    unit = p.get("unit") or None
    if unit not in (None, "g", "ml", "ud"):
        raise ValidationError("Unidad de ración no válida: %s" % unit)
    q = p.get("quality") or "historico"
    if q not in N.QUALITY_ORDER:
        raise ValidationError("Calidad no válida: %s" % q)
    label = (p.get("label") or "").strip()
    amount = _num(p.get("amount"), "cantidad de ración", 0, 100000)
    if not label:
        if amount is None or not unit:
            raise ValidationError("Cada ración necesita un nombre o una cantidad con unidad")
        label = "%g %s" % (amount, unit)
    return (label, amount, unit,
            _num(p.get("kcal"), "kcal", 0, 10000), _num(p.get("protein_g"), "proteína", 0, 1000),
            _num(p.get("carbs_g"), "carbohidratos", 0, 1000), _num(p.get("fat_g"), "grasas", 0, 1000),
            q, p.get("source_type"), p.get("note"), 1 if p.get("is_default") else 0)


FOOD_FIELDS = ("name", "category", "brand", "status", "source", "notes", "favorite", "hidden", "image", "image_source", "reviewed", "default_unit")


def create_food(conn, data, source="web"):
    name = (data.get("name") or "").strip()
    if not name:
        raise ValidationError("Falta el nombre")
    status = data.get("status") or "historico"
    if status not in N.QUALITY_ORDER:
        raise ValidationError("Estado no válido: %s" % status)
    portions = data.get("portions") or []
    vals = [_portion_values(p) for p in portions]
    with tx(conn, "create_food", source, payload=data):
        cur = conn.execute(
            "INSERT INTO foods(code,name,original_name,previous_name,kind,category,brand,status,source,notes,"
            "import_note,historical_text,favorite,hidden,image,image_source,reviewed,created_at,updated_at) "
            "VALUES(?,?,?,?, 'producto',?,?,?,?,?,?,?,?,0,?,?,?,?,?)",
            (data.get("code"), name, data.get("original_name"), data.get("previous_name"), data.get("category"),
             data.get("brand"), status, data.get("source"), data.get("notes"), data.get("import_note"),
             data.get("historical_text"), 1 if data.get("favorite") else 0, data.get("image"), data.get("image_source"),
             _auto_reviewed(conn, data, source), ts(), ts()))
        fid = cur.lastrowid
        for i, v in enumerate(vals):
            conn.execute(
                "INSERT INTO portions(food_id,label,amount,unit,kcal,protein_g,carbs_g,fat_g,quality,source_type,note,is_default,sort) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", (fid,) + v + (i,))
    return food_summary(conn, N.get_food(conn, fid))


def update_food(conn, food_id, data, source="web", apply_open_days=True):
    f = N.get_food(conn, food_id)
    sets, args = [], []
    for k in FOOD_FIELDS:
        if k in data:
            v = data[k]
            if k == "name" and not (v or "").strip():
                raise ValidationError("El nombre no puede quedar vacío")
            if k == "status" and v not in N.QUALITY_ORDER:
                raise ValidationError("Estado no válido: %s" % v)
            if k in ("favorite", "hidden", "reviewed"):
                v = 1 if v else 0
            sets.append("%s=?" % k)
            args.append(v)
    if f["kind"] == "receta":
        for k in ("recipe_servings", "recipe_cooked_weight_g"):
            if k in data:
                sets.append("%s=?" % k)
                args.append(_num(data[k], k, 0.01, 100000))
    with tx(conn, "update_food", source, ref=food_id, payload=data):
        if sets:
            conn.execute("UPDATE foods SET %s, updated_at=? WHERE id=?" % ", ".join(sets), args + [ts(), food_id])
        if "portions" in data and f["kind"] == "producto":
            for i, p in enumerate(data["portions"]):
                if p.get("id"):
                    if p.get("deleted"):
                        conn.execute("UPDATE portions SET deleted=1 WHERE id=? AND food_id=?", (p["id"], food_id))
                        continue
                    v = _portion_values(p)
                    conn.execute(
                        "UPDATE portions SET label=?,amount=?,unit=?,kcal=?,protein_g=?,carbs_g=?,fat_g=?,quality=?,"
                        "source_type=?,note=?,is_default=?,sort=? WHERE id=? AND food_id=?", v + (i, p["id"], food_id))
                elif not p.get("deleted"):
                    conn.execute(
                        "INSERT INTO portions(food_id,label,amount,unit,kcal,protein_g,carbs_g,fat_g,quality,source_type,note,is_default,sort) "
                        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", (food_id,) + _portion_values(p) + (i,))
        if "items" in data and f["kind"] == "receta":
            _write_recipe_items(conn, food_id, data["items"])
        refreshed = refresh_open_entries(conn, [food_id]) if apply_open_days else 0
    out = food_summary(conn, N.get_food(conn, food_id))
    out["entries_refreshed"] = refreshed
    return out


def set_food_flag(conn, food_id, flag, value, source="web"):
    if flag not in ("favorite", "hidden", "deleted"):
        raise ValidationError("Marca no válida")
    N.get_food(conn, food_id)
    with tx(conn, "food_%s" % flag, source, ref=food_id, payload={"value": value}):
        conn.execute("UPDATE foods SET %s=?, updated_at=? WHERE id=?" % flag, (1 if value else 0, ts(), food_id))
    return {"ok": True}


def _write_recipe_items(conn, recipe_id, items):
    if not items:
        raise ValidationError("Una receta necesita al menos un ingrediente")
    conn.execute("DELETE FROM recipe_items WHERE recipe_id=?", (recipe_id,))
    for i, it in enumerate(items):
        fid = int(it["food_id"])
        if fid == recipe_id:
            raise ValidationError("Una receta no puede contenerse a sí misma")
        q = _num(it.get("quantity"), "cantidad", 0.0001, 100000, allow_none=False)
        conn.execute("INSERT INTO recipe_items(recipe_id,food_id,unit_key,quantity,note,sort) VALUES(?,?,?,?,?,?)",
                     (recipe_id, fid, it["unit_key"], q, it.get("note"), i))
    # Valida que todo se puede calcular (unidades correctas, sin ciclos)
    N.recipe_total(conn, N.get_food(conn, recipe_id))


def create_recipe(conn, data, source="web"):
    name = (data.get("name") or "").strip()
    if not name:
        raise ValidationError("Falta el nombre")
    servings = _num(data.get("recipe_servings"), "raciones", 0.01, 1000)
    cooked = _num(data.get("recipe_cooked_weight_g"), "peso cocinado", 1, 100000)
    with tx(conn, "create_recipe", source, payload=data):
        cur = conn.execute(
            "INSERT INTO foods(name,kind,category,status,source,notes,favorite,recipe_servings,recipe_cooked_weight_g,reviewed,created_at,updated_at) "
            "VALUES(?, 'receta', ?, 'historico', 'receta propia', ?, ?, ?, ?, ?, ?, ?)",
            (name, data.get("category") or "receta", data.get("notes"), 1 if data.get("favorite", True) else 0,
             servings or 1, cooked, _auto_reviewed(conn, data, source), ts(), ts()))
        rid = cur.lastrowid
        _write_recipe_items(conn, rid, data.get("items") or [])
    return food_summary(conn, N.get_food(conn, rid))


def affected_foods(conn, food_ids):
    """El alimento y todas las recetas que lo contienen (transitivamente)."""
    out, frontier = set(food_ids), set(food_ids)
    while frontier:
        q = "SELECT DISTINCT recipe_id FROM recipe_items WHERE food_id IN (%s)" % ",".join("?" * len(frontier))
        new = {r[0] for r in conn.execute(q, list(frontier))} - out
        out |= new
        frontier = new
    return out


def refresh_open_entries(conn, food_ids):
    """Recalcula entradas de días ABIERTOS. Los días cerrados nunca se tocan.
    Debe llamarse dentro de una transacción."""
    ids = affected_foods(conn, food_ids)
    if not ids:
        return 0
    q = ("SELECT e.* FROM entries e LEFT JOIN days d ON d.date=e.date WHERE e.deleted_at IS NULL "
         "AND COALESCE(d.status,'abierto')='abierto' AND e.food_id IN (%s)" % ",".join("?" * len(ids)))
    n = 0
    for e in rows(conn.execute(q, list(ids))):
        try:
            nu, qual, label, snap = N.compute(conn, e["food_id"], e["unit_key"], e["quantity"])
        except (ValidationError, NotFound):
            continue
        food = N.get_food(conn, e["food_id"])
        conn.execute("UPDATE entries SET name=?,unit_label=?,kcal=?,protein_g=?,carbs_g=?,fat_g=?,missing=?,quality=?,"
                     "snapshot=?,updated_at=? WHERE id=?",
                     (food["name"], label, nu["kcal"], nu["protein_g"], nu["carbs_g"], nu["fat_g"],
                      json.dumps(nu["missing"]), qual, json.dumps(snap, ensure_ascii=False), ts(), e["id"]))
        n += 1
    return n


# --------------------------------------------------------------- plantillas ---

def list_templates(conn, include_hidden=False):
    q = "SELECT * FROM templates WHERE deleted=0" + ("" if include_hidden else " AND hidden=0") + " ORDER BY name COLLATE NOCASE"
    out = []
    for t in rows(conn.execute(q)):
        out.append(template_detail(conn, t))
    return out


def template_detail(conn, t):
    items, parts, quals = [], [], []
    for it in rows(conn.execute(
            "SELECT ti.*, f.name AS food_name FROM template_items ti JOIN foods f ON f.id=ti.food_id "
            "WHERE ti.template_id=? ORDER BY ti.sort, ti.id", (t["id"],))):
        try:
            n, q, label, _s = N.compute(conn, it["food_id"], it["unit_key"], it["quantity"])
            it.update({"nutr": N.rounded(n), "quality": q, "unit_label": label})
            parts.append(n)
            quals.append(q)
        except (ValidationError, NotFound) as e:
            it["error"] = str(e)
        items.append(it)
    t = dict(t)
    t["items"] = items
    t["nutr"] = N.rounded(N.total(parts)) if parts else None
    t["quality"] = N.worst(*quals) if quals else "pendiente"
    return t


def get_template(conn, tid):
    t = row(conn.execute("SELECT * FROM templates WHERE id=?", (tid,)).fetchone())
    if not t:
        raise NotFound("Comida habitual %s no encontrada" % tid)
    return template_detail(conn, t)


def find_template(conn, ref):
    if isinstance(ref, int) or str(ref).isdigit():
        return get_template(conn, int(ref))
    q = _norm(ref)
    c = [t for t in rows(conn.execute("SELECT * FROM templates WHERE deleted=0")) if q in _norm(t["name"])]
    if len(c) == 1:
        return template_detail(conn, c[0])
    if not c:
        raise NotFound("Ninguna comida habitual coincide con «%s»" % ref)
    raise ValidationError("«%s» es ambiguo: %s" % (ref, "; ".join(t["name"] for t in c)))


def _write_template_items(conn, tid, items):
    if not items:
        raise ValidationError("Una comida habitual necesita al menos un alimento")
    conn.execute("DELETE FROM template_items WHERE template_id=?", (tid,))
    for i, it in enumerate(items):
        q = _num(it.get("quantity"), "cantidad", 0.0001, 100000, allow_none=False)
        N.compute(conn, int(it["food_id"]), it["unit_key"], q)  # valida
        conn.execute("INSERT INTO template_items(template_id,food_id,unit_key,quantity,sort) VALUES(?,?,?,?,?)",
                     (tid, int(it["food_id"]), it["unit_key"], q, i))


def create_template(conn, data, source="web"):
    name = (data.get("name") or "").strip()
    if not name:
        raise ValidationError("Falta el nombre")
    meal = data.get("meal")
    if meal and meal not in MEALS:
        raise ValidationError("Franja no válida")
    with tx(conn, "create_template", source, payload=data):
        cur = conn.execute("INSERT INTO templates(name,meal,notes,reviewed,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                           (name, meal, data.get("notes"), _auto_reviewed(conn, data, source), ts(), ts()))
        _write_template_items(conn, cur.lastrowid, data.get("items") or [])
    return get_template(conn, cur.lastrowid)


def update_template(conn, tid, data, source="web"):
    get_template(conn, tid)
    with tx(conn, "update_template", source, ref=tid, payload=data):
        for k in ("name", "meal", "notes", "favorite", "hidden", "deleted", "reviewed", "image", "image_source"):
            if k in data:
                v = data[k]
                if k == "meal" and v and v not in MEALS:
                    raise ValidationError("Franja no válida")
                conn.execute("UPDATE templates SET %s=?, updated_at=? WHERE id=?" % k, (v, ts(), tid))
        if "items" in data:
            _write_template_items(conn, tid, data["items"])
    return get_template(conn, tid)


# ------------------------------------------------------------------ diario ---

def get_day_row(conn, d):
    r = conn.execute("SELECT * FROM days WHERE date=?", (d,)).fetchone()
    if r:
        return row(r)
    return {"date": d, "status": "abierto", "weight_kg": None, "weight_time": None, "steps": None,
            "neat_kcal": None, "rest_day": None, "notes": None, "hunger": None, "energy": None, "steps_auto": 0,
            "closed_at": None, "created_at": None, "updated_at": None}


def ensure_open(conn, d):
    if get_day_row(conn, d)["status"] == "cerrado":
        raise ClosedDayError("El día %s está cerrado. Reábrelo explícitamente para modificarlo." % d)


def _ensure_day(conn, d):
    conn.execute("INSERT OR IGNORE INTO days(date,created_at,updated_at) VALUES(?,?,?)", (d, ts(), ts()))


def get_entry(conn, eid):
    e = row(conn.execute("SELECT * FROM entries WHERE id=?", (eid,)).fetchone())
    if not e:
        raise NotFound("Entrada %s no encontrada" % eid)
    return e


def _next_sort(conn, d, meal):
    r = conn.execute("SELECT COALESCE(MAX(sort),0)+1 FROM entries WHERE date=? AND meal=?", (d, meal)).fetchone()
    return r[0]


def _insert_food_entry(conn, d, meal, food_id, unit_key, quantity, time=None, note=None, template_id=None):
    nu, qual, label, snap = N.compute(conn, food_id, unit_key, quantity)
    food = N.get_food(conn, food_id)
    cur = conn.execute(
        "INSERT INTO entries(date,meal,time,sort,food_id,template_id,name,kind,unit_key,unit_label,quantity,factor,"
        "kcal,protein_g,carbs_g,fat_g,missing,quality,note,snapshot,created_at,updated_at) "
        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (d, meal, time, _next_sort(conn, d, meal), food_id, template_id, food["name"], food["kind"], unit_key, label,
         quantity, quantity, nu["kcal"], nu["protein_g"], nu["carbs_g"], nu["fat_g"], json.dumps(nu["missing"]),
         qual, note, json.dumps(snap, ensure_ascii=False), ts(), ts()))
    return cur.lastrowid


def _meal(meal):
    meal = (meal or "").lower()
    if meal not in MEALS:
        raise ValidationError("Franja no válida: %s (usa %s)" % (meal, ", ".join(MEALS)))
    return meal


def add_entry(conn, data, source="web"):
    d = _date(data.get("date"))
    meal = _meal(data.get("meal"))
    time = _time(data.get("time"))
    q = _num(data.get("quantity"), "cantidad", 0.0001, 100000, allow_none=False)
    fid = int(data["food_id"])
    with tx(conn, "add_entry", source, d, payload=data):
        ensure_open(conn, d)
        _ensure_day(conn, d)
        eid = _insert_food_entry(conn, d, meal, fid, data["unit_key"], q, time, data.get("note"))
    return entry_out(get_entry(conn, eid))


def add_estimate(conn, data, source="web"):
    """Comida fuera / no predefinida: siempre etiquetada como estimación."""
    d = _date(data.get("date"))
    meal = _meal(data.get("meal"))
    name = (data.get("name") or "").strip()
    if not name:
        raise ValidationError("Describe la comida estimada")
    kcal = _num(data.get("kcal"), "kcal", 0, 10000)
    p = _num(data.get("protein_g"), "proteína", 0, 1000)
    c = _num(data.get("carbs_g"), "carbohidratos", 0, 1000)
    f = _num(data.get("fat_g"), "grasas", 0, 1000)
    kmin = _num(data.get("kcal_min"), "kcal mínimas", 0, 10000)
    kmax = _num(data.get("kcal_max"), "kcal máximas", 0, 10000)
    if kmin is not None and kmax is not None and kmin > kmax:
        raise ValidationError("Rango de kcal invertido")
    nu = N.nutr(kcal, p, c, f)
    with tx(conn, "add_estimate", source, d, payload=data):
        ensure_open(conn, d)
        _ensure_day(conn, d)
        cur = conn.execute(
            "INSERT INTO entries(date,meal,time,sort,name,kind,unit_label,quantity,factor,kcal,protein_g,carbs_g,fat_g,"
            "missing,kcal_min,kcal_max,quality,note,snapshot,created_at,updated_at) "
            "VALUES(?,?,?,?,?,'estimacion',?,1,1,?,?,?,?,?,?,?,'estimacion',?,?,?,?)",
            (d, meal, _time(data.get("time")), _next_sort(conn, d, meal), name, data.get("unit_label") or "ración estimada",
             kcal, p, c, f, json.dumps(nu["missing"]), kmin, kmax, data.get("note"),
             json.dumps({"tipo": "estimacion", "descripcion": name, "nota": data.get("note")}, ensure_ascii=False),
             ts(), ts()))
    return entry_out(get_entry(conn, cur.lastrowid))


def update_entry(conn, eid, data, source="web"):
    e = get_entry(conn, eid)
    if e["deleted_at"]:
        raise ValidationError("La entrada está eliminada; restáurala primero")
    with tx(conn, "update_entry", source, e["date"], ref=eid, payload=data):
        ensure_open(conn, e["date"])
        sets, args = [], []
        if "meal" in data:
            sets.append("meal=?"); args.append(_meal(data["meal"]))
        if "time" in data:
            sets.append("time=?"); args.append(_time(data["time"]))
        if "note" in data:
            sets.append("note=?"); args.append(data["note"])
        if e["kind"] != "estimacion" and ("quantity" in data or "unit_key" in data):
            q = _num(data.get("quantity", e["quantity"]), "cantidad", 0.0001, 100000, allow_none=False)
            uk = data.get("unit_key", e["unit_key"])
            nu, qual, label, snap = N.compute(conn, e["food_id"], uk, q)
            sets += ["unit_key=?", "unit_label=?", "quantity=?", "factor=?", "kcal=?", "protein_g=?", "carbs_g=?",
                     "fat_g=?", "missing=?", "quality=?", "snapshot=?"]
            args += [uk, label, q, q, nu["kcal"], nu["protein_g"], nu["carbs_g"], nu["fat_g"],
                     json.dumps(nu["missing"]), qual, json.dumps(snap, ensure_ascii=False)]
        if e["kind"] == "estimacion":
            vals = {k: e[k] for k in N.FIELDS}
            for k, lim in (("kcal", 10000), ("protein_g", 1000), ("carbs_g", 1000), ("fat_g", 1000),
                           ("kcal_min", 10000), ("kcal_max", 10000)):
                if k in data:
                    v = _num(data[k], k, 0, lim)
                    sets.append("%s=?" % k); args.append(v)
                    if k in vals:
                        vals[k] = v
            if "name" in data and data["name"].strip():
                sets.append("name=?"); args.append(data["name"].strip())
            sets.append("missing=?"); args.append(json.dumps(N.nutr(**vals)["missing"]))
        if sets:
            conn.execute("UPDATE entries SET %s, updated_at=? WHERE id=?" % ", ".join(sets), args + [ts(), eid])
    return entry_out(get_entry(conn, eid))


def delete_entry(conn, eid, source="web"):
    e = get_entry(conn, eid)
    with tx(conn, "delete_entry", source, e["date"], ref=eid, payload={"name": e["name"]}):
        ensure_open(conn, e["date"])
        conn.execute("UPDATE entries SET deleted_at=? WHERE id=?", (ts(), eid))
    return {"ok": True, "id": eid}


def restore_entry(conn, eid, source="web"):
    e = get_entry(conn, eid)
    with tx(conn, "restore_entry", source, e["date"], ref=eid):
        ensure_open(conn, e["date"])
        conn.execute("UPDATE entries SET deleted_at=NULL, updated_at=? WHERE id=?", (ts(), eid))
    return entry_out(get_entry(conn, eid))


def apply_template(conn, tid, data, source="web"):
    """Añade los alimentos de una comida habitual. `items` permite cambiar
    cantidades u omitir alimentos solo para esta vez."""
    t = get_template(conn, tid)
    d = _date(data.get("date"))
    meal = _meal(data.get("meal") or t["meal"] or "otro")
    time = _time(data.get("time"))
    overrides = {int(o["id"]): o for o in (data.get("items") or []) if o.get("id")}
    ids = []
    with tx(conn, "apply_template", source, d, ref=tid, payload=data):
        ensure_open(conn, d)
        _ensure_day(conn, d)
        for it in t["items"]:
            o = overrides.get(it["id"], {})
            if o.get("skip"):
                continue
            q = _num(o.get("quantity", it["quantity"]), "cantidad", 0.0001, 100000, allow_none=False)
            ids.append(_insert_food_entry(conn, d, meal, it["food_id"], o.get("unit_key", it["unit_key"]), q, time,
                                          None, tid))
    return {"ok": True, "entry_ids": ids}


def entry_out(e):
    e = dict(e)
    e["missing"] = json.loads(e["missing"] or "[]")
    e["snapshot"] = json.loads(e["snapshot"]) if e.get("snapshot") else None
    return e


def day_entries(conn, d):
    return [entry_out(e) for e in rows(conn.execute(
        "SELECT * FROM entries WHERE date=? AND deleted_at IS NULL ORDER BY "
        "CASE meal WHEN 'desayuno' THEN 1 WHEN 'almuerzo' THEN 2 WHEN 'merienda' THEN 3 WHEN 'cena' THEN 4 ELSE 5 END, "
        "COALESCE(time,'99'), sort, id", (d,)))]


def update_day(conn, d, data, source="web"):
    d = _date(d)
    fields = {}
    if "weight_kg" in data:
        fields["weight_kg"] = _num(data["weight_kg"], "peso", 30, 250)
        fields["weight_time"] = _time(data.get("weight_time")) if data.get("weight_time") else (
            now_local().strftime("%H:%M") if fields["weight_kg"] is not None and d == today() else None)
    if "steps" in data:
        s = _num(data["steps"], "pasos", 0, 150000)
        fields["steps"] = None if s is None else int(s)
        fields["steps_auto"] = 0
    if "neat_kcal" in data:
        fields["neat_kcal"] = _num(data["neat_kcal"], "NEAT", 0, 2000)
    if "rest_day" in data:
        fields["rest_day"] = None if data["rest_day"] is None else (1 if data["rest_day"] else 0)
    for k in ("notes",):
        if k in data:
            fields[k] = data[k]
    for k in ("hunger", "energy"):
        if k in data:
            v = _num(data[k], k, 1, 5)
            fields[k] = None if v is None else int(v)
    if not fields:
        raise ValidationError("Nada que actualizar")
    with tx(conn, "update_day", source, d, payload=data):
        ensure_open(conn, d)
        _ensure_day(conn, d)
        conn.execute("UPDATE days SET %s, updated_at=? WHERE date=?" % ", ".join("%s=?" % k for k in fields),
                     list(fields.values()) + [ts(), d])
    return get_day_row(conn, d)


# --------------------------------------------------------------- actividad ---

def _activity_values(data):
    t = (data.get("type") or "").lower()
    if t not in ACTIVITY_TYPES:
        raise ValidationError("Tipo de actividad no válido: %s (usa %s)" % (t, ", ".join(ACTIVITY_TYPES)))
    inten = (data.get("intensity") or "normal").lower()
    if inten not in INTENSITIES:
        raise ValidationError("Intensidad no válida: %s" % inten)
    minutes = _num(data.get("minutes"), "minutos", 1, 600)
    kcal = _num(data.get("kcal_net"), "kcal netas", 0, 3000)
    src = data.get("kcal_source") or ("manual" if kcal is not None else "estimado")
    if kcal is None and minutes is None:
        raise ValidationError("Indica la duración o las kcal netas")
    steps = _num(data.get("steps_in_activity"), "pasos de la sesión", 0, 100000)
    return {"type": t, "description": data.get("description"), "minutes": minutes, "intensity": inten,
            "kcal_net": kcal if src != "estimado" else None, "kcal_source": src if kcal is not None else "estimado",
            "steps_in_activity": None if steps is None else int(steps)}


def add_activity(conn, data, source="web"):
    d = _date(data.get("date"))
    v = _activity_values(data)
    with tx(conn, "add_activity", source, d, payload=data):
        ensure_open(conn, d)
        _ensure_day(conn, d)
        cur = conn.execute(
            "INSERT INTO activities(date,type,description,minutes,intensity,kcal_net,kcal_source,steps_in_activity,"
            "created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (d, v["type"], v["description"], v["minutes"], v["intensity"], v["kcal_net"], v["kcal_source"],
             v["steps_in_activity"], ts(), ts()))
        conn.execute("UPDATE days SET rest_day=0 WHERE date=?", (d,))
    return row(conn.execute("SELECT * FROM activities WHERE id=?", (cur.lastrowid,)).fetchone())


def update_activity(conn, aid, data, source="web"):
    a = row(conn.execute("SELECT * FROM activities WHERE id=?", (aid,)).fetchone())
    if not a:
        raise NotFound("Actividad no encontrada")
    merged = dict(a)
    merged.update(data)
    if "kcal_net" in data and data["kcal_net"] in (None, ""):
        merged["kcal_source"] = "estimado"
    elif "kcal_net" in data:
        merged["kcal_source"] = data.get("kcal_source") or "manual"
    v = _activity_values(merged)
    with tx(conn, "update_activity", source, a["date"], ref=aid, payload=data):
        ensure_open(conn, a["date"])
        conn.execute("UPDATE activities SET type=?,description=?,minutes=?,intensity=?,kcal_net=?,kcal_source=?,"
                     "steps_in_activity=?,updated_at=? WHERE id=?",
                     (v["type"], v["description"], v["minutes"], v["intensity"], v["kcal_net"], v["kcal_source"],
                      v["steps_in_activity"], ts(), aid))
    return row(conn.execute("SELECT * FROM activities WHERE id=?", (aid,)).fetchone())


def delete_activity(conn, aid, source="web"):
    a = row(conn.execute("SELECT * FROM activities WHERE id=?", (aid,)).fetchone())
    if not a:
        raise NotFound("Actividad no encontrada")
    with tx(conn, "delete_activity", source, a["date"], ref=aid):
        ensure_open(conn, a["date"])
        conn.execute("UPDATE activities SET deleted_at=? WHERE id=?", (ts(), aid))
    return {"ok": True}


def day_activities(conn, d):
    return rows(conn.execute("SELECT * FROM activities WHERE date=? AND deleted_at IS NULL ORDER BY id", (d,)))


# ------------------------------------------------------------------- gasto ---

def weights_between(conn, a, b):
    return {r["date"]: r["weight_kg"] for r in conn.execute(
        "SELECT date, weight_kg FROM days WHERE weight_kg IS NOT NULL AND date BETWEEN ? AND ? ORDER BY date", (a, b))}


def avg7(conn, d):
    w = weights_between(conn, shift(d, -6), d)
    if not w:
        return None, 0
    return sum(w.values()) / len(w), len(w)


def weight_for_energy(conn, d, s):
    a, n = avg7(conn, d)
    if a is not None:
        return a, "media de %d pesaje%s (7 días)" % (n, "s" if n != 1 else ""), True
    r = conn.execute("SELECT date, weight_kg FROM days WHERE weight_kg IS NOT NULL AND date<? AND date>=? "
                     "ORDER BY date DESC LIMIT 1", (d, shift(d, -30))).fetchone()
    if r:
        return r["weight_kg"], "último pesaje (%s)" % r["date"], True
    r = conn.execute("SELECT date, weight_kg FROM days WHERE weight_kg IS NOT NULL AND date<? ORDER BY date DESC LIMIT 1", (d,)).fetchone()
    if r:
        return r["weight_kg"], "último pesaje (%s)" % r["date"], True
    if s.get("peso_estimado_kg") not in (None, ""):
        return float(s["peso_estimado_kg"]), "peso estimado de perfil (sin pesajes)", False
    return None, "sin pesajes ni peso estimado", False


def activity_kcal(a, kg):
    if a["kcal_net"] is not None:
        return a["kcal_net"], a["kcal_source"]
    met = MET.get(a["type"], MET["otro"]).get(a["intensity"] or "normal", 4.5)
    return max(0.0, (met - 1) * kg * (a["minutes"] or 0) / 60.0), "estimado (MET %.1f neto %.1f)" % (met, met - 1)


def energy(conn, d, intake_kcal=None, day=None, acts=None):
    """Gasto estimado = BMR + TEF + NEAT (sin pasos) + pasos netos + ejercicio neto.

    Evita dobles conteos: el ejercicio se calcula NETO sobre reposo (MET − 1),
    y los pasos registrados dentro de una sesión se restan del total de pasos.
    """
    s = settings(conn)
    day = day or get_day_row(conn, d)
    acts = acts if acts is not None else day_activities(conn, d)
    kg, ksrc, measured = weight_for_energy(conn, d, s)
    h = float(s["altura_cm"]) if s.get("altura_cm") not in (None, "") else None
    age, sex = age_on(s, d), (s.get("sexo") or "").upper()[:1]
    missing = [n for n, v in (("peso", kg), ("altura", h), ("edad o fecha de nacimiento", age), ("sexo", sex if sex in ("H", "M") else None)) if v is None]
    bmr = None if missing else 10 * kg + 6.25 * h - 5 * age + (5 if sex == "H" else -161)
    tef = float(s["tef_pct"]) * (intake_kcal or 0)
    # Día a día (NEAT): se elige al cerrar; mientras el día está abierto y sin elegir cuenta 0 («por definir").
    # Días cerrados de antes de esto, sin elegir: el valor base (normal).
    neat_pending = day["neat_kcal"] is None and day.get("status") != "cerrado"
    neat = day["neat_kcal"] if day["neat_kcal"] is not None else (0.0 if neat_pending else float(s["neat_base_kcal"]))
    # Los niveles (50/150/300/450) son para unos 75 kg: moverse cuesta en proporción al peso, así que se ajustan a cada persona
    neat_f = 1.0 if kg is None else max(0.6, min(1.4, kg / 75))
    if any(abs(neat - v) < 1 for _k, _l, v in NEAT_LEVELS) or abs(neat - float(s["neat_base_kcal"])) < 1:
        neat *= neat_f
    stride_m = (h or 170) * float(s["factor_zancada"]) / 100
    # Pasos dados durante una sesión de carrera/hyrox/caminata: su gasto ya va en la sesión. Si los pasos llegan del móvil
    # por tramos, se calculan solos con la hora del entreno; si no, los indica la persona.
    auto = {}
    if day["steps"] and any(a["type"] in STEP_TYPES and a["steps_in_activity"] is None for a in acts):
        from datetime import datetime as _dt, timedelta as _td
        for w in conn.execute("SELECT activity_id, start_time, duration_min FROM workouts WHERE date=? AND deleted_at IS NULL "
                              "AND activity_id IS NOT NULL AND start_time IS NOT NULL AND duration_min > 0", (d,)):
            t0 = _dt.fromisoformat("%sT%s:00" % (d, w["start_time"][:5]))
            t1 = t0 + _td(minutes=float(w["duration_min"]))
            n = conn.execute("SELECT SUM(steps), COUNT(*) FROM step_buckets WHERE start>=? AND start<? AND (julianday(end)-julianday(start))*24 <= 1.01",
                             (t0.strftime("%Y-%m-%dT%H:%M:%S"), t1.strftime("%Y-%m-%dT%H:%M:%S"))).fetchone()
            if n[1]:
                auto[w["activity_id"]] = int(n[0] or 0)
    steps_in_acts = sum(a["steps_in_activity"] if a["steps_in_activity"] is not None else
                        (auto.get(a["id"], 0) if a["type"] in STEP_TYPES else 0) for a in acts)
    if day["steps"] is None or kg is None:
        steps_kcal, eff_steps = None, None
    else:
        eff_steps = max(0, day["steps"] - steps_in_acts)
        steps_kcal = eff_steps * stride_m / 1000 * kg * float(s["kcal_por_kg_km"])
    ex = []
    for a in acts:
        k, src = activity_kcal(a, kg) if kg is not None or a["kcal_net"] is not None else (0, "falta el peso")
        ex.append({"id": a["id"], "type": a["type"], "kcal": round(k), "source": src})
    ex_total = sum(x["kcal"] for x in ex)
    total = None if bmr is None else bmr + tef + neat + (steps_kcal or 0) + ex_total
    return {
        "weight_used_kg": None if kg is None else round(kg, 2), "weight_source": ksrc, "weight_measured": measured,
        "missing_profile": missing,
        "bmr": None if bmr is None else round(bmr), "tef": round(tef), "neat": round(neat),
        "neat_source": (neat_label(day["neat_kcal"]) or "elegido para el día") if day["neat_kcal"] is not None else ("por definir al cerrar el día" if neat_pending else "normal"),
        "neat_pending": neat_pending, "neat_factor": round(neat_f, 2),
        "neat_set": day["neat_kcal"] is not None,
        "steps": day["steps"], "steps_effective": eff_steps, "steps_in_activities": steps_in_acts, "steps_auto_sessions": auto,
        "steps_kcal": None if steps_kcal is None else round(steps_kcal),
        "exercise": ex, "exercise_kcal": round(ex_total),
        "total": None if total is None else round(total), "complete": steps_kcal is not None and bmr is not None,
        "stride_m": round(stride_m, 3), "kcal_per_kg_km": float(s["kcal_por_kg_km"]),
        "method": "Mifflin-St Jeor + TEF %.0f %% + NEAT + pasos netos (%.2f kcal/kg/km, zancada %.2f m) + ejercicio neto (MET−1)"
                  % (float(s["tef_pct"]) * 100, float(s["kcal_por_kg_km"]), stride_m),
    }


# --------------------------------------------------------------- resumen día ---

def day_state(conn, d=None):
    d = _date(d)
    day = get_day_row(conn, d)
    entries = day_entries(conn, d)
    acts = day_activities(conn, d)
    totals = N.total([N.nutr(e["kcal"], e["protein_g"], e["carbs_g"], e["fat_g"], e["missing"]) for e in entries])
    meals = {}
    for m in MEALS:
        es = [e for e in entries if e["meal"] == m]
        meals[m] = {"label": MEAL_LABEL[m], "entries": es,
                    "totals": N.rounded(N.total([N.nutr(e["kcal"], e["protein_g"], e["carbs_g"], e["fat_g"], e["missing"]) for e in es]))}
    tgt = target_for(conn, d)
    en = energy(conn, d, totals["kcal"], day, acts)
    a7, n7 = avg7(conn, d)
    closure = None
    if day["status"] == "cerrado":
        c = conn.execute("SELECT * FROM closures WHERE date=? ORDER BY version DESC LIMIT 1", (d,)).fetchone()
        if c:
            closure = {"version": c["version"], "closed_at": c["closed_at"], "forced": c["forced"],
                       "summary": json.loads(c["summary"]), "warnings": json.loads(c["warnings"] or "[]")}
    n_closures = conn.execute("SELECT COUNT(*) FROM closures WHERE date=?", (d,)).fetchone()[0]
    return {
        "date": d, "today": today(), "day": day, "status": day["status"], "meals": meals,
        "totals": N.rounded(totals), "target": tgt, "energy": en,
        "balance": None if totals["kcal"] is None or en["total"] is None else round(totals["kcal"] - en["total"]),
        "activities": acts, "avg7": None if a7 is None else round(a7, 2), "avg7_n": n7,
        "entry_count": len(entries), "closure": closure, "closure_count": n_closures, "rev": rev(conn),
        "steps_hours": steps_hours(conn, d), "supplements": supplements(conn), "supplements_taken": supplements_taken(conn, d), "neat_levels": [{"key": k, "label": l, "kcal": v, "kcal_adj": round(v * (en.get("neat_factor") or 1))} for k, l, v in NEAT_LEVELS],
    }


def _fmt(x, nd=0):
    if x is None:
        return "?"
    return ("{:,.%df}" % nd).format(x).replace(",", "X").replace(".", ",").replace("X", ".")


def close_check(conn, d):
    st = day_state(conn, d)
    w = []
    day = st["day"]
    # (sin peso del día no es un aviso: a esa hora ya no se puede pesar y se interpola entre pesajes)
    if day["steps"] is None:
        w.append({"level": "importante", "code": "pasos", "text": "Faltan los pasos (si no anduviste, pon 0): sin ellos el gasto queda incompleto"})
    # «cómo fue el día» no es un aviso: es obligatorio elegirlo para cerrar (needs_neat)
    # (sin entreno no es un aviso: el día cuenta como descanso)
    if st["entry_count"] == 0:
        w.append({"level": "importante", "code": "comidas", "text": "No hay comidas registradas"})
    else:
        empty = [MEAL_LABEL[m] for m in ("almuerzo", "cena") if not st["meals"][m]["entries"]]
        if empty:
            w.append({"level": "info", "code": "franjas", "text": "Sin registros en: %s" % ", ".join(empty)})
    incompletes = [e for m in MEALS for e in st["meals"][m]["entries"] if e["missing"]]
    for e in incompletes:
        miss = ", ".join({"kcal": "kcal", "protein_g": "P", "carbs_g": "C", "fat_g": "G"}[f] for f in e["missing"])
        w.append({"level": "importante" if "kcal" in e["missing"] else "info", "code": "incompleto",
                  "text": "%s: faltan %s" % (e["name"], miss), "entry_id": e["id"]})
    sups = supplements(conn)
    if sups:
        taken = supplements_taken(conn, d)
        miss = [x for x in sups if x["id"] not in taken]
        if miss:
            for x in miss:  # suplementos diarios: lo normal es que sí, se pregunta uno a uno
                w.append({"level": "info", "code": "suplementos", "text": "¿Has tomado %s hoy?" % x["name"].lower(), "supplements": [x]})
    # (los productos «sin datos oficiales» o aproximados no son un aviso: muchos nunca tendrán etiqueta)
    auto = st["energy"].get("steps_auto_sessions") or {}
    for a in st["activities"]:
        if a["type"] in STEP_TYPES and a["steps_in_activity"] is None and day["steps"] and a["id"] not in auto:
            w.append({"level": "info", "code": "doble_conteo",
                      "text": "%s: si el contador de pasos incluye la sesión, indica sus pasos para no contarlos dos veces" % a["type"].capitalize()})
    return {"date": d, "warnings": w, "has_important": any(x["level"] == "importante" for x in w), "needs_neat": day.get("neat_kcal") is None,
            "summary": build_summary(conn, d, st)}


def build_summary(conn, d, st=None):
    st = st or day_state(conn, d)
    t, tgt, en = st["totals"], st["target"], st["energy"]
    diffs = {}
    if tgt:
        diffs = {
            "kcal": None if t["kcal"] is None or not tgt["kcal"] else round(t["kcal"] - tgt["kcal"]),
            "protein_g": None if t["protein_g"] is None or tgt["protein_g"] is None else round(t["protein_g"] - tgt["protein_g"], 1),
            "carbs_g": None if t["carbs_g"] is None or tgt["carbs_g"] is None else round(t["carbs_g"] - tgt["carbs_g"], 1),
        }
        if t["fat_g"] is not None and tgt["fat_min_g"] is not None:
            diffs["fat_g"] = round(t["fat_g"] - tgt["fat_min_g"], 1) if t["fat_g"] < tgt["fat_min_g"] else (
                round(t["fat_g"] - tgt["fat_max_g"], 1) if t["fat_g"] > tgt["fat_max_g"] else 0)
    entries = [e for m in MEALS for e in st["meals"][m]["entries"]]
    est_kcal = sum(e["kcal"] or 0 for e in entries if e["kind"] == "estimacion")
    obs = []
    if tgt and diffs.get("protein_g") is not None and diffs["protein_g"] < -15:
        obs.append("Proteína %s g por debajo del objetivo." % _fmt(-diffs["protein_g"]))
    if tgt and diffs.get("kcal") is not None and abs(diffs["kcal"]) >= 300:
        obs.append("%s kcal %s del objetivo." % (_fmt(abs(diffs["kcal"])), "por encima" if diffs["kcal"] > 0 else "por debajo"))
    if diffs.get("fat_g"):
        obs.append("Grasas: %s g %s del rango." % (_fmt(abs(diffs["fat_g"])), "por debajo" if diffs["fat_g"] < 0 else "por encima"))
    if t["kcal"] and est_kcal / t["kcal"] > 0.25:
        obs.append("%d %% de las kcal vienen de estimaciones puntuales: el total tiene más incertidumbre." % round(100 * est_kcal / t["kcal"]))
    if t["missing"]:
        obs.append("Macros incompletos en %d entrada(s): los totales son mínimos." % sum(1 for e in entries if e["missing"]))
    w = st["day"]["weight_kg"]
    if w is not None and st["avg7"] is not None and st["avg7_n"] >= 4 and abs(w - st["avg7"]) >= 0.8:
        obs.append("Peso %s kg %s de la media de 7 días: probablemente agua/glucógeno/sal, no grasa."
                   % (_fmt(abs(w - st["avg7"]), 1), "por encima" if w > st["avg7"] else "por debajo"))
    if not en["complete"]:
        obs.append("Gasto incompleto: faltan pasos.")
    return {
        "date": d, "intake": t, "target": tgt, "diffs": diffs,
        "meals": {m: st["meals"][m]["totals"] for m in MEALS},
        "energy": en, "balance": st["balance"],
        "weight_kg": w, "avg7": st["avg7"], "steps": st["day"]["steps"],
        "activities": [{"type": a["type"], "minutes": a["minutes"], "intensity": a["intensity"],
                        "description": a["description"]} for a in st["activities"]],
        "rest_day": st["day"]["rest_day"],
        "entries": [{"meal": e["meal"], "time": e["time"], "name": e["name"], "qty": e["unit_label"],
                     "kcal": e["kcal"], "protein_g": e["protein_g"], "carbs_g": e["carbs_g"], "fat_g": e["fat_g"],
                     "missing": e["missing"], "quality": e["quality"], "kind": e["kind"]} for e in entries],
        "estimate_kcal": round(est_kcal), "observations": obs[:5],
    }


def close_day(conn, d, force=False, source="web"):
    d = _date(d)
    chk = close_check(conn, d)
    if get_day_row(conn, d)["status"] == "cerrado":
        raise ClosedDayError("El día %s ya está cerrado" % d)
    if chk["needs_neat"]:
        raise ValidationError("Antes de cerrar hay que elegir cómo fue el día (sin contar los pasos): cama, casa, ligero, normal, activo o muy activo")
    if chk["has_important"] and not force:
        return {"closed": False, "needs_confirmation": True, **chk}
    with tx(conn, "close_day", source, d, payload={"force": force}):
        _ensure_day(conn, d)
        v = conn.execute("SELECT COALESCE(MAX(version),0)+1 FROM closures WHERE date=?", (d,)).fetchone()[0]
        conn.execute("INSERT INTO closures(date,version,closed_at,forced,warnings,summary) VALUES(?,?,?,?,?,?)",
                     (d, v, ts(), 1 if chk["has_important"] else 0, json.dumps(chk["warnings"], ensure_ascii=False),
                      json.dumps(chk["summary"], ensure_ascii=False)))
        conn.execute("UPDATE days SET status='cerrado', closed_at=?, updated_at=? WHERE date=?", (ts(), ts(), d))
    return {"closed": True, "version": v, **chk}


def reopen_day(conn, d, reason=None, source="web"):
    d = _date(d)
    if get_day_row(conn, d)["status"] != "cerrado":
        raise ValidationError("El día %s no está cerrado" % d)
    with tx(conn, "reopen_day", source, d, payload={"reason": reason}):
        conn.execute("UPDATE days SET status='abierto', updated_at=? WHERE date=?", (ts(), d))
        conn.execute("UPDATE closures SET reopened_at=?, reopen_reason=? WHERE date=? AND reopened_at IS NULL",
                     (ts(), reason, d))
    return {"ok": True, "date": d}


def summary_text(s):
    """Resumen compacto para el chat."""
    t, tg, en = s["intake"], s["target"] or {}, s["energy"]
    L = ["Resumen %s" % s["date"]]
    mark = lambda f: "*" if f in t["missing"] else ""
    L.append("Ingesta: %s%s kcal · P %s%s · C %s%s · G %s%s" % (
        _fmt(t["kcal"]), mark("kcal"), _fmt(t["protein_g"]), mark("protein_g"), _fmt(t["carbs_g"]), mark("carbs_g"),
        _fmt(t["fat_g"]), mark("fat_g")))
    if tg:
        L.append("Objetivo: %s kcal · P %s · C %s · G %s–%s  →  dif. %s kcal, P %s g" % (
            _fmt(tg.get("kcal")), _fmt(tg.get("protein_g")), _fmt(tg.get("carbs_g")), _fmt(tg.get("fat_min_g")),
            _fmt(tg.get("fat_max_g")), _fmt(s["diffs"].get("kcal")), _fmt(s["diffs"].get("protein_g"))))
    L.append("Gasto estimado: %s kcal (BMR %s + TEF %s + NEAT %s + pasos %s + ejercicio %s)%s" % (
        _fmt(en["total"]), _fmt(en["bmr"]), _fmt(en["tef"]), _fmt(en["neat"]), _fmt(en["steps_kcal"]),
        _fmt(en["exercise_kcal"]), "" if en["complete"] else " — incompleto"))
    L.append("Balance estimado: %s kcal" % _fmt(s["balance"]))
    L.append("Peso: %s kg (media 7 d: %s) · Pasos: %s · Actividad: %s" % (
        _fmt(s["weight_kg"], 1), _fmt(s["avg7"], 2), _fmt(s["steps"]),
        ", ".join("%s %s min %s" % (a["type"], _fmt(a["minutes"]), a["intensity"]) for a in s["activities"])
        or ("descanso" if s["rest_day"] == 1 else "—")))
    for o in s["observations"]:
        L.append("· " + o)
    if t["missing"]:
        L.append("(* total mínimo: hay macros desconocidos)")
    return "\n".join(L)


# ------------------------------------------------------------ estadísticas ---

def history(conn, a, b):
    """Fila por día con datos entre a y b (inclusive)."""
    dates = set(r[0] for r in conn.execute("SELECT date FROM days WHERE date BETWEEN ? AND ?", (a, b)))
    dates |= set(r[0] for r in conn.execute(
        "SELECT DISTINCT date FROM entries WHERE deleted_at IS NULL AND date BETWEEN ? AND ?", (a, b)))
    out = []
    for d in sorted(dates):
        st = day_state(conn, d)
        out.append({
            "date": d, "status": st["status"], "kcal": st["totals"]["kcal"], "protein_g": st["totals"]["protein_g"],
            "carbs_g": st["totals"]["carbs_g"], "fat_g": st["totals"]["fat_g"], "missing": st["totals"]["missing"],
            "entries": st["entry_count"], "weight_kg": st["day"]["weight_kg"], "avg7": st["avg7"],
            "steps": st["day"]["steps"], "tdee": st["energy"]["total"], "tdee_complete": st["energy"]["complete"],
            "balance": st["balance"], "target_kcal": (st["target"] or {}).get("kcal"),
            "training": ", ".join(x["type"] for x in st["activities"]),
        })
    return out


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def weekly(conn, weeks=12):
    end = parse_date(today())
    start = end - timedelta(days=end.weekday()) - timedelta(weeks=weeks - 1)
    hist = history(conn, start.isoformat(), end.isoformat())
    by = {}
    for h in hist:
        dd = parse_date(h["date"])
        wk = (dd - timedelta(days=dd.weekday())).isoformat()
        by.setdefault(wk, []).append(h)
    out, prev_w = [], None
    for wk in sorted(by):
        hs = by[wk]
        logged = [h for h in hs if h["entries"] > 0]
        w = _mean([h["weight_kg"] for h in hs])
        out.append({
            "week": wk, "days": len(hs), "days_logged": len(logged),
            "days_closed": sum(1 for h in hs if h["status"] == "cerrado"),
            "kcal": _mean([h["kcal"] for h in logged]), "protein_g": _mean([h["protein_g"] for h in logged]),
            "carbs_g": _mean([h["carbs_g"] for h in logged]), "fat_g": _mean([h["fat_g"] for h in logged]),
            "weight": w, "weight_n": sum(1 for h in hs if h["weight_kg"] is not None),
            "weight_delta": None if w is None or prev_w is None else w - prev_w,
            "tdee": _mean([h["tdee"] for h in logged if h["tdee_complete"]]),
            "balance": _mean([h["balance"] for h in logged if h["tdee_complete"]]),
            "steps": _mean([h["steps"] for h in hs]),
        })
        if w is not None:
            prev_w = w
    for o in out:
        for k in ("kcal", "protein_g", "carbs_g", "fat_g", "tdee", "balance", "steps"):
            if o[k] is not None:
                o[k] = round(o[k])
        for k in ("weight", "weight_delta"):
            if o[k] is not None:
                o[k] = round(o[k], 2)
    return out


def calibration(conn, days=28):
    """Mantenimiento observado = ingesta media − pendiente del peso × 7700 kcal/kg.
    Solo se ofrece con datos suficientes (≥14 días con ingesta y ≥10 pesajes)."""
    b = today()
    a = shift(b, -(days - 1))
    hist = history(conn, a, b)
    logged = [h for h in hist if h["entries"] > 0 and h["kcal"] is not None and "kcal" not in h["missing"]]
    ws = [(parse_date(h["date"]).toordinal(), h["weight_kg"]) for h in hist if h["weight_kg"] is not None]
    res = {"window_days": days, "days_logged": len(logged), "weights": len(ws), "ready": False}
    if len(logged) < 14 or len(ws) < 10:
        res["reason"] = "Hacen falta ≥14 días con ingesta completa y ≥10 pesajes en los últimos %d días" % days
        return res
    mx = sum(x for x, _ in ws) / len(ws)
    my = sum(y for _, y in ws) / len(ws)
    slope = sum((x - mx) * (y - my) for x, y in ws) / max(1e-9, sum((x - mx) ** 2 for x, _ in ws))
    intake = sum(h["kcal"] for h in logged) / len(logged)
    tdee_est = _mean([h["tdee"] for h in logged if h["tdee_complete"]])
    res.update({"ready": True, "intake_avg": round(intake), "slope_kg_week": round(slope * 7, 2),
                "observed_maintenance": round(intake - slope * 7700),
                "model_tdee_avg": None if tdee_est is None else round(tdee_est)})
    return res


def weight_at(allw, d):
    """Peso de una fecha entre dos pesajes (interpolación lineal). None fuera del primer/último pesaje."""
    ks = sorted(allw)
    if not ks or d < ks[0] or d > ks[-1]:
        return None
    if d in allw:
        return allw[d]
    i = next(i for i, k in enumerate(ks) if k > d)
    a, b = ks[i - 1], ks[i]
    da = (date.fromisoformat(d) - date.fromisoformat(a)).days
    db = (date.fromisoformat(b) - date.fromisoformat(a)).days
    return allw[a] + (allw[b] - allw[a]) * da / db


def weight_series(conn, a, b):
    ws = weights_between(conn, shift(a, -6), b)
    allw = weights_between(conn, "0000-01-01", "9999-12-31")
    out = []
    d = a
    while d <= b:
        win = [v for k, v in ws.items() if shift(d, -6) <= k <= d]
        it = None if d in allw else weight_at(allw, d)
        out.append({"date": d, "weight_kg": ws.get(d), "interp": None if it is None else round(it, 2),
                    "avg7": round(sum(win) / len(win), 2) if win else None})
        d = shift(d, 1)
    return out


# ------------------------------------------------------ copias / exportación ---

def backup_dir(conn):
    """backups/ de la carpeta Salud; para BD de prueba, junto a esa BD."""
    path = os.path.abspath(conn.execute("PRAGMA database_list").fetchone()[2] or "")
    if path == os.path.abspath(DEFAULT_DB):
        return BACKUP_DIR
    return os.path.join(os.path.dirname(path), "backups")


def backup(conn, reason="manual", dest_dir=None):
    dest_dir = dest_dir or backup_dir(conn)
    os.makedirs(dest_dir, exist_ok=True)
    name = "salud_%s_%s.db" % (now_local().strftime("%Y%m%d-%H%M%S"), re.sub(r"[^a-z0-9]+", "-", reason.lower()))
    path = os.path.join(dest_dir, name)
    dst = sqlite3.connect(path)
    dst.execute("PRAGMA journal_mode=MEMORY")  # fichero nuevo: sin -journal residual
    with dst:
        conn.backup(dst)
    dst.close()
    _prune_backups(dest_dir)
    return path


def _prune_backups(dest_dir, keep=60):
    files = sorted(f for f in os.listdir(dest_dir) if f.startswith("salud_") and f.endswith(".db"))
    for f in files[:-keep]:
        try:
            os.remove(os.path.join(dest_dir, f))
        except OSError:
            pass  # en la carpeta montada de Cowork no se puede borrar: no es un error


def last_backup_age_hours(conn, dest_dir=None):
    dest_dir = dest_dir or backup_dir(conn)
    if not os.path.isdir(dest_dir):
        return None
    fs = [os.path.join(dest_dir, f) for f in os.listdir(dest_dir) if f.startswith("salud_") and f.endswith(".db")]
    if not fs:
        return None
    import time
    return (time.time() - max(os.path.getmtime(f) for f in fs)) / 3600


EXPORT_TABLES = ["foods", "portions", "recipe_items", "templates", "template_items", "days", "entries",
                 "activities", "closures", "targets", "settings", "events"]


def export_zip_bytes(conn):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        full = {}
        for t in EXPORT_TABLES:
            data = rows(conn.execute("SELECT * FROM %s" % t))
            if t == "settings":
                data = [r for r in data if r["key"] != "hevy_api_key"]
            full[t] = data
            s = io.StringIO()
            if data:
                w = csv.DictWriter(s, fieldnames=list(data[0].keys()))
                w.writeheader()
                w.writerows(data)
            z.writestr("csv/%s.csv" % t, "﻿" + s.getvalue())
        full["_meta"] = {"exported_at": ts(), "rev": rev(conn)}
        z.writestr("salud_completo.json", json.dumps(full, ensure_ascii=False, indent=1))
    return buf.getvalue()


def export_to_folder(conn, dest_dir=None):
    dest_dir = dest_dir or EXPORT_DIR
    os.makedirs(dest_dir, exist_ok=True)
    path = os.path.join(dest_dir, "salud_export_%s.zip" % now_local().strftime("%Y%m%d-%H%M%S"))
    with open(path, "wb") as f:
        f.write(export_zip_bytes(conn))
    return path


def events(conn, d=None, limit=100):
    if d:
        return rows(conn.execute("SELECT * FROM events WHERE date=? ORDER BY id DESC LIMIT ?", (d, limit)))
    return rows(conn.execute("SELECT * FROM events ORDER BY id DESC LIMIT ?", (limit,)))


# ------------------------------------------------- pasos automáticos (Health Connect / Salud de Apple)
def _local_dt(iso):
    """Instante ISO-8601 (con zona) → fecha y hora en Madrid."""
    from datetime import datetime as _dt
    from zoneinfo import ZoneInfo
    x = _dt.fromisoformat(str(iso).replace("Z", "+00:00"))
    if x.tzinfo is None:
        return x
    return x.astimezone(ZoneInfo("Europe/Madrid")).replace(tzinfo=None)


def ingest_health(conn, payload, source="health"):
    """Recibe el JSON de la app «HC Webhook» / «Health Webhook»: guarda los tramos de pasos (sustituye el mismo
    tramo si llega otra vez) y recalcula los pasos de los días afectados que sigan abiertos."""
    if not isinstance(payload, dict):
        raise ValidationError("JSON no válido")
    tot = payload.get("steps", payload.get("pasos"))
    if isinstance(tot, (int, float, str)) and not isinstance(tot, bool):
        return _ingest_total(conn, payload, tot, source)
    body = _ingest_body(conn, payload, source)
    recs = payload.get("steps") or []
    days, n = set(), 0
    with tx(conn, "health_sync", source, payload={"steps": len(recs), "app": payload.get("app_version")}):
        for r in recs:
            try:
                start, end, cnt = _local_dt(r["start_time"]), _local_dt(r.get("end_time") or r["start_time"]), int(r["count"])
            except (KeyError, ValueError, TypeError):
                continue
            if cnt < 0 or cnt > 200000:
                continue
            key = start.strftime("%Y-%m-%dT%H:%M:%S")
            if (end - start).total_seconds() <= 3 * 3600:
                # llegan tramos cortos (15–60 min): fuera los totales del día que hubiera (resolución «diaria») para no sumar dos veces
                conn.execute("DELETE FROM step_buckets WHERE substr(start,1,10)=? AND start<>? AND "
                             "(julianday(end)-julianday(start))*24 > 3", (key[:10], key))
            conn.execute("INSERT INTO step_buckets(start, end, steps, received_at) VALUES(?,?,?,?) "
                         "ON CONFLICT(start) DO UPDATE SET end=excluded.end, steps=excluded.steps, received_at=excluded.received_at",
                         (key, end.strftime("%Y-%m-%dT%H:%M:%S"), cnt, ts()))
            days.add(key[:10])
            n += 1
        out = []
        for d in sorted(days):
            tot = conn.execute("SELECT SUM(steps) FROM step_buckets WHERE substr(start,1,10)=?", (d,)).fetchone()[0] or 0
            st = conn.execute("SELECT status FROM days WHERE date=?", (d,)).fetchone()
            if st and st["status"] == "cerrado":
                out.append({"fecha": d, "pasos": int(tot), "guardado": False, "motivo": "día cerrado"})
                continue
            _ensure_day(conn, d)
            conn.execute("UPDATE days SET steps=?, steps_auto=1, updated_at=? WHERE date=?", (int(tot), ts(), d))
            out.append({"fecha": d, "pasos": int(tot), "guardado": True})
    return {"ok": True, "tramos": n, "dias": out, "bascula": body}


# Báscula por Health Connect: tipo del envío → (campo de body_metrics, clave del valor, conversión)
_BODY_HC = {"weight": ("weight_kg", "kilograms", 1), "body_fat": ("fat_pct", "percentage", 1), "lean_body_mass": ("lean_kg", "kilograms", 1),
            "bone_mass": ("bone_kg", "kilograms", 1), "body_water_mass": ("water_kg", "kilograms", 1),
            "basal_metabolic_rate": ("bmr_kcal", "watts", 86400 / 4184)}


def _ingest_body(conn, payload, source):
    """Junta las medidas de la báscula por momento (fecha y hora) y las guarda como un pesaje; no duplica
    uno ya apuntado (misma hora, o mismo día con el mismo peso, p. ej. desde una captura)."""
    from . import training as T
    by = {}
    for typ, (field, key, k) in _BODY_HC.items():
        for r in payload.get(typ) or []:
            try:
                dt = _local_dt(r["time"])
                v = round(float(r[key]) * k, 2)
            except (KeyError, ValueError, TypeError):
                continue
            by.setdefault(dt.strftime("%Y-%m-%d %H:%M"), {})[field] = v
    out = []
    for when, vals in sorted(by.items()):
        d, t = when[:10], when[11:]
        same = conn.execute("SELECT * FROM body_metrics WHERE date=? AND deleted_at IS NULL AND (time=? OR (weight_kg IS NOT NULL AND ABS(weight_kg-?)<0.06))",
                            (d, t, vals.get("weight_kg", -99))).fetchone()
        if same:
            new = {f: v for f, v in vals.items() if same[f] is None}
            if new:
                conn.execute("UPDATE body_metrics SET %s WHERE id=?" % ",".join(f + "=?" for f in new), list(new.values()) + [same["id"]])
            out.append({"fecha": d, "hora": t, "nuevo": False})
            continue
        if "weight_kg" not in vals and "fat_pct" not in vals:
            continue
        try:
            T.add_body(conn, dict(vals, date=d, time=t, source="movil"), source)
            out.append({"fecha": d, "hora": t, "nuevo": True, **vals})
        except (ValidationError, ClosedDayError):
            continue
    return out


def _ingest_total(conn, payload, tot, source):
    """Formato sencillo (p. ej. un Atajo de iPhone): {"steps": total del día, "date": "AAAA-MM-DD" opcional (hoy)}.
    Sustituye los pasos del día; los tramos por horas de ese día se quitan para no sumar dos veces."""
    try:
        n = int(round(float(str(tot).replace(",", ".").strip())))
    except ValueError:
        raise ValidationError("Pasos no válidos: %s" % tot)
    if n < 0 or n > 200000:
        raise ValidationError("Pasos fuera de rango: %s" % n)
    d = _date(str(payload.get("date") or payload.get("fecha") or "")[:10] or None)
    with tx(conn, "health_sync", source, d, payload={"total": n}):
        st = conn.execute("SELECT status FROM days WHERE date=?", (d,)).fetchone()
        if st and st["status"] == "cerrado":
            return {"ok": True, "dias": [{"fecha": d, "pasos": n, "guardado": False, "motivo": "día cerrado"}]}
        conn.execute("DELETE FROM step_buckets WHERE substr(start,1,10)=?", (d,))
        _ensure_day(conn, d)
        conn.execute("UPDATE days SET steps=?, steps_auto=1, updated_at=? WHERE date=?", (n, ts(), d))
    return {"ok": True, "dias": [{"fecha": d, "pasos": n, "guardado": True}]}


def steps_stats(conn, d=None):
    """Para la ficha de pasos: por horas del día, la media por horas de los 7 días anteriores con datos,
    los totales de los últimos 30 días y cuándo llegó el último envío del móvil."""
    d = _date(d)
    prev = [r[0] for r in conn.execute("SELECT DISTINCT substr(start,1,10) FROM step_buckets WHERE substr(start,1,10)<? "
                                       "ORDER BY 1 DESC LIMIT 7", (d,))]
    avg = None
    if prev:
        tot = [0] * 24
        for p in prev:
            for i, v in enumerate(steps_hours(conn, p) or [0] * 24):
                tot[i] += v
        avg = [round(v / len(prev)) for v in tot]
    since = shift(d, -400)
    days = [{"date": r["date"], "steps": r["steps"]} for r in conn.execute(
        "SELECT date, steps FROM days WHERE date BETWEEN ? AND ? AND steps IS NOT NULL ORDER BY date", (since, d))]
    last = conn.execute("SELECT MAX(received_at) FROM step_buckets").fetchone()[0]
    bh = conn.execute("SELECT substr(start,1,13) AS h, SUM(steps) AS n FROM step_buckets WHERE (julianday(end)-julianday(start))*24 <= 1.01 "
                      "GROUP BY 1 ORDER BY n DESC LIMIT 1").fetchone()
    try:
        goal = int(float(settings(conn).get("objetivo_pasos") or 8000))
    except ValueError:
        goal = 8000
    return {"date": d, "hours": steps_hours(conn, d), "avg_hours": avg, "avg_days": len(prev), "days": days, "last_received": last,
            "goal": goal, "best_hour": {"date": bh["h"][:10], "hour": int(bh["h"][11:13]), "steps": bh["n"]} if bh and bh["n"] else None}


def steps_hours(conn, d):
    rows_ = conn.execute("SELECT start, end, steps FROM step_buckets WHERE substr(start,1,10)=?", (d,)).fetchall()
    if not rows_:
        return None
    hrs = [0.0] * 24
    for r in rows_:
        h0, h1 = int(r["start"][11:13]), int((r["end"] or r["start"])[11:13])
        if h1 <= h0:
            hrs[h0] += r["steps"]
            continue
        # un tramo largo (p. ej. el total del día) se reparte por igual entre sus horas
        for h in range(h0, h1 + 1):
            hrs[h] += r["steps"] / (h1 - h0 + 1)
    return [round(x) for x in hrs]
