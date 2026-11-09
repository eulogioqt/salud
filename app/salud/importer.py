"""Importación inicial del catálogo aprobado (34 entradas) y valores iniciales.

Idempotente: si un código ya existe no se vuelve a importar ni se sobrescribe.
Conserva: nombre original, nombre anterior, raciones originales, tipo de dato,
observaciones, nota de importación y texto histórico. null -> desconocido.
"""
from __future__ import annotations

import json
import os
import re

from . import core
from .db import ROOT_DIR, tx, ts
from .nutrition import SOURCE_TYPE_TO_QUALITY

CATALOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "catalogo_inicial.json")

STATUS = {"pending_verification": "pendiente", "provisional": "provisional", "historical_reference": "historico"}

# Nombre corto para la interfaz y categoría (el nombre original se conserva íntegro).
DISPLAY = {
    1: ("HSN Evowhey doble chocolate", "suplementos"),
    2: ("Avena molida", "cereales"),
    3: ("Tortitas de legumbres", "snacks"),
    4: ("Blue Chameleon clásica", "bebidas"),
    5: ("Monster Zero / blanco", "bebidas"),
    6: ("Miel", "dulces"),
    7: ("Isodrink", "bebidas"),
    8: ("Yogur Protecito caramelo", "lácteos"),
    9: ("Mousse proteico", "lácteos"),
    10: ("Flan proteico", "lácteos"),
    11: ("Batido bebible de proteína", "lácteos"),
    12: ("Pack de lomo", "carnes"),
    13: ("Soja texturizada", "legumbres"),
    14: ("Limonada", "bebidas"),
    15: ("Atún al natural (lata amarilla)", "conservas"),
    16: ("Atún en aceite de girasol", "conservas"),
    17: ("Melva canutera con piquillo", "conservas"),
    18: ("Sardinas / melva / caballa", "conservas"),
    19: ("Maíz en lata", "conservas"),
    20: ("Salchichón", "embutidos"),
    21: ("Jamón (envase 240 g)", "embutidos"),
    22: ("Arroz en bolsa", "cereales"),
    23: ("Tiras de pollo Mercadona", "carnes"),
    24: ("Lomo adobado", "carnes"),
    25: ("Pollo asado / pechuga de pollería", "carnes"),
    26: ("Picos / regañás", "snacks"),
    27: ("Coca-Cola Zero", "bebidas"),
    28: ("Coca-Cola", "bebidas"),
    29: ("Tinto de verano", "alcohol"),
    30: ("Caña", "alcohol"),
    31: ("Tercio de cerveza", "alcohol"),
    32: ("Pinta", "alcohol"),
    33: ("Whisky con Coca-Cola Zero", "alcohol"),
    34: ("Victoria (lata)", "alcohol"),
}


def parse_amount(label):
    """Cantidad física explícita en el texto de la ración (g, ml o unidades)."""
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(g|ml)\b", label)
    if m:
        return float(m.group(1).replace(",", ".")), m.group(2)
    m = re.match(r"^(\d+)\s+unidades\b", label)
    if m:
        return float(m.group(1)), "ud"
    return None, None


def import_catalog(conn, path=CATALOG, source="importacion"):
    with open(path, encoding="utf-8") as f:
        cat = json.load(f)
    items = cat["alimentos"]
    if len(items) != cat["registros_aprobados"] or len(items) != 34:
        raise ValueError("El catálogo no contiene exactamente las 34 entradas aprobadas")
    created = 0
    with tx(conn, "import_catalog", source, payload={"file": os.path.basename(path), "n": len(items)}):
        for it in items:
            if it["id_original"] > 34:
                continue  # rechazados (nunca deberían estar, por seguridad)
            if conn.execute("SELECT 1 FROM foods WHERE code=?", (it["id"],)).fetchone():
                continue
            name, cat_ = DISPLAY[it["id_original"]]
            notes = " ".join(r["observacion"] for r in it["raciones_referencia"] if r.get("observacion")) or None
            cur = conn.execute(
                "INSERT INTO foods(code,name,original_name,previous_name,kind,category,status,source,notes,import_note,"
                "historical_text,created_at,updated_at) VALUES(?,?,?,?,'producto',?,?,?,?,?,?,?,?)",
                (it["id"], name, it["nombre"], it.get("nombre_anterior"), cat_, STATUS[it["estado"]],
                 "Catálogo aprobado 2026-11-08 (decisión: %s)" % it["decision_usuario"], notes,
                 it.get("nota_importacion"), it.get("referencia_textual_historica"), ts(), ts()))
            fid = cur.lastrowid
            for i, r in enumerate(it["raciones_referencia"]):
                amount, unit = parse_amount(r["cantidad"])
                conn.execute(
                    "INSERT INTO portions(food_id,label,amount,unit,kcal,protein_g,carbs_g,fat_g,quality,source_type,note,sort) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                    (fid, r["cantidad"], amount, unit, r["kcal"], r["proteinas_g"], r["carbohidratos_g"], r["grasas_g"],
                     SOURCE_TYPE_TO_QUALITY[r["tipo_dato"]], r["tipo_dato"], r.get("observacion"), i))
            created += 1
    return created


INITIAL_TARGET = {
    "valid_from": "2026-11-09", "kcal": 2450, "protein_g": 150, "fat_min_g": 65, "fat_max_g": 75, "provisional": True,
    "note": "Mantenimiento o ligero déficit (elegido por el usuario). Recalibrar con la media de 7 días y 2–4 semanas de registro.",
}


def init_db(conn):
    core.ensure_defaults(conn)
    n = import_catalog(conn) if os.path.exists(CATALOG) else 0
    if not core.targets_list(conn):
        core.set_target(conn, INITIAL_TARGET, source="importacion")
    return n
