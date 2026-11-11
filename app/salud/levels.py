"""Niveles de fuerza (Strength Level) y subidas de rango, calculados en el servidor y guardados.

Es el mismo cálculo que hacía la web (entreno.js: STD, slModel, exLevel, trainingStats) pasado a Python:
- Cada sesión de un ejercicio se compara con las tablas de Strength Level (hombre/mujer, por peso corporal de ese día).
- Subida de rango = la sesión en la que el ejercicio llega a un rango mejor que el mejor que tenía hasta entonces.
Las subidas se guardan en `rank_ups` y solo se recalculan cuando cambian los entrenos, los ajustes de los ejercicios
(asociaciones con Strength Level, peso de la máquina…), el sexo o las tablas disponibles; los pesajes nuevos no las mueven.
"""
from __future__ import annotations

import bisect
import json
import math
import os
import re
from datetime import date as _date

from . import core
from .db import rows

SL_DIR = None  # directorio con la caché de Strength Level (la pone el servidor; si no, junto a la base de datos)

LVL = ["Principiante", "Novato", "Intermedio", "Avanzado", "Élite", "Leyenda"]
HEVY_PCT = [1, .97, .94, .92, .89, .86, .83, .81, .78, .75, .73, .71, .70, .68, .67, .65, .64, .63, .61, .60,
            .59, .58, .57, .56, .55, .54, .53, .52, .51, .50]
Z = [-1.645, -0.8416, 0, 0.8416, 1.645, 2.326]

# [expresión sobre el nombre normalizado, métrica, tabla (+ .reps / .add), tipos, máquina/polea]  (igual que STD en entreno.js)
STD = [
    (r"press de banca inclinado \(barra\)", "1rm", "incline-bench-press", ["peso"]),
    (r"press de banca inclinado \(mancuerna\)", "db", "incline-dumbbell-bench-press", ["peso"]),
    (r"press de banca \(mancuerna\)", "db", "dumbbell-bench-press", ["peso"]),
    (r"press de banca \((barra|maquina smith)\)", "1rm", "bench-press", ["peso"]),
    (r"press de (banca inclinado \(maquina|pecho)", "1rm", "chest-press", ["peso"]),
    (r"^aperturas \(maquina\)|aperturas inclinadas \(maquina\)|mariposa|pec deck", "1rm", "machine-chest-fly", ["peso"]),
    (r"press de hombros \(mancuerna\)", "db", "dumbbell-shoulder-press", ["peso"]),
    (r"press de hombros", "1rm", "machine-shoulder-press", ["peso"]),
    (r"elevacion(es)? lateral(es)? \(mancuerna\)", "db", "dumbbell-lateral-raise", ["peso"]),
    (r"elevacion(es)? lateral(es)? \(maquina\)", "1rm", "machine-lateral-raise", ["peso"]),
    (r"jalon al pecho", "1rm", "lat-pulldown", ["peso"]),
    (r"remo sentado", "1rm", "seated-cable-row", ["peso"]),
    (r"curl de biceps \(cable\)", "1rm", "cable-bicep-curl", ["peso"]),
    (r"curl de biceps \(mancuerna\)", "db", "dumbbell-curl", ["peso"]),
    (r"curl martillo \(mancuerna\)", "db", "dumbbell-hammer-curl", ["peso"]),
    (r"curl predicador \(maquina\)|curl de biceps \(maquina\)|curl en maquina", "1rm", "machine-bicep-curl", ["peso"]),
    (r"curl predicador", "1rm", "preacher-curl", ["peso"]),
    (r"curl con barra", "1rm", "barbell-curl", ["peso"]),
    (r"triceps con polea|jalon de triceps", "1rm", "tricep-pushdown", ["peso"]),
    (r"press de piernas", "1rm", "leg-press", ["peso"]),
    (r"sentadilla hack", "1rm", "hack-squat", ["peso"]),
    (r"extension de pierna", "1rm", "leg-extension", ["peso"]),
    (r"curl de pierna sentado", "1rm", "seated-leg-curl", ["peso"]),
    (r"aduccion", "1rm", "hip-adduction", ["peso"]),
    (r"abduccion", "1rm", "hip-abduction", ["peso"]),
    (r"gemelos sentado", "1rm", "seated-calf-raise", ["peso"]),
    (r"gemelos de pie", "1rm", "machine-calf-raise", ["peso"]),
    (r"^dominada \(con peso", "add", "pull-ups.add", ["lastre"]),
    (r"^dominadas?\b(?!.*una mano)", "add", "pull-ups.add", ["asistido"]),
    (r"^fondos?\b", "add", "dips.add", ["asistido"]),
    (r"^fondos \(con peso", "add", "dips.add", ["lastre"]),
    (r"^muscle up \(con peso", "add", "muscle-ups.add", ["lastre"]),
    (r"^dominada$", "reps", "pull-ups.reps", ["corporal"]),
    (r"^fondos$", "reps", "dips.reps", ["corporal"]),
    (r"^muscle up$", "reps", "muscle-ups.reps", ["corporal"]),
    (r"^flexiones$", "reps", "push-ups.reps", ["corporal"]),
    (r"curl martillo \(cable\)", "1rm", "cable-hammer-curl", ["peso"]),
    (r"chin up \(con peso|supinas? \(con peso", "add", "chin-ups.add", ["lastre"]),
    (r"chin up|dominadas? supinas?", "reps", "chin-ups.reps", ["corporal"]),
    (r"levantamiento de piernas en barra|hanging leg raise", "reps", "hanging-leg-raise.reps", ["corporal"]),
    (r"levantamiento de rodillas en barra|hanging knee raise", "reps", "hanging-knee-raise.reps", ["corporal"]),
    (r"curl de muneca palmas arriba|^curl de muneca \((barra|mancuerna)\)|wrist curl", "1rm", "wrist-curl", ["peso"]),
    (r"flexiones diamante|diamond push", "reps", "diamond-push-ups.reps", ["corporal"]),
    (r"flexion a una mano|one arm push", "reps", "one-arm-push-ups.reps", ["corporal"]),
    (r"^dominadas? a una mano$|^one arm pull ?ups?$", "reps", "one-arm-pull-ups.reps", ["corporal"]),
    (r"^sit ?ups?$", "reps", "sit-ups.reps", ["corporal"]),
    (r"^abdominal corto$|^crunch", "reps", "crunches.reps", ["corporal"]),
    (r"remo en t", "1rm", "t-bar-row", ["peso"]),
    (r"^fondos? de triceps$|^fondos? en banco|bench dip", "reps", "bench-dips.reps", ["corporal"]),
]
STD = [(re.compile(rx), m, slug, kinds) for rx, m, slug, kinds in STD]
SKILL_MIN = {"one-arm-pull-ups.reps": {"min": 4, "map": {5: 2}}, "muscle-ups.reps": {"min": 3}, "ring-muscle-ups.reps": {"min": 3},
             "muscle-ups.add": {"min": 3, "map": {4: 3, 5: 4}}, "one-arm-push-ups.reps": {"min": 2}}
CUSTOM_SKILLS = [(re.compile(r"^front lever( sostenid[ao])?$"), "tiempo", "secs", {4: 1, 5: 15}, 4, "front-lever")]
UNI_RX = re.compile(r"un brazo|una mano|jalon de remo")
NOTE_MK = re.compile(r"(?:m[aá]quina|carro|trineo|plataforma)\s+pesa\s+(\d+(?:[.,]\d+)?)\s*kg", re.I)
SIDE_RX = re.compile(r"solo (con )?(el |la )?(brazo |mano )?(derech|izquierd)")


def _lg(x):
    return math.log(max(0.5, x))


def _sl_dir(conn):
    if SL_DIR:
        return os.path.join(SL_DIR, "strengthlevel")
    p = conn.execute("PRAGMA database_list").fetchone()[2] or ""
    return os.path.join(os.path.dirname(os.path.abspath(p)), "strengthlevel")


def load_tables(conn):
    """Tablas de Strength Level ya descargadas (sin pedir nada a la red): {clave: {"H": filas, "M": filas}}."""
    d, out = _sl_dir(conn), {}
    if not os.path.isdir(d):
        return out
    for f in os.listdir(d):
        if not f.endswith(".json") or f.startswith("_"):  # _no_existen.json y otros ficheros de control
            continue
        try:
            with open(os.path.join(d, f), encoding="utf-8") as fh:
                j = json.load(fh)
        except (OSError, ValueError):
            continue
        if not isinstance(j, dict) or not isinstance(j.get("H") or {}, dict) or not isinstance(j.get("M") or {}, dict):
            continue
        slug = j.get("slug") or f[:-5]

        def fix(rws, reps):
            res = []
            for r in rws or []:
                r = list(r)
                for i in range(2, 6):
                    if r[i] <= r[i - 1]:
                        r[i] = r[i - 1] + (0.5 if reps else 1)
                res.append(r)
            return res
        for key, k in ((slug, "w"), (slug + ".reps", "reps"), (slug + ".add", "add")):
            H, M = (j.get("H") or {}).get(k), (j.get("M") or {}).get(k)
            if H and M:
                out[key] = {"H": fix(H, k == "reps"), "M": fix(M, k == "reps")}
    return out


def sl_cuts(T, bw, sx):
    t = T and T.get(sx)
    if not t or not bw:
        return None
    if bw <= t[0][0]:
        return t[0][1:]
    if bw >= t[-1][0]:
        return t[-1][1:]
    i = 0
    while t[i + 1][0] < bw:
        i += 1
    f = (bw - t[i][0]) / (t[i + 1][0] - t[i][0])
    return [v + (t[i + 1][k + 1] - v) * f for k, v in enumerate(t[i][1:])]


def sl_model(tables, slug, metric, bw, sx):
    base = sl_cuts(tables.get(slug), bw, sx)
    if not base:
        return None
    off = bw if metric == "add" else 0
    pts = [max(0.5, x + off) for x in base]
    for k in range(1, len(pts)):
        if pts[k] <= pts[k - 1]:
            pts[k] = pts[k - 1] * 1.05
    slope = (_lg(pts[4]) - _lg(pts[3])) / (Z[4] - Z[3])
    legend = math.exp(_lg(pts[4]) + slope * (Z[5] - Z[4]))
    sk = SKILL_MIN.get(slug)
    if sk:
        allv, f = pts + [legend], sk["min"]
        one, low = (off + 0.5, off * 0.9) if metric == "add" else (1, 0.5)
        for k, v in (sk.get("map") or {}).items():
            allv[k] = pts[v]
        for k in range(f):
            allv[k] = low + (one - low) * k / f
        allv[f] = one
        for k in range(f + 1, 6):
            if allv[k] <= allv[k - 1]:
                allv[k] = allv[k - 1] + 1
        return {"all": allv, "off": off, "slope": (_lg(allv[5]) - _lg(allv[4])) / (Z[5] - Z[4]), "skill": f}
    return {"all": pts + [legend], "off": off, "slope": slope}


def custom_model(cuts, f):
    allv = [0] * 6
    for k in range(f, 6):
        allv[k] = cuts[k]
    for k in range(f):
        allv[k] = 0.5 + (allv[f] - 0.5) * k / f
    return {"all": allv, "off": 0, "slope": (_lg(allv[5]) - _lg(allv[4])) / (Z[5] - Z[4]), "skill": f}


def z_of(M, raw):
    A, val = M["all"], raw + M["off"]
    if val <= A[0]:
        return Z[0] + (_lg(val) - _lg(A[0])) / ((_lg(A[1]) - _lg(A[0])) / (Z[1] - Z[0]))
    if val >= A[5]:
        return Z[5] + (_lg(val) - _lg(A[5])) / M["slope"]
    i = 0
    while val >= A[i + 1]:
        i += 1
    return Z[i] + (Z[i + 1] - Z[i]) * (_lg(val) - _lg(A[i])) / (_lg(A[i + 1]) - _lg(A[i]))


def strict_sets(sets, notes):
    t = core._norm(notes or "")
    if re.search(r"pierna|tuck|recogid|straddle|abiert", t):
        return []
    m = re.search(r"(?:la|las) ultimas? ?(dos|tres|cuatro|\d)? ?con (goma|banda)", t)
    if m:
        n = {"dos": 2, "tres": 3, "cuatro": 4}.get(m.group(1)) or (int(m.group(1)) if m.group(1) and m.group(1).isdigit() else 1)
        return sets[:max(0, len(sets) - n)]
    if re.search(r"goma|banda|asistid", t) and not re.search(r"sin (goma|banda)", t):
        return []
    return sets


def work_sets(sets):
    w = [s for s in sets if s["type"] != "calentamiento"]
    return w or sets


class Ctx:
    """Lo que hace falta para calcular niveles de una persona: ajustes por ejercicio, pesajes, sexo y tablas."""

    def __init__(self, conn):
        from . import training as T
        self.T = T
        self.canon = T._canon(conn)
        self.settings = T.exercise_settings(conn)
        self.tables = load_tables(conn)
        sx = (core.settings(conn).get("sexo") or "").upper()[:1]
        self.sx = "M" if sx == "M" else "H"
        ws = [(r[0], r[1]) for r in conn.execute("SELECT date, weight_kg FROM days WHERE weight_kg IS NOT NULL ORDER BY date")]
        if not ws:  # sin ningún pesaje: el peso aproximado del perfil, constante
            try:
                est = float(str(core.settings(conn).get("peso_estimado_kg") or "").replace(",", "."))
            except ValueError:
                est = 0
            if est > 0:
                ws = [(core.today(), est)]
        self.wd = [d for d, _ in ws]
        self.wk = [k for _, k in ws]

    def key(self, name):
        k = self.T._norm_ex(name)
        return self.canon.get(k, k)

    def cfg(self, name):
        k = self.key(name)
        c = self.settings.get(k)
        if c:
            return c
        for x in self.settings.values():
            if self.T._norm_ex(x.get("name")) == k:
                return x
        return {}

    def bw_at(self, d):
        """Peso de una fecha: interpolado entre pesajes (como bwAt de la web)."""
        if not self.wd:
            return None
        if not d or d >= self.wd[-1]:
            return self.wk[-1]
        if d <= self.wd[0]:
            return self.wk[0]
        i = bisect.bisect_right(self.wd, d)
        if self.wd[i - 1] == d:
            return self.wk[i - 1]
        a, b = i - 1, i
        ta, tb, td = (_date.fromisoformat(x).toordinal() for x in (self.wd[a], self.wd[b], d))
        return self.wk[a] + (self.wk[b] - self.wk[a]) * (td - ta) / (tb - ta)

    def is_uni(self, name):
        u = self.cfg(name).get("unilateral")
        return bool(u) if u is not None else bool(UNI_RX.search(core._norm(name)))

    def e1rm(self, w, r, name):
        if not w or not r:
            return None
        if self.is_uni(name):
            r = max(1, round(r / 2))
        return w / HEVY_PCT[min(int(round(r)), 30) - 1]

    def machine_kg(self, name, notes):
        m = notes and NOTE_MK.search(notes)
        if m:
            return float(m.group(1).replace(",", "."))
        return self.cfg(name).get("machine_kg") or 0

    def level_idx(self, name, kind, sessions):
        """Rango (0–5) de las sesiones dadas, o None si el ejercicio no tiene tabla."""
        n, cfg = self.key(name), self.cfg(name)
        sd, cs = None, None
        if cfg.get("sl_slug"):
            metric = "reps" if kind == "corporal" else "add" if kind == "lastre" else "db" if cfg.get("equipment") == "mancuerna" else "1rm"
            key = cfg["sl_slug"] + (".reps" if metric == "reps" else ".add" if metric == "add" else "")
            if key in self.tables:
                sd = (metric, key)
        if not sd:
            cs = next((c for c in CUSTOM_SKILLS if c[0].search(n) and c[1] == kind), None)
            if cs:
                sd = (cs[2], cs[5])
        if not sd:
            m = next((x for x in STD if x[0].search(n) and kind in x[3]), None)
            if m:
                sd = (m[1], m[2])
        if not sd:
            return None
        metric, slug = sd
        ratio = cfg.get("load_ratio") or 1
        best = None
        for x in sessions:
            b = self.bw_at(x["date"])
            if not b:
                continue
            model = custom_model(cs[3], cs[4]) if cs else sl_model(self.tables, slug, metric, b, self.sx)
            if not model:
                continue
            mk = self.machine_kg(name, x.get("notes"))
            for s in (strict_sets(work_sets(x["sets"]), x.get("notes")) if cs else work_sets(x["sets"])):
                v = None
                w, reps = s.get("weight_kg"), s.get("reps")
                if metric in ("1rm", "db"):
                    lw = w - mk if w is not None else None
                    v = self.e1rm(lw, reps, name) if lw and lw > 0 else None
                    if v is not None:
                        v *= ratio
                        if metric == "db":
                            v /= 2
                elif metric == "add":
                    if reps and w is not None and (w > 0 or (kind == "asistido" and w < 0 and b + w > 0)):
                        v = (b + w) / HEVY_PCT[min(reps, 30) - 1] - b
                elif metric == "secs":
                    v = s.get("seconds") or None
                else:
                    if reps and self.is_uni(name) and not SIDE_RX.search(core._norm(x.get("notes") or "")):
                        v = math.ceil(reps / 2)
                    else:
                        v = reps
                if v is None:
                    continue
                z = z_of(model, v)
                if best is None or z > best[0]:
                    best = (z, v, model)
        if best is None:
            return None
        _, raw, model = best
        cuts = [x - model["off"] for x in model["all"][1:]]
        idx = 0
        while idx < len(cuts) and raw >= cuts[idx]:
            idx += 1
        return idx


def compute_ups(conn):
    """[{workout_id, key, name, from, to}] recorriendo todo el historial en orden, como trainingStats de la web."""
    cx = Ctx(conn)
    sets_by = {}
    for s in rows(conn.execute("SELECT exercise_id, idx, type, weight_kg, reps, distance_m, seconds FROM workout_sets ORDER BY exercise_id, idx, id")):
        sets_by.setdefault(s["exercise_id"], []).append(s)
    exs = {}
    q = ("SELECT e.id, e.name, e.kind, e.notes, w.id AS wid, w.date FROM workout_exercises e JOIN workouts w ON w.id=e.workout_id "
         "WHERE w.deleted_at IS NULL ORDER BY w.date, COALESCE(w.start_time,''), w.id, e.sort, e.id")
    for r in rows(conn.execute(q)):
        k = cx.key(r["name"])
        e = exs.setdefault(k, {"name": r["name"], "kind": r["kind"], "sessions": []})
        e["sessions"].append({"date": r["date"], "wid": r["wid"], "sets": sets_by.get(r["id"], []), "notes": r["notes"]})
        e["name"] = r["name"]
    names = {cx.T._norm_ex(x["same_as"]): x["same_as"] for x in cx.settings.values() if x.get("same_as")}
    out = []
    for k, e in exs.items():
        disp = names.get(k) or e["name"]
        best = None
        for x in e["sessions"]:
            li = cx.level_idx(disp, e["kind"], [x])
            if li is None:
                continue
            if best is not None and li > best:
                out.append({"workout_id": x["wid"], "key": k, "name": disp, "from": best, "to": li})
            if best is None or li > best:
                best = li
    return out


def _signature(conn):
    """Huella de lo que influye en las subidas (sin los pesajes: un pesaje nuevo no cambia lo ya guardado)."""
    from . import training as T
    w = conn.execute("SELECT COUNT(*), MAX(updated_at), MAX(deleted_at), SUM(id) FROM workouts").fetchone()
    s = conn.execute("SELECT COUNT(*), SUM(id), MAX(id) FROM workout_sets").fetchone()
    es = sorted(json.dumps(v, sort_keys=True, default=str) for v in T.exercise_settings(conn).values())
    d = _sl_dir(conn)
    tabs = sorted(os.listdir(d)) if os.path.isdir(d) else []
    sx = [core.settings(conn).get("sexo"), core.settings(conn).get("peso_estimado_kg"),
          conn.execute("SELECT COUNT(*) FROM days WHERE weight_kg IS NOT NULL").fetchone()[0] > 0]
    return json.dumps([list(w), list(s), es, tabs, sx], default=str)


def ensure(conn):
    """Recalcula y guarda las subidas de rango si algo de lo que influye ha cambiado desde la última vez."""
    sig = _signature(conn)
    r = conn.execute("SELECT value FROM meta WHERE key='rank_ups_sig'").fetchone()
    if r and r[0] == sig:
        return False
    ups = compute_ups(conn)
    own = not conn.in_transaction  # dentro de otra transacción, se guarda con ella
    if own:
        conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("DELETE FROM rank_ups")
        conn.executemany("INSERT INTO rank_ups(workout_id, ex_key, name, from_idx, to_idx) VALUES(?,?,?,?,?)",
                         [(u["workout_id"], u["key"], u["name"], u["from"], u["to"]) for u in ups])
        conn.execute("INSERT OR REPLACE INTO meta(key, value) VALUES('rank_ups_sig', ?)", (sig,))
        if own:
            conn.execute("COMMIT")
    except Exception:
        if own:
            conn.execute("ROLLBACK")
        raise
    return True


def ups_by_workout(conn):
    ensure(conn)
    out = {}
    for r in conn.execute("SELECT workout_id, ex_key, name, from_idx, to_idx FROM rank_ups ORDER BY id"):
        out.setdefault(r[0], []).append({"key": r[1], "name": r[2], "from": r[3], "to": r[4]})
    return out
