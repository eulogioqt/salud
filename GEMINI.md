# Instrucciones para Gemini / Antigravity

**Forma recomendada: conector MCP.** Añade el servidor MCP remoto `https://salud.eulogioqt.com/mcp` (Streamable HTTP, OAuth). La primera vez se abre la web: el usuario inicia sesión y pulsa «Permitir». Las herramientas (`leer_contexto`, `ver_dia`, `anadir_alimento`, `registrar_entreno`…) y las reglas de uso llegan con el propio servidor: no hace falta clonar nada ni instrucciones personales. En la web: menú de tu nombre → Conectar un agente (pasos para cada agente).

**Plan B (agentes sin MCP):** token personal (web → Conectar un agente → «Usar un token»). Con MCP pero sin OAuth: cabecera `Authorization: Bearer <token>` en `/mcp`. Sin MCP: ejecutar Python con internet (`salud.eulogioqt.com` y `github.com`):

1. `git clone https://github.com/eulogioqt/salud` (o `git pull`) y `python3 app/salud_remoto.py comprobar` (si no hay red, explícale al usuario qué activar y espera; no es un error).
2. `python3 app/salud_remoto.py login <token> --agente <quién eres>`; no repetir el token.
3. `python3 app/salud_remoto.py contexto` y seguir [`CLAUDE.md`](CLAUDE.md) (comandos y reglas; donde pone «Claude», eres tú). Nunca simular un registro.
