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
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 2);
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


test('v1 to v2 migration preserves existing workout history and preference choices', async () => {
  const db = new NativeTestDatabase();
  try {
    const repo = new GymRepository(db);
    await repo.initialize(async () => JSON.stringify(sample()));
    await db.execAsync('DROP INDEX idx_custom_exercises_name; DROP INDEX idx_custom_exercises_kind; DROP TABLE custom_exercises; PRAGMA user_version = 1;');
    await repo.initialize(async () => { throw new Error('Legacy data should not be read twice'); });
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 2);
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
    await db.execAsync('DROP INDEX idx_custom_exercises_name; DROP INDEX idx_custom_exercises_kind; DROP TABLE custom_exercises; PRAGMA user_version = 1;');
    // A malformed old table causes v2's name index to fail inside its transaction.
    await db.execAsync('CREATE TABLE custom_exercises (unrelated TEXT);');
    await assert.rejects(repo.initialize(async () => null), /no such column|name/i);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 1);
    assert.deepEqual(await repo.readSnapshot(), sample());
  } finally { db.close(); }
});
