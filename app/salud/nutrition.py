"""Cálculo nutricional reproducible.

Representación: dict con kcal, protein_g, carbs_g, fat_g y `missing`.
- Un valor None significa DESCONOCIDO (nunca 0).
- `missing` lista los campos donde al menos un componente es desconocido; el
  valor numérico es entonces la suma de lo conocido (un mínimo, no un total).
"""
from __future__ import annotations

from .db import NotFound, ValidationError, row, rows

FIELDS = ("kcal", "protein_g", "carbs_g", "fat_g")
QUALITY_ORDER = ["etiqueta", "historico", "provisional", "estimacion", "pendiente"]
QUALITY_LABEL = {
    "etiqueta": "Etiqueta",
    "historico": "Histórico",
    "provisional": "Provisional",
    "estimacion": "Estimación",
    "pendiente": "Pendiente",
}
SOURCE_TYPE_TO_QUALITY = {
    "label": "etiqueta",
    "historical": "historico",
    "historical_estimate": "estimacion",
    "external_provisional": "provisional",
    "pending": "pendiente",
}


def worst(*qs):
    qs = [q for q in qs if q]
    if not qs:
        return "pendiente"
    return max(qs, key=lambda q: QUALITY_ORDER.index(q) if q in QUALITY_ORDER else len(QUALITY_ORDER))


def nutr(kcal=None, protein_g=None, carbs_g=None, fat_g=None, missing=None):
    n = {"kcal": kcal, "protein_g": protein_g, "carbs_g": carbs_g, "fat_g": fat_g}
    m = set(missing or [])
    for f in FIELDS:
        if n[f] is None:
            m.add(f)
    n["missing"] = [f for f in FIELDS if f in m]
    return n


def from_row(r):
    return nutr(r["kcal"], r["protein_g"], r["carbs_g"], r["fat_g"])


def scale(n, factor):
    out = {f: (None if n[f] is None else n[f] * factor) for f in FIELDS}
    out["missing"] = list(n["missing"])
    return out


def add(a, b):
    out = {}
    m = set(a["missing"]) | set(b["missing"])
    for f in FIELDS:
        va, vb = a[f], b[f]
        if va is None and vb is None:
            out[f] = None
        else:
            out[f] = (va or 0) + (vb or 0)
        if va is None or vb is None:
            m.add(f)
    out["missing"] = [f for f in FIELDS if f in m]
    return out


def zero():
    return {"kcal": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0, "missing": []}


def total(items):
    items = list(items)
    if not items:
        return zero()
    t = items[0]
    t = {**{f: t[f] for f in FIELDS}, "missing": list(t["missing"])}
    for n in items[1:]:
        t = add(t, n)
    return t


def rounded(n, nd=1, kcal_nd=0):
    out = {f: (None if n[f] is None else round(n[f], kcal_nd if f == "kcal" else nd)) for f in FIELDS}
    out["missing"] = list(n["missing"])
    return out


# ---------------------------------------------------------------- unidades ---

def _completeness(p):
    return sum(1 for f in FIELDS if p[f] is not None)


def pick_basis(portions, unit):
    """Ración que sirve de base para escalar por g o ml.

    Prioridad: marcada por defecto > más campos conocidos > mejor calidad >
    mayor cantidad. Es determinista y queda registrada en el snapshot.
    """
    cands = [p for p in portions if p["unit"] == unit and p["amount"] and p["amount"] > 0]
    if not cands:
        return None
    return max(
        cands,
        key=lambda p: (
            p["is_default"],
            _completeness(p),
            -QUALITY_ORDER.index(p["quality"]) if p["quality"] in QUALITY_ORDER else -9,
            p["amount"],
        ),
    )


def get_food(conn, food_id):
    f = row(conn.execute("SELECT * FROM foods WHERE id=?", (food_id,)).fetchone())
    if not f:
        raise NotFound("Alimento %s no encontrado" % food_id)
    return f


def get_portions(conn, food_id):
    return rows(conn.execute(
        "SELECT * FROM portions WHERE food_id=? AND deleted=0 ORDER BY sort, id", (food_id,)))


def recipe_items(conn, recipe_id):
    return rows(conn.execute(
        "SELECT ri.*, f.name AS food_name FROM recipe_items ri JOIN foods f ON f.id=ri.food_id "
        "WHERE ri.recipe_id=? ORDER BY ri.sort, ri.id", (recipe_id,)))


def recipe_total(conn, recipe, depth=0):
    if depth > 5:
        raise ValidationError("Receta con anidamiento circular o demasiado profundo")
    parts, quals = [], []
    for it in recipe_items(conn, recipe["id"]):
        n, q, _lbl = compute(conn, it["food_id"], it["unit_key"], it["quantity"], depth + 1)[:3]
        parts.append(n)
        quals.append(q)
    t = total(parts) if parts else nutr()
    return t, (worst(*quals) if quals else "pendiente")


def unit_options(conn, food, depth=0):
    """Unidades en las que puede registrarse un alimento, con valores por unidad."""
    opts = []
    if food["kind"] == "receta":
        t, q = recipe_total(conn, food, depth)
        if food["recipe_servings"]:
            opts.append({"key": "rac", "label": "ración", "per": scale(t, 1.0 / food["recipe_servings"]),
                         "quality": q, "basis": "receta / %g raciones" % food["recipe_servings"], "default_qty": 1})
        if food["recipe_cooked_weight_g"]:
            opts.append({"key": "g", "label": "g", "per": scale(t, 1.0 / food["recipe_cooked_weight_g"]),
                         "quality": q, "basis": "receta / %g g cocinados" % food["recipe_cooked_weight_g"],
                         "default_qty": round(food["recipe_cooked_weight_g"] / (food["recipe_servings"] or 1))})
        opts.append({"key": "total", "label": "receta completa", "per": t, "quality": q,
                     "basis": "suma de ingredientes", "default_qty": 1})
        return opts

    portions = get_portions(conn, food["id"])
    for unit in ("g", "ml"):
        b = pick_basis(portions, unit)
        if b:
            opts.append({"key": unit, "label": unit, "per": scale(from_row(b), 1.0 / b["amount"]),
                         "quality": worst(b["quality"], food["status"]),
                         "basis": "escalado desde «%s»" % b["label"],
                         "default_qty": b["amount"] if b["amount"] != 100 else 100})
    for p in portions:
        opts.append({"key": "p:%d" % p["id"], "label": p["label"], "per": from_row(p),
                     "quality": worst(p["quality"], food["status"]), "basis": "ración registrada",
                     "default_qty": 1, "amount": p["amount"], "unit": p["unit"]})
    if not portions:
        opts.append({"key": "x", "label": "ración (sin datos)", "per": nutr(), "quality": "pendiente",
                     "basis": "sin datos nutricionales", "default_qty": 1})
    return opts


def compute(conn, food_id, unit_key, quantity, depth=0):
    """Devuelve (nutrición, calidad, etiqueta_unidad, snapshot) de una cantidad."""
    if quantity is None or quantity <= 0:
        raise ValidationError("La cantidad debe ser mayor que 0")
    food = get_food(conn, food_id)
    opts = {o["key"]: o for o in unit_options(conn, food, depth)}
    o = opts.get(unit_key)
    if not o:
        raise ValidationError("Unidad «%s» no válida para %s (válidas: %s)" % (unit_key, food["name"], ", ".join(opts)))
    n = scale(o["per"], quantity)
    q = ("%g" % quantity).replace(".", ",")
    if unit_key in ("g", "ml"):
        label = "%s %s" % (q, unit_key)
    elif quantity == 1:
        label = o["label"]
    else:
        label = "%s × %s" % (q, o["label"])
    snap = {
        "food_id": food["id"], "food_name": food["name"], "food_status": food["status"],
        "unit_key": unit_key, "unit": o["label"], "basis": o["basis"],
        "per_unit": rounded(o["per"], 6, 6), "quantity": quantity,
    }
    if food["kind"] == "receta":
        snap["ingredients"] = [
            {"food_id": it["food_id"], "name": it["food_name"], "unit_key": it["unit_key"], "quantity": it["quantity"]}
            for it in recipe_items(conn, food["id"])
        ]
        snap["servings"] = food["recipe_servings"]
        snap["cooked_weight_g"] = food["recipe_cooked_weight_g"]
    return n, o["quality"], label, snap
