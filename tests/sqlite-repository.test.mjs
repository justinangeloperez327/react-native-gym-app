import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { GymRepository } from '../src/data/gym-repository.ts';
import { parseLegacy } from '../src/data/legacy.ts';

class NativeTestDatabase {
  constructor() {
    this.native = new DatabaseSync(':memory:');
    this.failOn = null;
  }

  async execAsync(sql) { this.native.exec(sql); }
  async runAsync(sql, ...values) {
    if (this.failOn && sql.includes(this.failOn)) throw new Error('Simulated disk write error');
    return this.native.prepare(sql).run(...values);
  }
  async getFirstAsync(sql, ...values) {
    return this.native.prepare(sql).get(...values) ?? null;
  }
  async getAllAsync(sql, ...values) {
    return this.native.prepare(sql).all(...values);
  }
  async withExclusiveTransactionAsync(task) {
    this.native.exec('BEGIN IMMEDIATE');
    try {
      await task(this);
      this.native.exec('COMMIT');
    } catch (error) {
      this.native.exec('ROLLBACK');
      throw error;
    }
  }
  close() { this.native.close(); }
}

function sample() {
  return {
    version: 1,
    preferences: { unit: 'lb', theme: 'dark' },
    workouts: [{
      id: 'workout-1',
      startedAt: '2026-10-12T10:00:00.000Z',
      finishedAt: null,
      movements: [{
        id: 'movement-1', exerciseId: 'bench-press',
        sets: [
          { id: 'set-1', reps: 10, weightKg: 55.5, completed: true },
          { id: 'set-2', reps: 8, weightKg: 60, completed: false },
        ],
      }],
    }],
  };
}

test('initialization creates foreign-keyed schema once and defaults', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 8);
    assert.equal((await db.getFirstAsync('PRAGMA foreign_keys')).foreign_keys, 1);
    assert.deepEqual(await repo.readSnapshot(), {
      version: 1, workouts: [], preferences: { unit: 'kg', theme: 'system' },
    });
    await repo.initialize(async () => { throw new Error('Already migrated'); });
  } finally { db.close(); }
});

test('legacy workouts migrate once and keep original data untouched', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    const raw = JSON.stringify(sample());
    await repo.initialize(async () => raw);
    assert.deepEqual(await repo.readSnapshot(), sample());
    assert.equal(
      (await db.getFirstAsync('SELECT value FROM app_metadata WHERE key = ?', 'legacy_async_storage_v1')).value,
      'imported',
    );

    // A stale AsyncStorage copy must not overwrite newer SQLite changes.
    const next = { ...sample().workouts[0], finishedAt: '2026-10-12T11:00:00.000Z' };
    await repo.upsertWorkout(next);
    await repo.initialize(async () => raw);
    assert.equal((await repo.readSnapshot()).workouts[0].finishedAt, next.finishedAt);
    assert.equal(JSON.parse(raw).workouts[0].finishedAt, null);
  } finally { db.close(); }
});

test('invalid legacy data is never discarded and the import remains retryable', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await assert.rejects(repo.initialize(async () => '{"invalid": true}'), /invalid/);
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM workouts')).n, 0);
    assert.equal(await db.getFirstAsync('SELECT value FROM app_metadata WHERE key = ?', 'legacy_async_storage_v1'), null);
    await repo.initialize(async () => JSON.stringify(sample()));
    assert.equal((await repo.readSnapshot()).workouts.length, 1);
  } finally { db.close(); }
});

test('legacy migration rolls back fully after an insert failure', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    db.failOn = 'INSERT INTO workout_sets';
    await assert.rejects(repo.initialize(async () => JSON.stringify(sample())), /Simulated/);
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM workouts')).n, 0);
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM workout_movements')).n, 0);
    assert.equal(await db.getFirstAsync('SELECT value FROM app_metadata WHERE key = ?', 'legacy_async_storage_v1'), null);
    db.failOn = null;
    await repo.initialize(async () => JSON.stringify(sample()));
    assert.deepEqual(await repo.readSnapshot(), sample());
  } finally { db.close(); }
});

test('targeted updates, cascade delete and settings are transactional', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    await repo.upsertWorkout(sample().workouts[0]);
    await repo.updatePreferences({ unit: 'lb', theme: 'dark' });
    assert.deepEqual(await repo.readSnapshot(), sample());
    db.failOn = 'INSERT INTO workout_sets';
    const modified = { ...sample().workouts[0], movements: [{
      ...sample().workouts[0].movements[0],
      sets: [{ ...sample().workouts[0].movements[0].sets[0], reps: 20 }],
    }] };
    await assert.rejects(repo.upsertWorkout(modified), /Simulated/);
    assert.deepEqual((await repo.readSnapshot()).workouts[0], sample().workouts[0]);
    db.failOn = null;
    await repo.deleteWorkout('workout-1');
    const after = await repo.readSnapshot();
    assert.equal(after.workouts.length, 0);
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM workout_movements')).n, 0);
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM workout_sets')).n, 0);
    assert.deepEqual(after.preferences, { unit: 'lb', theme: 'dark' });
  } finally { db.close(); }
});

test('snapshot replacement is atomic; invalid snapshots are rejected', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    await repo.replaceSnapshot(sample());
    assert.deepEqual(await repo.readSnapshot(), sample());
    await assert.rejects(repo.replaceSnapshot({
      ...sample(), workouts: [{ ...sample().workouts[0], startedAt: 'invalid' }],
    }), /Invalid snapshot/);
    assert.deepEqual(await repo.readSnapshot(), sample());
    db.failOn = 'INSERT INTO workout_sets';
    await assert.rejects(repo.replaceSnapshot(sample()), /Simulated/);
    assert.deepEqual(await repo.readSnapshot(), sample());
  } finally { db.close(); }
});

test('legacy validator rejects duplicate record IDs and invalid measurements', () => {
  const data = sample();
  assert.throws(() => parseLegacy(JSON.stringify({
    ...data, workouts: [...data.workouts, data.workouts[0]],
  })), /invalid/);
  assert.throws(() => parseLegacy(JSON.stringify({
    ...data, workouts: [{ ...data.workouts[0], movements: [{
      ...data.workouts[0].movements[0],
      sets: [{ id: 'set-1', reps: -2, weightKg: 22, completed: true }],
    }] }],
  })), /invalid/);
});

test('newer database schema is never downgraded', async () => {
  const db = new NativeTestDatabase();
  try {
    await db.execAsync('PRAGMA user_version = 99;');
    const repo = new GymRepository(db);
    await assert.rejects(repo.initialize(async () => null), /newer app version/);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 99);
  } finally { db.close(); }
});


test('v1 to v8 migration preserves existing workout history and preference choices', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => JSON.stringify(sample()));
    await db.execAsync('DROP INDEX idx_water_entries_day; DROP TABLE water_entries; DROP TABLE nutrition_targets; DROP TABLE meal_entries; DROP INDEX idx_foods_active_name; DROP TABLE foods; DROP TABLE fitness_goals; DROP INDEX idx_body_measurements_kind_date; DROP TABLE body_measurements; DROP TABLE routine_weekdays; DROP TABLE routine_exercises; DROP TABLE routine_templates; ALTER TABLE workout_sets DROP COLUMN set_type; ALTER TABLE workout_sets DROP COLUMN duration_seconds; ALTER TABLE workout_sets DROP COLUMN distance_meters; ALTER TABLE workout_movements DROP COLUMN superset_group; ALTER TABLE workout_movements DROP COLUMN rest_seconds; DROP INDEX idx_custom_exercises_name; DROP INDEX idx_custom_exercises_kind; DROP TABLE custom_exercises; ALTER TABLE workouts DROP COLUMN notes; ALTER TABLE workout_movements DROP COLUMN notes; PRAGMA user_version = 1;');
    await repo.initialize(async () => { throw new Error('Legacy data should not be read twice'); });
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 8);
    assert.deepEqual(await repo.readSnapshot(), sample());
    assert.deepEqual(await repo.readCustomExercises(), []);
  } finally { db.close(); }
});

test('custom exercise persists, updates and archives without mutating workout history', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    const custom = {
      id: 'custom:press', name: 'Landmine Press', muscle: 'Shoulders',
      equipment: 'Barbell', kind: 'strength', tracking: 'reps', custom: true, archived: false,
    };
    await repo.saveCustomExercise(custom);
    const w = { ...sample().workouts[0], movements: [
      { ...sample().workouts[0].movements[0], exerciseId: custom.id },
    ] };
    await repo.upsertWorkout(w);
    assert.deepEqual(await repo.readCustomExercises(), [custom]);
    await repo.saveCustomExercise({ ...custom, name: 'Landmine Shoulder Press' });
    assert.equal((await repo.readCustomExercises())[0].name, 'Landmine Shoulder Press');
    await repo.archiveCustomExercise(custom.id);
    assert.equal((await repo.readCustomExercises())[0].archived, true);
    assert.equal((await repo.readSnapshot()).workouts[0].movements[0].exerciseId, custom.id);
    await assert.rejects(
      repo.archiveCustomExercise('bench-press'), /Built-in exercises/,
    );
  } finally { db.close(); }
});

test('custom exercise unique names and rejected invalid updates do not change stored data', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    const first = {
      id: 'custom:one', name: 'Band Rotation', muscle: 'Shoulders',
      equipment: 'Resistance Band', kind: 'strength', tracking: 'reps', custom: true,
    };
    await repo.saveCustomExercise(first);
    await assert.rejects(
      repo.saveCustomExercise({ ...first, id: 'custom:two', name: 'band rotation' }),
      /UNIQUE|constraint/i,
    );
    await assert.rejects(
      repo.saveCustomExercise({ ...first, name: '' }),
      /name must contain/,
    );
    assert.equal((await repo.readCustomExercises()).length, 1);
    assert.equal((await repo.readCustomExercises())[0].name, 'Band Rotation');
  } finally { db.close(); }
});

test('failed migration to v2 rolls back version and does not delete workouts', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => JSON.stringify(sample()));
    await db.execAsync('DROP INDEX idx_water_entries_day; DROP TABLE water_entries; DROP TABLE nutrition_targets; DROP TABLE meal_entries; DROP INDEX idx_foods_active_name; DROP TABLE foods; DROP TABLE fitness_goals; DROP INDEX idx_body_measurements_kind_date; DROP TABLE body_measurements; DROP TABLE routine_weekdays; DROP TABLE routine_exercises; DROP TABLE routine_templates; DROP INDEX idx_custom_exercises_name; DROP INDEX idx_custom_exercises_kind; DROP TABLE custom_exercises; PRAGMA user_version = 1;');
    // A malformed old table causes v2's name index to fail inside its transaction.
    await db.execAsync('CREATE TABLE custom_exercises (unrelated TEXT);');
    await assert.rejects(repo.initialize(async () => null), /no such column|name/i);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 1);
    assert.deepEqual(await repo.readSnapshot(), sample());
  } finally { db.close(); }
});


test('upgrading an actual v2 database adds note fields without rewriting workout history', async () => {
  const db = new NativeTestDatabase();
  try {
    const { MIGRATION_V1, MIGRATION_V2 } = await import('../src/data/migrations.ts');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await db.execAsync(MIGRATION_V1);
    await db.execAsync(MIGRATION_V2);
    await db.runAsync('INSERT INTO workouts (id, started_at, finished_at) VALUES (?, ?, ?)',
      'old-session', '2026-10-12T08:00:00Z', null);
    await db.runAsync('INSERT INTO workout_movements (id, workout_id, exercise_id, position) VALUES (?, ?, ?, ?)',
      'old-movement', 'old-session', 'bench-press', 0);
    await db.runAsync('INSERT INTO workout_sets (id, movement_id, position, reps, weight_kg, completed) VALUES (?, ?, ?, ?, ?, ?)',
      'old-set', 'old-movement', 0, 5, 80, 1);
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    const saved = await repo.readSnapshot();
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 8);
    assert.equal(saved.workouts[0].id, 'old-session');
    assert.equal(saved.workouts[0].movements[0].sets[0].weightKg, 80);
    assert.equal(saved.workouts[0].notes, undefined);
    assert.equal(saved.workouts[0].movements[0].notes, undefined);
  } finally { db.close(); }
});

test('workout and exercise notes round-trip and survive session completion', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    const workout = {
      ...sample().workouts[0],
      notes: 'Good session, careful shoulder next time',
      movements: sample().workouts[0].movements.map((m) =>
        ({ ...m, notes: 'Controlled eccentric' })),
    };
    await repo.upsertWorkout(workout);
    assert.deepEqual((await repo.readSnapshot()).workouts[0], workout);
    const finished = { ...workout, finishedAt: '2026-10-12T10:45:00.000Z' };
    await repo.upsertWorkout(finished);
    const result = (await repo.readSnapshot()).workouts[0];
    assert.equal(result.finishedAt, finished.finishedAt);
    assert.equal(result.notes, workout.notes);
    assert.equal(result.movements[0].notes, workout.movements[0].notes);
    await assert.rejects(repo.upsertWorkout({ ...workout, notes: 'x'.repeat(4001) }), /Invalid workout/);
  } finally { db.close(); }
});

test('failed v3 migration rolls back and retains v2 schema plus existing workouts', async () => {
  const db = new NativeTestDatabase();
  try {
    const { MIGRATION_V1, MIGRATION_V2 } = await import('../src/data/migrations.ts');
    await db.execAsync(MIGRATION_V1);
    await db.execAsync(MIGRATION_V2);
    await db.execAsync("INSERT INTO workouts (id, started_at, finished_at) VALUES ('safe', '2026-10-12T10:00:00Z', NULL)");
    await db.execAsync("ALTER TABLE workouts ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
    const repo = new GymRepository(db);
    await assert.rejects(repo.initialize(async () => null), /duplicate column/i);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 2);
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM workouts')).n, 1);
    assert.equal((await db.getFirstAsync('PRAGMA table_info(workout_movements)'))?.name, 'id');
  } finally { db.close(); }
});


test('live note updates do not rewrite or reorder sets', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    await repo.upsertWorkout(sample().workouts[0]);
    await repo.updateWorkoutNotes('workout-1', 'Session note in progress.');
    await repo.updateMovementNotes('movement-1', 'Maintain control.');
    const restored = (await repo.readSnapshot()).workouts[0];
    assert.equal(restored.notes, 'Session note in progress.');
    assert.equal(restored.movements[0].notes, 'Maintain control.');
    assert.deepEqual(restored.movements[0].sets, sample().workouts[0].movements[0].sets);
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM workout_sets')).n, 2);
    await assert.rejects(repo.updateWorkoutNotes('workout-1', 'x'.repeat(4001)), /length/);
    await assert.rejects(repo.updateMovementNotes('movement-1', 'x'.repeat(2001)), /length/);
  } finally { db.close(); }
});



async function insertV3Workout(db, workout) {
  await db.runAsync(
    'INSERT INTO workouts(id, started_at, finished_at, notes) VALUES (?, ?, ?, ?)',
    workout.id, workout.startedAt, workout.finishedAt, workout.notes ?? '',
  );
  for (const [index, movement] of workout.movements.entries()) {
    await db.runAsync(
      'INSERT INTO workout_movements(id, workout_id, exercise_id, position, notes) VALUES (?, ?, ?, ?, ?)',
      movement.id, workout.id, movement.exerciseId, index, movement.notes ?? '',
    );
    for (const [setIndex, set] of movement.sets.entries()) {
      await db.runAsync(
        'INSERT INTO workout_sets(id, movement_id, position, reps, weight_kg, completed) VALUES (?, ?, ?, ?, ?, ?)',
        set.id, movement.id, setIndex, set.reps, set.weightKg, set.completed ? 1 : 0,
      );
    }
  }
}

test('v3 to v4 schema migration preserves existing workout data and preferences', async () => {
  const db = new NativeTestDatabase();
  try {
    const { MIGRATION_V1, MIGRATION_V2, MIGRATION_V3 } = await import('../src/data/migrations.ts');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await db.execAsync(MIGRATION_V1);
    await db.execAsync(MIGRATION_V2);
    await db.execAsync(MIGRATION_V3);
    const repo = new GymRepository(db);
    await insertV3Workout(db, sample().workouts[0]);
    await repo.updatePreferences(sample().preferences);
    await repo.initialize(async () => null);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 8);
    assert.deepEqual(await repo.readSnapshot(), sample());
    assert.deepEqual(await repo.readRoutines(), []);
  } finally { db.close(); }
});

test('routines and weekdays persist atomically with ordered target values', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    const routine = {
      id: 'routine:one', name: 'Full Body', description: 'Simple weekly session',
      createdAt: '2026-10-13T10:00:00Z', updatedAt: '2026-10-13T10:00:00Z',
      days: [1, 3, 5],
      exercises: [
        { id: 'routine-m1', exerciseId: 'squat', sets: 3, reps: 8, weightKg: 60 },
        { id: 'routine-m2', exerciseId: 'bench-press', sets: 4, reps: 10, weightKg: 40 },
      ],
    };
    await repo.saveRoutine(routine);
    assert.deepEqual(await repo.readRoutines(), [routine]);
    const edited = {
      ...routine, name: 'Updated Full Body', updatedAt: '2026-10-14T10:00:00Z',
      days: [0, 6], exercises: [routine.exercises[1]],
    };
    await repo.saveRoutine(edited);
    assert.deepEqual(await repo.readRoutines(), [edited]);
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM routine_exercises')).n, 1);
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM routine_weekdays')).n, 2);
  } finally { db.close(); }
});

test('failed routine save rolls back edits and schedule entirely', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    const routine = {
      id: 'routine:safe', name: 'Safe program', description: '',
      createdAt: '2026-10-13T10:00:00Z', updatedAt: '2026-10-13T10:00:00Z',
      days: [2],
      exercises: [{ id: 'routine-e1', exerciseId: 'squat', sets: 3, reps: 10, weightKg: 20 }],
    };
    await repo.saveRoutine(routine);
    db.failOn = 'INSERT INTO routine_weekdays';
    await assert.rejects(repo.saveRoutine({ ...routine, name: 'New name', days: [1, 3] }), /Simulated/);
    db.failOn = null;
    assert.deepEqual(await repo.readRoutines(), [routine]);
  } finally { db.close(); }
});

test('deleting a routine cascades schedule/exercises but never erases workout history', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    const routine = {
      id: 'routine:delete', name: 'Temporary plan', description: '',
      createdAt: '2026-10-13T10:00:00Z', updatedAt: '2026-10-13T10:00:00Z',
      days: [1, 4], exercises: [{ id: 'routine-x', exerciseId: 'bench-press', sets: 3, reps: 10, weightKg: 20 }],
    };
    await repo.saveRoutine(routine);
    await repo.upsertWorkout(sample().workouts[0]);
    await repo.deleteRoutine(routine.id);
    assert.deepEqual(await repo.readRoutines(), []);
    assert.deepEqual((await repo.readSnapshot()).workouts, sample().workouts);
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM routine_weekdays')).n, 0);
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM routine_exercises')).n, 0);
  } finally { db.close(); }
});

test('invalid routine targets and duplicate exercises do not mutate SQLite state', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    const routine = {
      id: 'routine:invalid', name: 'Invalid plan', description: '',
      createdAt: '2026-10-13T10:00:00Z', updatedAt: '2026-10-13T10:00:00Z',
      days: [1, 1], exercises: [],
    };
    await assert.rejects(repo.saveRoutine(routine), /weekly schedule/);
    await assert.rejects(repo.saveRoutine({
      ...routine, days: [], exercises: [{ id: 'a', exerciseId: 'squat', sets: 0, reps: 10, weightKg: 30 }],
    }), /exercise targets/);
    await assert.rejects(repo.saveRoutine({
      ...routine, days: [], exercises: [
        { id: 'a', exerciseId: 'squat', sets: 3, reps: 8, weightKg: 0 },
        { id: 'b', exerciseId: 'squat', sets: 4, reps: 9, weightKg: 0 },
      ],
    }), /unique/);
    assert.deepEqual(await repo.readRoutines(), []);
  } finally { db.close(); }
});


test('v4 to v5 migration retains workouts and routine targets', async () => {
  const db = new NativeTestDatabase();
  try {
    const { MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4 } = await import('../src/data/migrations.ts');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    for (const script of [MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4]) await db.execAsync(script);
    const repo = new GymRepository(db);
    await insertV3Workout(db, sample().workouts[0]);
    const original = {
      id: 'routine:prior', name: 'Existing plan', description: '',
      createdAt: '2026-10-12T10:00:00.000Z', updatedAt: '2026-10-12T10:00:00.000Z',
      days: [1], exercises: [{ id: 'routine-set', exerciseId: 'bench-press', sets: 3, reps: 10, weightKg: 30 }],
    };
    await db.runAsync('INSERT OR REPLACE INTO routine_templates(id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      original.id, original.name, original.description, original.createdAt, original.updatedAt);
    await db.runAsync('INSERT OR REPLACE INTO routine_exercises(id, routine_id, exercise_id, position, target_sets, target_reps, target_weight_kg) VALUES (?, ?, ?, ?, ?, ?, ?)',
      'routine-set', original.id, 'bench-press', 0, 3, 10, 30);
    await db.runAsync('INSERT OR IGNORE INTO routine_weekdays(routine_id, weekday) VALUES (?, ?)', original.id, 1);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 4);
    await repo.initialize(async () => null);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 8);
    assert.deepEqual((await repo.readSnapshot()).workouts, sample().workouts);
    assert.deepEqual(await repo.readRoutines(), [original]);
  } finally { db.close(); }
});

test('advanced sets, timed cardio and supersets survive SQLite round trip', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    const w = {
      ...sample().workouts[0],
      movements: [
        {
          ...sample().workouts[0].movements[0],
          restSeconds: 45, supersetGroup: 'superset:pair',
          sets: [
            { id: 'a', reps: 10, weightKg: 30, completed: true, setType: 'warmup' },
            { id: 'b', reps: 8, weightKg: 60, completed: true, setType: 'drop' },
          ],
        },
        {
          id: 'cardio-movement', exerciseId: 'outdoor-run',
          supersetGroup: 'superset:pair', restSeconds: 0,
          sets: [{
            id: 'c', reps: 0, weightKg: 0, completed: true, durationSeconds: 1350,
            distanceMeters: 3250,
          }],
        },
      ],
    };
    await repo.upsertWorkout(w);
    const actual = (await repo.readSnapshot()).workouts[0];
    assert.deepEqual(actual, w);
    await repo.upsertWorkout({ ...w, finishedAt: '2026-10-12T11:00:00.000Z' });
    assert.equal((await repo.readSnapshot()).workouts[0].movements[1].sets[0].distanceMeters, 3250);
  } finally { db.close(); }
});

test('invalid cardio durations and set types roll back without mutating data', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    await repo.upsertWorkout(sample().workouts[0]);
    const badSet = sample().workouts[0].movements[0].sets[0];
    for (const change of [{ durationSeconds: -1 }, { durationSeconds: 2.5 }, { distanceMeters: -10 },
      { distanceMeters: Number.POSITIVE_INFINITY }, { setType: 'nonsense' }]) {
      const movement = { ...sample().workouts[0].movements[0], sets: [{ ...badSet, ...change }] };
      await assert.rejects(repo.upsertWorkout({ ...sample().workouts[0], movements: [movement] }), /Invalid workout/);
    }
    assert.deepEqual((await repo.readSnapshot()).workouts[0], sample().workouts[0]);
  } finally { db.close(); }
});

test('routine distance and timed targets round trip through v5 schema', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    const routine = {
      id: 'routine:mixed', name: 'Mixed conditioning', description: '',
      createdAt: '2026-10-12T10:00:00.000Z', updatedAt: '2026-10-12T10:00:00.000Z',
      days: [2, 5], exercises: [
        { id: 'tempo', exerciseId: 'plank', sets: 3, reps: 0, weightKg: 0, durationSeconds: 50 },
        { id: 'dist', exerciseId: 'outdoor-run', sets: 1, reps: 0, weightKg: 0, distanceMeters: 5000 },
      ],
    };
    await repo.saveRoutine(routine);
    assert.deepEqual(await repo.readRoutines(), [routine]);
    await repo.saveRoutine({ ...routine, exercises: [routine.exercises[1]] });
    assert.equal((await repo.readRoutines())[0].exercises.length, 1);
  } finally { db.close(); }
});


test('v5 to v7 migration preserves workouts, routines and settings', async () => {
  const db = new NativeTestDatabase();
  try {
    const { MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4, MIGRATION_V5 } = await import('../src/data/migrations.ts');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    for (const script of [MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4, MIGRATION_V5])
      await db.execAsync(script);
    const repo = new GymRepository(db);
    await repo.upsertWorkout(sample().workouts[0]);
    await repo.updatePreferences(sample().preferences);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 5);
    await repo.initialize(async () => null);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 8);
    assert.deepEqual(await repo.readSnapshot(), sample());
    assert.deepEqual(await repo.readMeasurements(), []);
    assert.deepEqual(await repo.readGoals(), []);
    await repo.initialize(async () => { throw new Error('already initialized'); });
  } finally { db.close(); }
});

test('weight and circumference readings round trip with stable IDs and sorted dates', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    const older = { id: 'body:one', kind: 'weight', recordedOn: '2026-10-01', value: 81.5, notes: 'morning' };
    const newer = { id: 'body:two', kind: 'weight', recordedOn: '2026-10-14', value: 79.2 };
    const waist = { id: 'body:three', kind: 'waist', recordedOn: '2026-10-14', value: 89.9 };
    for (const m of [older, waist, newer]) await repo.saveMeasurement(m);
    assert.deepEqual(await repo.readMeasurements(), [newer, waist, older].sort((a, b) =>
      b.recordedOn.localeCompare(a.recordedOn) || b.id.localeCompare(a.id)));
    const updated = { ...newer, value: 78.5, notes: 'after waking' };
    await repo.saveMeasurement(updated);
    assert.equal((await repo.readMeasurements()).find(item => item.id === newer.id).value, 78.5);
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM body_measurements')).n, 3);
    await repo.deleteMeasurement(older.id);
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM body_measurements')).n, 2);
  } finally { db.close(); }
});

test('metric/date uniqueness and failed writes do not damage existing readings', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    const first = { id: 'body:a', kind: 'weight', recordedOn: '2026-10-14', value: 80 };
    await repo.saveMeasurement(first);
    await assert.rejects(repo.saveMeasurement({ ...first, id: 'body:b', value: 81 }), /UNIQUE|constraint/i);
    await assert.rejects(repo.saveMeasurement({ ...first, value: -4 }), /Invalid body measurement/);
    await assert.rejects(repo.saveMeasurement({ ...first, value: Number.POSITIVE_INFINITY }), /Invalid body measurement/);
    await assert.rejects(repo.saveMeasurement({ ...first, recordedOn: '2026-02-30' }), /Invalid body measurement/);
    await assert.rejects(repo.saveMeasurement({ ...first, notes: 'a'.repeat(501) }), /notes/);
    db.failOn = 'INSERT INTO body_measurements';
    await assert.rejects(repo.saveMeasurement({ ...first, value: 79 }), /Simulated/);
    db.failOn = null;
    assert.deepEqual(await repo.readMeasurements(), [first]);
  } finally { db.close(); }
});

test('fitness goals persist and preserve stable IDs on update', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    const weight = { id: 'goal:weight', kind: 'body_weight', createdOn: '2026-10-14',
      startValue: 85, targetValue: 77 };
    const frequency = { id: 'goal:weekly', kind: 'weekly_workouts', createdOn: '2026-10-14',
      startValue: 0, targetValue: 3 };
    await repo.saveGoal(weight);
    await repo.saveGoal(frequency);
    assert.deepEqual(await repo.readGoals(), [weight, frequency]);
    await repo.saveGoal({ ...weight, targetValue: 76 });
    assert.equal((await repo.readGoals()).find(goal => goal.kind === 'body_weight').targetValue, 76);
    await assert.rejects(repo.saveGoal({ ...weight, id: 'goal:duplicate' }), /UNIQUE|constraint/i);
    await assert.rejects(repo.saveGoal({ ...frequency, targetValue: 2.5 }), /Weekly workout goal/);
    await assert.rejects(repo.saveGoal({ ...weight, targetValue: 10 }), /Weight goal/);
    assert.equal((await repo.readGoals()).length, 2);
    await repo.deleteGoal(weight.id);
    assert.deepEqual(await repo.readGoals(), [frequency]);
  } finally { db.close(); }
});

test('v6 measurement and goal failures roll back atomically', async () => {
  const db = new NativeTestDatabase();
  try {
    const { MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4, MIGRATION_V5 } = await import('../src/data/migrations.ts');
    for (const script of [MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4, MIGRATION_V5]) await db.execAsync(script);
    // Occupy a would-be v6 index name to force a transactional failure after CREATE TABLE.
    await db.execAsync('CREATE TABLE idx_body_measurements_kind_date (id INTEGER);');
    const repo = new GymRepository(db);
    await assert.rejects(repo.initialize(async () => null), /already a table|already exists|index/i);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 5);
    assert.equal(await db.getFirstAsync(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'body_measurements'"), null);
    await db.execAsync('DROP TABLE idx_body_measurements_kind_date');
    await repo.initialize(async () => null);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 8);
  } finally { db.close(); }
});


test('v6 to v7 migration retains body readings and workout history', async () => {
  const db = new NativeTestDatabase();
  try {
    const { MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4, MIGRATION_V5, MIGRATION_V6 } =
      await import('../src/data/migrations.ts');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    for (const script of [MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4, MIGRATION_V5, MIGRATION_V6])
      await db.execAsync(script);
    const repo = new GymRepository(db);
    await repo.upsertWorkout(sample().workouts[0]);
    const weight = { id: 'body:old', kind: 'weight', recordedOn: '2026-10-12', value: 80 };
    await repo.saveMeasurement(weight);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 6);
    await repo.initialize(async () => null);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 8);
    assert.deepEqual((await repo.readSnapshot()).workouts, sample().workouts);
    assert.deepEqual(await repo.readMeasurements(), [weight]);
    assert.deepEqual(await repo.readFoods(), []);
    assert.deepEqual(await repo.readMeals(), []);
    await repo.initialize(async () => { throw Error('Old key read twice'); });
  } finally { db.close(); }
});

test('foods save, edit and archive without changing historical meal snapshots', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    const food = { id: 'food:yogurt', name: 'Plain Yogurt', brand: 'A',
      servingGrams: 150, caloriesPerServing: 110, proteinPerServing: 9,
      carbsPerServing: 12, fatPerServing: 4, archived: false };
    await repo.saveFood(food);
    const snapshot = { id: 'meal:one', eatenOn: '2026-10-12', mealType: 'breakfast',
      quantity: 1.5, foodId: food.id, foodName: food.name, foodBrand: food.brand,
      servingGrams: food.servingGrams, caloriesPerServing: food.caloriesPerServing,
      proteinPerServing: food.proteinPerServing, carbsPerServing: food.carbsPerServing,
      fatPerServing: food.fatPerServing };
    await repo.saveMeal(snapshot);
    await repo.saveFood({ ...food, name: 'Renamed Yogurt', caloriesPerServing: 140 });
    await repo.archiveFood(food.id);
    assert.equal((await repo.readFoods())[0].archived, true);
    assert.deepEqual(await repo.readMeals(), [snapshot]);
    await repo.saveMeal({ ...snapshot, quantity: 2 });
    assert.equal((await repo.readMeals())[0].caloriesPerServing, 110);
    assert.equal((await repo.readMeals())[0].quantity, 2);
    await repo.deleteMeal(snapshot.id);
    assert.deepEqual(await repo.readMeals(), []);
    assert.equal((await repo.readFoods()).length, 1);
  } finally { db.close(); }
});

test('meal log supports dates, meal categories and multiple entries per day', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    const template = { id: 'meal:a', eatenOn: '2026-10-13', mealType: 'breakfast',
      quantity: 1, foodId: 'food:x', foodName: 'Personal Food', foodBrand: '',
      servingGrams: 100, caloriesPerServing: 200, proteinPerServing: 0,
      carbsPerServing: 0, fatPerServing: 0 };
    await repo.saveMeal(template);
    await repo.saveMeal({ ...template, id: 'meal:b', mealType: 'dinner', quantity: 0.5 });
    await repo.saveMeal({ ...template, id: 'meal:c', eatenOn: '2026-10-12' });
    const meals = await repo.readMeals();
    assert.equal(meals.length, 3);
    assert.deepEqual(meals.map(m => m.id), ['meal:a', 'meal:b', 'meal:c']);
  } finally { db.close(); }
});

test('invalid meal and food writes do not corrupt saved data', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    const food = { id: 'food:a', name: 'Custom Porridge', brand: '',
      servingGrams: 100, caloriesPerServing: 80, proteinPerServing: 4,
      carbsPerServing: 14, fatPerServing: 1, archived: false };
    await repo.saveFood(food);
    await assert.rejects(repo.saveFood({ ...food, caloriesPerServing: -5 }), /Invalid food/);
    await assert.rejects(repo.saveFood({ ...food, name: '' }), /Invalid food/);
    const meal = { id: 'meal:a', eatenOn: '2026-10-12', mealType: 'lunch',
      quantity: 1, foodId: food.id, foodName: food.name, foodBrand: '',
      servingGrams: 100, caloriesPerServing: 80,
      proteinPerServing: 4, carbsPerServing: 14, fatPerServing: 1 };
    await repo.saveMeal(meal);
    for (const patch of [{ quantity: 0 }, { quantity: 100 }, { mealType: 'midnight' },
      { eatenOn: '2026-02-30' }, { caloriesPerServing: -1 }, { eatenOn: '2099-01-01' }]) {
      await assert.rejects(repo.saveMeal({ ...meal, ...patch }), /Invalid meal/);
    }
    db.failOn = 'INSERT INTO meal_entries';
    await assert.rejects(repo.saveMeal({ ...meal, quantity: 2 }), /Simulated/);
    db.failOn = null;
    assert.deepEqual(await repo.readMeals(), [meal]);
    assert.deepEqual(await repo.readFoods(), [food]);
  } finally { db.close(); }
});

test('v7 migration failure rolls back tables and schema version', async () => {
  const db = new NativeTestDatabase();
  try {
    const { MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4, MIGRATION_V5, MIGRATION_V6 } =
      await import('../src/data/migrations.ts');
    for (const script of [MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4, MIGRATION_V5, MIGRATION_V6])
      await db.execAsync(script);
    await db.execAsync('CREATE TABLE idx_foods_active_name (x TEXT);');
    const repo = new GymRepository(db);
    await assert.rejects(repo.initialize(async () => null), /already a table|already exists|index/i);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 6);
    assert.equal(await db.getFirstAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='foods'"), null);
    await db.execAsync('DROP TABLE idx_foods_active_name');
    await repo.initialize(async () => null);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 8);
  } finally { db.close(); }
});


test('upgrading v7 to v8 retains foods, meals, workouts and body records', async () => {
  const db = new NativeTestDatabase();
  try {
    const { MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4,
      MIGRATION_V5, MIGRATION_V6, MIGRATION_V7 } = await import('../src/data/migrations.ts');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    for (const script of [MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4,
      MIGRATION_V5, MIGRATION_V6, MIGRATION_V7]) await db.execAsync(script);
    const repo = new GymRepository(db);
    await repo.upsertWorkout(sample().workouts[0]);
    const food = { id: 'food:prior', name: 'Previous food', brand: '',
      servingGrams: 100, caloriesPerServing: 120, proteinPerServing: 8,
      carbsPerServing: 10, fatPerServing: 4, archived: false };
    const meal = { id: 'meal:prior', eatenOn: '2026-10-12', mealType: 'lunch', quantity: 1,
      foodId: food.id, foodName: food.name, foodBrand: food.brand,
      servingGrams: food.servingGrams, caloriesPerServing: food.caloriesPerServing,
      proteinPerServing: food.proteinPerServing, carbsPerServing: food.carbsPerServing,
      fatPerServing: food.fatPerServing };
    await repo.saveFood(food);
    await repo.saveMeal(meal);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 7);
    await repo.initialize(async () => null);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 8);
    assert.deepEqual((await repo.readSnapshot()).workouts, sample().workouts);
    assert.deepEqual(await repo.readFoods(), [food]);
    assert.deepEqual(await repo.readMeals(), [meal]);
    assert.deepEqual(await repo.readWaterEntries(), []);
    assert.equal(await repo.readNutritionTargets(), null);
  } finally { db.close(); }
});

test('optional nutrition targets save, update, clear and reject invalid values', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    assert.equal(await repo.readNutritionTargets(), null);
    const targets = { calories: 2100, proteinGrams: 125, carbsGrams: 230,
      fatGrams: null, waterMl: 2200 };
    await repo.saveNutritionTargets(targets);
    assert.deepEqual(await repo.readNutritionTargets(), targets);
    const next = { ...targets, calories: null, fatGrams: 60 };
    await repo.saveNutritionTargets(next);
    assert.deepEqual(await repo.readNutritionTargets(), next);
    for (const patch of [{ calories: -1 }, { proteinGrams: Infinity },
      { fatGrams: NaN }, { waterMl: 0 }, { carbsGrams: 10000 }]) {
      await assert.rejects(repo.saveNutritionTargets({ ...targets, ...patch }), /Invalid nutrition target/);
    }
    db.failOn = 'INSERT INTO nutrition_targets';
    await assert.rejects(repo.saveNutritionTargets(targets), /Simulated/);
    db.failOn = null;
    assert.deepEqual(await repo.readNutritionTargets(), next);
    await repo.clearNutritionTargets();
    assert.equal(await repo.readNutritionTargets(), null);
  } finally { db.close(); }
});

test('water entries persist by date and can be edited or deleted independently', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    const a = { id: 'water:one', recordedOn: '2026-10-13', amountMl: 250 };
    const b = { id: 'water:two', recordedOn: '2026-10-14', amountMl: 500 };
    const c = { id: 'water:three', recordedOn: '2026-10-14', amountMl: 300 };
    for (const value of [a, b, c]) await repo.saveWaterEntry(value);
    assert.deepEqual(await repo.readWaterEntries(), [b, c, a]);
    await repo.saveWaterEntry({ ...a, amountMl: 450 });
    assert.equal((await repo.readWaterEntries()).find(e => e.id === a.id).amountMl, 450);
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM water_entries')).n, 3);
    await repo.deleteWaterEntry(b.id);
    assert.deepEqual((await repo.readWaterEntries()).map(e => e.id), ['water:three', 'water:one']);
  } finally { db.close(); }
});

test('invalid water amounts and transactional failures preserve valid history', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => null);
    const entry = { id: 'water:valid', recordedOn: '2026-10-12', amountMl: 250 };
    await repo.saveWaterEntry(entry);
    for (const patch of [{ amountMl: 0 }, { amountMl: -1 }, { amountMl: 5001 },
      { amountMl: Infinity }, { recordedOn: '2026-02-30' }, { recordedOn: '2099-01-01' }]) {
      await assert.rejects(repo.saveWaterEntry({ ...entry, ...patch }), /Invalid water/);
    }
    db.failOn = 'INSERT INTO water_entries';
    await assert.rejects(repo.saveWaterEntry({ ...entry, amountMl: 350 }), /Simulated/);
    db.failOn = null;
    assert.deepEqual(await repo.readWaterEntries(), [entry]);
  } finally { db.close(); }
});

test('v8 migration rolls back when a table/index name collides', async () => {
  const db = new NativeTestDatabase();
  try {
    const { MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4,
      MIGRATION_V5, MIGRATION_V6, MIGRATION_V7 } = await import('../src/data/migrations.ts');
    for (const script of [MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4,
      MIGRATION_V5, MIGRATION_V6, MIGRATION_V7]) await db.execAsync(script);
    await db.execAsync('CREATE TABLE idx_water_entries_day (id INTEGER);');
    const repo = new GymRepository(db);
    await assert.rejects(repo.initialize(async () => null), /already a table|already exists|index/i);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 7);
    assert.equal(await db.getFirstAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='nutrition_targets'"), null);
    await db.execAsync('DROP TABLE idx_water_entries_day');
    await repo.initialize(async () => null);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 8);
  } finally { db.close(); }
});
