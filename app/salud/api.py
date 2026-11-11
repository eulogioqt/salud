"""Router único de la API. Lo usan el servidor HTTP y la CLI del chat, de modo
que una operación hecha desde el chat es exactamente la misma que desde la web."""
from __future__ import annotations

import re

from . import core
from . import training as T
from . import hevy as H
from .db import ClosedDayError, NotFound, ValidationError, rev, today, shift, tx, ts

ROUTES = []


def route(method, pattern):
    def deco(fn):
        ROUTES.append((method, re.compile("^" + pattern + "$"), fn))
        return fn
    return deco


class ApiError(Exception):
    def __init__(self, status, message, extra=None):
        super().__init__(message)
        self.status, self.message, self.extra = status, message, extra or {}


def dispatch(conn, method, path, query=None, body=None, source="web"):
    query, body = query or {}, body or {}
    for m, rx, fn in ROUTES:
        if m != method:
            continue
        mt = rx.match(path)
        if mt:
            try:
                return fn(conn, query, body, source, *mt.groups())
            except ClosedDayError as e:
                raise ApiError(409, str(e), {"code": "dia_cerrado"})
            except NotFound as e:
                raise ApiError(404, str(e))
            except ValidationError as e:
                raise ApiError(400, str(e))
            except KeyError as e:
                raise ApiError(400, "Falta el campo %s" % e)
    raise ApiError(404, "Ruta no encontrada: %s %s" % (method, path))


def _bool(v):
    return str(v).lower() in ("1", "true", "si", "sí", "yes")


@route("GET", r"/api/rev")
def _rev(c, q, b, s):
    return {"rev": rev(c), "today": today()}


@route("GET", r"/api/state")
def _state(c, q, b, s):
    st = core.day_state(c, q.get("date"))
    st["workouts"] = T.day_workouts(c, st["date"])
    return st


@route("GET", r"/api/catalog")
def _catalog(c, q, b, s):
    inc = _bool(q.get("all", "0"))
    return {"foods": core.list_foods(c, inc), "templates": core.list_templates(c, inc), "rev": rev(c)}


@route("GET", r"/api/foods/(\d+)")
def _food(c, q, b, s, fid):
    from .nutrition import get_food
    return core.food_summary(c, get_food(c, int(fid)))


@route("GET", r"/api/foods/search")
def _search(c, q, b, s):
    term = core._norm(q.get("q", ""))
    return [f for f in core.list_foods(c, True) if term in core._norm(f["name"]) or term in core._norm(f.get("original_name") or "")]


@route("POST", r"/api/foods")
def _food_new(c, q, b, s):
    return core.create_food(c, b, s)


@route("PUT", r"/api/foods/(\d+)")
def _food_upd(c, q, b, s, fid):
    apply_open = b.pop("apply_open_days", True)
    return core.update_food(c, int(fid), b, s, apply_open)


@route("POST", r"/api/foods/(\d+)/(favorite|hidden|deleted)")
def _food_flag(c, q, b, s, fid, flag):
    return core.set_food_flag(c, int(fid), flag, b.get("value", True), s)


@route("POST", r"/api/recipes")
def _recipe_new(c, q, b, s):
    return core.create_recipe(c, b, s)


@route("POST", r"/api/templates")
def _tpl_new(c, q, b, s):
    return core.create_template(c, b, s)


@route("PUT", r"/api/templates/(\d+)")
def _tpl_upd(c, q, b, s, tid):
    return core.update_template(c, int(tid), b, s)


@route("POST", r"/api/templates/(\d+)/apply")
def _tpl_apply(c, q, b, s, tid):
    return core.apply_template(c, int(tid), b, s)


@route("POST", r"/api/entries")
def _entry_new(c, q, b, s):
    if b.get("estimate") or not b.get("food_id"):
        return core.add_estimate(c, b, s)
    return core.add_entry(c, b, s)


@route("PUT", r"/api/entries/(\d+)")
def _entry_upd(c, q, b, s, eid):
    return core.update_entry(c, int(eid), b, s)


@route("DELETE", r"/api/entries/(\d+)")
def _entry_del(c, q, b, s, eid):
    return core.delete_entry(c, int(eid), s)


@route("POST", r"/api/entries/(\d+)/restore")
def _entry_restore(c, q, b, s, eid):
    return core.restore_entry(c, int(eid), s)


@route("POST", r"/api/revisar/aceptar-todo")
def _accept_all(c, q, b, s):
    return core.accept_all_review(c, s)


@route("GET", r"/api/pasos/stats")
def _steps_stats(c, q, b, s):
    return core.steps_stats(c, q.get("date"))


@route("POST", r"/api/pasos/tramos")
def _steps_buckets(c, q, b, s):
    """Pasos por tramos (mismo formato que el webhook del móvil: {"steps": [{count, start_time, end_time}]})
    o el total de un día ({"steps": N, "date": "AAAA-MM-DD"}). Para meter a mano lo que no llegó del móvil."""
    return core.ingest_health(c, b, s)


@route("PUT", r"/api/days/(\d{4}-\d{2}-\d{2})")
def _day_upd(c, q, b, s, d):
    return core.update_day(c, d, b, s)


@route("GET", r"/api/days/(\d{4}-\d{2}-\d{2})/close-check")
def _close_check(c, q, b, s, d):
    return core.close_check(c, d)


@route("POST", r"/api/days/(\d{4}-\d{2}-\d{2})/close")
def _close(c, q, b, s, d):
    return core.close_day(c, d, bool(b.get("force")), s)


@route("POST", r"/api/days/(\d{4}-\d{2}-\d{2})/reopen")
def _reopen(c, q, b, s, d):
    return core.reopen_day(c, d, b.get("reason"), s)


@route("GET", r"/api/days/(\d{4}-\d{2}-\d{2})/events")
def _day_events(c, q, b, s, d):
    return core.events(c, d)


@route("POST", r"/api/activities")
def _act_new(c, q, b, s):
    return core.add_activity(c, b, s)


@route("PUT", r"/api/activities/(\d+)")
def _act_upd(c, q, b, s, aid):
    return core.update_activity(c, int(aid), b, s)


@route("DELETE", r"/api/activities/(\d+)")
def _act_del(c, q, b, s, aid):
    return core.delete_activity(c, int(aid), s)


@route("GET", r"/api/progress")
def _progress(c, q, b, s):
    days = int(q.get("days", 90))
    b_ = today()
    a = shift(b_, -(days - 1))
    hist = core.history(c, a, b_)
    exp = core.expected_weights(hist)
    ws = core.weight_series(c, a, b_)
    for w in ws:
        w["expected"] = exp.get(w["date"])
    return {"weights": ws, "history": hist,
            "weeks": core.weekly(c, int(q.get("weeks", 12))), "calibration": core.calibration(c, apply=False),
            "body": T.list_body(c, a, b_), "steps_goal": int(float(core.settings(c).get("objetivo_pasos") or 8000)), "rev": rev(c)}


@route("GET", r"/api/calibration")
def _cal_get(c, q, b, s):
    return core.calibration(c, apply=False)


@route("PUT", r"/api/calibration")
def _cal_put(c, q, b, s):
    """Cambiar a mano los parámetros (o «auto»). Si se tocan los de la calibración, deja de ajustarse sola salvo que se pida."""
    data = {k: v for k, v in (b or {}).items() if k in core.CAL_DEFAULTS}
    if any(k in data for k in ("cal_ajuste_kcal", "cal_pasos_factor", "cal_ejercicio_factor")) and "cal_auto" not in data:
        data["cal_auto"] = "0"
    core.update_settings(c, data, s)
    return core.calibration(c, apply=False)


@route("POST", r"/api/calibration/reset")
def _cal_reset(c, q, b, s):
    core.update_settings(c, dict(core.CAL_DEFAULTS), s)
    core.set_setting(c, "cal_fecha", "", s)
    return core.calibration(c, apply=False)


@route("POST", r"/api/calibration/apply")
def _cal_apply(c, q, b, s):
    """Aplicar ya lo que estiman los datos (y volver a ajustarse sola)."""
    core.set_setting(c, "cal_fecha", "", s)
    core.update_settings(c, {"cal_auto": "1"}, s)
    return core.calibration(c, apply=True)


@route("GET", r"/api/weights")
def _weights(c, q, b, s):
    """Todos los pesajes (peso del día), para interpolar el peso corporal de cualquier fecha."""
    return [{"date": r["date"], "kg": r["weight_kg"]} for r in
            c.execute("SELECT date, weight_kg FROM days WHERE weight_kg IS NOT NULL ORDER BY date")]


# ---- entrenos
@route("GET", r"/api/workouts")
def _workouts(c, q, b, s):
    return {"workouts": T.list_workouts(c, q.get("from"), q.get("to"), int(q.get("limit", 200))),
            "exercises": T.exercise_names(c), "rev": rev(c)}


@route("GET", r"/api/workouts/(\d+)")
def _workout(c, q, b, s, wid):
    return T.get_workout(c, int(wid))


@route("POST", r"/api/workouts")
def _workout_new(c, q, b, s):
    return T.create_workout(c, b, s)


@route("PUT", r"/api/workouts/(\d+)")
def _workout_upd(c, q, b, s, wid):
    return T.update_workout(c, int(wid), b, s)


@route("DELETE", r"/api/workouts/(\d+)")
def _workout_del(c, q, b, s, wid):
    return T.delete_workout(c, int(wid), s)


@route("GET", r"/api/exercises/history")
def _ex_hist(c, q, b, s):
    return T.exercise_history(c, q.get("name", ""))


@route("GET", r"/api/exercise-settings")
def _exs_get(c, q, b, s):
    return T.exercise_settings(c)


@route("PUT", r"/api/exercise-settings")
def _exs_put(c, q, b, s):
    return T.set_exercise_settings(c, b, s)


# ---- notas (contexto personal para Claude)
@route("GET", r"/api/notes/([a-z0-9_-]{1,40})")
def _note_get(c, q, b, s, key):
    r = c.execute("SELECT body, updated_at FROM notes WHERE key=?", (key,)).fetchone()
    return {"key": key, "body": r["body"] if r else "", "updated_at": r["updated_at"] if r else None}


@route("PUT", r"/api/notes/([a-z0-9_-]{1,40})")
def _note_put(c, q, b, s, key):
    body = b.get("body")
    if not isinstance(body, str) or len(body) > 200_000:
        raise ApiError(400, "body debe ser texto (máx. 200.000 caracteres)")
    with tx(c, "set_note", s, ref=key):
        c.execute("INSERT INTO notes(key, body, updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at",
                  (key, body, ts()))
        if key == "claude" and body.strip():  # el agente ya hizo el inicio («Empezar con Salud»): la web da por hechos los primeros pasos
            c.execute("INSERT INTO notes(key, body, updated_at) VALUES('bienvenida', ?, ?) ON CONFLICT(key) DO UPDATE SET body=excluded.body, "
                      "updated_at=excluded.updated_at WHERE notes.body NOT LIKE 'hecho%'", ("hecho (con el agente)", ts()))
    return _note_get(c, q, b, s, key)


# ---- báscula
@route("GET", r"/api/body")
def _body(c, q, b, s):
    return T.list_body(c, q.get("from"), q.get("to"))


@route("POST", r"/api/body")
def _body_new(c, q, b, s):
    return T.add_body(c, b, s)


@route("DELETE", r"/api/body/(\d+)")
def _body_del(c, q, b, s, bid):
    return T.delete_body(c, int(bid), s)


# ---- fotos
@route("POST", r"/api/foods/(\d+)/image")
def _food_img(c, q, b, s, fid):
    return T.set_food_image(c, int(fid), data_url=b.get("data_url"), source=s)


@route("DELETE", r"/api/foods/(\d+)/image")
def _food_img_del(c, q, b, s, fid):
    return T.clear_food_image(c, int(fid), s)


@route("GET", r"/api/settings")
def _settings(c, q, b, s):
    return {"settings": core.settings(c), "targets": core.targets_list(c),
            "current_target": core.target_for(c, today())}


@route("PUT", r"/api/settings")
def _settings_upd(c, q, b, s):
    return core.update_settings(c, b, s)


@route("POST", r"/api/targets/preview")
def _target_preview(c, q, b, s):
    return core.preview_target(c, b, b.get("date"))


@route("POST", r"/api/targets")
def _target(c, q, b, s):
    return core.set_target(c, b, s)


@route("POST", r"/api/backup")
def _backup(c, q, b, s):
    return {"path": core.backup(c, b.get("reason", "manual"))}


@route("POST", r"/api/export")
def _export(c, q, b, s):
    return {"path": core.export_to_folder(c)}


@route("GET", r"/api/events")
def _events(c, q, b, s):
    return core.events(c, q.get("date"), int(q.get("limit", 100)))


# ---- Hevy
@route("GET", r"/api/hevy")
def _hevy(c, q, b, s):
    return H.status(c)


@route("PUT", r"/api/hevy")
def _hevy_key(c, q, b, s):
    return H.set_key(c, b.get("api_key"), s)


@route("POST", r"/api/hevy/sync")
def _hevy_sync(c, q, b, s):
    try:
        r = H.sync(c, bool(b.get("full")))
    except H.HevyError as e:
        raise ApiError(502, str(e))
    return {"result": r, "status": H.status(c)}


@route("POST", r"/api/hevy/import-csv")
def _hevy_csv(c, q, b, s):
    txt = (b.get("csv") or "").lstrip("\ufeff")
    if txt.lstrip().startswith(("[", "{")):
        import json as _j
        return H.import_json(c, _j.loads(txt), s)
    return T.import_hevy_csv(c, txt, s)


@route("POST", r"/api/templates/(\d+)/image")
def _tpl_img(c, q, b, s, tid):
    return T.set_template_image(c, int(tid), data_url=b.get("data_url"), source=s)
