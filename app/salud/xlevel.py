"""Estándares de cardio de la familia Strength Level: Swimming, Running, Rowing y Cycling Level.

Igual que strengthlevel.py: se descargan despacio desde sus webs (robots.txt lo permite), se guardan en la caché
del servidor (<datos>/xlevel/<sitio>/<slug>.json) y la web las pide a nuestra API. Son datos suyos: se citan.

Cada página es una prueba (p. ej. «100m», «5k», «2000m», «60 minutes») con tablas por edad de hombres (H) y mujeres (M):
filas [edad, principiante, novato, intermedio, avanzado, élite, récord]. La primera tabla es la principal (tiempo en
segundos, o metros si la prueba es por tiempo); las siguientes son variantes (ritmo, velocidad, vatios…).
"""
from __future__ import annotations

import html
import json
import os
import re
import time
import urllib.request

SITES = {
    "swimming": ("Swimming Level", "https://swimminglevel.com", "swimming-times"),
    "running": ("Running Level", "https://runninglevel.com", "running-times"),
    "rowing": ("Rowing Level", "https://rowinglevel.com", "rowing-times"),
    "cycling": ("Cycling Level", "https://cyclinglevel.com", "cycling-times"),
}
SLUG_RX = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
VERSION = 1


class XLError(Exception):
    pass


def _fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; salud.eulogioqt.com; seguimiento personal)"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode("utf-8", "replace")


def _val(t):
    t = html.unescape(re.sub(r"<[^>]+>", "", t)).strip().replace(",", "")
    t = re.sub(r"[a-z%]+$", "", t).strip()
    if re.match(r"^\d+(:\d+){1,2}(\.\d+)?$", t):
        parts = [float(x) for x in t.split(":")]
        sec = 0.0
        for p in parts:
            sec = sec * 60 + p
        return round(sec, 2)
    try:
        v = float(t)
        return int(v) if v == int(v) else v
    except ValueError:
        return None


def parse(page):
    title = re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S)
    out = {"name": html.unescape(re.sub(r"<[^>]+>|\s+", " ", title.group(1))).strip() if title else None, "H": [], "M": []}
    secs = re.split(r"<h2[^>]*>\s*(?=(?:Male|Female) )", page)
    for sec in secs[1:]:
        sx = "H" if sec.startswith("Male") else "M"
        if out[sx]:
            continue
        for m in re.finditer(r"<table[^>]*>(.*?)</table>", sec, re.S):
            rows = re.findall(r"<tr[^>]*>(.*?)</tr>", m.group(1), re.S)
            if not rows or not re.search(r">\s*Age\s*<", rows[0]):
                continue
            tab = []
            for r in rows[1:]:
                cells = [_val(c) for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", r, re.S)]
                if len(cells) >= 6 and None not in cells[:6]:
                    tab.append(cells[:7])
            if tab:
                out[sx].append(tab)
    if not out["H"] or not out["M"]:
        raise XLError("No se han encontrado tablas")
    return out


def _dir(datadir, site):
    d = os.path.join(datadir, "xlevel", site)
    os.makedirs(d, exist_ok=True)
    return d


def slugs(datadir, site, fetch=None):
    name, base, sec = SITES[site]
    path = os.path.join(_dir(datadir, site), "_lista.json")
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < 30 * 86400:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    xml = (fetch or _fetch)(base + "/sitemap.xml")
    out = sorted(set(re.findall(r"<loc>%s/%s/([a-z0-9-]+)/?</loc>" % (re.escape(base), sec), xml)))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f)
    return out


def get(datadir, site, slug, fetch=None, refetch=False):
    if site not in SITES or not SLUG_RX.match(slug or ""):
        raise XLError("Prueba no válida")
    path = os.path.join(_dir(datadir, site), slug + ".json")
    if os.path.exists(path) and not refetch:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        if d.get("v") == VERSION:
            return d
    name, base, sec = SITES[site]
    url = "%s/%s/%s" % (base, sec, slug)
    d = parse((fetch or _fetch)(url))
    d.update({"site": site, "slug": slug, "url": url, "fetched": time.strftime("%Y-%m-%d"), "v": VERSION})
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)
    return d


def download_all(datadir, delay=3.0, log=print):
    for site in SITES:
        ok = bad = 0
        for sl in slugs(datadir, site):
            exists = os.path.exists(os.path.join(_dir(datadir, site), sl + ".json"))
            try:
                get(datadir, site, sl)
                ok += 1
            except Exception as e:  # páginas sin tablas (FAQ, etc.)
                bad += 1
                log("  %s/%s: %s" % (site, sl, e))
            if not exists:
                time.sleep(delay)
        log("%s: %d pruebas, %d sin tablas" % (SITES[site][0], ok, bad))


def index(datadir):
    """{sitio: {"name": …, "url": …, "items": [{slug, name}]}} con lo que haya en la caché."""
    out = {}
    for site, (name, base, sec) in SITES.items():
        items = []
        d = _dir(datadir, site)
        for f in sorted(os.listdir(d)):
            if f.endswith(".json") and not f.startswith("_"):
                try:
                    with open(os.path.join(d, f), encoding="utf-8") as fh:
                        j = json.load(fh)
                    items.append({"slug": j["slug"], "name": j.get("name")})
                except (OSError, ValueError, KeyError):
                    pass
        out[site] = {"name": name, "url": base, "items": items}
    return out
