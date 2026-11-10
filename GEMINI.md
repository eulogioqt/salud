# Instrucciones para Gemini CLI


**Red (lo primero):** `python3 app/salud_remoto.py comprobar`. Si el entorno no llega a github.com o a salud.eulogioqt.com, NO lo trates como un error ni lo reintentes por otra vía: explícale al usuario, como un paso de configuración, qué activar (Claude: Ajustes → Capacidades → acceso a la red → añadir salud.eulogioqt.com y github.com, o «Todos los dominios»; otros agentes: su ajuste de acceso a internet) y espera a que te avise.

Las instrucciones completas están en [`CLAUDE.md`](CLAUDE.md) y valen para cualquier agente (donde pone «Claude», eres tú). Resumen para arrancar:

1. Clona https://github.com/eulogioqt/salud (o `git pull`).
2. Token personal del usuario (lo genera en la web: menú de tu nombre → Conectar un agente): `python3 app/salud_remoto.py login <token> --agente <quién eres: claude, claude-code, chatgpt, codex, antigravity…>`.
3. `python3 app/salud_remoto.py contexto` → objetivos y forma de uso de esa persona.
4. Todos los comandos: `python3 app/salud_remoto.py <comando>` (tabla en `CLAUDE.md`). Nunca simular un registro: la salida del comando es la confirmación.

Requisitos: ejecutar Python 3 con acceso a internet (`salud.eulogioqt.com` y `github.com`).
