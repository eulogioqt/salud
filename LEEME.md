# Salud

Seguimiento de nutrición, peso y entrenamiento (estilo Hevy) para uso personal, pensado para usarse a medias entre la web y Claude.

- **Web**: https://salud.eulogioqt.com — una cuenta y una base de datos por persona. Hoy (comidas, macros, gasto, balance), Entreno (récords, niveles de fuerza, estadísticas), Biblioteca, Progreso y Ajustes.
- **Claude**: cada persona usa su propio Claude con un token personal (`app/salud_remoto.py`), que solo da acceso a su cuenta. Funciona también desde el entorno en la nube de Claude, con el ordenador apagado. Instrucciones en `CLAUDE.md`.
- **Datos**: solo en el servidor (SQLite por usuario + fotos + contexto personal). Este repositorio no contiene datos personales.

## Para usarlo con Claude

1. En la web, pide a quien administra el servidor un token (`salud usuario-token <usuario>`).
2. Dile a Claude: «Lee https://github.com/eulogioqt/salud/blob/main/CLAUDE.md y úsalo con mi token sal_…». Claude clona el repo, guarda el token y lee tu contexto personal.
3. Para actualizar: Claude hace `git pull` al empezar.

## Código

```
app/servidor.py        servidor web (modo local o --multiusuario)
app/salud_cli.py       CLI (la usa el servidor para /api/cli)
app/salud_remoto.py    cliente con token para Claude o scripts
app/salud/             núcleo: base de datos, nutrición, entreno, cuentas, API
app/web/               interfaz (HTML/CSS/JS sin dependencias)
app/tests/             pruebas: python3 -m unittest discover -s app/tests
deploy/                servicio systemd, nginx e instalador (ver deploy/LEEME.md)
docs/ARQUITECTURA.md   modelo de datos y fórmulas
```

Modo local (un solo usuario, sin cuentas): `python3 app/servidor.py` (o `iniciar.bat` en Windows) → http://localhost:47823.
