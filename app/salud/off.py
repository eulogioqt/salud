"""Open Food Facts: buscar un producto por su código de barras (o por el enlace de su página) y traducirlo a nuestro formato."""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request

from .db import NotFound, ValidationError

UA = "Salud/1.0 (+https://salud.eulogioqt.com)"
FIELDS = "code,product_name,product_name_es,generic_name_es,brands,quantity,serving_size,serving_quantity,nutriments,image_front_url,image_url,nutrition_data_per"


def parse_code(q):
    """Código de barras (8–14 cifras) a partir de lo que se escriba: el código, el enlace de Open Food Facts o texto con el código."""
    q = (q or "").strip()
    m = re.search(r"openfoodfacts\.[a-z.]+/(?:[a-z-]+/)?(?:product|producto|produit)/(\d{8,14})", q, re.I)
    if m:
        return m.group(1)
    digits = re.sub(r"[\s-]", "", q)
    if re.fullmatch(r"\d{8,14}", digits):
        return digits
    m = re.search(r"\b(\d{8,14})\b", q)
    if m:
        return m.group(1)
    raise ValidationError("Pon el código de barras (8–14 cifras) o el enlace del producto en Open Food Facts")


def _num(v):
    try:
        return None if v in (None, "") else round(float(v), 2)
    except (TypeError, ValueError):
        return None


def lookup(q, timeout=10):
    code = parse_code(q)
    url = "https://world.openfoodfacts.org/api/v2/product/%s.json?fields=%s" % (code, FIELDS)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=timeout) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise NotFound("Ese código no está en Open Food Facts (%s)" % code)
        raise ValidationError("Open Food Facts no responde (%s)" % e.code)
    except (urllib.error.URLError, OSError, ValueError):
        raise ValidationError("No se pudo consultar Open Food Facts; prueba en un rato")
    p = data.get("product") if data.get("status") in (1, "1", "success") or data.get("product") else None
    if not p:
        raise NotFound("Ese código no está en Open Food Facts (%s)" % code)
    n = p.get("nutriments") or {}
    kcal = _num(n.get("energy-kcal_100g"))
    if kcal is None and _num(n.get("energy_100g")) is not None:  # solo kJ
        kcal = round(_num(n.get("energy_100g")) / 4.184, 1)
    per100 = {"kcal": kcal, "protein_g": _num(n.get("proteins_100g")), "carbs_g": _num(n.get("carbohydrates_100g")), "fat_g": _num(n.get("fat_100g"))}
    unit = "ml" if (p.get("nutrition_data_per") or "").endswith("ml") or re.search(r"\d\s*(ml|cl|l)\b", (p.get("quantity") or "").lower()) else "g"
    serving = None
    sq = _num(p.get("serving_quantity"))
    if sq and sq > 0:
        k = sq / 100
        ss = (p.get("serving_size") or "").strip()
        # «23 g» a secas no dice qué es: se llama «1 unidad (23 g)» (si trae nombre, p. ej. «1 barrita (23 g)», se respeta)
        if not ss or re.fullmatch(r"[\d.,]+\s*(g|gr|ml|cl|l)\.?", ss.lower()):
            ss = "1 unidad (%s %s)" % (("%g" % sq).replace(".", ","), unit)
        serving = {"label": ss, "amount": sq, "unit": unit,
                   **{f: (None if v is None else round(v * k, 1)) for f, v in per100.items()}}
    name = (p.get("product_name_es") or p.get("product_name") or p.get("generic_name_es") or "").strip()
    brand = (p.get("brands") or "").split(",")[0].strip() or None
    complete = all(v is not None for v in per100.values())
    return {"code": code, "name": name or None, "brand": brand, "quantity": p.get("quantity") or None,
            "unit": unit, "per100": per100, "complete": complete, "serving": serving,
            "image_url": p.get("image_front_url") or p.get("image_url") or None,
            "url": "https://world.openfoodfacts.org/product/%s" % code}
