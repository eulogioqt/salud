# Arquitectura y reglas de cálculo

## Componentes

| Pieza | Archivo | Función |
|---|---|---|
| Base de datos | `data/salud.db` (SQLite) | Única fuente de verdad. |
| Núcleo | `app/salud/core.py`, `nutrition.py`, `db.py` | Toda la lógica: cálculos, validaciones, cierres, estadísticas. |
| API | `app/salud/api.py` | Router único usado por la web **y** por la CLI. |
| Servidor | `app/salud/server.py` (`app/servidor.py`) | HTTP en el puerto 47823 (este ordenador + red local; rechaza IPs públicas), sirve la web y la API. |
| CLI | `app/salud/cli.py` (`app/salud_cli.py`) | Operaciones desde el chat de Claude (origen `chat`). |
| Web | `app/web/` | HTML + CSS + JS sin dependencias ni compilación. |

Elección: Python estándar + SQLite + JS sin framework. Cero instalaciones, arranque inmediato en Windows, nada que actualizar ni que se rompa con dependencias. La web consulta cada 4 s la revisión de la BD (`meta.rev`) y se refresca sola cuando el chat escribe.

Concurrencia: transacciones `BEGIN IMMEDIATE` cortas. `journal_mode=TRUNCATE` (la carpeta montada en Cowork no permite borrar ficheros; WAL no es seguro entre la VM de Cowork y Windows).

## Modelo de datos

- `foods`: productos y recetas (`kind`). `status` = calidad del dato (`etiqueta`, `historico`, `provisional`, `estimacion`, `pendiente`). Conserva `original_name`, `previous_name`, `import_note`, `historical_text`. Borrado lógico (`deleted`), `hidden`, `favorite`.
- `portions`: raciones de un producto con sus valores (`null` = desconocido), cantidad física opcional (`g`, `ml`, `ud`), calidad y tipo original (`source_type`).
- `recipe_items`: ingredientes de una receta (alimento, unidad, cantidad). Receta: `recipe_servings`, `recipe_cooked_weight_g`.
- `templates` / `template_items`: comidas habituales (se añaden como entradas separadas y editables).
- `entries`: lo comido. Guarda **snapshot** (valores, unidad, base de cálculo, ingredientes) para que el pasado no cambie. `kind='estimacion'` para comidas fuera (con rango `kcal_min/max`). Borrado lógico (`deleted_at`).
- `days`: estado abierto/cerrado, peso matinal, pasos, NEAT del día, descanso, notas.
- `activities`: sesiones (tipo, minutos, intensidad, kcal netas manuales o estimadas, pasos dentro de la sesión).
- `closures`: cada cierre (versión, fecha, avisos, resumen completo en JSON, reapertura y motivo).
- `targets`: objetivos con fecha de validez (historial).
- `workouts` / `workout_exercises` / `workout_sets`: entrenos estilo Hevy (tipo de ejercicio peso/lastre/corporal/asistido/cardio; series normal/calentamiento/fallo/drop). Cada entreno crea y mantiene una `activity` vinculada para el gasto.
- `body_metrics`: mediciones de la báscula (peso y composición por bioimpedancia, siempre estimación). El peso se copia a `days` si el día no tiene.
- Fotos de alimentos: `foods.image` → `data/fotos/`.
- `settings`: perfil para el gasto. `events`: auditoría de todas las escrituras (origen web/chat).

## Cálculo nutricional

- Por gramos/ml: se escala desde una ración base del producto (la marcada como base; si no, la más completa, de mejor calidad y mayor cantidad). La base queda en el snapshot.
- Por ración: valores de la ración × número de raciones.
- Desconocidos: un campo `null` no se suma como 0; el total muestra lo conocido marcado con `*` (mínimo) y la lista `missing`.
- Energía de etiqueta: se conserva aunque no cuadre con 4P+4C+9G.
- Recetas: suma de ingredientes; ración = total / raciones; gramos = total / peso cocinado.
- Editar un alimento o receta recalcula las entradas de días **abiertos** (opcional desde la web); los cerrados nunca.

## Gasto energético (estimación, no medición)

`Gasto = BMR + TEF + NEAT sin pasos + pasos netos + ejercicio neto`

- **BMR**: Mifflin-St Jeor (10·kg + 6,25·cm − 5·edad + 5). Peso: media de pesajes de 7 días; si no hay, último pesaje (≤30 días); si no, peso estimado del perfil (marcado como tal).
- **TEF**: 10 % de las kcal registradas.
- **NEAT sin pasos**: 150 kcal por defecto (editable por día o en ajustes).
- **Pasos**: (pasos del día − pasos registrados dentro de sesiones) × zancada (altura × 0,415) × 0,5 kcal/kg/km neto × kg.
- **Ejercicio**: kcal netas manuales si se conocen; si no, (MET − 1) × kg × horas, para no duplicar el reposo ya incluido en el BMR. MET (normal): fuerza 3,5 · calistenia 3,8 · HYROX 8 · carrera 9,8 · bici 7 · caminata 3,5 (con suave/dura/muy dura).
- Sin pasos registrados el gasto se marca incompleto.

Calibración: con ≥14 días de ingesta completa y ≥10 pesajes en 28 días, *mantenimiento observado = ingesta media − pendiente del peso (kg/día) × 7.700*. Sirve para ajustar el objetivo, no se aplica solo.

## Cierre del día

Comprueba: peso, pasos, entreno o descanso, comidas, entradas con macros desconocidos, datos provisionales/pendientes y posibles dobles conteos de pasos. Los avisos «importante» exigen confirmar («Cerrar igualmente»). Guarda un snapshot completo y bloquea el día hasta reabrirlo; las versiones anteriores del cierre se conservan.

## Importación inicial

`app/salud/importer.py` importa exactamente las 34 entradas aprobadas de `app/salud/catalogo_inicial.json` (idempotente). Conserva valores, raciones, tipo de dato y observaciones; `null` se mantiene. Nombre corto para la interfaz; el original queda en `original_name`. Las 17 entradas rechazadas no existen en el archivo y nunca se importan.
