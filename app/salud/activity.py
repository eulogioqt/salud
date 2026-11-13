"""Actividad: lo que se ha cambiado en la cuenta, quién lo hizo (tú en la web, tu agente, el móvil) y en qué consistió.

Sale de la tabla `events` (cada cambio guarda su acción, su origen y sus datos). Aquí se convierte en frases cortas
(«apuntó 2 huevos en el desayuno») con el detalle para quien quiera verlo.
Origen: `web` = la persona; `agente:<claude|chatgpt|…>` = un agente (antes de guardar el nombre: `chat`);
`movil` = el móvil (pasos, báscula); `importacion` = importaciones.
"""
from __future__ import annotations

import json

from .db import row

MEALS = {"desayuno": "el desayuno", "almuerzo": "el almuerzo", "merienda": "la merienda", "cena": "la cena", "otro": ""}
HIDDEN = ("init_settings", "calibrar")
# Ajustes internos que no interesan (fechas de sincronización…); el de Hevy sí
SETTING_TXT = {"hevy_agente": ("avisó de que tiene Hevy conectado", "avisó de que ya no tiene Hevy")}
FIELD_TXT = {"name": "nombre", "category": "categoría", "brand": "marca", "status": "calidad del dato", "source": "fuente", "notes": "notas",
             "portions": "raciones", "default_unit": "cómo se apunta", "reviewed": "aceptado", "favorite": "favorito", "hidden": "oculto",
             "image": "foto", "items": "ingredientes", "meal": "franja", "quantity": "cantidad", "unit_key": "unidad", "time": "hora",
             "date": "día", "note": "nota", "qty_est": "cantidad a ojo", "steps": "pasos", "weight_kg": "peso", "neat_kcal": "día a día",
             "how": "cómo fue el día", "rest_day": "descanso", "intensity": "intensidad", "kcal_netas": "kcal", "activity_type": "tipo",
             "title": "título", "duration_min": "duración", "exercises": "ejercicios", "description": "descripción",
             "fecha_nacimiento": "fecha de nacimiento", "altura_cm": "altura", "sexo": "sexo", "peso_estimado_kg": "peso aproximado"}


def who_of(source):
    s = source or ""
    if s.startswith("agente:"):
        return s
    if s in ("chat", "agente"):
        return "agente"
    if s in ("web",):
        return "tu"
    if s in ("movil",):
        return "movil"
    return "sistema"


def _n(x, nd=0):
    if x is None:
        return "?"
    s = ("{:,.%df}" % nd).format(float(x)).replace(",", "X").replace(".", ",").replace("X", ".")
    return s[:-2] if nd and s.endswith(",0") and nd == 1 and False else s


def _q(x):
    x = float(x)
    return _n(x, 0 if x == int(x) else 1)


def _date(d):
    if not d:
        return ""
    m = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
    return "%d %s" % (int(d[8:10]), m[int(d[5:7]) - 1])


class _Names:
    """Nombres de alimentos, raciones, comidas habituales, entradas y entrenos (con caché por petición)."""

    def __init__(self, conn):
        self.c, self.k = conn, {}

    def _one(self, key, sql, arg):
        if (key, arg) not in self.k:
            r = self.c.execute(sql, (arg,)).fetchone()
            self.k[(key, arg)] = r[0] if r else None
        return self.k[(key, arg)]

    def food(self, i):
        return self._one("f", "SELECT name FROM foods WHERE id=?", i) or "un alimento"

    def portion(self, i):
        return self._one("p", "SELECT label FROM portions WHERE id=?", i)

    def template(self, i):
        return self._one("t", "SELECT name FROM templates WHERE id=?", i) or "una comida habitual"

    def entry(self, i):
        return self._one("e", "SELECT name FROM entries WHERE id=?", i) or "una entrada"

    def workout(self, i):
        return self._one("w", "SELECT title FROM workouts WHERE id=?", i) or "un entreno"

    def qty(self, unit_key, q):
        if q is None:
            return ""
        u = unit_key or "g"
        if u in ("g", "ml"):
            return "%s %s" % (_q(q), u)
        if u.startswith("p:"):
            lab = self.portion(int(u[2:])) or "ración"
            return lab if float(q) == 1 else "%s × %s" % (_q(q), lab)
        if u == "total":
            return "todo"
        return "%s %s" % (_q(q), "ración" if float(q) == 1 else "raciones")


_INTERNAL = {"id", "created_at", "updated_at", "deleted_at", "activity_id", "hevy_id", "sets_count", "work_sets_count", "volume_kg",
             "volume_source", "source", "hevy_volume_kg", "start_time", "kind", "sort", "factor", "snapshot", "food_id", "template_id"}


def _changed(p, skip=("id",)):
    ks = list(dict.fromkeys(FIELD_TXT.get(k, k) for k in (p or {}) if k not in skip and k not in _INTERNAL and not k.startswith("apply")))
    return ", ".join(ks[:4]) + (" y más" if len(ks) > 4 else "") if ks else "datos"


def describe(ev, N):
    """→ (texto, icono, detalle[(etiqueta, valor)]) o None si no se enseña."""
    a, p, ref, d = ev["action"], ev["payload"] or {}, ev["ref"], ev["date"]
    when = (" · del " + _date(d)) if d and d != (ev.get("ts") or "")[:10] else ""  # solo si es de otro día
    meal = MEALS.get(p.get("meal") or "", "")
    det = []
    if a == "add_entry":
        f = N.food(p.get("food_id"))
        det = [("Alimento", f), ("Cantidad", N.qty(p.get("unit_key"), p.get("quantity"))), ("Comida", (p.get("meal") or "").capitalize()),
               ("Hora", p.get("time")), ("Nota", p.get("note")), ("A ojo", "sí" if p.get("qty_est") else None)]
        return "apuntó %s de %s%s%s" % (N.qty(p.get("unit_key"), p.get("quantity")), f, (" en " + meal) if meal else "", when), "plus", det
    if a == "add_estimate":
        det = [("Qué", p.get("name")), ("kcal", _n(p.get("kcal"))), ("Rango", "%s–%s kcal" % (_n(p.get("kcal_min")), _n(p.get("kcal_max"))) if p.get("kcal_min") else None),
               ("Proteína", p.get("protein_g") and _n(p.get("protein_g")) + " g"), ("Supuestos", p.get("note"))]
        return "estimó «%s» (%s kcal)%s%s" % (p.get("name"), _n(p.get("kcal")), (" en " + meal) if meal else "", when), "plus", det
    if a == "apply_template":
        t = N.template(int(ref)) if ref else "una comida habitual"
        return "apuntó la comida habitual «%s»%s%s" % (t, (" en " + meal) if meal else "", when), "plus", [("Cambios esta vez", len(p.get("items") or []) or None)]
    if a == "update_entry":
        return "cambió %s (%s)%s" % (N.entry(int(ref)), _changed(p), when), "edit", [(FIELD_TXT.get(k, k).capitalize(), v) for k, v in p.items() if k not in _INTERNAL]
    if a == "delete_entry":
        return "borró %s%s" % (p.get("name") or N.entry(int(ref)), when), "trash", []
    if a == "restore_entry":
        return "recuperó %s%s" % (N.entry(int(ref)), when), "undo", []
    if a in ("create_food", "create_recipe", "create_template"):
        kind = {"create_food": "el producto", "create_recipe": "la receta", "create_template": "la comida habitual"}[a]
        if a == "create_template":
            det = [("Lleva", ", ".join("%s de %s" % (N.qty(i.get("unit_key"), i.get("quantity")), N.food(i.get("food_id"))) for i in p.get("items") or []))]
        else:
            det = [("Raciones", ", ".join(x.get("label") or "" for x in p.get("portions") or []) or None), ("Fuente", p.get("source")), ("Notas", p.get("notes"))]
        return "creó %s «%s»" % (kind, p.get("name")), "plus", det
    if a == "update_food":
        f = N.food(int(ref))
        if p.get("deleted"):
            return "borró «%s»" % f, "trash", []
        if list(p) == ["reviewed"] or (p.get("reviewed") and len(p) <= 2):
            return "aceptó «%s»" % f, "check", []
        if list(p) == ["default_unit"]:
            u = p["default_unit"]
            return "puso «%s» para apuntarse %s" % (f, ("por " + (N.portion(int(u[2:])) or "unidad")) if u and u.startswith("p:") else "por peso"), "edit", []
        return "editó «%s» (%s)" % (f, _changed(p, ("id", "apply_open_days"))), "edit", [("Raciones", ", ".join(x.get("label") or "" for x in p.get("portions") or [] if not x.get("deleted")) or None)]
    if a.startswith("food_"):
        f = N.food(int(ref))
        on = p.get("value")
        txt = {"food_favorite": ("marcó «%s» como favorito", "quitó «%s» de favoritos"), "food_hidden": ("ocultó «%s»", "volvió a mostrar «%s»"),
               "food_deleted": ("borró «%s»", "recuperó «%s»")}.get(a, ("cambió «%s»", "cambió «%s»"))
        return (txt[0] if on else txt[1]) % f, "star" if a == "food_favorite" else "edit", []
    if a in ("set_food_image", "clear_food_image"):
        return ("puso foto a «%s»" if a == "set_food_image" else "quitó la foto de «%s»") % N.food(int(ref)), "camera", []
    if a == "set_template_image":
        return "puso imagen a «%s»" % N.template(int(ref)), "camera", []
    if a == "update_template":
        t = N.template(int(ref))
        if p.get("deleted"):
            return "borró la comida habitual «%s»" % t, "trash", []
        return "editó la comida habitual «%s» (%s)" % (t, _changed(p)), "edit", []
    if a == "create_workout":
        det = [("Duración", p.get("duration_min") and "%s min" % _n(p.get("duration_min"))), ("Ejercicios", len(p.get("exercises") or []) or None),
               ("kcal netas", p.get("kcal_netas") and _n(p.get("kcal_netas"))), ("Intensidad", p.get("intensity")), ("De", "Hevy" if p.get("hevy_id") else None)]
        return "subió el entreno «%s»%s" % (p.get("title") or "Entreno", when), "dumbbell", det
    if a == "update_workout":
        return "editó el entreno «%s» (%s)%s" % (N.workout(int(ref)), _changed(p), when), "dumbbell", [(FIELD_TXT.get(k, k).capitalize(), v) for k, v in p.items() if k != "exercises" and k not in _INTERNAL]
    if a == "delete_workout":
        return "borró el entreno «%s»%s" % (p.get("title") or "", when), "trash", []
    if a in ("add_activity", "update_activity", "delete_activity"):
        v = {"add_activity": "apuntó", "update_activity": "editó", "delete_activity": "borró"}[a]
        return "%s una actividad%s%s" % (v, (" de %s min" % _n(p.get("minutes"))) if p.get("minutes") else "", when), "dumbbell", [(FIELD_TXT.get(k, k).capitalize(), v_) for k, v_ in p.items()]
    if a == "add_body":
        w = p.get("weight_kg")
        det = [("Peso", w and _n(w, 1) + " kg"), ("Grasa", p.get("fat_pct") and _n(p["fat_pct"], 1) + " %"), ("Hora", p.get("time"))]
        return "registró un pesaje%s%s" % ((" de %s kg" % _n(w, 1)) if w else "", when), "scale", det
    if a == "delete_body":
        return "borró un pesaje%s" % when, "trash", []
    if a == "update_day":
        k = set(p)
        if k == {"steps"}:
            return "puso %s pasos%s" % (_n(p["steps"]), when), "steps", []
        if k == {"weight_kg"}:
            return "puso el peso del día%s%s" % ((" en %s kg" % _n(p["weight_kg"], 1)) if p["weight_kg"] else "", when), "scale", []
        if k == {"neat_kcal"}:
            return "eligió cómo fue el día a día%s" % when, "edit", []
        return "actualizó el día (%s)%s" % (_changed(p), when), "edit", [(FIELD_TXT.get(x, x).capitalize(), v) for x, v in p.items()]
    if a == "close_day":
        return "cerró el día%s" % when, "lock", [("Aunque faltara algo", "sí" if p.get("force") else None)]
    if a == "reopen_day":
        return "reabrió el día%s" % when, "undo", [("Motivo", p.get("reason"))]
    if a == "set_target":
        if p.get("mode") == "gasto":
            o = p.get("kcal_offset") or 0
            t = "según el gasto, %s kcal" % (("−%s" % _n(-o)) if o < 0 else ("+%s" % _n(o)) if o > 0 else "±0")
        else:
            t = "fijo, %s kcal" % _n(p.get("kcal"))
        return "cambió el objetivo (%s)" % t, "target", [("Desde", p.get("valid_from") and _date(p["valid_from"])), ("Nota", p.get("note"))]
    if a == "update_settings":
        return "cambió el perfil (%s)" % _changed(p), "gear", []
    if a == "set_note":
        return "actualizó sus notas sobre ti", "edit", []
    if a == "exercise_settings":
        return "ajustó el ejercicio «%s»" % p.get("name"), "dumbbell", [(k, v) for k, v in p.items() if k != "name" and v not in (None, "")]
    if a == "set_setting":
        t = SETTING_TXT.get(p.get("key"))
        if not t:
            return None
        return (t[0] if p.get("value") else t[1]), "plug", []
    if a == "health_sync":
        return "mandó tus pasos", "steps", []
    if a == "import_catalog":
        return "importó %s alimentos" % _n(p.get("n")), "plus", [("Archivo", p.get("file"))]
    if a == "accept_all_review":
        return "aceptó todo lo que había por revisar", "check", []
    return a.replace("_", " "), "edit", []


def feed(conn, before=None, limit=60, who=None):
    """Últimos cambios (de más nuevo a más viejo). Los envíos de pasos del móvil seguidos se juntan en uno por día."""
    base = "SELECT id, ts, source, action, date, ref, payload FROM events WHERE id < ? AND action NOT IN (%s)" % ",".join("?" * len(HIDDEN))
    args = list(HIDDEN)
    if who == "tu":
        base += " AND source='web'"
    elif who == "agente":
        base += " AND (source LIKE 'agente:%' OR source='chat')"
    elif who and who.startswith("agente:"):
        base += " AND source=?"
        args.append(who)
    elif who == "movil":
        base += " AND source='movil'"
    base += " ORDER BY id DESC LIMIT 400"
    N = _Names(conn)
    out, cur, done = [], int(before) if before else 1 << 62, False
    while not done and len(out) < limit:
        rs = conn.execute(base, [cur] + args).fetchall()
        if len(rs) < 400:
            done = True
        for r in rs:
            ev = row(r)
            cur = ev["id"]
            try:
                ev["payload"] = json.loads(ev["payload"]) if ev["payload"] else {}
            except ValueError:
                ev["payload"] = {}
            if not isinstance(ev["payload"], dict):
                ev["payload"] = {}
            w = who_of(ev["source"])
            if w == "sistema":
                continue
            try:
                d = describe(ev, N)
            except Exception:  # un evento raro no rompe la lista
                d = (ev["action"].replace("_", " "), "edit", [])
            if not d:
                continue
            text, ic, det = d
            prev = out[-1] if out else None
            # Pasos del móvil: uno por día («mandó tus pasos · 12 veces»)
            if ev["action"] == "health_sync" and prev and prev["action"] == "health_sync" and prev["ts"][:10] == ev["ts"][:10]:
                prev["count"] += 1
                continue
            # Lo que se hizo de golpe (una comida con varias cosas, pasos de varios días): una línea con «y N más»
            if prev and prev["who"] == w and prev["action"] == ev["action"] and prev["ts"][:16] == ev["ts"][:16] and ev["action"] != "health_sync":
                prev["count"] += 1
                if len(prev["more"]) < 40:
                    prev["more"].append(text)
                continue
            if len(out) >= limit:
                done = False
                cur = out[-1]["id"]
                break
            raw = ev["payload"] if len(json.dumps(ev["payload"], default=str)) < 6000 else None
            out.append({"id": ev["id"], "ts": ev["ts"], "who": w, "action": ev["action"], "text": text, "icon": ic, "count": 1,
                        "date": ev["date"], "raw": raw, "more": [],
                        "detail": [[k, v if isinstance(v, (str, int, float)) else json.dumps(v, ensure_ascii=False)] for k, v in det if v not in (None, "", [], {})]})
        else:
            continue
        break
    more = not done
    srcs = [r[0] for r in conn.execute("SELECT DISTINCT source FROM events WHERE source LIKE 'agente:%' OR source IN ('chat','web','movil')")]
    return {"items": out, "next": out[-1]["id"] if out and more else None,
            "who": sorted(set(who_of(x) for x in srcs), key=lambda x: (x != "tu", x == "movil", x))}
