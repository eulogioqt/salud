"""Entrenos estilo Hevy, báscula (composición = estimación) y fotos de alimentos."""
from __future__ import annotations

import base64
import os
import re

from . import core
from .db import DATA_DIR, NotFound, ValidationError, now_local, row, rows, shift, ts, tx
from .nutrition import get_food

SET_TYPES = ["normal", "calentamiento", "fallo", "drop"]
EX_KINDS = ["peso", "lastre", "corporal", "asistido", "cardio", "tiempo"]
SET_ALIASES = {"w": "calentamiento", "warmup": "calentamiento", "warm-up": "calentamiento", "f": "fallo",
               "failure": "fallo", "d": "drop", "dropset": "drop", "n": "normal", "": "normal", None: "normal"}


def _n(v, name, lo, hi):
    return core._num(v, name, lo, hi)


# ------------------------------------------------------------------ entrenos

# Mismo ejercicio con dos nombres en Hevy: se agrupan en estadísticas e historial.
EX_ALIASES = {
    "elevacion laterales (maquina)": "elevacion lateral (maquina)",
    "flexiones de brazos (con peso agregado)": "flexiones (con peso anadido)",
    "dead hang": "colgado en barra",
    "vuelos posteriores": "aperturas invertidas",
    "vuelo posterior": "aperturas invertidas",
    "vuelos posteriores (maquina)": "aperturas invertidas",
    "vuelo posterior (maquina)": "aperturas invertidas",
    "vuelos posteriores en maquina": "aperturas invertidas",
    "vuelo posterior en maquina": "aperturas invertidas",
}

# 1RM estimado igual que Hevy: peso ÷ porcentaje según reps (tabla del centro de ayuda de Hevy; >30 reps = 50 %).
HEVY_PCT = [1.00, .97, .94, .92, .89, .86, .83, .81, .78, .75, .73, .71, .70, .68, .67,
            .65, .64, .63, .61, .60, .59, .58, .57, .56, .55, .54, .53, .52, .51, .50]


def e1rm(weight, reps):
    if not weight or not reps or reps < 1:
        return None
    return weight / HEVY_PCT[min(int(round(reps)), 30) - 1]


EQUIPMENT = ("barra", "mancuerna", "maquina", "discos", "polea", "cable", "corporal", "otro")


def exercise_settings(conn):
    return {r["name_key"]: dict(r) for r in conn.execute("SELECT * FROM exercise_settings")}


def set_exercise_settings(conn, data, source="web"):
    name = (data.get("name") or "").strip()
    if not name:
        raise ValidationError("Falta el ejercicio")
    key = _norm_ex(name)
    cur = conn.execute("SELECT * FROM exercise_settings WHERE name_key=?", (key,)).fetchone()
    vals = dict(cur) if cur else {"name_key": key, "name": name}
    for k in ("equipment", "machine_kg", "load_ratio", "unilateral", "notes", "sl_slug"):
        if k in data:
            vals[k] = data[k]
    sl = (vals.get("sl_slug") or "").strip().lower()
    m = re.search(r"strength-standards/([a-z0-9-]+)", sl)  # se acepta la URL de Strength Level
    sl = m.group(1) if m else sl
    if sl and not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", sl):
        raise ValidationError("Tabla de Strength Level no válida (usa el final de su URL, p. ej. «weighted-pull-ups»)")
    vals["sl_slug"] = sl or None
    if vals.get("equipment") not in (None, "") + EQUIPMENT:
        raise ValidationError("Material no válido")
    for k, lo, hi in (("machine_kg", 0, 500), ("load_ratio", 0.05, 4)):
        if vals.get(k) in ("", None):
            vals[k] = None
        else:
            try:
                vals[k] = float(vals[k])
            except (TypeError, ValueError):
                raise ValidationError("Valor no válido: %s" % k)
            if not lo <= vals[k] <= hi:
                raise ValidationError("Valor fuera de rango: %s" % k)
    if vals.get("unilateral") is not None:
        vals["unilateral"] = 1 if vals["unilateral"] else 0
    with tx(conn, "exercise_settings", source, payload=data):
        conn.execute("INSERT OR REPLACE INTO exercise_settings(name_key,name,equipment,machine_kg,load_ratio,unilateral,notes,sl_slug,updated_at) "
                     "VALUES(?,?,?,?,?,?,?,?,?)", (key, vals.get("name") or name, vals.get("equipment"), vals.get("machine_kg"),
                                                   vals.get("load_ratio"), vals.get("unilateral"), vals.get("notes"), vals.get("sl_slug"), ts()))
    return exercise_settings(conn).get(key)


def _norm_ex(name):
    n = core._norm(re.sub(r"\s+", " ", name or ""))
    return EX_ALIASES.get(n, n)


def _write_exercises(conn, wid, exercises):
    conn.execute("DELETE FROM workout_sets WHERE exercise_id IN (SELECT id FROM workout_exercises WHERE workout_id=?)", (wid,))
    conn.execute("DELETE FROM workout_exercises WHERE workout_id=?", (wid,))
    for i, ex in enumerate(exercises or []):
        name = (ex.get("name") or "").strip()
        if not name:
            raise ValidationError("Ejercicio %d sin nombre" % (i + 1))
        kind = ex.get("kind") or "peso"
        if kind not in EX_KINDS:
            raise ValidationError("Tipo de ejercicio no válido: %s (%s)" % (kind, ", ".join(EX_KINDS)))
        cur = conn.execute("INSERT INTO workout_exercises(workout_id,sort,name,kind,notes,superset) VALUES(?,?,?,?,?,?)",
                           (wid, i, name, kind, ex.get("notes"), ex.get("superset")))
        for j, st in enumerate(ex.get("sets") or []):
            t = st.get("type")
            t = SET_ALIASES.get(t.lower() if isinstance(t, str) else t, t)
            if t not in SET_TYPES:
                raise ValidationError("Tipo de serie no válido: %s" % t)
            reps = _n(st.get("reps"), "repeticiones", 0, 1000)
            conn.execute("INSERT INTO workout_sets(exercise_id,idx,type,weight_kg,reps,distance_m,seconds,rpe) VALUES(?,?,?,?,?,?,?,?)",
                         (cur.lastrowid, j, t, _n(st.get("weight_kg"), "peso", -300, 1000), None if reps is None else int(reps),
                          _n(st.get("distance_m"), "distancia", 0, 100000), _n(st.get("seconds"), "segundos", 0, 100000),
                          _n(st.get("rpe"), "RPE", 1, 10)))


def _tracked(conn, d):
    """Antes del inicio del seguimiento los entrenos solo son histórico deportivo (no tocan días ni gasto)."""
    return d >= core.tracking_start(conn)


def _sync_activity(conn, wid):
    w = row(conn.execute("SELECT * FROM workouts WHERE id=?", (wid,)).fetchone())
    if w["deleted_at"] or not w["duration_min"] or not _tracked(conn, w["date"]):
        if w["activity_id"]:
            conn.execute("UPDATE activities SET deleted_at=? WHERE id=?", (ts(), w["activity_id"]))
            conn.execute("UPDATE workouts SET activity_id=NULL WHERE id=?", (wid,))
        return
    vals = (w["date"], w["activity_type"], w["title"], w["duration_min"], w["intensity"])
    if w["activity_id"]:
        conn.execute("UPDATE activities SET date=?,type=?,description=?,minutes=?,intensity=?,deleted_at=NULL,updated_at=? WHERE id=?",
                     vals + (ts(), w["activity_id"]))
    else:
        cur = conn.execute("INSERT INTO activities(date,type,description,minutes,intensity,kcal_source,created_at,updated_at) "
                           "VALUES(?,?,?,?,?,'estimado',?,?)", vals + (ts(), ts()))
        conn.execute("UPDATE workouts SET activity_id=? WHERE id=?", (cur.lastrowid, wid))
    conn.execute("UPDATE days SET rest_day=0 WHERE date=?", (w["date"],))


def _workout_values(data, base=None):
    base = base or {}
    d = core._date(data.get("date", base.get("date")))
    title = (data.get("title", base.get("title")) or "").strip()
    if not title:
        raise ValidationError("Falta el título del entreno")
    at = (data.get("activity_type", base.get("activity_type")) or "fuerza").lower()
    if at not in core.ACTIVITY_TYPES:
        raise ValidationError("Tipo no válido: %s" % at)
    inten = (data.get("intensity", base.get("intensity")) or "normal").lower()
    if inten not in core.INTENSITIES:
        raise ValidationError("Intensidad no válida: %s" % inten)
    return {"date": d, "start_time": core._time(data.get("start_time", base.get("start_time"))), "title": title,
            "duration_min": _n(data.get("duration_min", base.get("duration_min")), "duración", 1, 600),
            "activity_type": at, "intensity": inten,
            "hevy_volume_kg": _n(data.get("hevy_volume_kg", base.get("hevy_volume_kg")), "volumen", 0, 1000000),
            "notes": data.get("notes", base.get("notes")), "source": data.get("source", base.get("source")) or "hevy"}


def create_workout(conn, data, source="chat"):
    v = _workout_values(data)
    with tx(conn, "create_workout", source, v["date"], payload=data):
        if _tracked(conn, v["date"]):
            core.ensure_open(conn, v["date"])
            core._ensure_day(conn, v["date"])
        cur = conn.execute("INSERT INTO workouts(date,start_time,title,duration_min,activity_type,intensity,hevy_volume_kg,notes,source,"
                           "hevy_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                           (v["date"], v["start_time"], v["title"], v["duration_min"], v["activity_type"], v["intensity"],
                            v["hevy_volume_kg"], v["notes"], v["source"], data.get("hevy_id"), ts(), ts()))
        wid = cur.lastrowid
        _write_exercises(conn, wid, data.get("exercises"))
        _sync_activity(conn, wid)
    return get_workout(conn, wid)


def update_workout(conn, wid, data, source="web"):
    w = _get(conn, wid)
    v = _workout_values(data, w)
    with tx(conn, "update_workout", source, v["date"], ref=wid, payload=data):
        if _tracked(conn, w["date"]):
            core.ensure_open(conn, w["date"])
        if _tracked(conn, v["date"]):
            core.ensure_open(conn, v["date"])
            core._ensure_day(conn, v["date"])
        conn.execute("UPDATE workouts SET date=?,start_time=?,title=?,duration_min=?,activity_type=?,intensity=?,hevy_volume_kg=?,"
                     "notes=?,source=?,updated_at=? WHERE id=?", tuple(v.values()) + (ts(), wid))
        if "exercises" in data:
            _write_exercises(conn, wid, data["exercises"])
        _sync_activity(conn, wid)
    return get_workout(conn, wid)


def delete_workout(conn, wid, source="web"):
    w = _get(conn, wid)
    with tx(conn, "delete_workout", source, w["date"], ref=wid, payload={"title": w["title"]}):
        if _tracked(conn, w["date"]):
            core.ensure_open(conn, w["date"])
        conn.execute("UPDATE workouts SET deleted_at=? WHERE id=?", (ts(), wid))
        _sync_activity(conn, wid)
    return {"ok": True}


def _get(conn, wid):
    w = row(conn.execute("SELECT * FROM workouts WHERE id=?", (wid,)).fetchone())
    if not w:
        raise NotFound("Entreno %s no encontrado" % wid)
    return w


# Como Hevy: en los ejercicios que mueven el 100 % del cuerpo (fondos, dominadas) con lastre, el volumen es (peso corporal + lastre) × reps;
# en el resto (flexiones…) solo cuenta el lastre. https://help.hevyapp.com/hc/en-us/articles/38387131819799
FULL_BW_RX = re.compile(r"fondo|dips?\b|dominada|pull.?up|chin.?up")


def full_bw(name):
    n = _norm_ex(name or "")
    return bool(FULL_BW_RX.search(n)) and not re.search(r"banco|bench|asistid|assist|escapular", n)


def bw_on(conn, d):
    """Peso corporal de un día: el pesaje más cercano (antes o después) o el peso estimado del perfil."""
    if not d:
        return None
    r = conn.execute("SELECT weight_kg FROM days WHERE weight_kg IS NOT NULL ORDER BY ABS(julianday(date)-julianday(?)) LIMIT 1", (d,)).fetchone()
    if r:
        return r[0]
    r = conn.execute("SELECT value FROM settings WHERE key='peso_estimado_kg'").fetchone()
    try:
        return float(r[0]) if r and r[0] else None
    except ValueError:
        return None


def _ex_stats(ex, bw=None):
    """Como Hevy: el volumen y el nº de series incluyen los calentamientos; el 1RM (tabla de Hevy) sale de las series efectivas."""
    sets = ex["sets"]
    work = [s for s in sets if s["type"] != "calentamiento"]
    if ex["kind"] == "lastre" and bw and full_bw(ex.get("name")):
        vol = sum((bw + (s["weight_kg"] or 0)) * (s["reps"] or 0) for s in sets)
    else:
        vol = sum((s["weight_kg"] or 0) * (s["reps"] or 0) for s in sets if ex["kind"] in ("peso", "lastre") and (s["weight_kg"] or 0) > 0)
    best, e1 = None, None
    for s in work:
        if s["reps"] is None:
            continue
        key = ((s["weight_kg"] or 0), s["reps"])
        if best is None or key > ((best["weight_kg"] or 0), best["reps"]):
            best = s
        if ex["kind"] == "peso" and s["weight_kg"] and s["reps"] > 0:
            v = e1rm(s["weight_kg"], s["reps"])
            e1 = v if e1 is None or v > e1 else e1
    return {"work_sets": len(work), "sets": len(sets), "reps": sum(s["reps"] or 0 for s in work), "volume_kg": round(vol, 1),
            "best": None if not best else {"weight_kg": best["weight_kg"], "reps": best["reps"]},
            "e1rm": None if e1 is None else round(e1, 1)}


def _exercises(conn, wid):
    out = []
    d = conn.execute("SELECT date FROM workouts WHERE id=?", (wid,)).fetchone()
    bw = bw_on(conn, d[0]) if d else None
    for ex in rows(conn.execute("SELECT * FROM workout_exercises WHERE workout_id=? ORDER BY sort, id", (wid,))):
        ex["sets"] = rows(conn.execute("SELECT * FROM workout_sets WHERE exercise_id=? ORDER BY idx, id", (ex["id"],)))
        ex["stats"] = _ex_stats(ex, bw)
        out.append(ex)
    return out


def _previous(conn, name, before_date, wid):
    """Última sesión anterior con el mismo ejercicio (como la columna «anterior» de Hevy)."""
    key = _norm_ex(name)
    for r in conn.execute("SELECT e.id, e.kind, e.name, w.date, w.id AS wid FROM workout_exercises e JOIN workouts w ON w.id=e.workout_id "
                          "WHERE w.deleted_at IS NULL AND w.id<>? AND w.date<=? ORDER BY w.date DESC, w.id DESC", (wid, before_date)):
        if _norm_ex(r["name"]) == key:
            ex = {"kind": r["kind"], "name": r["name"], "sets": rows(conn.execute("SELECT * FROM workout_sets WHERE exercise_id=? ORDER BY idx", (r["id"],)))}
            return {"date": r["date"], "workout_id": r["wid"], "sets": ex["sets"], "stats": _ex_stats(ex, bw_on(conn, r["date"]))}
    return None


# Récords como Hevy, por tipo de ejercicio
PR_KINDS = {"peso": ("e1", "w", "sv"), "lastre": ("w", "sv"), "corporal": ("reps", "sreps"),
            "asistido": ("reps", "sreps"), "tiempo": ("secs", "stime"), "cardio": ("dist", "w")}


def _recs(kind, sets):
    work = [s for s in sets if s["type"] != "calentamiento"] or sets
    r = {}

    def up(k, v):
        if v and v > 0 and v > r.get(k, 0):
            r[k] = v
    for s in work:
        w, n = s["weight_kg"] or 0, s["reps"] or 0
        up("w", w); up("sv", w * n); up("reps", n); up("secs", s["seconds"]); up("dist", s["distance_m"])
        if kind == "peso":
            up("e1", e1rm(w, n))
    if kind in ("peso", "lastre"):
        up("vol", sum((s["weight_kg"] or 0) * (s["reps"] or 0) for s in sets))
    up("sreps", sum(s["reps"] or 0 for s in work))
    up("stime", sum(s["seconds"] or 0 for s in work))
    return r


def pr_map(conn):
    """{exercise_id: [tipos de récord batidos en esa sesión]} recorriendo todo el historial en orden."""
    best, out = {}, {}
    q = ("SELECT e.id, e.name, e.kind FROM workout_exercises e JOIN workouts w ON w.id=e.workout_id "
         "WHERE w.deleted_at IS NULL ORDER BY w.date, COALESCE(w.start_time,''), w.id, e.sort, e.id")
    sets_by = {}
    for s in rows(conn.execute("SELECT * FROM workout_sets ORDER BY exercise_id, idx, id")):
        sets_by.setdefault(s["exercise_id"], []).append(s)
    for e in rows(conn.execute(q)):
        key = _norm_ex(e["name"])
        b = best.setdefault(key, {})
        rs = _recs(e["kind"], sets_by.get(e["id"], []))
        hit = []
        for t in PR_KINDS.get(e["kind"], ()):
            v = rs.get(t)
            if v is None:
                continue
            if t in b and v > b[t] + 1e-9:
                hit.append(t)
            if v > b.get(t, 0):
                b[t] = v
        if hit:
            out[e["id"]] = hit
    return out


def get_workout(conn, wid, with_previous=True):
    w = _get(conn, wid)
    w["exercises"] = _exercises(conn, wid)
    prs = pr_map(conn)
    for ex in w["exercises"]:
        ex["prs"] = prs.get(ex["id"], [])
        if with_previous:
            ex["previous"] = _previous(conn, ex["name"], w["date"], wid)
    _summ(w)
    return w


def _summ(w):
    exs = w["exercises"]
    w["sets_count"] = sum(e["stats"]["sets"] for e in exs)
    w["work_sets_count"] = sum(e["stats"]["work_sets"] for e in exs)
    w["volume_kg"] = w["hevy_volume_kg"] if w["hevy_volume_kg"] is not None else round(sum(e["stats"]["volume_kg"] for e in exs))
    w["volume_source"] = "hevy" if w["hevy_volume_kg"] is not None else "calculado"


def list_workouts(conn, a=None, b=None, limit=200):
    q, args = "SELECT * FROM workouts WHERE deleted_at IS NULL", []
    if a:
        q += " AND date>=?"; args.append(a)
    if b:
        q += " AND date<=?"; args.append(b)
    out = []
    prs = pr_map(conn)
    for w in rows(conn.execute(q + " ORDER BY date DESC, COALESCE(start_time,'') DESC, id DESC LIMIT ?", args + [limit])):
        w["exercises"] = _exercises(conn, w["id"])
        for ex in w["exercises"]:
            ex["prs"] = prs.get(ex["id"], [])
        w["prs_count"] = sum(len(ex["prs"]) for ex in w["exercises"])
        _summ(w)
        out.append(w)
    return out


def day_workouts(conn, d):
    return list_workouts(conn, d, d)


def exercise_history(conn, name):
    key = _norm_ex(name)
    out = []
    for r in conn.execute("SELECT e.*, w.date, w.title FROM workout_exercises e JOIN workouts w ON w.id=e.workout_id "
                          "WHERE w.deleted_at IS NULL ORDER BY w.date DESC, w.id DESC"):
        if _norm_ex(r["name"]) != key:
            continue
        ex = dict(r)
        ex["sets"] = rows(conn.execute("SELECT * FROM workout_sets WHERE exercise_id=? ORDER BY idx", (r["id"],)))
        ex["stats"] = _ex_stats(ex, bw_on(conn, r["date"]))
        out.append(ex)
    return out


def exercise_names(conn):
    seen = {}
    for r in conn.execute("SELECT e.name FROM workout_exercises e JOIN workouts w ON w.id=e.workout_id WHERE w.deleted_at IS NULL"):
        k = _norm_ex(r["name"])
        seen.setdefault(k, [r["name"], 0])
        seen[k][1] += 1
    return sorted(({"name": n, "sessions": c} for n, c in seen.values()), key=lambda x: -x["sessions"])


# ------------------------------------------------------------------- báscula

BODY_FIELDS = {"weight_kg": (20, 300), "bmi": (5, 80), "fat_pct": (1, 80), "fat_kg": (0, 200), "muscle_kg": (5, 200),
               "muscle_pct": (10, 95), "skeletal_muscle_kg": (5, 150), "lean_kg": (5, 250), "water_pct": (10, 90),
               "water_kg": (5, 200), "protein_pct": (1, 50), "protein_kg": (1, 50), "bone_kg": (0.5, 10), "bone_pct": (0.5, 15),
               "visceral_fat": (0, 60), "bmr_kcal": (500, 5000), "body_age": (5, 120), "whr": (0.5, 1.5),
               "heart_rate": (30, 220), "body_score": (0, 100)}


def add_body(conn, data, source="chat"):
    d = core._date(data.get("date"))
    vals = {k: _n(data.get(k), k, lo, hi) for k, (lo, hi) in BODY_FIELDS.items()}
    if all(v is None for v in vals.values()):
        raise ValidationError("Sin valores de báscula")
    t = core._time(data.get("time"))
    set_day = data.get("set_day_weight", True)
    with tx(conn, "add_body", source, d, payload=data):
        cur = conn.execute("INSERT INTO body_metrics(date,time,%s,notes,source,created_at) VALUES(?,?,%s,?,?,?)"
                           % (",".join(vals), ",".join("?" * len(vals))),
                           [d, t] + list(vals.values()) + [data.get("notes"), data.get("source") or "xiaomi", ts()])
        updated_day = False
        if set_day and vals["weight_kg"] is not None:
            day = core.get_day_row(conn, d)
            if day["status"] != "cerrado" and (day["weight_kg"] is None or data.get("override_day_weight")):
                core._ensure_day(conn, d)
                conn.execute("UPDATE days SET weight_kg=?, weight_time=COALESCE(?, weight_time), updated_at=? WHERE date=?",
                             (vals["weight_kg"], t, ts(), d))
                updated_day = True
    r = row(conn.execute("SELECT * FROM body_metrics WHERE id=?", (cur.lastrowid,)).fetchone())
    r["day_weight_updated"] = updated_day
    return r


def delete_body(conn, bid, source="web"):
    r = row(conn.execute("SELECT * FROM body_metrics WHERE id=?", (bid,)).fetchone())
    if not r:
        raise NotFound("Medición no encontrada")
    with tx(conn, "delete_body", source, r["date"], ref=bid):
        conn.execute("UPDATE body_metrics SET deleted_at=? WHERE id=?", (ts(), bid))
    return {"ok": True}


def list_body(conn, a=None, b=None):
    q, args = "SELECT * FROM body_metrics WHERE deleted_at IS NULL", []
    if a:
        q += " AND date>=?"; args.append(a)
    if b:
        q += " AND date<=?"; args.append(b)
    return rows(conn.execute(q + " ORDER BY date DESC, COALESCE(time,'') DESC, id DESC", args))


# --------------------------------------------------------------------- fotos

PHOTO_DIR = None  # por defecto: carpeta «fotos» junto a la base de datos (data/fotos)


def photo_dir(conn):
    if PHOTO_DIR:
        return PHOTO_DIR
    path = conn.execute("PRAGMA database_list").fetchone()[2] or os.path.join(DATA_DIR, "salud.db")
    return os.path.join(os.path.dirname(os.path.abspath(path)), "fotos")


SVG_BAD = re.compile(rb"<\s*(script|foreignObject|iframe|image|use|a|style)\b|\bon[a-z]+\s*=|javascript:|href\s*=\s*[\"'](?!#)|url\(\s*[\"']?(?!#)", re.I)


def check_svg(raw):
    """Ilustraciones SVG: solo dibujo (sin scripts, enlaces externos ni imágenes incrustadas)."""
    if len(raw) > 400 * 1024:
        raise ValidationError("SVG demasiado grande (máx. 400 KB)")
    head = raw[:2000].lower()
    if b"<svg" not in head:
        raise ValidationError("No es un SVG")
    if SVG_BAD.search(raw):
        raise ValidationError("El SVG solo puede llevar formas y degradados (sin scripts, imágenes, estilos ni enlaces)")


def set_food_image(conn, food_id, data_url=None, file_path=None, source="web"):
    f = get_food(conn, food_id)
    pdir = photo_dir(conn)
    os.makedirs(pdir, exist_ok=True)
    if data_url:
        m = re.match(r"^data:image/(jpeg|jpg|png|webp|svg\+xml);base64,(.+)$", data_url, re.S)
        if not m:
            raise ValidationError("Imagen no válida (usa JPG, PNG, WebP o SVG)")
        raw = base64.b64decode(m.group(2))
        ext = {"jpeg": "jpg", "svg+xml": "svg"}.get(m.group(1), m.group(1))
    elif file_path:
        if not os.path.isfile(file_path):
            raise NotFound("No existe %s" % file_path)
        ext = os.path.splitext(file_path)[1].lower().lstrip(".")
        if ext not in ("jpg", "jpeg", "png", "webp", "svg"):
            raise ValidationError("Formato no admitido: %s" % ext)
        ext = "jpg" if ext == "jpeg" else ext
        with open(file_path, "rb") as fh:
            raw = fh.read()
    else:
        raise ValidationError("Falta la imagen")
    if len(raw) > 3 * 1024 * 1024:
        raise ValidationError("Imagen demasiado grande (máx. 3 MB)")
    if ext == "svg":
        check_svg(raw)
    name = "food_%d_%s.%s" % (f["id"], now_local().strftime("%Y%m%d%H%M%S"), ext)
    with open(os.path.join(pdir, name), "wb") as fh:
        fh.write(raw)
    with tx(conn, "set_food_image", source, ref=food_id, payload={"file": name, "previous": f["image"]}):
        conn.execute("UPDATE foods SET image=?, image_source=?, updated_at=? WHERE id=?",
                     ("fotos/" + name, "ilustración" if ext == "svg" and source != "web" else None, ts(), food_id))
    return {"ok": True, "image": "fotos/" + name}


def clear_food_image(conn, food_id, source="web"):
    f = get_food(conn, food_id)
    with tx(conn, "clear_food_image", source, ref=food_id, payload={"previous": f["image"]}):
        conn.execute("UPDATE foods SET image=NULL, updated_at=? WHERE id=?", (ts(), food_id))
    return {"ok": True}


# ------------------------------------------------------- importación CSV Hevy

MONTHS = {"jan": 1, "ene": 1, "feb": 2, "mar": 3, "apr": 4, "abr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8, "ago": 8,
          "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12, "dic": 12}
LASTRE_HINTS = ("weighted", "lastrad", "dip", "fondo", "pull up", "pull-up", "chin up", "chin-up", "dominad", "muscle up")


def _parse_dt(s):
    """Fechas del CSV de Hevy: «8 Nov 2026, 18:30», ISO o «2026-11-08 18:30:00»."""
    from datetime import datetime
    s = (s or "").strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            return datetime.strptime(s.replace("+00:00", ""), fmt)
        except ValueError:
            pass
    m = re.match(r"^(\d{1,2})\s+([A-Za-zé.]+)\s+(\d{4}),?\s+(\d{1,2}):(\d{2})", s)
    if m:
        mon = MONTHS.get(m.group(2).lower().strip(".")[:4]) or MONTHS.get(m.group(2).lower()[:3])
        if mon:
            return datetime(int(m.group(3)), mon, int(m.group(1)), int(m.group(4)), int(m.group(5)))
    raise ValidationError("Fecha no reconocida en el CSV: %s" % s)


def import_hevy_csv(conn, text, source="web"):
    import csv
    import hashlib
    import io
    rows_ = list(csv.DictReader(io.StringIO(text.lstrip("﻿"))))
    if not rows_:
        raise ValidationError("CSV vacío")
    cols = {c.strip().lower(): c for c in rows_[0].keys()}
    need = ("title", "start_time", "exercise_title")
    if not all(n in cols for n in need):
        raise ValidationError("No parece un CSV de Hevy (faltan columnas %s)" % ", ".join(n for n in need if n not in cols))
    g = lambda r, k: (r.get(cols[k]) if k in cols else None)
    num = lambda v: None if v in (None, "") else float(str(v).replace(",", "."))
    workouts = {}
    for r in rows_:
        key = (g(r, "title"), g(r, "start_time"))
        w = workouts.setdefault(key, {"title": g(r, "title"), "start": g(r, "start_time"), "end": g(r, "end_time"),
                                      "desc": g(r, "description"), "exs": {}})
        exn = g(r, "exercise_title")
        ex = w["exs"].setdefault(exn, {"name": exn, "notes": g(r, "exercise_notes") or None, "sets": []})
        wkg = num(g(r, "weight_kg"))
        if wkg is None and "weight_lbs" in cols and num(g(r, "weight_lbs")) is not None:
            wkg = round(num(g(r, "weight_lbs")) * 0.45359237, 2)
        dist = num(g(r, "distance_km"))
        ex["sets"].append({"type": SET_ALIASES.get((g(r, "set_type") or "normal").lower(), {"warmup": "calentamiento", "failure": "fallo", "dropset": "drop"}.get((g(r, "set_type") or "").lower(), "normal")),
                           "weight_kg": wkg, "reps": num(g(r, "reps")), "distance_m": None if dist is None else dist * 1000,
                           "seconds": num(g(r, "duration_seconds")), "rpe": num(g(r, "rpe"))})
    res = {"created": 0, "updated": 0, "skipped": [], "errors": []}
    from .hevy import _activity_type
    for (title, start), w in workouts.items():
        try:
            st = _parse_dt(start)
            en = _parse_dt(w["end"]) if w["end"] else None
            exercises = []
            for ex in w["exs"].values():
                sets = ex["sets"]
                loaded = any((s_["weight_kg"] or 0) > 0 for s_ in sets)
                if any(s_["distance_m"] or s_["seconds"] for s_ in sets) and not any(s_["reps"] for s_ in sets):
                    kind = "cardio"
                elif not loaded:
                    kind = "corporal"
                else:
                    kind = "lastre" if any(hh in core._norm(ex["name"]) for hh in LASTRE_HINTS) else "peso"
                exercises.append({"name": ex["name"], "kind": kind, "notes": ex["notes"], "sets": sets})
            hid = "csv:" + hashlib.sha1(("%s|%s" % (title, start)).encode("utf-8")).hexdigest()[:16]
            data = {"hevy_id": hid, "source": "hevy-csv", "title": title or "Entreno", "date": st.date().isoformat(),
                    "start_time": st.strftime("%H:%M"), "duration_min": round((en - st).total_seconds() / 60) if en else None,
                    "activity_type": _activity_type(title or "", exercises), "notes": w["desc"] or None, "exercises": exercises}
            r = conn.execute("SELECT id, intensity, activity_type FROM workouts WHERE hevy_id=?", (hid,)).fetchone()
            if r:
                data["intensity"], data["activity_type"] = r["intensity"], r["activity_type"]
                update_workout(conn, r["id"], data, source)
                res["updated"] += 1
            else:
                create_workout(conn, data, source)
                res["created"] += 1
        except core.ClosedDayError:
            res["skipped"].append("%s (%s)" % (title, start))
        except Exception as e:
            res["errors"].append("%s (%s): %s" % (title, start, e))
    return res


def set_template_image(conn, tid, data_url=None, file_path=None, source="web"):
    t = row(conn.execute("SELECT * FROM templates WHERE id=?", (tid,)).fetchone())
    if not t:
        raise NotFound("Comida habitual no encontrada")
    pdir = photo_dir(conn)
    os.makedirs(pdir, exist_ok=True)
    if data_url:
        m = re.match(r"^data:image/(jpeg|jpg|png|webp|svg\+xml);base64,(.+)$", data_url, re.S)
        if not m:
            raise ValidationError("Imagen no válida")
        raw, ext = base64.b64decode(m.group(2)), {"jpeg": "jpg", "svg+xml": "svg"}.get(m.group(1), m.group(1))
    else:
        ext = os.path.splitext(file_path)[1].lower().lstrip(".")
        ext = "jpg" if ext == "jpeg" else ext
        if ext not in ("jpg", "png", "webp", "svg"):
            raise ValidationError("Formato no admitido")
        with open(file_path, "rb") as fh:
            raw = fh.read()
    if len(raw) > 3 * 1024 * 1024:
        raise ValidationError("Imagen demasiado grande (máx. 3 MB)")
    if ext == "svg":
        check_svg(raw)
    name = "tpl_%d_%s.%s" % (tid, now_local().strftime("%Y%m%d%H%M%S"), ext)
    with open(os.path.join(pdir, name), "wb") as fh:
        fh.write(raw)
    with tx(conn, "set_template_image", source, ref=tid, payload={"file": name}):
        conn.execute("UPDATE templates SET image=?, image_source=?, updated_at=? WHERE id=?",
                     ("fotos/" + name, "ilustración" if ext == "svg" and source != "web" else None, ts(), tid))
    return {"ok": True, "image": "fotos/" + name}
