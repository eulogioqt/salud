"""iPhone (Apple Salud) → el mismo formato que Android (Health Connect + «HC Webhook»).

La app «Conduit Health Sync» manda lotes así (JSON):
  {"schemaVersion": "v1", "batchId", "deviceId", "sentAtUnixMs",
   "batches": [{"hkTypeId": "HKQuantityTypeIdentifierStepCount",
                "samples": [{"uuid", "startUnixMs", "endUnixMs", "source": {"name", "bundleId", "productType"},
                             "quantity": {"value", "unit"}  |  "workout": {"activityType", "durationSeconds", "totalEnergyKcal", "brandName"}}]}]}
Se traduce a lo que ya entiende `core.ingest_health` (pasos por tramos, medidas de la báscula y sesiones de ejercicio),
así a la web le da igual de qué móvil venga. Lo que no usamos (pisos, distancia, energía, altura, IMC…) se ignora.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

QT = "HKQuantityTypeIdentifier"
# Medidas de la báscula: tipo de Apple Salud → (lista de HC Webhook, campo del valor, cómo convertir)
BODY = {QT + "BodyMass": ("weight", "kilograms", lambda v, u: v * (0.45359237 if u == "lb" else 1)),
        QT + "BodyFatPercentage": ("body_fat", "percentage", lambda v, u: v * 100 if v <= 1 else v),
        QT + "LeanBodyMass": ("lean_body_mass", "kilograms", lambda v, u: v * (0.45359237 if u == "lb" else 1)),
        QT + "BasalBodyTemperature": None}


def is_conduit(payload):
    return isinstance(payload, dict) and "batches" in payload and "schemaVersion" in payload


def _iso(ms):
    return datetime.fromtimestamp(int(ms) / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _snake(t):
    """«traditionalStrengthTraining» → «TRADITIONAL_STRENGTH_TRAINING» (como los tipos de Health Connect)."""
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", str(t or "")).upper()


def to_hc(payload, since=None):
    """Lote de Conduit → dict con el formato de HC Webhook. `since` (AAAA-MM-DD): lo anterior se ignora (historial viejo)."""
    lim = None
    if since:
        lim = int(datetime.fromisoformat(since).replace(tzinfo=timezone.utc).timestamp() * 1000) - 86400000
    out = {"app_version": "conduit", "timezone": "Europe/Madrid", "steps": [], "exercise": []}
    for b in payload.get("batches") or []:
        t = b.get("hkTypeId") or ""
        for s in b.get("samples") or []:
            try:
                start, end = int(s["startUnixMs"]), int(s.get("endUnixMs") or s["startUnixMs"])
            except (KeyError, ValueError, TypeError):
                continue
            if lim and end < lim:
                continue
            src = s.get("source") or {}
            q = s.get("quantity") or {}
            if t == QT + "StepCount":
                # Solo los que cuenta el propio iPhone (o el reloj): otras apps que escriben pasos los duplicarían
                if not str(src.get("bundleId") or "").startswith("com.apple."):
                    continue
                try:
                    out["steps"].append({"start_time": _iso(start), "end_time": _iso(end), "count": int(round(float(q["value"])))})
                except (KeyError, ValueError, TypeError):
                    pass
            elif BODY.get(t):
                lst, key, conv = BODY[t]
                try:
                    out.setdefault(lst, []).append({"time": _iso(start), key: round(conv(float(q["value"]), q.get("unit")), 3)})
                except (KeyError, ValueError, TypeError):
                    pass
            elif t == "HKWorkoutTypeIdentifier":
                w = s.get("workout") or {}
                out["exercise"].append({"start_time": _iso(start), "end_time": _iso(end), "type": _snake(w.get("activityType")),
                                        "duration_seconds": w.get("durationSeconds") or (end - start) / 1000,
                                        "title": w.get("brandName"), "metadata": {"data_origin": src.get("bundleId") or src.get("name")}})
    return out


def counts(hc):
    return {k: len(v) for k, v in hc.items() if isinstance(v, list) and v}
