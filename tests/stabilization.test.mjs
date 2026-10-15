import test from 'node:test';
import assert from 'node:assert/strict';
import { finishedWorkouts, filterHistory, weeklyTrends, trainingSummary,
  exercisesInHistory, exerciseSessions } from '../src/lib/analytics.ts';
import { validateBackup, parseBackup, serializeBackup } from '../src/data/backup.ts';

function manySessions(count) {
  const start = new Date(2026, 0, 1, 10, 0, 0);
  return Array.from({ length: count }, (_, index) => {
    const timestamp = new Date(start.getTime() + index * 2 * 3600000).toISOString();
    return {
      id: 'stress-workout-' + index, startedAt: timestamp, finishedAt: timestamp,
      movements: Array.from({ length: 3 }, (_, m) => ({
        id: 'stress-movement-' + index + '-' + m,
        exerciseId: 'exercise-stress-' + m,
        sets: Array.from({ length: 5 }, (_, s) => ({
          id: 'stress-set-' + index + '-' + m + '-' + s,
          reps: 8 + s, weightKg: 25 + s, completed: s !== 4,
        })),
      })),
    };
  });
}

test('large training history analytics are deterministic without mutating records', () => {
  const workouts = manySessions(400);
  const before = workouts.map(w => w.id);
  const completed = finishedWorkouts(workouts);
  assert.equal(completed.length, 400);
  assert.equal(completed[0].id, 'stress-workout-399');
  const summary = trainingSummary(workouts);
  assert.equal(summary.sessions, 400);
  assert.equal(summary.completedSets, 4800);
  assert.equal(exercisesInHistory(workouts).length, 3);
  assert.equal(exerciseSessions(workouts, 'exercise-stress-0').length, 400);
  assert.deepEqual(workouts.map(w => w.id), before);
  assert.equal(filterHistory(workouts, 'all', new Date(2026, 10, 15)).length, 400);
  const now = new Date(2026, 0, 25, 12);
  const expected = workouts.filter(workout => Date.parse(workout.finishedAt) <= now.getTime()).length;
  assert.equal(weeklyTrends(workouts, now, 8).reduce((s, w) => s + w.sessions, 0), expected);
});

test('stress-history JSON backup round trip retains all set IDs and latest entry', () => {
  const workouts = manySessions(100);
  const payload = {
    format: 'react-native-gym-app-backup', version: 1,
    createdAt: '2026-10-15T10:00:00.000Z',
    snapshot: { version: 1, preferences: { unit: 'kg', theme: 'system' }, workouts },
    customExercises: [], routines: [], measurements: [], goals: [], foods: [], meals: [],
    nutritionTargets: null, waterEntries: [], recoveryEntries: [],
  };
  assert.equal(validateBackup(payload).snapshot.workouts.length, 100);
  const output = parseBackup(serializeBackup(payload));
  assert.equal(output.snapshot.workouts.length, 100);
  assert.equal(output.snapshot.workouts[99].movements[2].sets[4].id, 'stress-set-99-2-4');
});
