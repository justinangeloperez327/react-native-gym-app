export const SCHEMA_VERSION = 5;

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

export const MIGRATION_V4 = [
  "CREATE TABLE routine_templates (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE routine_exercises (id TEXT PRIMARY KEY NOT NULL, routine_id TEXT NOT NULL REFERENCES routine_templates(id) ON DELETE CASCADE, exercise_id TEXT NOT NULL, position INTEGER NOT NULL CHECK(position >= 0), target_sets INTEGER NOT NULL CHECK(target_sets BETWEEN 1 AND 20), target_reps INTEGER NOT NULL CHECK(target_reps BETWEEN 1 AND 1000), target_weight_kg REAL NOT NULL CHECK(target_weight_kg >= 0), UNIQUE(routine_id, position), UNIQUE(routine_id, exercise_id))",
  "CREATE INDEX idx_routine_exercises_owner ON routine_exercises(routine_id)",
  "CREATE TABLE routine_weekdays (routine_id TEXT NOT NULL REFERENCES routine_templates(id) ON DELETE CASCADE, weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6), PRIMARY KEY(routine_id, weekday))",
  "CREATE INDEX idx_routine_weekdays_day ON routine_weekdays(weekday)",
  'PRAGMA user_version = 4',
].join(';\n') + ';';

export const MIGRATION_V5 = [
  "ALTER TABLE workout_sets ADD COLUMN duration_seconds INTEGER",
  "ALTER TABLE workout_sets ADD COLUMN distance_meters REAL",
  "ALTER TABLE workout_sets ADD COLUMN set_type TEXT NOT NULL DEFAULT 'normal' CHECK(set_type IN ('normal','warmup','drop','failure'))",
  "ALTER TABLE workout_movements ADD COLUMN rest_seconds INTEGER NOT NULL DEFAULT 90 CHECK(rest_seconds BETWEEN 0 AND 600)",
  "ALTER TABLE workout_movements ADD COLUMN superset_group TEXT",
  // SQLite cannot DROP the old CHECK(target_reps BETWEEN 1 AND 1000).
  // Rebuild this child table atomically to permit zero-rep timed/cardio entries.
  "CREATE TABLE routine_exercises_v5 (id TEXT PRIMARY KEY NOT NULL, routine_id TEXT NOT NULL REFERENCES routine_templates(id) ON DELETE CASCADE, exercise_id TEXT NOT NULL, position INTEGER NOT NULL CHECK(position >= 0), target_sets INTEGER NOT NULL CHECK(target_sets BETWEEN 1 AND 20), target_reps INTEGER NOT NULL CHECK(target_reps BETWEEN 0 AND 1000), target_weight_kg REAL NOT NULL CHECK(target_weight_kg >= 0), target_duration_seconds INTEGER CHECK(target_duration_seconds IS NULL OR target_duration_seconds BETWEEN 0 AND 86400), target_distance_meters REAL CHECK(target_distance_meters IS NULL OR target_distance_meters BETWEEN 0 AND 1000000), UNIQUE(routine_id, position), UNIQUE(routine_id, exercise_id))",
  "INSERT INTO routine_exercises_v5(id, routine_id, exercise_id, position, target_sets, target_reps, target_weight_kg) SELECT id, routine_id, exercise_id, position, target_sets, target_reps, target_weight_kg FROM routine_exercises",
  "DROP TABLE routine_exercises",
  "ALTER TABLE routine_exercises_v5 RENAME TO routine_exercises",
  "CREATE INDEX idx_routine_exercises_owner ON routine_exercises(routine_id)",
  'PRAGMA user_version = 5',
].join(';\n') + ';';
