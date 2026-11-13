"""Sincronización con la API oficial de Hevy (requiere Hevy PRO y una API key).

La clave se crea en https://hevy.com/settings?developer y se guarda solo en la
base de datos local (no se exporta). La sincronización la hace el servidor de
este ordenador, que es el que tiene conexión a internet.
"""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from . import core
from . import training as T
from .db import ClosedDayError, row, ts

BASE = "https://api.hevyapp.com"
SET_TYPE = {"warmup": "calentamiento", "failure": "fallo", "dropset": "drop", "normal": "normal"}


class HevyError(Exception):
    pass


def api_key(conn):
    return core.get_setting(conn, "hevy_api_key")


def status(conn):
    k = api_key(conn)
    res = core.get_setting(conn, "hevy_last_result")
    return {"configured": bool(k), "key_hint": ("…" + k[-4:]) if k else None,
            "last_sync": core.get_setting(conn, "hevy_last_sync_local"),
            "last_result": json.loads(res) if res else None,
            "agente": core.get_setting(conn, "hevy_agente"), "agente_por": core.get_setting(conn, "hevy_agente_por"), "pendientes": core.pending_sessions(conn)}


def set_key(conn, key, source="web"):
    key = (key or "").strip()
    if key and not re.match(r"^[0-9a-fA-F-]{20,}$", key):
        raise core.ValidationError("La API key de Hevy no tiene el formato esperado")
    core.set_setting(conn, "hevy_api_key", key or None, source)
    if not key:
        core.set_setting(conn, "hevy_since", None, source)
    return status(conn)


def _get(key, path, params=None):
    url = BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers={"api-key": key, "accept": "application/json", "User-Agent": "Salud-local/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise HevyError("Hevy rechazó la API key (¿caducada o sin Hevy PRO?)")
        raise HevyError("Hevy respondió %s" % e.code)
    except urllib.error.URLError as e:
        raise HevyError("Sin conexión con Hevy: %s" % e.reason)


def _template(conn, key, tid):
    if not tid:
        return None
    r = conn.execute("SELECT * FROM hevy_templates WHERE id=?", (tid,)).fetchone()
    if r:
        return row(r)
    try:
        t = _get(key, "/v1/exercise_templates/%s" % tid)
    except HevyError:
        return None
    t = t.get("exercise_template", t)
    conn.execute("INSERT OR REPLACE INTO hevy_templates(id,title,type,primary_muscle,is_custom,fetched_at) VALUES(?,?,?,?,?,?)",
                 (tid, t.get("title"), t.get("type"), t.get("primary_muscle_group"), 1 if t.get("is_custom") else 0, ts()))
    return {"id": tid, "title": t.get("title"), "type": t.get("type")}


def _kind(ttype, sets):
    loaded = any((s.get("weight_kg") or 0) > 0 for s in sets)
    return {"weight_reps": "peso", "reps_only": "corporal",
            "bodyweight_reps": "lastre" if loaded else "corporal",
            "bodyweight_weighted": "lastre", "bodyweight_assisted_reps": "asistido",
            "duration": "tiempo", "distance_duration": "cardio", "short_distance_weight": "cardio",
            "weight_duration": "tiempo"}.get(ttype or "", "peso" if loaded else "corporal")


def _local(iso):
    d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    try:
        from zoneinfo import ZoneInfo  # type: ignore
        return d.astimezone(ZoneInfo("Europe/Madrid"))
    except Exception:
        return d.astimezone()  # Windows sin tzdata: zona del ordenador (Madrid)


def _activity_type(title, exercises):
    """Ya no se deduce nada del título: las kcal del entreno las estima el agente analizándolo. Queda «fuerza» como
    tipo genérico (solo se usaría si un entreno llegara sin kcal del agente)."""
    return "fuerza"


def map_workout(conn, key, w):
    st, en = _local(w["start_time"]), _local(w["end_time"]) if w.get("end_time") else None
    exercises = []
    for ex in sorted(w.get("exercises", []), key=lambda e: e.get("index", 0)):
        tpl = _template(conn, key, ex.get("exercise_template_id"))
        sets = sorted(ex.get("sets", []), key=lambda s: s.get("index", 0))
        kind = _kind(tpl and tpl.get("type"), sets)
        exercises.append({
            "name": ex.get("title") or (tpl or {}).get("title") or "Ejercicio",
            "kind": kind, "notes": ex.get("notes") or None, "superset": ex.get("superset_id") or ex.get("supersets_id"),
            "sets": [{"type": SET_TYPE.get(s.get("type"), "normal"),
                      "weight_kg": (-abs(s["weight_kg"]) if kind == "asistido" and s.get("weight_kg") else s.get("weight_kg")),
                      "reps": s.get("reps"), "distance_m": s.get("distance_meters"),
                      "seconds": s.get("duration_seconds"), "rpe": s.get("rpe")} for s in sets]})
    return {
        "hevy_id": w["id"], "source": "hevy", "title": w.get("title") or "Entreno",
        "date": st.date().isoformat(), "start_time": st.strftime("%H:%M"),
        "duration_min": round((en - st).total_seconds() / 60) if en else None,
        "activity_type": _activity_type(w.get("title") or "", exercises),
        "notes": w.get("description") or None, "exercises": exercises,
    }


def sync(conn, full=False):
    key = api_key(conn)
    if not key:
        raise HevyError("Falta la API key de Hevy (Ajustes → Hevy)")
    since = None if full else core.get_setting(conn, "hevy_since")
    started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    res = {"created": 0, "updated": 0, "deleted": 0, "skipped": [], "errors": []}
    events = []
    page = 1
    while True:
        d = _get(key, "/v1/workouts/events", {"page": page, "pageSize": 10, "since": since or "1970-01-01T00:00:00Z"})
        events += d.get("events", [])
        if page >= (d.get("page_count") or 1):
            break
        page += 1
    for ev in events:
        try:
            if ev.get("type") == "deleted":
                r = conn.execute("SELECT id FROM workouts WHERE hevy_id=? AND deleted_at IS NULL", (ev.get("id"),)).fetchone()
                if r:
                    T.delete_workout(conn, r[0], "hevy")
                    res["deleted"] += 1
                continue
            data = map_workout(conn, key, ev["workout"])
            r = conn.execute("SELECT id FROM workouts WHERE hevy_id=?", (data["hevy_id"],)).fetchone()
            if r:
                old = row(conn.execute("SELECT intensity, activity_type FROM workouts WHERE id=?", (r[0],)).fetchone())
                data["intensity"] = old["intensity"]  # la intensidad la ajusta el usuario
                data["activity_type"] = old["activity_type"]
                conn.execute("UPDATE workouts SET deleted_at=NULL WHERE id=?", (r[0],))
                T.update_workout(conn, r[0], data, "hevy")
                res["updated"] += 1
            else:
                T.create_workout(conn, data, "hevy")
                res["created"] += 1
        except ClosedDayError:
            res["skipped"].append(ev.get("workout", {}).get("title") or ev.get("id"))
        except Exception as e:  # un entreno raro no debe bloquear el resto
            res["errors"].append(str(e))
    if not res["skipped"]:
        core.set_setting(conn, "hevy_since", started)  # con días cerrados pendientes, se reintenta la próxima vez
    core.set_setting(conn, "hevy_last_sync_local", core.now_local().strftime("%Y-%m-%d %H:%M"))
    core.set_setting(conn, "hevy_last_result", json.dumps(res, ensure_ascii=False))
    return res


def import_json(conn, data, source="chat"):
    """Importa entrenos en formato de la API de Hevy (p. ej. exportados vía ChatGPT).
    Usa `exercise_type` si viene; si no, deduce el tipo por las series y el nombre."""
    if isinstance(data, dict):
        data = data.get("workouts") or data.get("entrenos") or []
    res = {"created": 0, "updated": 0, "skipped": [], "errors": []}
    for w in data:
        try:
            st = _local(w["start_time"])
            en = _local(w["end_time"]) if w.get("end_time") else None
            exercises = []
            for ex in sorted(w.get("exercises") or [], key=lambda e: e.get("index", 0)):
                sets = sorted(ex.get("sets") or [], key=lambda s: s.get("index", 0))
                ttype = ex.get("exercise_type")
                known = None if ttype else conn.execute(  # el conector de Hevy no trae el tipo: el que ya tenía ese ejercicio
                    "SELECT e.kind FROM workout_exercises e JOIN workouts w ON w.id=e.workout_id WHERE e.name=? AND w.deleted_at IS NULL "
                    "ORDER BY w.date DESC, e.id DESC LIMIT 1", (ex.get("title") or "",)).fetchone()
                if not ttype and not known:
                    if any(s.get("distance_meters") or s.get("duration_seconds") for s in sets) and not any(s.get("reps") for s in sets):
                        ttype = "distance_duration"
                    elif any((s.get("weight_kg") or 0) > 0 for s in sets):
                        ttype = "bodyweight_reps" if any(h in core._norm(ex.get("title") or "") for h in T.LASTRE_HINTS) else "weight_reps"
                    else:
                        ttype = "reps_only"
                kind = known[0] if known else _kind(ttype, sets)
                exercises.append({
                    "name": ex.get("title") or "Ejercicio", "kind": kind, "notes": ex.get("notes") or None,
                    "superset": ex.get("superset_id"),
                    "sets": [{"type": SET_TYPE.get(s.get("type"), "normal"),
                              "weight_kg": (-abs(s["weight_kg"]) if kind == "asistido" and s.get("weight_kg") else s.get("weight_kg")),
                              "reps": s.get("reps"), "distance_m": s.get("distance_meters"),
                              "seconds": s.get("duration_seconds"), "rpe": s.get("rpe")} for s in sets]})
            d = {"hevy_id": w.get("id") or ("json:%s|%s" % (w.get("title"), w.get("start_time"))), "source": "hevy",
                 "title": w.get("title") or "Entreno", "date": st.date().isoformat(), "start_time": st.strftime("%H:%M"),
                 "duration_min": round((en - st).total_seconds() / 60) if en else None,
                 "activity_type": _activity_type(w.get("title") or "", exercises), "notes": w.get("description") or None,
                 "exercises": exercises}
            if w.get("intensity"):  # lo que estima el agente al analizar el entreno
                d["intensity"] = w["intensity"]
            if w.get("kcal_netas") is not None:
                d["kcal_netas"] = w["kcal_netas"]
            r = conn.execute("SELECT id, intensity, activity_type FROM workouts WHERE hevy_id=?", (d["hevy_id"],)).fetchone()
            if r:
                d["activity_type"] = r["activity_type"]
                d.setdefault("intensity", r["intensity"])
                T.update_workout(conn, r["id"], d, source)
                res["updated"] += 1
            else:
                T.create_workout(conn, d, source)
                res["created"] += 1
        except ClosedDayError:
            res["skipped"].append("%s %s" % (w.get("title"), w.get("start_time")))
        except Exception as e:
            res["errors"].append("%s %s: %s" % (w.get("title"), w.get("start_time"), e))
    # Su agente tiene el conector de Hevy: lo sabemos porque manda entrenos tal cual salen de la API de Hevy
    # (con el id del entreno y el exercise_template_id de cada ejercicio). Las capturas van por registrar_entreno y el CSV no trae ids.
    if (source == "chat" or source.startswith("agente")) and (res["created"] or res["updated"]) and any(
            w.get("id") and any(ex.get("exercise_template_id") for ex in (w.get("exercises") or [])) for w in data):
        core.set_setting(conn, "hevy_agente", ts(), source)
        if source.startswith("agente:"):
            core.set_setting(conn, "hevy_agente_por", source, source)
    return res
