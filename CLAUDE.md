# Instrucciones para Claude — Salud

Sistema de seguimiento de nutrición, peso y entrenamiento: web https://salud.eulogioqt.com con una cuenta (y una base de datos) por persona. Cada persona usa su propio Claude, que trabaja **solo con su cuenta** mediante un token personal.

## Al empezar cada conversación

1. **Código** (la carpeta del usuario si la tiene conectada; si no, en el entorno de la nube, que funciona con el ordenador apagado):
   ```bash
   [ -d salud ] && git -C salud pull -q || git clone -q https://github.com/eulogioqt/salud
   cd salud
   ```
2. **Token**: si no existe `~/.salud_token`, pedírselo al usuario. Lo genera él en la web: **Ajustes → Conectar con un agente** (elige su agente y copia un mensaje con el token y estos pasos; en Claude puede dejarlo en sus instrucciones personales para no pegarlo cada vez). Guardarlo con `python3 app/salud_remoto.py login <token>` y no repetirlo en las respuestas. Claude no inicia sesión en la web ni escribe contraseñas.
3. **Contexto personal**: `python3 app/salud_remoto.py contexto`. Ahí están sus objetivos, perfil, forma de uso y preferencias; seguirlo. Si está vacío: ver «Primera vez».

Todos los comandos: `python3 app/salud_remoto.py <comando>` (abreviado abajo como `S <comando>`). Se ejecutan en el servidor sobre la cuenta del token; la salida es la confirmación. **Nunca simular un registro.**

Red: el entorno de Claude debe poder salir a `salud.eulogioqt.com` y `github.com` (Ajustes de Claude → Capacidades → acceso a la red: «Todos los dominios» o añadir esos dos). Cloudflare bloquea el User-Agent de Python: `salud_remoto.py` ya manda el suyo; con `curl` usar `-A salud-remoto/1.0`.

Reglas de acceso: un token = una cuenta. No intentar acceder a otras cuentas, ni pedir tokens o contraseñas de otras personas, ni entrar al servidor por SSH (eso es solo para el mantenimiento, y únicamente si el contexto personal del usuario lo indica). Las contraseñas las crea y escribe siempre el propio usuario.

## Primera vez (contexto vacío)

Preguntar lo justo (de una en una o en un solo mensaje corto) y guardarlo con `S contexto-guardar --archivo notas.md`:
- Objetivo (perder grasa / mantenimiento / ganar), kcal y proteína si ya las tiene; si no, proponerlas y fijarlas con `S api POST /api/targets '{json}'`.
- Perfil: revisar `S api GET /api/settings` y corregir sexo, fecha de nacimiento, altura y peso aproximado (se usa hasta que haya pesajes): Ajustes de la web o `S api PUT /api/settings '{"fecha_nacimiento":"AAAA-MM-DD","altura_cm":"170","sexo":"M","peso_estimado_kg":"60"}'`.
- Cómo quiere usarlo: qué apunta ella/él en la web y qué manda por el chat (capturas de Hevy, báscula, comidas fuera…), estilo de respuesta.
Al cambiar algo del contexto: leer el actual, editarlo y guardarlo entero (sustituye al anterior).

## Comandos

| Acción | Comando |
|---|---|
| Ver el día (con ids) | `S hoy [AAAA-MM-DD]` |
| Buscar alimento y sus unidades | `S buscar avena` |
| Añadir alimento | `S add <id\|nombre> <cantidad> <unidad> -c desayuno\|almuerzo\|merienda\|cena\|otro [--hora 14:30] [--fecha …]` (unidad `g`, `ml`, `rac`, `total` o `p:<id>`) |
| Comida habitual | `S habitual "batido" -c desayuno [--set <item_id>=60] [--skip <item_id>]` |
| Comida fuera (estimación) | `S estimar "Menú: lentejas + filete" --kcal 950 --p 55 --ch 90 --g 38 --min 800 --max 1150 -c almuerzo --nota "supuestos…"` |
| Editar / borrar / restaurar | `S edit <id> --cantidad 200 [--unidad g] [-c cena]` · `S del <id>` · `S undo <id>` |
| Peso / pasos / descanso | `S peso 61.4` · `S pasos 8000` · `S descanso` |
| Actividad sin Hevy | `S act fuerza\|calistenia\|hyrox\|carrera\|bici\|caminata\|otro --min 60 --int suave\|normal\|dura\|"muy dura" [--kcal netas] [--desc "…"]` |
| Entreno (capturas de Hevy) | `S entreno --archivo entreno.json` · `S entrenos` · `S ver-entreno <id>` · `S entreno-editar <id> --archivo cambios.json` |
| JSON/CSV de Hevy | `S importar-hevy archivo.json` (no duplica) |
| Báscula | `S bascula --peso … --grasa … …` (ver abajo) |
| Revisar / cerrar / reabrir | `S check` · `S cerrar [--forzar]` · `S reabrir --motivo "…"` |
| Tendencias | `S resumen [fecha]` · `S semanas` · `S historial --dias 28` |
| API directa | `S api POST /api/foods '{json}'` (crear producto) · `S api PUT /api/foods/<id> '{json}'` · `S api POST /api/recipes '{json}'` · `S api POST /api/templates '{json}'` · `S api POST /api/targets '{json}'` |
| Consulta (solo lectura) | `S sql "SELECT …"` |
| Contexto personal | `S contexto` · `S contexto-guardar --archivo notas.md` |

Formatos JSON: `app/salud/api.py` y `core.py` (`create_food`: `name, status, category, brand, source, notes, portions[{label, amount, unit g|ml|ud, kcal, protein_g, carbs_g, fat_g, quality, is_default}]`; `create_recipe`: `name, recipe_servings, recipe_cooked_weight_g, items[{food_id, unit_key, quantity}]`; `create_template`: `name, meal, items[...]`).

## Entrenos desde capturas de Hevy

Transcribir fielmente lo que se ve (no inventar series ni pesos ilegibles; si algo no se lee, preguntar). Escribir el JSON en un fichero y `S entreno --archivo entreno.json`:

```json
{"date":"2026-11-09","start_time":"18:30","title":"Pierna","duration_min":72,"activity_type":"fuerza",
 "intensity":"normal","hevy_volume_kg":9850,"description":"…",
 "exercises":[{"name":"Sentadilla (Barra)","kind":"peso","notes":"…",
   "sets":[{"type":"W","weight_kg":20,"reps":12},{"weight_kg":50,"reps":10},{"type":"F","weight_kg":50,"reps":8}]}]}
```

- `kind`: `peso`, `lastre` (peso añadido: dominadas/fondos lastrados), `corporal` (solo reps), `asistido`, `tiempo`/`cardio` (`seconds`, `distance_m`).
- Serie: normal (omitir `type`), `W` calentamiento, `F` fallo, `D` drop; `rpe` si aparece.
- Nombre del ejercicio: exactamente el de Hevy (enlaza el histórico y los récords).
- El entreno crea su actividad para el gasto: no añadir además `act` de esa sesión. Día cerrado: preguntar antes de reabrir.

Pesos (para niveles y 1RM): mancuernas = el peso de las dos; a un brazo = peso normal y reps de los dos brazos sumadas; máquinas = con el peso de la máquina incluido. Ajustes por ejercicio (peso de la máquina, polea que pesa la mitad, a un brazo): web → ficha del ejercicio → «Material y peso real», o `S api PUT /api/exercise-settings '{"name":"…","equipment":"maquina","machine_kg":45}'`.

## Báscula (Xiaomi u otra)

`S bascula --fecha … --hora … --peso … --imc … --grasa … --grasa-kg … --musculo … --musculo-pct … --esqueletico … --magra … --agua … --agua-kg … --proteina … --proteina-kg … --hueso … --hueso-pct … --visceral … --bmr … --edad-corporal … --cintura-cadera … --fc … --puntuacion … --nota "…"`
- Ignorar flechas de variación y «sugerencias» de la app. La composición (bioimpedancia) es una estimación con mucho error: solo tendencias de semanas. El peso se copia al día si no tiene (`--sobrescribir-dia` para reemplazarlo).

## Reglas de datos

- `null` = desconocido, nunca 0. Si falta un dato relevante: preguntar UNA cosa concreta o dejarlo pendiente.
- Calidad: `etiqueta` > `historico` > `provisional` > `estimacion` > `pendiente`. No inventar valores de productos de marca: pedir la etiqueta o usar Open Food Facts indicándolo como fuente.
- Lo que Claude crea (productos, recetas, comidas habituales) queda **por revisar** hasta que el usuario lo acepta en Biblioteca.
- Fotos: preferir Open Food Facts por URL con `image_source`.
- Lo que se toma por unidad (lata, yogur, pack) se registra por unidad (`default_unit`); lo demás por peso.
- Comidas fuera: estimar con rango y supuestos en `--nota`.
- Aceite: una línea más en la comida donde se usó. Sin pesar: chorrito ≈ 8 g, cucharada ≈ 10 g. Plancha/salteado: contar el 100 %; fritura profunda: absorción ~10–15 % del peso del alimento.
- Recetas en crudo/seco. Los días cerrados no cambian; no modificarlos sin `reabrir` pedido por el usuario.
- «Cierra el día»: `S check`, decir solo lo que falta de verdad, preguntar si cierra igualmente; tras cerrar, resumen compacto.
- Fechas en hora de Madrid; si es de otro día, `--fecha`. Para «cuánto llevo»: `S hoy`.
- El gasto es una estimación (BMR Mifflin-St Jeor + pasos + ejercicio neto + TEF). Calibrar objetivos con la media de 7 días y tendencias de 2–4 semanas, nunca con cambios de un día.

## Si no hay conexión con el servidor

Decirlo en una línea y guardar lo pedido como **PENDIENTE** en la conversación (fecha, franja, hora, alimento y cantidad tal como los dijo). En cuanto haya conexión, volcarlo con su `--fecha`/`--hora`, comprobar con `S hoy` que no esté ya apuntado desde la web y confirmar.

## Código y mantenimiento (solo el administrador)

- Python 3 sin dependencias. Pruebas: `python3 -m unittest discover -s app/tests`.
- Esquema: solo migraciones nuevas al final de `MIGRATIONS` (`app/salud/db.py`). SQLite con `journal_mode=TRUNCATE`.
- Despliegue y servidor: `deploy/LEEME.md`. Los datos de cada persona (BD, fotos, contexto) viven solo en el servidor; en este repo no hay datos personales (ver `.gitignore`).
- Commits en español.
