"""Tablas de niveles de fuerza de Strength Level (strengthlevel.com), bajo demanda y con caché.

Cada ejercicio se pide UNA vez cuando alguien lo necesita (su robots.txt lo permite) y se guarda en
<datos>/strengthlevel/<slug>.json; se refresca como mucho cada 90 días. No se publica un volcado de su web:
los datos son suyos y se citan en la web y en el LEEME.

Formato de cada tabla: filas [peso corporal o edad, principiante, novato, intermedio, avanzado, élite].
- Ejercicios con peso: «w» (1RM en kg; mancuernas: por mancuerna).
- Ejercicios de peso corporal: «reps» (repeticiones) y «add» (lastre 1RM; negativo = asistencia).
"""
from __future__ import annotations

import html
import json
import os
import re
import threading
import time
import urllib.request

BASE = "https://strengthlevel.com/strength-standards/"
SLUG_RX = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
MAX_AGE = 90 * 86400
VERSION = 2  # sube si cambia el formato: lo guardado con otra versión se vuelve a pedir
_LOCK = threading.Lock()
_LAST = [0.0]


class SLError(Exception):
    pass


def _num(txt):
    t = html.unescape(re.sub(r"<[^>]+>", "", txt)).replace("kg", "").replace("+", "").strip()
    if t.startswith("<"):
        return 0.5
    try:
        v = float(t.replace(",", ""))
    except ValueError:
        return None
    return int(v) if v == int(v) else v


def parse(page):
    """Saca de la página las tablas por peso corporal y por edad de hombres (H) y mujeres (M)."""
    name = re.search(r"<h2[^>]*>\s*Male (.*?) Standards", page, re.S)
    out = {"name": html.unescape(name.group(1)).strip() if name else None, "H": {}, "M": {}}
    sections = re.split(r"<h2[^>]*>\s*(?=Male |Female )", page)
    for sec in sections[1:]:
        sx = "H" if sec.startswith("Male") else "M"
        tables = []
        for m in re.finditer(r'<table class="table is-striped is-fullwidth is-narrow has-text-right">(.*?)</table>', sec, re.S):
            rows = []
            for r in re.findall(r"<tr>(.*?)</tr>", m.group(1), re.S)[1:]:
                cells = [_num(c) for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", r, re.S)]
                if len(cells) == 6 and None not in cells:
                    rows.append(cells)
            if rows:
                tables.append(rows)
        if len(tables) >= 4:   # peso corporal: repeticiones y lastre
            out[sx] = {"reps": tables[0], "reps_age": tables[1], "add": tables[2], "add_age": tables[3]}
        elif len(tables) >= 2 and re.search(r"How many reps|Reps By", sec):  # solo repeticiones
            out[sx] = {"reps": tables[0], "reps_age": tables[1]}
        elif len(tables) >= 2:
            out[sx] = {"w": tables[0], "w_age": tables[1]}
    if not out["H"] and not out["M"]:
        raise SLError("No se han encontrado tablas")
    return out


def cache_dir(datadir):
    d = os.path.join(datadir, "strengthlevel")
    os.makedirs(d, exist_ok=True)
    return d


def get(datadir, slug, fetch=None):
    """Tablas de un ejercicio (de la caché o pidiéndolas a Strength Level)."""
    slug = (slug or "").strip().lower()
    if not SLUG_RX.match(slug) or len(slug) > 80:
        raise SLError("Ejercicio no válido")
    path = os.path.join(cache_dir(datadir), slug + ".json")
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < MAX_AGE:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if data.get("v") == VERSION:
            return data
    url = BASE + slug + "/kg"
    with _LOCK:  # una petición cada 2 s como mucho, para no molestar
        wait = 2 - (time.time() - _LAST[0])
        if wait > 0:
            time.sleep(wait)
        _LAST[0] = time.time()
        try:
            page = (fetch or _fetch)(url)
        except Exception as e:  # sin red o no existe
            if os.path.exists(path):
                with open(path, encoding="utf-8") as f:
                    return json.load(f)
            raise SLError("No se ha podido consultar Strength Level (%s)" % e)
    data = parse(page)
    data.update({"slug": slug, "url": url, "fetched": time.strftime("%Y-%m-%d"), "v": VERSION})
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)
    return data


def _fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; salud.eulogioqt.com; seguimiento personal)"})
    with urllib.request.urlopen(req, timeout=20) as r:
        if r.status != 200:
            raise SLError("HTTP %s" % r.status)
        return r.read().decode("utf-8", "replace")


def cached(datadir):
    """Ejercicios ya consultados: [{slug, name}]."""
    d = cache_dir(datadir)
    out = []
    for f in sorted(os.listdir(d)):
        if f.endswith(".json"):
            try:
                with open(os.path.join(d, f), encoding="utf-8") as fh:
                    j = json.load(fh)
                out.append({"slug": j["slug"], "name": j.get("name")})
            except (OSError, ValueError, KeyError):
                pass
    return out
