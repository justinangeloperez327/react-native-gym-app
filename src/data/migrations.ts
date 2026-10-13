export const SCHEMA_VERSION = 3;

/** PRAGMA user_version advances atomically with the DDL transaction. */
export const MIGRATION_V1 = [
  'CREATE TABLE IF NOT EXISTS app_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)',
  "CREATE TABLE IF NOT EXISTS preferences (id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1), weight_unit TEXT NOT NULL DEFAULT 'kg' CHECK (weight_unit IN ('kg', 'lb')), theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')))",
  'CREATE TABLE IF NOT EXISTS workouts (id TEXT PRIMARY KEY NOT NULL, started_at TEXT NOT NULL, finished_at TEXT)',
  'CREATE INDEX IF NOT EXISTS idx_workouts_started ON workouts(started_at DESC)',
  'CREATE TABLE IF NOT EXISTS workout_movements (id TEXT PRIMARY KEY NOT NULL, workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE, exercise_id TEXT NOT NULL, position INTEGER NOT NULL CHECK (position >= 0), UNIQUE(workout_id, position))',
  'CREATE INDEX IF NOT EXISTS idx_movements_workout ON workout_movements(workout_id)',
  'CREATE TABLE IF NOT EXISTS workout_sets (id TEXT PRIMARY KEY NOT NULL, movement_id TEXT NOT NULL REFERENCES workout_movements(id) ON DELETE CASCADE, position INTEGER NOT NULL CHECK (position >= 0), reps INTEGER NOT NULL CHECK (reps >= 0), weight_kg REAL NOT NULL CHECK (weight_kg >= 0), completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)), UNIQUE(movement_id, position))',
  'CREATE INDEX IF NOT EXISTS idx_sets_movement ON workout_sets(movement_id)',
  "INSERT OR IGNORE INTO preferences (id, weight_unit, theme) VALUES (1, 'kg', 'system')",
  'PRAGMA user_version = 1',
].join(';\n') + ';';

export const MIGRATION_V2 = [
  "CREATE TABLE IF NOT EXISTS custom_exercises (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL COLLATE NOCASE, muscle TEXT NOT NULL, equipment TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('strength','bodyweight','cardio')), tracking TEXT NOT NULL CHECK(tracking IN ('reps','duration','distance')), archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)))",
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_exercises_name ON custom_exercises(name)',
  'CREATE INDEX IF NOT EXISTS idx_custom_exercises_kind ON custom_exercises(kind, archived)',
  'PRAGMA user_version = 2',
].join(';\n') + ';';

export const MIGRATION_V3 = [
  "ALTER TABLE workouts ADD COLUMN notes TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE workout_movements ADD COLUMN notes TEXT NOT NULL DEFAULT ''",
  'PRAGMA user_version = 3',
].join(';\n') + ';';
