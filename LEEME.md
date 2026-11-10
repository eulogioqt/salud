# Salud

Seguimiento de nutrición, peso y entrenamiento (estilo Hevy) para uso personal, pensado para usarse a medias entre la web y Claude.

- **Web**: https://salud.eulogioqt.com — una cuenta y una base de datos por persona. Hoy (comidas, macros, gasto, balance), Entreno (récords, niveles de fuerza, estadísticas), Biblioteca, Progreso y Ajustes.
- **Claude**: cada persona usa su propio Claude con un token personal (`app/salud_remoto.py`), que solo da acceso a su cuenta. Funciona también desde el entorno en la nube de Claude, con el ordenador apagado. Instrucciones en `CLAUDE.md`.
- **Datos**: solo en el servidor (SQLite por usuario + fotos + contexto personal). Este repositorio no contiene datos personales.

## Para usarlo con Claude u otro agente

1. Entra en la web → **menú de tu nombre → Conectar un agente** → elige tu agente (Claude, Claude Code, Codex, Gemini…) → «Generar token y mensaje» → «Copiar mensaje».
2. Pégalo en Claude (Cowork, Claude Code…) o, mejor, en tus instrucciones personales de Claude para que valga en todas las conversaciones. Claude clona este repo, guarda el token, lee tu contexto y, la primera vez, te pregunta tus objetivos.
3. Funciona con cualquier agente que pueda ejecutar Python con acceso a internet (`AGENTS.md`). El token solo da acceso a tu cuenta; si lo pierdes, genera otro en la web (el anterior deja de valer).

## Niveles: datos de Strength Level y sus webs de cardio

Los niveles (principiante → élite) usan los estándares públicos de **[Strength Level](https://strengthlevel.com)**, creados con los levantamientos que envía su comunidad. Todo el mérito de esos datos es suyo.

- El servidor descarga sus tablas (todas las de su web, ~290 ejercicios, por peso corporal y edad, hombres y mujeres) despacio y una sola vez, las guarda en su caché (se refrescan cada 90 días) y la web las pide a nuestra API. No están en este repositorio: son datos de Strength Level.
- Cada ejercicio de Hevy se enlaza solo con su página por el nombre; si no acierta, se elige a mano en la ficha del ejercicio («Material, peso real y nivel»).
- Cardio: **[Swimming Level](https://swimminglevel.com)**, **[Running Level](https://runninglevel.com)**, **[Rowing Level](https://rowinglevel.com)** y **[Cycling Level](https://cyclinglevel.com)** (de los mismos autores): tiempos por edad y sexo de cada prueba, guardados igual en la caché del servidor (`/api/levels`).
- Descarga inicial en el servidor: `salud niveles-descargar` (una página cada 3 s).

## Añadir una persona (administrador)

En el servidor (`ssh hetzner`), con la persona delante para que escriba su contraseña:

```
salud usuario-crear <usuario> --nombre <Nombre> --sexo H|M --nacimiento AAAA-MM-DD --altura <cm>
sudo systemctl restart salud
```

Después entra en la web con su usuario y conecta su agente desde Ajustes. Cambiar contraseña: `salud usuario-password <usuario>`.

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
