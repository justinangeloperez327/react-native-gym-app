import { emptyGymData, isGymData, parseLegacy } from './legacy.ts';
import { MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4, MIGRATION_V5, SCHEMA_VERSION } from './migrations.ts';
import { normalizeExerciseInput } from './exercises.ts';
import { validateRoutine } from './routines.ts';
import type { GymData, Preferences, Workout, WorkoutMovement, TrainingSet, Exercise, RoutineTemplate, RoutineExercise } from '../types/gym';

export type SqlParam = string | number | null;

/**
 * Narrow adapter around expo-sqlite, deliberately portable to Node's sqlite
 * module for real SQL integration tests. All writes use exclusive transactions.
 */
export interface SqlClient {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: SqlParam[]): Promise<unknown>;
  getFirstAsync(source: string, ...params: SqlParam[]): Promise<unknown | null>;
  getAllAsync(source: string, ...params: SqlParam[]): Promise<unknown[]>;
}

export interface SqlDatabase extends SqlClient {
  withExclusiveTransactionAsync(callback: (transaction: SqlClient) => Promise<void>): Promise<void>;
}

type CountRow = { total: number };
type SchemaRow = { user_version: number };
type KeyRow = { value: string };
type PrefRow = { weight_unit: string; theme: string };
type WorkoutRow = { id: string; started_at: string; finished_at: string | null; notes: string };
type MovementRow = { id: string; workout_id: string; exercise_id: string; position: number; notes: string; rest_seconds: number; superset_group: string | null };
type ExerciseRow = { id: string; name: string; muscle: Exercise['muscle']; equipment: string; kind: Exercise['kind']; tracking: Exercise['tracking']; archived: number };
type RoutineRow = { id: string; name: string; description: string; created_at: string; updated_at: string };
type RoutineExerciseRow = { id: string; routine_id: string; exercise_id: string; position: number; target_sets: number; target_reps: number; target_weight_kg: number; target_duration_seconds: number | null; target_distance_meters: number | null };
type RoutineDayRow = { routine_id: string; weekday: number };
type SetRow = { id: string; movement_id: string; position: number; reps: number; weight_kg: number; completed: number; duration_seconds: number | null; distance_meters: number | null; set_type: string };

const LEGACY_STATUS = 'legacy_async_storage_v1';

/**
 * SQLite is the source of truth after initialization. This class does not
 * delete AsyncStorage records or create synthetic workouts on migration errors.
 */
export class GymRepository {
  private readonly db: SqlDatabase;

  constructor(db: SqlDatabase) {
    this.db = db;
  }

  async initialize(readLegacy: () => Promise<string | null>): Promise<void> {
    await this.db.execAsync('PRAGMA foreign_keys = ON;');
    await this.db.execAsync('PRAGMA journal_mode = WAL;');
    const row = await this.db.getFirstAsync('PRAGMA user_version') as SchemaRow | null;
    const currentVersion = row?.user_version ?? 0;
    if (currentVersion > SCHEMA_VERSION) {
      throw new Error('This workout database was created by a newer app version. Nothing was changed.');
    }
    if (currentVersion < 1) {
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.execAsync(MIGRATION_V1);
      });
    }

    if (currentVersion < 2) {
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.execAsync(MIGRATION_V2);
      });
    }

    if (currentVersion < 3) {
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.execAsync(MIGRATION_V3);
      });
    }

    if (currentVersion < 4) {
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.execAsync(MIGRATION_V4);
      });
    }

    if (currentVersion < 5) {
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.execAsync(MIGRATION_V5);
      });
    }

    // If the legacy key is still present after an import, do not import it again.
    const previous = await this.db.getFirstAsync(
      'SELECT value FROM app_metadata WHERE key = ?', LEGACY_STATUS,
    ) as KeyRow | null;
    if (previous) return;

    const saved = await readLegacy(); // A read failure is fatal: do not mark migration completed.
    const legacy = saved === null ? null : parseLegacy(saved);
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      const marker = await tx.getFirstAsync(
        'SELECT value FROM app_metadata WHERE key = ?', LEGACY_STATUS,
      ) as KeyRow | null;
      if (marker) return;
      const count = await tx.getFirstAsync('SELECT COUNT(*) AS total FROM workouts') as CountRow;
      const current = await tx.getFirstAsync(
        'SELECT weight_unit, theme FROM preferences WHERE id = 1',
      ) as PrefRow | null;
      const customized = current !== null && (current.weight_unit !== 'kg' || current.theme !== 'system');
      if (legacy && count.total === 0 && !customized) {
        await writeSnapshot(tx, legacy);
      }
      await tx.runAsync(
        'INSERT INTO app_metadata (key, value) VALUES (?, ?)',
        LEGACY_STATUS,
        legacy ? (count.total === 0 && !customized ? 'imported' : 'existing_sqlite_kept') : 'absent',
      );
    });
  }

  async readSnapshot(): Promise<GymData> {
    const prefs = await this.db.getFirstAsync(
      'SELECT weight_unit, theme FROM preferences WHERE id = 1',
    ) as PrefRow | null;
    if (!prefs) throw new Error('Database preferences missing');
    const rows = await this.db.getAllAsync(
      'SELECT id, started_at, finished_at, notes FROM workouts ORDER BY started_at DESC, id DESC',
    ) as WorkoutRow[];
    const movements = await this.db.getAllAsync(
      'SELECT id, workout_id, exercise_id, position, notes, rest_seconds, superset_group FROM workout_movements ORDER BY position',
    ) as MovementRow[];
    const sets = await this.db.getAllAsync(
      'SELECT id, movement_id, position, reps, weight_kg, completed, duration_seconds, distance_meters, set_type FROM workout_sets ORDER BY position',
    ) as SetRow[];
    const byWorkout = new Map<string, WorkoutMovement[]>();
    const byMovement = new Map<string, TrainingSet[]>();
    for (const s of sets) {
      const list = byMovement.get(s.movement_id) ?? [];
      list.push({ id: s.id, reps: s.reps, weightKg: s.weight_kg, completed: s.completed === 1,
        ...(s.duration_seconds !== null ? { durationSeconds: s.duration_seconds } : {}),
        ...(s.distance_meters !== null ? { distanceMeters: s.distance_meters } : {}),
        ...(s.set_type !== 'normal' ? { setType: s.set_type as TrainingSet['setType'] } : {}),
      });
      byMovement.set(s.movement_id, list);
    }
    for (const m of movements) {
      const list = byWorkout.get(m.workout_id) ?? [];
      list.push({ id: m.id, exerciseId: m.exercise_id, sets: byMovement.get(m.id) ?? [],
        ...(m.notes ? { notes: m.notes } : {}),
        ...(m.rest_seconds !== 90 ? { restSeconds: m.rest_seconds } : {}),
        ...(m.superset_group ? { supersetGroup: m.superset_group } : {}),
      });
      byWorkout.set(m.workout_id, list);
    }
    const snapshot: GymData = {
      version: 1,
      workouts: rows.map((w) => ({
        id: w.id, startedAt: w.started_at, finishedAt: w.finished_at, ...(w.notes ? { notes: w.notes } : {}),
        movements: byWorkout.get(w.id) ?? [],
      })),
      preferences: { unit: prefs.weight_unit as Preferences['unit'], theme: prefs.theme as Preferences['theme'] },
    };
    if (!isGymData(snapshot)) throw new Error('Stored workouts failed integrity validation');
    return snapshot;
  }

  async readCustomExercises(): Promise<Exercise[]> {
    const rows = await this.db.getAllAsync(
      'SELECT id, name, muscle, equipment, kind, tracking, archived FROM custom_exercises ORDER BY name COLLATE NOCASE',
    ) as ExerciseRow[];
    return rows.map((row) => ({
      id: row.id, name: row.name, muscle: row.muscle, equipment: row.equipment,
      kind: row.kind, tracking: row.tracking, custom: true, archived: row.archived === 1,
    }));
  }

  async saveCustomExercise(exercise: Exercise): Promise<void> {
    if (!exercise.custom || !exercise.id.startsWith('custom:')) {
      throw new Error('Only custom exercise records may be saved.');
    }
    const input = normalizeExerciseInput(exercise);
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        'INSERT INTO custom_exercises (id, name, muscle, equipment, kind, tracking, archived) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, muscle=excluded.muscle, equipment=excluded.equipment, kind=excluded.kind, tracking=excluded.tracking, archived=excluded.archived',
        exercise.id, input.name, input.muscle, input.equipment, input.kind,
        input.tracking, exercise.archived ? 1 : 0,
      );
    });
  }

  async archiveCustomExercise(id: string): Promise<void> {
    if (!id.startsWith('custom:')) throw new Error('Built-in exercises cannot be archived.');
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('UPDATE custom_exercises SET archived = 1 WHERE id = ?', id);
    });
  }

  async updateWorkoutNotes(id: string, notes: string): Promise<void> {
    if (notes.length > 4000) throw new Error('Workout notes exceed the supported length');
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('UPDATE workouts SET notes = ? WHERE id = ?', notes, id);
    });
  }

  async updateMovementNotes(id: string, notes: string): Promise<void> {
    if (notes.length > 2000) throw new Error('Exercise notes exceed the supported length');
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('UPDATE workout_movements SET notes = ? WHERE id = ?', notes, id);
    });
  }

  async readRoutines(): Promise<RoutineTemplate[]> {
    const rows = await this.db.getAllAsync(
      'SELECT id, name, description, created_at, updated_at FROM routine_templates ORDER BY updated_at DESC, id',
    ) as RoutineRow[];
    const movements = await this.db.getAllAsync(
      'SELECT id, routine_id, exercise_id, position, target_sets, target_reps, target_weight_kg, target_duration_seconds, target_distance_meters FROM routine_exercises ORDER BY routine_id, position',
    ) as RoutineExerciseRow[];
    const days = await this.db.getAllAsync(
      'SELECT routine_id, weekday FROM routine_weekdays ORDER BY weekday',
    ) as RoutineDayRow[];
    const exercisesByRoutine = new Map<string, RoutineExercise[]>();
    const daysByRoutine = new Map<string, number[]>();
    for (const row of movements) {
      const list = exercisesByRoutine.get(row.routine_id) ?? [];
      list.push({ id: row.id, exerciseId: row.exercise_id, sets: row.target_sets, reps: row.target_reps, weightKg: row.target_weight_kg,
        ...(row.target_duration_seconds !== null ? { durationSeconds: row.target_duration_seconds } : {}),
        ...(row.target_distance_meters !== null ? { distanceMeters: row.target_distance_meters } : {}),
      });
      exercisesByRoutine.set(row.routine_id, list);
    }
    for (const row of days) {
      const list = daysByRoutine.get(row.routine_id) ?? [];
      list.push(row.weekday);
      daysByRoutine.set(row.routine_id, list);
    }
    return rows.map((row) => ({
      id: row.id, name: row.name, description: row.description,
      createdAt: row.created_at, updatedAt: row.updated_at,
      days: daysByRoutine.get(row.id) ?? [],
      exercises: exercisesByRoutine.get(row.id) ?? [],
    }));
  }

  async saveRoutine(routine: RoutineTemplate): Promise<void> {
    validateRoutine(routine);
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        'INSERT INTO routine_templates (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, updated_at=excluded.updated_at',
        routine.id, routine.name.trim(), routine.description.trim(), routine.createdAt, routine.updatedAt,
      );
      await tx.runAsync('DELETE FROM routine_exercises WHERE routine_id = ?', routine.id);
      await tx.runAsync('DELETE FROM routine_weekdays WHERE routine_id = ?', routine.id);
      for (const [position, movement] of routine.exercises.entries()) {
        await tx.runAsync(
          'INSERT INTO routine_exercises (id, routine_id, exercise_id, position, target_sets, target_reps, target_weight_kg, target_duration_seconds, target_distance_meters) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          movement.id, routine.id, movement.exerciseId, position, movement.sets, movement.reps, movement.weightKg,
          movement.durationSeconds ?? null, movement.distanceMeters ?? null,
        );
      }
      for (const day of routine.days) {
        await tx.runAsync('INSERT INTO routine_weekdays (routine_id, weekday) VALUES (?, ?)', routine.id, day);
      }
    });
  }

  async deleteRoutine(id: string): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('DELETE FROM routine_templates WHERE id = ?', id);
    });
  }

  async upsertWorkout(workout: Workout): Promise<void> {
    // Enforce domain validity before changing persistent state.
    if (!isGymData({ version: 1, workouts: [workout], preferences: emptyGymData().preferences })) {
      throw new Error('Invalid workout cannot be saved');
    }
    await this.db.withExclusiveTransactionAsync((tx) => writeWorkout(tx, workout));
  }

  async deleteWorkout(id: string): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('DELETE FROM workouts WHERE id = ?', id);
    });
  }

  async updatePreferences(preferences: Preferences): Promise<void> {
    if (!isGymData({ version: 1, workouts: [], preferences })) throw new Error('Invalid preferences');
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        'UPDATE preferences SET weight_unit = ?, theme = ? WHERE id = 1',
        preferences.unit, preferences.theme,
      );
    });
  }

  // Import/restore operation: intentionally replaces the complete snapshot atomically.
  async replaceSnapshot(data: GymData): Promise<void> {
    if (!isGymData(data)) throw new Error('Invalid snapshot cannot be imported');
    await this.db.withExclusiveTransactionAsync((tx) => writeSnapshot(tx, data));
  }
}

async function writeWorkout(tx: SqlClient, workout: Workout): Promise<void> {
  await tx.runAsync(
    'INSERT INTO workouts(id, started_at, finished_at, notes) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET started_at=excluded.started_at, finished_at=excluded.finished_at, notes=excluded.notes',
    workout.id, workout.startedAt, workout.finishedAt, workout.notes ?? '',
  );
  // Cascade-removal ensures no stale child rows; all changes roll back together.
  await tx.runAsync('DELETE FROM workout_movements WHERE workout_id = ?', workout.id);
  for (const [mIndex, movement] of workout.movements.entries()) {
    await tx.runAsync(
      'INSERT INTO workout_movements(id, workout_id, exercise_id, position, notes, rest_seconds, superset_group) VALUES (?, ?, ?, ?, ?, ?, ?)',
      movement.id, workout.id, movement.exerciseId, mIndex, movement.notes ?? '',
      movement.restSeconds ?? 90, movement.supersetGroup ?? null,
    );
    for (const [sIndex, set] of movement.sets.entries()) {
      await tx.runAsync(
        'INSERT INTO workout_sets(id, movement_id, position, reps, weight_kg, completed, duration_seconds, distance_meters, set_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        set.id, movement.id, sIndex, set.reps, set.weightKg, set.completed ? 1 : 0,
        set.durationSeconds ?? null, set.distanceMeters ?? null, set.setType ?? 'normal',
      );
    }
  }
}

async function writeSnapshot(tx: SqlClient, data: GymData): Promise<void> {
  await tx.runAsync('DELETE FROM workouts');
  await tx.runAsync(
    'UPDATE preferences SET weight_unit = ?, theme = ? WHERE id = 1',
    data.preferences.unit, data.preferences.theme,
  );
  for (const workout of data.workouts) await writeWorkout(tx, workout);
}
