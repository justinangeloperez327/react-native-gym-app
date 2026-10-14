import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEEKDAYS, buildStarterRoutine, createRoutineTemplate,
  duplicateRoutineTemplate, routineToWorkout, validateRoutine,
} from '../src/data/routines.ts';

test('starter plans provide realistic weekly schedules and unique exercise IDs', () => {
  assert.equal(WEEKDAYS.length, 7);
  for (const key of ['full-body', 'upper-body', 'lower-body']) {
    const value = buildStarterRoutine(key);
    assert.doesNotThrow(() => validateRoutine(value));
    assert.ok(value.exercises.length >= 3);
    assert.ok(value.days.length >= 2);
  }
  assert.throws(() => buildStarterRoutine('unknown'), /Unknown/);
});

test('routine duplication creates independent IDs and does not copy schedule', () => {
  const original = buildStarterRoutine('full-body');
  const duplicated = duplicateRoutineTemplate(original);
  assert.notEqual(original.id, duplicated.id);
  assert.deepEqual(duplicated.days, []);
  assert.deepEqual(duplicated.exercises.map(m => m.exerciseId), original.exercises.map(m => m.exerciseId));
  assert.ok(duplicated.exercises.every((m, i) => m.id !== original.exercises[i].id));
  duplicated.exercises[0].reps = 30;
  assert.notEqual(original.exercises[0].reps, 30);
});

test('launching a routine creates fresh incomplete workout sets', () => {
  const routine = buildStarterRoutine('upper-body');
  const first = routineToWorkout(routine);
  const second = routineToWorkout(routine);
  assert.notEqual(first.id, second.id);
  assert.equal(first.finishedAt, null);
  assert.deepEqual(first.movements.map(m => m.exerciseId), routine.exercises.map(m => m.exerciseId));
  assert.ok(first.movements.flatMap(m => m.sets).every(s => !s.completed));
  assert.equal(first.movements[0].sets.length, routine.exercises[0].sets);
  assert.equal(first.movements[0].sets[0].reps, routine.exercises[0].reps);
  assert.equal(first.movements[0].sets[0].weightKg, routine.exercises[0].weightKg);
  const identifiers = first.movements.flatMap(m => [m.id, ...m.sets.map(s => s.id)]);
  assert.equal(new Set(identifiers).size, identifiers.length);
  assert.notEqual(first.movements[0].sets[0].id, second.movements[0].sets[0].id);
  assert.deepEqual(routine.exercises.map(m => m.sets), buildStarterRoutine('upper-body').exercises.map(m => m.sets));
});

test('empty routines cannot start sessions; validation rejects invalid weekdays', () => {
  const routine = createRoutineTemplate('New plan');
  assert.throws(() => routineToWorkout(routine), /Add exercises/);
  assert.throws(() => validateRoutine({ ...routine, days: [7] }), /weekly schedule/);
});
