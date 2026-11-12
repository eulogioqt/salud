"""Servidor MCP (Model Context Protocol) de Salud: Claude, ChatGPT, Codex… se conectan a https://<web>/mcp.

Transporte «Streamable HTTP» sin estado: cada POST lleva un mensaje JSON-RPC y la respuesta va en JSON.
La autenticación (OAuth 2.1 o token personal) la hace server.py; aquí solo se describen las herramientas
y se traducen a comandos de la CLI (la misma lógica que usa la web y salud_remoto.py).
"""
from __future__ import annotations

import json
import os

PROTOCOLS = ("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05")
VERSION = "1.0"
HERE = os.path.dirname(os.path.abspath(__file__))

INSTRUCTIONS = """Salud: seguimiento personal de comidas, peso, pasos y entrenos (web https://salud.eulogioqt.com). Estás conectado a la cuenta de UNA persona.

AL EMPEZAR cualquier tarea de salud: llama a `leer_contexto` (objetivos, perfil, cómo quiere usarlo y estilo de respuesta) y síguelo.

PRIMERA VEZ (contexto vacío, o te dice «empezar con Salud»): inicio rápido y sin cuestionarios. Sus datos (sexo, nacimiento, altura, peso) ya los puso en la web; compruébalo con `ver_perfil` y pide solo lo que falte.
1. Pregunta solo qué quiere conseguir: perder grasa, mantener o ganar. NO preguntes pasos medios, nivel de actividad, trabajo, sueño ni nada más: el gasto se calcula solo con lo que vaya apuntando.
2. Propón el objetivo «según el gasto» con `objetivo` (sin guardar): perder −300 kcal (−500 si quiere ir más rápido), mantener 0, ganar +250; proteína 1,8 g/kg (2,0 si entrena fuerza); grasa 25–35 %. Enséñale la vista previa en una línea y guárdalo cuando diga que sí.
3. Si entrena con Hevy, ofrécele volcar su historial: en Hevy, Perfil → ⚙ Ajustes → Exportar e importar datos → Exportar entrenos; que te adjunte el .csv aquí y lo importas con `importar_hevy` (si lo prefiere, también lo puede subir en la web: Entreno → Importar CSV de Hevy).
4. Guarda con `guardar_contexto` su objetivo y cómo quiere usarlo, y termina en dos líneas: ya puede usarlo («apunta mi desayuno», «cierra el día», capturas de Hevy o de la báscula), y le recomiendas conectar los pasos para que lleguen solos, que eso se hace en la web: Hoy → Pasos → «Conectar». Menciona también que conviene ir guardando lo que suele comer (fotos de etiquetas, o su desayuno de siempre como comida habitual).
Después, a lo que pida.

Reglas:
- Nunca simules un registro: usa la herramienta y su salida es la confirmación. «Cuánto llevo» → `ver_dia`.
- null = desconocido, nunca 0. Si falta un dato relevante, pregunta UNA cosa concreta.
- Antes de añadir, `buscar_alimento` para usar lo que ya existe (y su unidad). No inventes valores de productos de marca: pide la etiqueta o usa Open Food Facts citándolo. Lo que crees (productos, recetas, comidas habituales) queda «por revisar» hasta que la persona lo acepte en la pestaña Comida.
- Comidas fuera: `estimar_comida` con rango y supuestos en la nota.
- Comidas habituales: si apunta algo de varios alimentos que parece de siempre (su desayuno, un táper, un batido) y no venía de una comida habitual, pregúntale una vez al final: «¿lo guardo como comida habitual? La próxima vez bastará con decirme su nombre». Si dice que sí, créala con `api` POST /api/templates {name, meal, items:[{food_id, unit_key, quantity}]} y dibújale su ilustración. Cuando nombre una comida habitual, usa `comida_habitual` (con `cambios` si esta vez varía algo) en vez de volver a estimarla.
- Aceite: una línea más en la comida (chorrito ≈ 8 g, cucharada ≈ 10 g; plancha/salteado cuenta 100 %, fritura ~10–15 % del peso del alimento).
- Lo que se toma por unidad (lata, yogur…) va por unidad; lo demás por peso. Recetas con ingredientes en crudo.
- Fechas en hora de Madrid; si es de otro día, pasa `fecha`.
- «Cierra el día»: `revisar_dia`, di solo lo que falta de verdad (los pasos deben estar siempre, aunque sean 0; cómo fue el día es obligatorio para cerrar: si no lo ha dicho, pregúntalo en la misma frase y guárdalo con `como_fue_el_dia`), pregunta si cierra igualmente y, tras `cerrar_dia`, da un resumen compacto. Los días cerrados no se tocan salvo que pida `reabrir_dia`.
- Historial de Hevy: que exporte el CSV (Hevy → Perfil → Ajustes → Exportar e importar datos → Exportar entrenos) y lo suba en la web (menú → Primeros pasos, o Entreno → Importar) o te lo adjunte para `importar_hevy`.
- Si también tienes el conector de Hevy («entreno hecho», «sube el entreno»): pide a Hevy los entrenos de ese día y pásalos tal cual a `importar_hevy` como JSON {"workouts": [...]} con los campos de Hevy (id, title, start_time, end_time, description, exercises[title, exercise_template_id, notes, sets[type, weight_kg, reps, distance_meters, duration_seconds, rpe]]); el id y el exercise_template_id son los que le dicen a la web que tienes Hevy conectado. No duplica. Sin conector: capturas.
- Conector de Hevy: `leer_contexto` dice si la web cree que lo tienes. Si no coincide con lo que ves (lo tienes y funciona, o ya no lo tienes), díselo con `api` POST /api/hevy/agente {"conectado": true|false}.
- Entrenos detectados: si `leer_contexto` o `revisar_dia` dicen que el móvil ha detectado un entreno sin subir y tienes el conector de Hevy, súbelo tú en ese momento sin que te lo pida; si no lo tienes, pídele las capturas.
- Entrenos desde capturas de Hevy: transcribe fielmente (no inventes series; si algo no se lee, pregunta) y usa `registrar_entreno`. El entreno ya cuenta en el gasto: no añadas además `registrar_actividad`.
- GASTO DE CADA ENTRENO (capturas o conector de Hevy): estímalo TÚ analizando el entreno de verdad, no pongas «normal» y ya. Mira los ejercicios (compuestos grandes como sentadilla, peso muerto, press o remo frente a aislamiento; cardio, Hyrox o circuitos), las series de trabajo y cuántas al fallo, reps, cargas y volumen, RPE, distancias y tiempos, la duración real y la densidad (descansos, superseries) y el peso de la persona. Con eso calcula las kcal NETAS (lo que gasta por encima de estar en reposo, sin el metabolismo basal; nunca las brutas de Hevy, el reloj u otra app) y pásalas en `kcal_netas` junto con `intensity` (suave|normal|dura|muy dura). Referencias netas para ~80 kg (escala por su peso): fuerza con descansos largos 3–4 kcal/min, fuerza densa o superseries 5–6, circuito/Hyrox 8–11, carrera ≈ 1 kcal por kg y km. Dile en una línea cómo te sale (p. ej. «≈ 320 kcal netas: 18 series de empujes pesados en 94 min con descansos largos»). Si después la persona corrige algo del entreno, vuelve a estimarlo con `editar_entreno`.
- Las kcal de pasos y de actividades sueltas (`registrar_actividad`) las calcula el servidor con la misma fórmula: ahí no las estimes tú.
- Báscula: `registrar_bascula`; la composición corporal es una estimación con mucho error, solo tendencias de semanas.
- Objetivos: pueden ser fijos o «según el gasto» (kcal = gasto estimado del día ± diferencia, proteína por kg, grasa en %). Calibra con la media de 7 días y tendencias de 2–4 semanas, nunca con un día suelto.
- Foto de una etiqueta (tabla nutricional) o «sube/apunta la etiqueta»: LEE tú los valores de la imagen y guárdalos en el producto (crea con `api` POST /api/foods o corrige con PUT /api/foods/<id>, calidad `etiqueta`, fuente «Etiqueta»; por 100 g/ml y la ración o unidad si viene). Eso es lo que pide: no le des un enlace para subir nada. Confírmale en una línea los valores que has puesto.
- Código de barras o enlace de Open Food Facts: `api` GET /api/off?q=<código o enlace> devuelve nombre, marca, valores por 100 g, ración y foto; con eso crea o completa el producto (fuente «Open Food Facts · <código>», calidad `etiqueta` si los datos están completos; si falta algo, `provisional`).
- Fotos: tú creas los productos con sus valores; la foto, recomiéndale subirla en la web (ficha del producto → foto). Para un producto de marca puedes poner tú la de Open Food Facts (`poner_imagen` con su `url`). Solo si te pide expresamente que la FOTO quede en el producto (no los valores), pide `enlace_foto`: con terminal y el archivo, recórtala al producto, redúcela a ~1000 px y súbela con el curl que indica; sin terminal, dale el enlace para que la elija desde el móvil. No pases fotos en base64 por `poner_imagen`.
- Ilustraciones: solo para comidas habituales (los productos llevan la foto de Open Food Facts o la suya). Cada vez que crees una comida habitual y la persona no te haya mandado foto, en ese MISMO turno lee `guia_ilustraciones`, dibuja su ilustración SVG y súbela con `poner_imagen`; no lo dejes para luego.
- Suplementos (creatina, multivitamínico…): cada persona añade los suyos como producto con categoría «Suplemento» y su dosis como ración (p. ej. «1 cacito» de 5 g); salen en la pestaña Comida, en «Suplementos». Cuando diga que se lo ha tomado, apúntalo con `anadir_alimento` (franja «otro», su ración). Son diarios: al cerrar el día, `revisar_dia` avisa de los que no están marcados; pregúntalo uno a uno («¿has tomado creatina hoy?») y si dice que sí, apúntalo. La proteína en polvo no es suplemento: va en su comida con sus gramos.
Respuestas breves y en el idioma de la persona."""

U = {"type": "string"}
N = {"type": "number"}
I = {"type": "integer"}
FECHA = {"type": "string", "description": "AAAA-MM-DD (por defecto hoy, hora de Madrid)"}
HORA = {"type": "string", "description": "HH:MM"}
COMIDA = {"type": "string", "enum": ["desayuno", "almuerzo", "merienda", "cena", "otro"]}


def _o(props, req=()):
    return {"type": "object", "properties": props, "required": list(req), "additionalProperties": False}


def _opt(a, flag, key, argv):
    v = a.get(key)
    if v is not None and v != "":
        argv += [flag, str(v)]


def _fh(a, argv):
    _opt(a, "--fecha", "fecha", argv)
    _opt(a, "--hora", "hora", argv)
    return argv


def _hoy():
    from .db import now_local
    return now_local().strftime("%Y-%m-%d")


def _api(a):
    argv = ["api", str(a["metodo"]).upper(), a["ruta"]]
    if a.get("cuerpo") is not None:
        argv.append(json.dumps(a["cuerpo"], ensure_ascii=False))
    return argv


def _bascula(a):
    argv = ["bascula"]
    for k, v in (a.get("medidas") or {}).items():
        argv += ["--" + k, str(v)]
    _fh(a, argv)
    _opt(a, "--nota", "nota", argv)
    if a.get("sobrescribir_dia"):
        argv.append("--sobrescribir-dia")
    if a.get("no_cuenta"):
        argv.append("--no-dia")
    return argv


def _descargar_imagen(url, limite=3 * 1024 * 1024):
    """Descarga una imagen pública (https) para guardarla como foto; nada de direcciones internas."""
    import base64
    import ipaddress
    import socket
    import urllib.error
    import urllib.request
    from urllib.parse import urlparse

    def segura(u):
        p = urlparse(u)
        if p.scheme != "https" or not p.hostname:
            raise ValueError("La url de la imagen debe empezar por https://")
        try:
            ips = {x[4][0] for x in socket.getaddrinfo(p.hostname, p.port or 443)}
        except OSError:
            raise ValueError("No se encuentra el servidor de la imagen")
        if not ips or not all(ipaddress.ip_address(ip.split("%")[0]).is_global for ip in ips):
            raise ValueError("Dirección no permitida")

    class Redir(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            segura(newurl)
            return super().redirect_request(req, fp, code, msg, headers, newurl)

    segura(url)
    req = urllib.request.Request(url, headers={"User-Agent": "Salud/1.0 (+https://salud.eulogioqt.com)"})
    try:
        with urllib.request.build_opener(Redir).open(req, timeout=15) as r:
            ct = (r.headers.get_content_type() or "").lower()
            raw = r.read(limite + 1)
    except (urllib.error.URLError, OSError) as e:
        raise ValueError("No se pudo descargar la imagen: %s" % getattr(e, "reason", e))
    if ct not in ("image/jpeg", "image/png", "image/webp"):
        raise ValueError("La url no es una imagen JPG, PNG o WebP (%s)" % ct)
    if len(raw) > limite:
        raise ValueError("Imagen demasiado grande (máx. 3 MB)")
    return "data:%s;base64,%s" % (ct, base64.b64encode(raw).decode())


def _imagen(a):
    tipo = a.get("tipo") or "habitual"
    ruta = "/api/%s/%d/image" % ("foods" if tipo == "alimento" else "templates", int(a["id"]))
    if a.get("svg"):
        import base64
        data = "data:image/svg+xml;base64," + base64.b64encode(a["svg"].encode("utf-8")).decode()
    elif a.get("url"):
        data = _descargar_imagen(a["url"])
    elif a.get("data_url"):
        data = a["data_url"]
    else:
        raise ValueError("Falta svg o url (para la foto de la persona usa enlace_foto)")
    return ["api", "POST", ruta, json.dumps({"data_url": data})]


def _objetivo(a):
    modo = a.get("modo") or "gasto"
    body = {"mode": modo}
    if modo == "gasto":
        for k, f in (("diferencia_kcal", "kcal_offset"), ("proteina_g_por_kg", "protein_per_kg"), ("grasa_min_pct", "fat_min_pct"), ("grasa_max_pct", "fat_max_pct")):
            if a.get(k) is not None:
                body[f] = a[k]
    else:
        for k, f in (("kcal", "kcal"), ("proteina_g", "protein_g"), ("grasa_min_g", "fat_min_g"), ("grasa_max_g", "fat_max_g")):
            if a.get(k) is not None:
                body[f] = a[k]
    if a.get("guardar"):
        body.update({"valid_from": a.get("desde"), "provisional": True, "note": a.get("nota") or "Fijado desde el chat"})
        return ["api", "POST", "/api/targets", json.dumps(body, ensure_ascii=False)]
    return ["api", "POST", "/api/targets/preview", json.dumps(body, ensure_ascii=False)]


TOOLS = [
    ("leer_contexto", "Notas personales de la persona: objetivos, perfil, cómo quiere usarlo y estilo de respuesta. Llámala al empezar.",
     _o({}), lambda a: ["contexto"], True),
    ("guardar_contexto", "Sustituye las notas personales enteras (lee antes las actuales, edítalas y guarda el texto completo, en Markdown).",
     _o({"contenido": U}, ["contenido"]), lambda a: ["contexto-guardar", "--contenido=" + a["contenido"]], False),
    ("ver_dia", "Resumen del día: comidas con ids de entrada, kcal y macros frente al objetivo, gasto estimado, balance, peso, pasos y avisos.",
     _o({"fecha": FECHA}), lambda a: ["hoy"] + ([a["fecha"]] if a.get("fecha") else []), True),
    ("buscar_alimento", "Busca en sus alimentos, recetas y comidas habituales (con ids y unidades/raciones disponibles).",
     _o({"texto": U}, ["texto"]), lambda a: ["buscar"] + a["texto"].split(), True),
    ("anadir_alimento", "Apunta un alimento en una comida. `alimento`: id o nombre (mejor el id de buscar_alimento). `unidad`: g, ml, rac (ración por defecto), total, o p:<id de ración>. "
     "`cantidad_estimada`: true si la cantidad es a ojo (no la ha pesado ni contado); los valores del alimento llevan su propia calidad.",
     _o({"alimento": U, "cantidad": N, "unidad": U, "comida": COMIDA, "fecha": FECHA, "hora": HORA, "nota": U, "cantidad_estimada": {"type": "boolean"}}, ["alimento", "cantidad", "comida"]),
     lambda a: _fh(a, ["add", str(a["alimento"]), str(a["cantidad"]), a.get("unidad") or "", "-c", a["comida"]]) + (["--nota", a["nota"]] if a.get("nota") else []) + (["--a-ojo"] if a.get("cantidad_estimada") else []), False),
    ("comida_habitual", "Apunta una comida habitual (plantilla) entera. `cambios`: cantidades distintas solo esta vez por id de ítem; `omitir`: ids de ítem que no tomó.",
     _o({"nombre": U, "comida": COMIDA, "fecha": FECHA, "hora": HORA,
         "cambios": {"type": "array", "items": _o({"item_id": I, "cantidad": N}, ["item_id", "cantidad"])},
         "omitir": {"type": "array", "items": I}}, ["nombre"]),
     lambda a: _fh(a, ["habitual", a["nombre"]] + (["-c", a["comida"]] if a.get("comida") else [])
                   + sum([["--set", "%d=%s" % (c["item_id"], c["cantidad"])] for c in a.get("cambios") or []], [])
                   + sum([["--skip", str(i)] for i in a.get("omitir") or []], [])), False),
    ("estimar_comida", "Comida fuera o sin pesar: estimación con kcal y macros, rango (min–max kcal) y supuestos en la nota.",
     _o({"descripcion": U, "kcal": N, "proteina_g": N, "carbohidratos_g": N, "grasa_g": N, "kcal_min": N, "kcal_max": N,
         "comida": COMIDA, "nota": U, "fecha": FECHA, "hora": HORA}, ["descripcion", "kcal", "comida"]),
     lambda a: _fh(a, ["estimar", a["descripcion"], "--kcal", str(a["kcal"]), "-c", a["comida"]]
                   + sum([[f, str(a[k])] for f, k in (("--p", "proteina_g"), ("--ch", "carbohidratos_g"), ("--g", "grasa_g"),
                                                       ("--min", "kcal_min"), ("--max", "kcal_max"), ("--nota", "nota")) if a.get(k) is not None], [])), False),
    ("editar_entrada", "Cambia una entrada del día (id de ver_dia): cantidad, unidad, comida, hora o si la cantidad es estimada (a ojo).",
     _o({"id": I, "cantidad": N, "unidad": U, "comida": COMIDA, "hora": HORA, "nota": U, "cantidad_estimada": {"type": "boolean"}}, ["id"]),
     lambda a: ["edit", str(a["id"])] + sum([[f, str(a[k])] for f, k in (("--cantidad", "cantidad"), ("--unidad", "unidad"), ("-c", "comida"),
                                                                        ("--hora", "hora"), ("--nota", "nota")) if a.get(k) is not None], [])
     + ([] if a.get("cantidad_estimada") is None else ["--a-ojo" if a["cantidad_estimada"] else "--pesado"]), False),
    ("borrar_entrada", "Quita una entrada del día (reversible con restaurar_entrada).", _o({"id": I}, ["id"]), lambda a: ["del", str(a["id"])], False),
    ("restaurar_entrada", "Recupera una entrada borrada.", _o({"id": I}, ["id"]), lambda a: ["undo", str(a["id"])], False),
    ("registrar_peso", "Peso en ayunas (kg).", _o({"kg": N, "fecha": FECHA, "hora": HORA}, ["kg"]), lambda a: _fh(a, ["peso", str(a["kg"])]), False),
    ("registrar_pasos", "Pasos totales del día (0 si no anduvo).", _o({"pasos": I, "fecha": FECHA}, ["pasos"]),
     lambda a: ["pasos", str(a["pasos"])] + (["--fecha", a["fecha"]] if a.get("fecha") else []), False),
    ("como_fue_el_dia", "Movimiento del día sin contar los pasos (gasto «día a día»): cama (en cama o enfermo), casa (casi todo sentado), ligero (algo de movimiento: recados, cocinar), normal, activo (mucho de pie o tareas) o muy (trabajo físico); son 0/50/100/150/250/350 kcal para 75 kg y se ajustan solos al peso de la persona. Es obligatorio para cerrar el día: pregúntalo si no está.",
     _o({"nivel": {"type": "string", "enum": ["cama", "casa", "ligero", "normal", "activo", "muy"]}, "fecha": FECHA}, ["nivel"]),
     lambda a: ["api", "PUT", "/api/days/%s" % (a.get("fecha") or _hoy()), json.dumps({"neat_kcal": {"cama": 0, "casa": 50, "ligero": 100, "normal": 150, "activo": 250, "muy": 350}[a["nivel"]]})], False),
    ("dia_descanso", "Marca (o quita con quitar=true) el día como descanso de entreno.", _o({"fecha": FECHA, "quitar": {"type": "boolean"}}),
     lambda a: ["descanso"] + (["--fecha", a["fecha"]] if a.get("fecha") else []) + (["--no"] if a.get("quitar") else []), False),
    ("registrar_actividad", "Actividad sin Hevy para el gasto. No pases kcal: el servidor las estima igual para todos (MET neto según tipo, minutos, intensidad y peso). Solo si las mide un pulsómetro y la persona lo pide.",
     _o({"tipo": {"type": "string", "enum": ["fuerza", "calistenia", "hyrox", "carrera", "bici", "caminata", "natacion", "otro"]},
         "minutos": N, "intensidad": {"type": "string", "enum": ["suave", "normal", "dura", "muy dura"]}, "kcal_netas": N,
         "pasos_de_la_sesion": I, "descripcion": U, "fecha": FECHA}, ["tipo", "minutos"]),
     lambda a: ["act", a["tipo"], "--min", str(a["minutos"]), "--int", a.get("intensidad") or "normal"]
     + sum([[f, str(a[k])] for f, k in (("--kcal", "kcal_netas"), ("--pasos", "pasos_de_la_sesion"), ("--desc", "descripcion"), ("--fecha", "fecha")) if a.get(k) is not None], []), False),
    ("registrar_entreno", "Entreno (capturas de Hevy). Analízalo (ejercicios, series al fallo, reps, cargas, volumen, RPE, distancias, duración, descansos, peso de la persona) y pasa tu estimación de `kcal_netas` (netas: sin el metabolismo basal) e `intensity` (suave|normal|dura|muy dura). "
     "Formato: {date, start_time, title, duration_min, activity_type, intensity, kcal_netas, hevy_volume_kg, description, "
     "exercises:[{name (exactamente el de Hevy), kind: peso|lastre|corporal|asistido|tiempo|cardio, notes, sets:[{type: omitir|W|F|D, weight_kg, reps, seconds, distance_m, rpe}]}]}. "
     "Mancuernas: peso de las dos; máquinas con su peso incluido.",
     _o({"entreno": {"type": "object"}}, ["entreno"]), lambda a: ["entreno", "--contenido=" + json.dumps(a["entreno"], ensure_ascii=False)], False),
    ("editar_entreno", "Corrige un entreno (mismo formato, solo los campos que cambian).", _o({"id": I, "cambios": {"type": "object"}}, ["id", "cambios"]),
     lambda a: ["entreno-editar", str(a["id"]), "--contenido=" + json.dumps(a["cambios"], ensure_ascii=False)], False),
    ("ver_entrenos", "Últimos entrenos (o uno con su detalle si pasas id).", _o({"id": I, "n": I}),
     lambda a: ["ver-entreno", str(a["id"])] if a.get("id") else ["entrenos", "--n", str(a.get("n") or 10)], True),
    ("historial_ejercicio", "Histórico y récords de un ejercicio (nombre de Hevy).", _o({"nombre": U}, ["nombre"]), lambda a: ["ejercicio", a["nombre"]], True),
    ("registrar_bascula", "Medición de báscula inteligente. `medidas`: peso, imc, grasa, grasa-kg, musculo, musculo-pct, esqueletico, magra, agua, agua-kg, "
     "proteina, proteina-kg, hueso, hueso-pct, visceral, bmr, edad-corporal, cintura-cadera, fc, puntuacion (ignora flechas y sugerencias de la app).",
     _o({"medidas": {"type": "object", "additionalProperties": {"type": "number"}}, "fecha": FECHA, "hora": HORA, "nota": U, "sobrescribir_dia": {"type": "boolean"},
         "no_cuenta": {"type": "boolean", "description": "true si no debe contar como peso del día (p. ej. ya había comido): se guarda y se ve, pero no entra en la tendencia"}}, ["medidas"]),
     _bascula, False),
    ("revisar_dia", "Comprueba qué falta antes de cerrar el día.", _o({"fecha": FECHA}), lambda a: ["check"] + ([a["fecha"]] if a.get("fecha") else []), True),
    ("cerrar_dia", "Cierra el día (antes tiene que estar `como_fue_el_dia`; forzar=true si la persona quiere cerrarlo aunque falte algo importante).", _o({"fecha": FECHA, "forzar": {"type": "boolean"}}),
     lambda a: ["cerrar"] + ([a["fecha"]] if a.get("fecha") else []) + (["--forzar"] if a.get("forzar") else []), False),
    ("reabrir_dia", "Reabre un día cerrado (solo si la persona lo pide).", _o({"fecha": FECHA, "motivo": U}, ["motivo"]),
     lambda a: ["reabrir"] + ([a["fecha"]] if a.get("fecha") else []) + ["--motivo", a["motivo"]], False),
    ("tendencias", "Medias y tendencias: semanas (medias semanales y calibración) o historial de N días.",
     _o({"tipo": {"type": "string", "enum": ["semanas", "historial"]}, "n": I}, ["tipo"]),
     lambda a: ["semanas", "--n", str(a.get("n") or 8)] if a["tipo"] == "semanas" else ["historial", "--dias", str(a.get("n") or 14)], True),
    ("ver_perfil", "Perfil (sexo, fecha de nacimiento, altura, peso estimado, ajustes del gasto) y objetivo actual con su historial.",
     _o({}), lambda a: ["api", "GET", "/api/settings"], True),
    ("cambiar_perfil", "Corrige el perfil para el gasto estimado. Campos: sexo (H/M), fecha_nacimiento (AAAA-MM-DD), altura_cm, peso_estimado_kg (se usa hasta que haya pesajes).",
     _o({"sexo": {"type": "string", "enum": ["H", "M"]}, "fecha_nacimiento": U, "altura_cm": N, "peso_estimado_kg": N}),
     lambda a: ["api", "PUT", "/api/settings", json.dumps({k: str(v) for k, v in a.items() if v is not None}, ensure_ascii=False)], False),
    ("objetivo", "Objetivo diario de kcal y macros. modo=gasto (recomendado): cada día kcal = gasto estimado + diferencia_kcal (−300 déficit suave, −500 perder, 0 mantener, +250 ganar), "
     "proteína en g por kg (1,6–2,2) y grasa en % de las kcal (20–35). modo=fijo: kcal, proteina_g, grasa_min_g y grasa_max_g (tienen que cuadrar). "
     "Sin guardar=true solo devuelve la vista previa de cómo quedaría hoy: enséñasela y guarda cuando la persona esté de acuerdo.",
     _o({"modo": {"type": "string", "enum": ["gasto", "fijo"]}, "diferencia_kcal": N, "proteina_g_por_kg": N, "grasa_min_pct": N, "grasa_max_pct": N,
         "kcal": N, "proteina_g": N, "grasa_min_g": N, "grasa_max_g": N, "desde": FECHA, "nota": U, "guardar": {"type": "boolean"}}, ["modo"]), _objetivo, False),
    ("importar_hevy", "Importa el historial de Hevy: el contenido del CSV que exporta Hevy (Perfil → Ajustes → Exportar e importar datos → Exportar entrenos) o un JSON de su API (desde el conector de Hevy: tal cual, con el id del entreno y el exercise_template_id de cada ejercicio, y añade en cada entreno nuevo tu estimación `kcal_netas` e `intensity` tras analizarlo). No duplica lo ya importado.",
     _o({"contenido": U}, ["contenido"]), lambda a: ["api", "POST", "/api/hevy/import-csv", json.dumps({"csv": a["contenido"]}, ensure_ascii=False)], False),
    ("consulta_sql", "Consulta SQL de solo lectura sobre su base de datos (tablas: foods, portions, entries, days, targets, templates, template_items, "
     "activities, workouts, workout_exercises, workout_sets, weights, body_measurements, exercise_settings, notes…).",
     _o({"sql": U}, ["sql"]), lambda a: ["sql", a["sql"]], True),
    ("api", "Llamada directa a la API de la web para lo demás. Ejemplos: POST /api/foods {name, status, category, brand, source, notes, default_unit, "
     "portions:[{label, amount, unit g|ml|ud, kcal, protein_g, carbs_g, fat_g, quality etiqueta|historico|provisional|estimacion, is_default}]} · "
     "PUT /api/foods/<id> · POST /api/recipes {name, recipe_servings, recipe_cooked_weight_g, items:[{food_id, unit_key, quantity}]} · "
     "POST /api/templates {name, meal, items:[...]} · POST /api/targets: fijo {valid_from, mode: fijo, kcal, protein_g, fat_min_g, fat_max_g} o según el gasto {valid_from, mode: gasto, kcal_offset (−300 = déficit de 300), protein_per_kg, fat_min_pct, fat_max_pct} (POST /api/targets/preview para ver cómo quedaría) · GET|PUT /api/settings · "
     "PUT /api/exercise-settings {name, equipment, machine_kg, load_ratio, unilateral, sl_slug}.",
     _o({"metodo": {"type": "string", "enum": ["GET", "POST", "PUT", "DELETE"]}, "ruta": U, "cuerpo": {"type": "object"}}, ["metodo", "ruta"]), _api, False),
    ("guia_ilustraciones", "Estilo de la casa para dibujar ilustraciones SVG de platos y comidas habituales (con un ejemplo). Léela antes de dibujar.",
     _o({}), None, True),
    ("poner_imagen", "Pone la imagen de una comida habitual (tipo=habitual) o de un alimento/receta (tipo=alimento): `svg` con tu ilustración, o `url` de una imagen pública (p. ej. la de Open Food Facts), que descarga el servidor. Para una foto que te mande la persona usa `enlace_foto`.",
     _o({"tipo": {"type": "string", "enum": ["habitual", "alimento"]}, "id": I, "svg": U, "url": U, "data_url": U}, ["tipo", "id"]), _imagen, False),
    ("enlace_foto", "Enlace de un solo uso (30 min) para subir una foto de un alimento/receta (tipo=alimento) o de una comida habitual (tipo=habitual) sin pasarla por el chat. Si tienes terminal con el archivo, súbela con el `curl` que te indica; si no, dale el enlace a la persona: lo abre en el móvil, elige la foto y se guarda sola.",
     _o({"tipo": {"type": "string", "enum": ["habitual", "alimento"]}, "id": I}, ["tipo", "id"]),
     lambda a: ["__enlace_foto", a.get("tipo") or "alimento", int(a["id"])], False),
]

GUIA = """Ilustraciones de la casa (platos y comidas habituales sin foto). SVG plano, sin texto ni contornos negros:
- `viewBox="0 0 400 300"`, sin width/height. Solo formas: rect, ellipse, circle, path, g, defs, linearGradient/radialGradient, stop. Nada de script, foreignObject, image ni enlaces externos. Peso ideal 8–40 KB.
- Fondo: rect a sangre con degradado radial crema (cx 50 %, cy 40 %, r 75 %: #f4efe6 → #e3dccd).
- Recipiente visto en 3/4: plato blanco (elipse grande con degradado radial #ffffff → #f4f4f1 (80 %) → #dcdcd6, y una elipse interior #efeee9) o cuenco blanco (degradado vertical #ffffff → #dfe6ea) con banda azul (#3f6f94 → #5b8db3, opacidad .85); vasos, tarros o envases para bebidas y lácteos. Sombra suave debajo: elipse negra con opacidad .08–.10.
- Comida: muchas piezas pequeñas y simples (elipses, rectángulos redondeados rx 2–3, paths sencillos) repartidas con rotaciones variadas para que parezca natural; colores planos realistas con 3–5 tonos del mismo color, trazo fino (0,5–0,8) de un tono más oscuro y un brillo blanco con opacidad .25–.35 en cada pieza. Salsas: elipses translúcidas (opacidad .55–.8).
- Detalles opcionales: cubiertos o palillos de madera (#b07a48/#9c6a3c), cuenquito de salsa, hojas.
- Encuadre: el recipiente centrado ocupando ~80 % del ancho; nada cortado salvo el fondo.
Ejemplo (habas con taquitos de jamón; el original lleva ~80 habas y ~30 taquitos, aquí recortado):
"""


def guia():
    try:
        with open(os.path.join(HERE, "ilustracion_ejemplo.svg"), encoding="utf-8") as f:
            return GUIA + f.read()
    except OSError:
        return GUIA


def tools_version():
    """Huella corta de la lista de herramientas: cambia al añadir o modificar herramientas."""
    import hashlib
    return hashlib.sha256(json.dumps(tool_list(), sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:8]


AVISO_NUEVAS = ("\n\n[Aviso del servidor Salud: desde que empezó este chat hay herramientas nuevas o cambiadas. "
                "Si algo no lo puedes hacer con las que ves, dile a la persona que abra un chat nuevo "
                "(o que desactive y vuelva a activar Salud en «+» → Conectores) para cargarlas.]")


def tool_list():
    out = []
    for name, desc, schema, _fn, ro in TOOLS:
        t = {"name": name, "description": desc, "inputSchema": schema, "annotations": {"readOnlyHint": ro}}
        if not ro:
            t["annotations"]["destructiveHint"] = name in ("borrar_entrada", "guardar_contexto", "cerrar_dia")
        out.append(t)
    return out


def tool_argv(name, args):
    """Devuelve la lista de argumentos de la CLI, o ("texto", …) para herramientas que no la usan."""
    for n, _d, _s, fn, _ro in TOOLS:
        if n == name:
            if fn is None:
                return ("texto", guia())
            return fn(args or {})
    raise KeyError(name)


def handle(msg, run_cli, session_ver=None):
    """Procesa un mensaje JSON-RPC. `run_cli(argv)` → (código, stdout, stderr). Devuelve la respuesta o None (notificación).
    `session_ver`: versión de las herramientas con la que empezó la sesión del cliente (si es antigua, se avisa al agente)."""
    if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0" or "method" not in msg:
        return {"jsonrpc": "2.0", "id": msg.get("id") if isinstance(msg, dict) else None, "error": {"code": -32600, "message": "Petición no válida"}}
    mid, method, params = msg.get("id"), msg["method"], msg.get("params") or {}
    if "id" not in msg:  # notificación (initialized, cancelled…)
        return None

    def ok(result):
        return {"jsonrpc": "2.0", "id": mid, "result": result}

    if method == "initialize":
        want = params.get("protocolVersion")
        return ok({"protocolVersion": want if want in PROTOCOLS else PROTOCOLS[0],
                   "capabilities": {"tools": {"listChanged": False}},
                   "serverInfo": {"name": "salud", "title": "Salud", "version": VERSION},
                   "instructions": INSTRUCTIONS})
    if method == "ping":
        return ok({})
    if method == "tools/list":
        return ok({"tools": tool_list()})
    if method in ("resources/list", "resources/templates/list", "prompts/list"):
        return ok({method.split("/")[0] if method != "resources/templates/list" else "resourceTemplates": []})
    if method == "tools/call":
        name, args = params.get("name"), params.get("arguments") or {}
        try:
            argv = tool_argv(name, args)
        except KeyError:
            return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32602, "message": "Herramienta desconocida: %s" % name}}
        except (ValueError, TypeError) as e:
            return ok({"content": [{"type": "text", "text": "Argumentos no válidos: %s" % e}], "isError": True})
        if isinstance(argv, tuple):
            return ok({"content": [{"type": "text", "text": argv[1]}], "isError": False})
        code, out, err = run_cli([str(x) for x in argv])
        text = (out + ("\n" + err if err else "")).strip()
        if not text:
            text = "Sin resultados (si no existe, créalo con api POST /api/foods)" if name == "buscar_alimento" else ("Hecho" if code == 0 else "Error")
        if session_ver and session_ver != tools_version():
            text += AVISO_NUEVAS
        if name == "leer_contexto" and code == 0:
            text += "\n\n---\nPerfil y objetivos actuales: usa ver_dia para el día; api GET /api/settings para el perfil."
        return ok({"content": [{"type": "text", "text": text}], "isError": code != 0})
    return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": "Método no soportado: %s" % method}}
