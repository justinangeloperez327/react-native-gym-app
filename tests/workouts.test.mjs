import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completedSets, totalVolumeKg, toDisplayWeight, toKg, formatWeight,
  formatDuration, formatDate, createId,
} from '../src/lib/workouts.ts';
import { EXERCISES, getExercise } from '../src/data/exercises.ts';

const workout = {
  id: 'workout-test',
  startedAt: '2026-10-12T10:00:00.000Z',
  finishedAt: '2026-10-12T10:45:00.000Z',
  movements: [
    {
      id: 'movement-1',
      exerciseId: 'bench-press',
      sets: [
        { id: 'set-1', reps: 10, weightKg: 50, completed: true },
        { id: 'set-2', reps: 8, weightKg: 60, completed: true },
        { id: 'set-3', reps: 6, weightKg: 70, completed: false },
      ],
    },
    {
      id: 'movement-2',
      exerciseId: 'lat-pulldown',
      sets: [{ id: 'set-4', reps: 12, weightKg: 40, completed: true }],
    },
  ],
};

test('counts only completed sets', () => {
  assert.equal(completedSets(workout), 3);
  assert.equal(completedSets({ ...workout, movements: [] }), 0);
});

test('total volume excludes incomplete sets', () => {
  assert.equal(totalVolumeKg(workout), 10 * 50 + 8 * 60 + 12 * 40);
  assert.equal(totalVolumeKg({ ...workout, movements: [] }), 0);
});

test('converts kilograms and pounds without changing stored kilograms', () => {
  assert.equal(toDisplayWeight(45, 'kg'), 45);
  assert.ok(Math.abs(toDisplayWeight(1, 'lb') - 2.2046226218) < 1e-10);
  assert.ok(Math.abs(toKg(toDisplayWeight(77, 'lb'), 'lb') - 77) < 1e-9);
  assert.equal(toKg(35, 'kg'), 35);
  assert.match(formatWeight(50, 'lb'), /lb$/);
});

test('formats completed workout duration', () => {
  assert.equal(formatDuration(workout), '45m');
  assert.equal(
    formatDuration({ ...workout, finishedAt: '2026-10-12T11:15:00.000Z' }),
    '1h 15m',
  );
  assert.ok(formatDate(workout.startedAt).length > 0);
});

test('created ids are distinct and non-empty', () => {
  const ids = new Set(Array.from({ length: 100 }, createId));
  assert.equal(ids.size, 100);
  assert.ok([...ids].every((id) => typeof id === 'string' && id.length > 0));
});

test('exercise catalog has unique ids and resolves exercises', () => {
  assert.ok(EXERCISES.length > 0);
  assert.equal(new Set(EXERCISES.map((item) => item.id)).size, EXERCISES.length);
  assert.equal(getExercise('bench-press')?.name, 'Barbell Bench Press');
  assert.equal(getExercise('does-not-exist'), undefined);
});
