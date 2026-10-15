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
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 5);
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


test('v1 to v5 migration preserves existing workout history and preference choices', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => JSON.stringify(sample()));
    await db.execAsync('DROP TABLE routine_weekdays; DROP TABLE routine_exercises; DROP TABLE routine_templates; ALTER TABLE workout_sets DROP COLUMN set_type; ALTER TABLE workout_sets DROP COLUMN duration_seconds; ALTER TABLE workout_sets DROP COLUMN distance_meters; ALTER TABLE workout_movements DROP COLUMN superset_group; ALTER TABLE workout_movements DROP COLUMN rest_seconds; DROP INDEX idx_custom_exercises_name; DROP INDEX idx_custom_exercises_kind; DROP TABLE custom_exercises; ALTER TABLE workouts DROP COLUMN notes; ALTER TABLE workout_movements DROP COLUMN notes; PRAGMA user_version = 1;');
    await repo.initialize(async () => { throw new Error('Legacy data should not be read twice'); });
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 5);
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
    await db.execAsync('DROP TABLE routine_weekdays; DROP TABLE routine_exercises; DROP TABLE routine_templates; DROP INDEX idx_custom_exercises_name; DROP INDEX idx_custom_exercises_kind; DROP TABLE custom_exercises; PRAGMA user_version = 1;');
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
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 5);
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


test('v3 to v4 schema migration preserves existing workout data and preferences', async () => {
  const db = new NativeTestDatabase();
  try {
    const { MIGRATION_V1, MIGRATION_V2, MIGRATION_V3 } = await import('../src/data/migrations.ts');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await db.execAsync(MIGRATION_V1);
    await db.execAsync(MIGRATION_V2);
    await db.execAsync(MIGRATION_V3);
    const repo = new GymRepository(db);
    await repo.upsertWorkout(sample().workouts[0]);
    await repo.updatePreferences(sample().preferences);
    await repo.initialize(async () => null);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 5);
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
    await repo.upsertWorkout(sample().workouts[0]);
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
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 5);
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
