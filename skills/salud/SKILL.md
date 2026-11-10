---
name: salud
description: Seguimiento de salud en salud.eulogioqt.com (comida, macros, peso, báscula, pasos, entrenos de Hevy, niveles de fuerza). Úsala cuando el usuario quiera apuntar o consultar comida, peso, pasos o entrenos, cerrar el día o ver su progreso.
---

# Salud

Sistema de seguimiento con web (https://salud.eulogioqt.com) y una cuenta por persona.

**Si tienes el conector «Salud» (MCP) conectado, usa sus herramientas y no sigas esta skill** (empieza por `leer_contexto`). Si no: conéctalo en tu agente con la URL `https://salud.eulogioqt.com/mcp` (la web lo explica en menú de tu nombre → Conectar un agente). Lo de abajo es el plan B con token personal, desde un entorno con Python e internet.

## Arranque (cada conversación)

**Red (lo primero):** `python3 app/salud_remoto.py comprobar`. Si el entorno no llega a github.com o a salud.eulogioqt.com, NO lo trates como un error ni lo reintentes por otra vía: explícale al usuario, como un paso de configuración, qué activar (Claude: claude.ai en el navegador —en la app del móvil no sale— → Ajustes → Capacidades → «Permitir salida a la red»; si hay lista de dominios, añadir salud.eulogioqt.com y github.com; otros agentes: su ajuste de acceso a internet) y espera a que te avise.

```bash
[ -d salud ] && git -C salud pull -q || git clone -q https://github.com/eulogioqt/salud
cd salud
```

1. Token: si no existe `~/.salud_token`, búscalo en las instrucciones personales del usuario o pídeselo (lo genera en la web: menú de tu nombre → Conectar un agente). `python3 app/salud_remoto.py login <token> --agente <quién eres: claude, claude-code, chatgpt, codex, antigravity…>`. No lo repitas en las respuestas.
2. `python3 app/salud_remoto.py contexto` → objetivos, perfil y forma de uso de esta persona. Si está vacío, pregúntale lo necesario y guárdalo con `contexto-guardar`.
3. Sigue `CLAUDE.md` del repo: comandos, formato de entrenos desde capturas de Hevy, báscula y reglas de datos.

## Reglas clave

- Nunca simular un registro: ejecutar el comando y usar su salida como confirmación.
- `null` = desconocido, nunca 0. No inventar valores de productos de marca.
- Días cerrados: no tocarlos sin que el usuario pida reabrir.
- Un token = una cuenta: no intentar acceder a otras ni pedir contraseñas.
- Si no hay red hacia salud.eulogioqt.com o github.com: pedir que active el acceso en Ajustes → Capacidades y guardar lo pedido como PENDIENTE en la conversación.
