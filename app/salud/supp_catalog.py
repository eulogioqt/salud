"""Catálogo de suplementos: al añadir uno se elige de aquí y ya viene con su dosis, cuándo se toma y un dibujo
(SVG de la casa). Luego la persona lo cambia todo a su gusto (valores, foto, hora…), como cualquier producto."""
from __future__ import annotations

import base64
import re

BG = ('<defs><radialGradient id="bg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#f4efe6"/><stop offset="1" stop-color="#e3dccd"/></radialGradient>'
      '<radialGradient id="pl" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#ffffff"/><stop offset=".8" stop-color="#f4f4f1"/><stop offset="1" stop-color="#dcdcd6"/></radialGradient></defs>'
      '<rect width="400" height="300" fill="url(#bg)"/>')


def _svg(body):
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">' + BG + body + "</svg>"


def _plate(body):
    """El plato y lo que lleva, centrados (las miniaturas recortan en cuadrado)."""
    return '<g transform="translate(200 158) scale(.88) translate(-200 -205)">' + body + "</g>"


def _dish():
    return ('<ellipse cx="200" cy="236" rx="160" ry="38" fill="#000" opacity=".08"/>'
            '<ellipse cx="200" cy="222" rx="160" ry="50" fill="url(#pl)"/><ellipse cx="200" cy="217" rx="128" ry="36" fill="#efeee9"/>')


SPOTS = [(-62, -8, -25), (-10, -14, 15), (48, -8, -50), (-38, 16, 70), (20, 14, -10), (78, 14, 35), (-90, 12, 10)]


def capsules(c1, c2):
    out = [_dish()]
    for dx, dy, rot in SPOTS[:6]:
        x, y = 200 + dx, 214 + dy
        out.append('<g transform="translate(%d %d) rotate(%d)">'
                   '<rect x="-32" y="-12" width="32" height="24" rx="12" fill="%s" stroke="#00000022" stroke-width=".7"/>'
                   '<rect x="0" y="-12" width="32" height="24" rx="12" fill="%s" stroke="#00000022" stroke-width=".7"/>'
                   '<rect x="-24" y="-7" width="46" height="5" rx="2.5" fill="#fff" opacity=".35"/></g>' % (x, y, rot, c1, c2))
    return _svg(_plate("".join(out)))


def softgels(c, c2):
    out = [_dish()]
    for dx, dy, rot in SPOTS[:7]:
        out.append('<g transform="translate(%d %d) rotate(%d)"><ellipse rx="26" ry="16" fill="%s" opacity=".92" stroke="%s" stroke-width=".8"/>'
                   '<ellipse cx="-8" cy="-6" rx="10" ry="4" fill="#fff" opacity=".45"/></g>' % (200 + dx, 214 + dy, rot, c, c2))
    return _svg(_plate("".join(out)))


def tablets(c, c2):
    out = [_dish()]
    for dx, dy, rot in SPOTS[:7]:
        out.append('<g transform="translate(%d %d) rotate(%d)"><ellipse rx="23" ry="14" fill="%s" stroke="%s" stroke-width=".8"/>'
                   '<ellipse cy="-3" rx="23" ry="11" fill="%s"/><path d="M-14 -3 L14 -3" stroke="%s" stroke-width="1.5" opacity=".5"/>'
                   '<ellipse cx="-7" cy="-6" rx="7" ry="3" fill="#fff" opacity=".35"/></g>' % (200 + dx, 216 + dy, rot // 3, c2, c2, c, c2))
    return _svg(_plate("".join(out)))


def tub(lid, label, powder="#ffffff"):
    return _svg('<ellipse cx="200" cy="250" rx="120" ry="18" fill="#000" opacity=".09"/>'
                '<rect x="130" y="95" width="140" height="150" rx="14" fill="#f7f7f5"/><rect x="130" y="95" width="140" height="150" rx="14" fill="none" stroke="#d8d8d2"/>'
                '<rect x="130" y="140" width="140" height="60" fill="%s"/><rect x="146" y="158" width="70" height="8" rx="4" fill="#fff" opacity=".7"/>'
                '<rect x="146" y="174" width="44" height="6" rx="3" fill="#fff" opacity=".5"/>'
                '<rect x="122" y="76" width="156" height="26" rx="8" fill="%s"/><rect x="132" y="80" width="80" height="5" rx="2.5" fill="#fff" opacity=".3"/>'
                '<g transform="translate(300 225) rotate(-18)"><rect x="-6" y="-48" width="12" height="44" rx="5" fill="#cfd6dc"/>'
                '<ellipse cx="0" cy="0" rx="22" ry="13" fill="#dfe6ea"/><ellipse cx="0" cy="-3" rx="18" ry="8" fill="%s"/></g>'
                '<rect x="140" y="104" width="14" height="128" rx="7" fill="#fff" opacity=".5"/>' % (label, lid, powder))


def blister(c):
    cells = "".join('<circle cx="%d" cy="%d" r="10" fill="#e9eef2" stroke="#c9d2d9" stroke-width=".8"/><circle cx="%d" cy="%d" r="6.5" fill="%s"/>'
                    '<circle cx="%d" cy="%d" r="2.2" fill="#fff" opacity=".5"/>' % (x, y, x, y, c if i % 7 or True else c, x - 2, y - 2)
                    for i, (x, y) in enumerate((126 + 25 * k, 120 + 28 * r) for r in range(3) for k in range(7)))
    return _svg('<ellipse cx="200" cy="232" rx="135" ry="20" fill="#000" opacity=".09"/>'
                '<g transform="rotate(-6 200 150)"><rect x="104" y="96" width="194" height="112" rx="12" fill="#f5f7f9" stroke="#d6dde3"/>'
                + cells + '<path d="M118 102 L176 102" stroke="#fff" stroke-width="4" opacity=".6"/></g>')


def sachet(c, c2):
    return _svg('<ellipse cx="200" cy="246" rx="120" ry="18" fill="#000" opacity=".09"/>'
                '<g transform="rotate(-10 200 160)"><rect x="140" y="70" width="120" height="170" rx="6" fill="%s"/>'
                '<rect x="140" y="70" width="120" height="16" fill="%s"/><rect x="140" y="224" width="120" height="16" fill="%s"/>'
                '<circle cx="200" cy="150" r="30" fill="#fff" opacity=".85"/><path d="M200 128 l-12 26 h10 l-6 22 l18 -30 h-10 z" fill="%s"/>'
                '<rect x="150" y="92" width="10" height="126" rx="5" fill="#fff" opacity=".3"/></g>' % (c, c2, c2, c))


# clave, nombre, ración (etiqueta, cantidad, unidad), cuándo, extra, notas, dibujo, reconoce
CATALOG = [
    ("creatina", "Creatina monohidrato", ("5 g", 5, "g"), "diario", {}, "3–5 g al día, cualquier hora; no hace falta cargar.",
     lambda: tub("#2f6fb3", "#3f86d0"), r"creatin"),
    ("b12", "Vitamina B12", ("1 cápsula", 1, "ud"), "fiesta", {}, "Los días de fiesta: antes de salir y al día siguiente.",
     lambda: capsules("#d9473f", "#f3efe9"), r"\bb\s?12|cobalamina"),
    ("hierro", "Hierro", ("1 comprimido", 1, "ud"), "diario", {}, "Mejor con vitamina C y lejos del café, el té y los lácteos.",
     lambda: tablets("#9b3a2f", "#7a2c23"), r"hierro|\biron\b|ferro"),
    ("vitamina_d", "Vitamina D3", ("1 cápsula", 1, "ud"), "diario", {}, "Con una comida con algo de grasa.",
     lambda: softgels("#f2c33d", "#d9a722"), r"vitamina\s?d|\bd3\b|colecalciferol"),
    ("omega3", "Omega 3", ("1 cápsula", 1, "ud"), "diario", {}, "Con una comida.",
     lambda: softgels("#e0a43a", "#b9802a"), r"omega|aceite de pescado"),
    ("magnesio", "Magnesio", ("1 comprimido", 1, "ud"), "diario", {"supp_time": "22:30"}, "Mejor por la noche.",
     lambda: tablets("#f4f4f1", "#cfd2d6"), r"magnesio|magnesium"),
    ("pildora", "Píldora anticonceptiva", ("1 comprimido", 1, "ud"), "diario", {"supp_time": "22:00", "supp_notify": 1, "supp_cycle": "21+7"},
     "Cada día a la misma hora; 21 días y 7 de descanso (cámbialo si la tuya es continua).", lambda: blister("#e37fa3"), r"p[ií]ldora|anticoncep"),
    ("multivitaminico", "Multivitamínico", ("1 comprimido", 1, "ud"), "diario", {}, "Con el desayuno.",
     lambda: tablets("#f0a64b", "#c9822e"), r"multivit"),
    ("electrolitos", "Electrolitos", ("1 sobre", 1, "ud"), "entreno", {}, "Los días de entreno (o de mucho calor o de fiesta).",
     lambda: sachet("#3fa3c9", "#2b7f9f"), r"electrolit|sales minerales|isot"),
    ("cafeina", "Cafeína / preentreno", ("1 dosis", 1, "ud"), "entreno", {}, "Antes de entrenar; no tarde.",
     lambda: tub("#2b2b2b", "#e2533b", "#f2a7a0"), r"cafe[ií]na|pre.?entreno|pre.?workout"),
    ("melatonina", "Melatonina", ("1 comprimido", 1, "ud"), "manual", {}, "Solo cuando la tomes.",
     lambda: tablets("#c9d6ef", "#9fb2d6"), r"melatonin"),
]
BY_KEY = {c[0]: c for c in CATALOG}
WHEN_TXT = {"diario": "cada día", "fiesta": "días de fiesta (antes y después)", "entreno": "días de entreno", "manual": "cuando lo apuntes", "dias": "algunos días"}


def svg_data_url(key):
    return "data:image/svg+xml;base64," + base64.b64encode(BY_KEY[key][6]().encode()).decode()


def listing():
    out = []
    for key, name, (lab, _a, _u), when, extra, notes, _draw, _rx in CATALOG:
        t = WHEN_TXT[when] + ((" a las " + extra["supp_time"]) if extra.get("supp_time") else "") + (" · " + extra["supp_cycle"].replace("+", " + ") + " de descanso" if extra.get("supp_cycle") else "")
        out.append({"key": key, "name": name, "dose": lab, "when": when, "when_txt": t, "notes": notes, "img": svg_data_url(key)})
    return out


def food_data(key):
    """Datos para crear el producto (sin el dibujo, que se pone después)."""
    key_, name, (lab, amount, unit), when, extra, notes, _draw, _rx = BY_KEY[key]
    return {"name": name, "category": "Suplemento", "status": "historico", "source": "Catálogo de Salud", "notes": notes,
            "portions": [{"label": lab, "amount": amount, "unit": unit, "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "quality": "historico", "is_default": True}],
            "supp_when": when, "supp_key": key, **extra}


def match(name):
    """Clave del catálogo que corresponde a un suplemento ya creado (por su nombre), o None."""
    n = (name or "").lower()
    for c in CATALOG:
        if re.search(c[7], n):
            return c[0]
    return None
