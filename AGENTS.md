# Instrucciones para agentes (Codex, Gemini CLI, Claude Code, etc.)

Las instrucciones completas están en [`CLAUDE.md`](CLAUDE.md) y valen para cualquier agente (donde pone «Claude», eres tú). Resumen para arrancar:

1. Clona https://github.com/eulogioqt/salud (o `git pull`).
2. Token personal del usuario (lo genera en la web: Ajustes → Conectar con un agente): `python3 app/salud_remoto.py login <token>`.
3. `python3 app/salud_remoto.py contexto` → objetivos y forma de uso de esa persona.
4. Todos los comandos: `python3 app/salud_remoto.py <comando>` (tabla en `CLAUDE.md`). Nunca simular un registro: la salida del comando es la confirmación.

Requisitos: ejecutar Python 3 con acceso a internet (`salud.eulogioqt.com` y `github.com`).
