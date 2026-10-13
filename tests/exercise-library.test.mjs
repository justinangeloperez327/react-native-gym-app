import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXERCISES, getExercise, findExercise, activeExercises, searchExercises,
  canLogRepetitions, normalizeExerciseInput, hasExerciseName,
} from '../src/data/exercises.ts';

test('built-in catalog IDs are unique and historical exercise IDs remain stable', () => {
  assert.ok(EXERCISES.length >= 30);
  assert.equal(new Set(EXERCISES.map((e) => e.id)).size, EXERCISES.length);
  assert.equal(getExercise('bench-press')?.name, 'Barbell Bench Press');
  assert.equal(getExercise('plank')?.tracking, 'duration');
  assert.equal(getExercise('treadmill-run')?.kind, 'cardio');
  assert.ok(EXERCISES.some((e) => e.kind === 'bodyweight'));
  assert.ok(EXERCISES.every((e) => e.name && e.muscle && e.equipment && e.kind && e.tracking));
});

test('search filters work across name, equipment, kind, and muscle group', () => {
  const results = searchExercises(EXERCISES, { kind: 'strength', muscle: 'Chest', query: 'barbell' });
  assert.ok(results.some((e) => e.id === 'bench-press'));
  assert.ok(results.every((e) => e.kind === 'strength' && e.muscle === 'Chest'));
  assert.ok(searchExercises(EXERCISES, { equipment: 'Bicycle' }).some((e) => e.id === 'cycling'));
  assert.ok(searchExercises(EXERCISES, { query: 'pool' }).some((e) => e.id === 'swimming'));
});

test('custom exercises are searchable; archiving hides them but allows historical lookups', () => {
  const custom = [
    { id: 'custom:a', name: 'My Home Row', muscle: 'Back', equipment: 'Band', kind: 'strength', tracking: 'reps', custom: true },
    { id: 'custom:b', name: 'Older Lift', muscle: 'Legs', equipment: 'Barbell', kind: 'strength', tracking: 'reps', custom: true, archived: true },
  ];
  const active = activeExercises(custom);
  assert.ok(searchExercises(active, { query: 'home' }).some((e) => e.id === 'custom:a'));
  assert.equal(active.some((e) => e.id === 'custom:b'), false);
  assert.equal(findExercise('custom:b', custom)?.name, 'Older Lift');
  assert.equal(canLogRepetitions(custom[0]), true);
  assert.equal(canLogRepetitions(getExercise('plank')), false);
  assert.equal(canLogRepetitions(getExercise('cycling')), false);
});

test('custom exercise inputs are normalized and invalid values rejected', () => {
  const input = {
    name: '  My   Press  ', muscle: 'Shoulders', equipment: '  Cable  ',
    kind: 'strength', tracking: 'reps',
  };
  assert.equal(normalizeExerciseInput(input).name, 'My Press');
  assert.equal(normalizeExerciseInput(input).equipment, 'Cable');
  assert.throws(() => normalizeExerciseInput({ ...input, name: ' ' }), /name/);
  assert.throws(() => normalizeExerciseInput({ ...input, kind: 'cardio', tracking: 'reps' }), /Cardio/);
  assert.throws(() => normalizeExerciseInput({ ...input, equipment: '' }), /Equipment/);
  assert.equal(hasExerciseName('BARBELL BENCH PRESS', []), true);
  assert.equal(hasExerciseName('my press', [{ ...input, id: 'custom:a', name: 'My Press' }]), true);
  assert.equal(hasExerciseName('my press', [{ ...input, id: 'custom:a', name: 'My Press' }], 'custom:a'), false);
});
