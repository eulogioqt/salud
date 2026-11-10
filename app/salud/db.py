"""Conexión SQLite, migraciones y transacciones.

La base de datos (data/salud.db) es la única fuente de verdad. La usan tanto
el servidor web como la CLI que Claude ejecuta desde el chat.

Notas de robustez:
- journal_mode=TRUNCATE: no borra el fichero -journal (la carpeta montada en
  Cowork no permite borrar ficheros) y funciona igual en Windows.
- Nunca WAL: no es seguro cuando dos máquinas (Windows y la VM de Cowork)
  acceden al mismo fichero.
- Las migraciones solo añaden; nunca eliminan datos históricos.
"""
from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, date, timedelta

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT_DIR = os.path.dirname(APP_DIR)
DATA_DIR = os.path.join(ROOT_DIR, "data")
BACKUP_DIR = os.path.join(ROOT_DIR, "backups")
EXPORT_DIR = os.path.join(ROOT_DIR, "exportaciones")
DEFAULT_DB = os.path.join(DATA_DIR, "salud.db")


def now_local() -> datetime:
    """Hora local de Madrid (fallback: hora local del sistema)."""
    try:
        from zoneinfo import ZoneInfo  # type: ignore
        return datetime.now(ZoneInfo("Europe/Madrid")).replace(tzinfo=None)
    except Exception:
        return datetime.now()


def today() -> str:
    return now_local().date().isoformat()


def ts() -> str:
    return now_local().replace(microsecond=0).isoformat(sep=" ")


def parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def shift(d: str, days: int) -> str:
    return (parse_date(d) + timedelta(days=days)).isoformat()


MIGRATIONS = [
    # v1 — esquema inicial
    """
    CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
    CREATE TABLE targets(
        id INTEGER PRIMARY KEY,
        valid_from TEXT NOT NULL UNIQUE,
        kcal REAL, protein_g REAL, fat_min_g REAL, fat_max_g REAL,
        provisional INTEGER NOT NULL DEFAULT 1,
        note TEXT, created_at TEXT
    );
    CREATE TABLE foods(
        id INTEGER PRIMARY KEY,
        code TEXT UNIQUE,
        name TEXT NOT NULL,
        original_name TEXT, previous_name TEXT,
        kind TEXT NOT NULL DEFAULT 'producto' CHECK(kind IN ('producto','receta')),
        category TEXT, brand TEXT,
        status TEXT NOT NULL DEFAULT 'historico'
            CHECK(status IN ('etiqueta','historico','provisional','pendiente','estimacion')),
        source TEXT, notes TEXT, import_note TEXT, historical_text TEXT,
        favorite INTEGER NOT NULL DEFAULT 0,
        hidden INTEGER NOT NULL DEFAULT 0,
        deleted INTEGER NOT NULL DEFAULT 0,
        image TEXT,
        recipe_servings REAL, recipe_cooked_weight_g REAL,
        created_at TEXT, updated_at TEXT
    );
    CREATE TABLE portions(
        id INTEGER PRIMARY KEY,
        food_id INTEGER NOT NULL REFERENCES foods(id),
        label TEXT NOT NULL,
        amount REAL, unit TEXT CHECK(unit IN ('g','ml','ud') OR unit IS NULL),
        kcal REAL, protein_g REAL, carbs_g REAL, fat_g REAL,
        quality TEXT NOT NULL DEFAULT 'historico',
        source_type TEXT, note TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        sort INTEGER NOT NULL DEFAULT 0,
        deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE recipe_items(
        id INTEGER PRIMARY KEY,
        recipe_id INTEGER NOT NULL REFERENCES foods(id),
        food_id INTEGER NOT NULL REFERENCES foods(id),
        unit_key TEXT NOT NULL, quantity REAL NOT NULL,
        note TEXT, sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE templates(
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL, meal TEXT, notes TEXT,
        favorite INTEGER NOT NULL DEFAULT 1,
        hidden INTEGER NOT NULL DEFAULT 0,
        deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT, updated_at TEXT
    );
    CREATE TABLE template_items(
        id INTEGER PRIMARY KEY,
        template_id INTEGER NOT NULL REFERENCES templates(id),
        food_id INTEGER NOT NULL REFERENCES foods(id),
        unit_key TEXT NOT NULL, quantity REAL NOT NULL,
        sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE days(
        date TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'abierto' CHECK(status IN ('abierto','cerrado')),
        weight_kg REAL, weight_time TEXT,
        steps INTEGER, neat_kcal REAL, rest_day INTEGER,
        notes TEXT, hunger INTEGER, energy INTEGER,
        closed_at TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE entries(
        id INTEGER PRIMARY KEY,
        date TEXT NOT NULL,
        meal TEXT NOT NULL CHECK(meal IN ('desayuno','almuerzo','merienda','cena','otro')),
        time TEXT, sort INTEGER NOT NULL DEFAULT 0,
        food_id INTEGER REFERENCES foods(id),
        template_id INTEGER REFERENCES templates(id),
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('producto','receta','estimacion')),
        unit_key TEXT, unit_label TEXT, quantity REAL, factor REAL,
        kcal REAL, protein_g REAL, carbs_g REAL, fat_g REAL,
        missing TEXT NOT NULL DEFAULT '[]',
        kcal_min REAL, kcal_max REAL,
        quality TEXT NOT NULL,
        note TEXT, snapshot TEXT,
        created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE INDEX idx_entries_date ON entries(date);
    CREATE TABLE activities(
        id INTEGER PRIMARY KEY,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        minutes REAL, intensity TEXT,
        kcal_net REAL, kcal_source TEXT NOT NULL DEFAULT 'estimado',
        steps_in_activity INTEGER,
        created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE INDEX idx_activities_date ON activities(date);
    CREATE TABLE closures(
        id INTEGER PRIMARY KEY,
        date TEXT NOT NULL, version INTEGER NOT NULL,
        closed_at TEXT NOT NULL, forced INTEGER NOT NULL DEFAULT 0,
        warnings TEXT, summary TEXT,
        reopened_at TEXT, reopen_reason TEXT
    );
    CREATE INDEX idx_closures_date ON closures(date);
    CREATE TABLE events(
        id INTEGER PRIMARY KEY,
        ts TEXT NOT NULL, source TEXT, action TEXT NOT NULL,
        date TEXT, ref TEXT, payload TEXT
    );
    """,
    # v2 — entrenos (estilo Hevy) y báscula
    """
    CREATE TABLE workouts(
        id INTEGER PRIMARY KEY,
        date TEXT NOT NULL, start_time TEXT,
        title TEXT NOT NULL,
        duration_min REAL,
        activity_type TEXT NOT NULL DEFAULT 'fuerza',
        intensity TEXT NOT NULL DEFAULT 'normal',
        hevy_volume_kg REAL,
        notes TEXT, source TEXT NOT NULL DEFAULT 'hevy',
        activity_id INTEGER REFERENCES activities(id),
        created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE INDEX idx_workouts_date ON workouts(date);
    CREATE TABLE workout_exercises(
        id INTEGER PRIMARY KEY,
        workout_id INTEGER NOT NULL REFERENCES workouts(id),
        sort INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'peso' CHECK(kind IN ('peso','lastre','corporal','asistido','cardio','tiempo')),
        notes TEXT, superset INTEGER
    );
    CREATE INDEX idx_wex_workout ON workout_exercises(workout_id);
    CREATE TABLE workout_sets(
        id INTEGER PRIMARY KEY,
        exercise_id INTEGER NOT NULL REFERENCES workout_exercises(id),
        idx INTEGER NOT NULL DEFAULT 0,
        type TEXT NOT NULL DEFAULT 'normal' CHECK(type IN ('normal','calentamiento','fallo','drop')),
        weight_kg REAL, reps INTEGER, distance_m REAL, seconds REAL, rpe REAL
    );
    CREATE INDEX idx_wset_ex ON workout_sets(exercise_id);
    CREATE TABLE body_metrics(
        id INTEGER PRIMARY KEY,
        date TEXT NOT NULL, time TEXT,
        weight_kg REAL, bmi REAL, fat_pct REAL, fat_kg REAL, muscle_kg REAL, muscle_pct REAL, skeletal_muscle_kg REAL,
        lean_kg REAL, water_pct REAL, water_kg REAL, protein_pct REAL, protein_kg REAL, bone_kg REAL, bone_pct REAL,
        visceral_fat REAL, bmr_kcal REAL, body_age REAL, whr REAL, heart_rate REAL, body_score REAL,
        notes TEXT, source TEXT NOT NULL DEFAULT 'xiaomi',
        created_at TEXT, deleted_at TEXT
    );
    CREATE INDEX idx_body_date ON body_metrics(date);
    """,
    # v3 — revisión de catálogo, origen de foto, sincronización con Hevy
    """
    ALTER TABLE foods ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE foods ADD COLUMN image_source TEXT;
    ALTER TABLE templates ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE workouts ADD COLUMN hevy_id TEXT;
    CREATE UNIQUE INDEX idx_workouts_hevy ON workouts(hevy_id);
    CREATE TABLE hevy_templates(
        id TEXT PRIMARY KEY, title TEXT, type TEXT, primary_muscle TEXT, is_custom INTEGER, fetched_at TEXT
    );
    """,
    # v4 — unidad por defecto (productos por unidad vs por peso) y foto de comidas habituales
    """
    ALTER TABLE foods ADD COLUMN default_unit TEXT;
    ALTER TABLE templates ADD COLUMN image TEXT;
    ALTER TABLE templates ADD COLUMN image_source TEXT;
    """,
    # v5 — ajustes por ejercicio (peso de la máquina, polea que pesa la mitad, a un brazo)
    """
    CREATE TABLE exercise_settings (
        name_key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        equipment TEXT,
        machine_kg REAL,
        load_ratio REAL,
        unilateral INTEGER,
        notes TEXT,
        updated_at TEXT
    );
    """,
    # v6 — notas por usuario (contexto personal para Claude: objetivos, perfil, forma de uso)
    """
    CREATE TABLE notes (
        key TEXT PRIMARY KEY,
        body TEXT NOT NULL,
        updated_at TEXT
    );
    """,
    # v7 — tabla de Strength Level elegida para cada ejercicio (su «slug», p. ej. «weighted-pull-ups»)
    """
    ALTER TABLE exercise_settings ADD COLUMN sl_slug TEXT;
    """,
    # v8 — objetivo según el gasto: kcal = gasto estimado del día ± diferencia; proteína por kg y grasa en % de las kcal
    """
    ALTER TABLE targets ADD COLUMN mode TEXT NOT NULL DEFAULT 'fijo';
    ALTER TABLE targets ADD COLUMN kcal_offset REAL;
    ALTER TABLE targets ADD COLUMN protein_per_kg REAL;
    ALTER TABLE targets ADD COLUMN fat_min_pct REAL;
    ALTER TABLE targets ADD COLUMN fat_max_pct REAL;
    """,
    # v9 — pasos automáticos (Health Connect / Salud de Apple): tramos con su hora local; el día guarda la suma
    """
    CREATE TABLE step_buckets(start TEXT PRIMARY KEY, end TEXT, steps INTEGER NOT NULL, received_at TEXT);
    ALTER TABLE days ADD COLUMN steps_auto INTEGER NOT NULL DEFAULT 0;
    """,
]


class ClosedDayError(Exception):
    pass


class NotFound(Exception):
    pass


class ValidationError(Exception):
    pass


def connect(path: str | None = None) -> sqlite3.Connection:
    path = path or os.environ.get("SALUD_DB") or DEFAULT_DB
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path, timeout=15, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=TRUNCATE")
    conn.execute("PRAGMA synchronous=FULL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=15000")
    migrate(conn)
    return conn


def schema_version(conn) -> int:
    try:
        r = conn.execute("SELECT value FROM meta WHERE key='schema_version'").fetchone()
        return int(r[0]) if r else 0
    except sqlite3.OperationalError:
        return 0


def migrate(conn):
    v = schema_version(conn)
    if v >= len(MIGRATIONS):
        return
    conn.execute("BEGIN IMMEDIATE")
    try:
        v = schema_version(conn)
        for i in range(v, len(MIGRATIONS)):
            for stmt in [s.strip() for s in MIGRATIONS[i].split(";") if s.strip()]:
                conn.execute(stmt)
            conn.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('schema_version',?)", (str(i + 1),))
        conn.execute("INSERT OR IGNORE INTO meta(key,value) VALUES('rev','0')")
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def rev(conn) -> int:
    r = conn.execute("SELECT value FROM meta WHERE key='rev'").fetchone()
    return int(r[0]) if r else 0


@contextmanager
def tx(conn, action: str, source: str = "web", date_: str | None = None, ref=None, payload=None):
    """Transacción atómica que registra el evento y sube la revisión."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield
        conn.execute(
            "INSERT INTO events(ts,source,action,date,ref,payload) VALUES(?,?,?,?,?,?)",
            (ts(), source, action, date_, None if ref is None else str(ref),
             None if payload is None else json.dumps(payload, ensure_ascii=False, default=str)),
        )
        conn.execute("UPDATE meta SET value=CAST(value AS INTEGER)+1 WHERE key='rev'")
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def row(r):
    return None if r is None else {k: r[k] for k in r.keys()}


def rows(rs):
    return [row(r) for r in rs]
