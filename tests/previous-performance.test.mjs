import test from 'node:test';
import assert from 'node:assert/strict';
import { previousCompletedSets } from '../src/lib/workouts.ts';

function workout(id, start, finished, exerciseId = 'bench-press', sets = []) {
  return { id, startedAt: start, finishedAt: finished, movements: [
    { id: 'movement-' + id, exerciseId, sets },
  ] };
}
const date = (day) => '2026-10-' + day + 'T10:00:00.000Z';
const complete = (day) => '2026-10-' + day + 'T10:45:00.000Z';

test('previous performance selects the most recent completed earlier session', () => {
  const first = workout('first', date('01'), complete('01'), 'bench-press', [
    { id: 'a', reps: 10, weightKg: 40, completed: true },
  ]);
  const second = workout('second', date('08'), complete('08'), 'bench-press', [
    { id: 'b', reps: 8, weightKg: 55, completed: true },
    { id: 'c', reps: 7, weightKg: 60, completed: false },
  ]);
  const active = workout('active', date('13'), null, 'bench-press');
  const future = workout('future', date('20'), complete('20'), 'bench-press', [
    { id: 'd', reps: 3, weightKg: 80, completed: true },
  ]);
  const result = previousCompletedSets([first, future, active, second], active, 'bench-press');
  assert.deepEqual(result.map((s) => s.reps), [8]);
  result[0].reps = 999;
  assert.equal(second.movements[0].sets[0].reps, 8, 'previous history must not be mutable through the result');
});

test('active, future, and unrelated workouts are excluded', () => {
  const active = workout('active', date('13'), null);
  const anotherActive = workout('ongoing', date('12'), null, 'bench-press', [
    { id: 'x', reps: 8, weightKg: 80, completed: true },
  ]);
  const unrelated = workout('other', date('11'), complete('11'), 'squat', [
    { id: 'y', reps: 9, weightKg: 50, completed: true },
  ]);
  assert.deepEqual(previousCompletedSets([active, anotherActive, unrelated], active, 'bench-press'), []);
});

test('no completed sets in the latest matching session returns an empty reference', () => {
  const active = workout('active', date('13'), null);
  const old = workout('old', date('10'), complete('10'), 'bench-press', [
    { id: 's', reps: 8, weightKg: 50, completed: false },
  ]);
  assert.deepEqual(previousCompletedSets([old, active], active, 'bench-press'), []);
});
