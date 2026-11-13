"""Open Food Facts: buscar un producto por su código de barras (o por el enlace de su página) y traducirlo a nuestro formato."""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request

from .db import NotFound, ValidationError

UA = "Salud/1.0 (+https://salud.eulogioqt.com)"
FIELDS = "code,product_name,product_name_es,generic_name_es,brands,quantity,serving_size,serving_quantity,nutriments,image_front_url,image_url,nutrition_data_per,categories_tags"


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


_UNIT_WORDS = r"unidad|barrita|barra|lata|botella|bote|botell[ií]n|yogur|tarrina|sobre|bolsita|bolsa|galleta|pieza|brick|vaso|tableta|huevo"


def _qty(txt):
    """«150 g (6 x 25 g)» → (150, 6, 25); «330 ml» → (330, None, None)."""
    t = (txt or "").lower().replace(",", ".")
    m = re.search(r"(\d+)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(g|gr|ml|cl)\b", t)
    n, each = (int(m.group(1)), float(m.group(2)) * (10 if m.group(3) == "cl" else 1)) if m else (None, None)
    m = re.search(r"(\d+(?:\.\d+)?)\s*(kg|g|gr|ml|cl|l)\b", t)
    total = float(m.group(1)) * {"kg": 1000, "l": 1000, "cl": 10}.get(m.group(2), 1) if m else None
    if n and each and (not m or m.start() >= re.search(r"(\d+)\s*[x×*]", t).start()):
        total = n * each  # «6 x 25 g» sin total delante
    return total, n, each


def _serving(p, unit):
    """La ración de Open Food Facts con un nombre que diga qué es.
    - Caja de varias unidades («6 x 25 g») o ración = el envase entero (una lata de 330 ml): «1 unidad (25 g)» y por unidad.
    - Si ya trae nombre («1 barrita (23 g)», «2 galletas (25 g)»), se respeta; si es de una pieza, va por unidad.
    - Un peso a secas sin más («30 g» de cereales): «1 ración (30 g)», y se apunta por peso."""
    sq = _num(p.get("serving_quantity"))
    ss = (p.get("serving_size") or "").strip()
    total, n, each = _qty(p.get("quantity"))
    if not (sq and sq > 0):
        if not each:
            return None
        sq, ss = each, ""
    num = ("%g" % sq).replace(".", ",")
    bare = not ss or re.fullmatch(r"[\d.,]+\s*(g|gr|ml|cl|l)\.?", ss.lower())
    pack = bool(each and abs(each - sq) < 0.6) or bool(total and abs(total - sq) < 0.6)
    if not pack and total and bare:
        # Caja sin «6 x 23 g» escrito (138 g con ración de 23 g): si cabe un número entero de raciones y es de las cosas que
        # van en piezas (barritas, yogures, bollos…), cada ración es una unidad
        r = total / sq
        cats = " ".join(p.get("categories_tags") or [])
        if 2 <= round(r) <= 30 and abs(r - round(r)) < 0.03 and re.search(r"bars|yogh?urt|dessert|ice-cream|muffin|croissant|cake|madalena|magdalena|pastr", cats):
            pack, n = True, round(r)
    if bare:
        label, per_unit = ("1 unidad (%s %s)" if pack else "1 ración (%s %s)") % (num, unit), pack
    else:
        label = ss
        per_unit = pack or bool(re.match(r"^\s*1\s+(%s)" % _UNIT_WORDS, ss.lower()))
    out = {"label": label, "amount": sq, "unit": unit, "per_unit": per_unit}
    if n and pack:
        out["pack_units"] = n
    return out


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
    serving = _serving(p, unit)
    name = (p.get("product_name_es") or p.get("product_name") or p.get("generic_name_es") or "").strip()
    brand = (p.get("brands") or "").split(",")[0].strip() or None
    complete = all(v is not None for v in per100.values())
    if serving:
        k = serving["amount"] / 100
        serving.update({f: (None if v is None else round(v * k, 1)) for f, v in per100.items()})
    return {"code": code, "name": name or None, "brand": brand, "quantity": p.get("quantity") or None,
            "unit": unit, "per100": per100, "complete": complete, "serving": serving,
            "image_url": p.get("image_front_url") or p.get("image_url") or None,
            "url": "https://world.openfoodfacts.org/product/%s" % code}
