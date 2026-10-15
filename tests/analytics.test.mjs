import test from 'node:test';
import assert from 'node:assert/strict';
import {
  finishedWorkouts, trainingSummary, weeklyTrends, filterHistory,
  estimatedOneRepMaxKg, exerciseSessions, exerciseRecords, exercisesInHistory,
} from '../src/lib/analytics.ts';

const date = (day, hour = 12) => new Date(2026, 9, day, hour).toISOString();
function workout(id, day, movements, finished = true) {
  return { id, startedAt: date(day, 9), finishedAt: finished ? date(day, 10) : null, movements };
}
function movement(id, exerciseId, sets) {
  return { id, exerciseId, sets };
}
function set(id, values = {}) {
  return { id, reps: 10, weightKg: 50, completed: true, ...values };
}
const samples = [
  workout('old', 3, [
    movement('a', 'bench-press', [
      set('old-warmup', { reps: 20, weightKg: 100, setType: 'warmup' }),
      set('old-working', { reps: 8, weightKg: 70 }),
      set('uncompleted', { reps: 1, weightKg: 300, completed: false }),
    ]),
    movement('b', 'outdoor-run', [
      set('old-run', { reps: 0, weightKg: 0, distanceMeters: 2500, durationSeconds: 1000 }),
    ]),
  ]),
  workout('new', 12, [
    movement('c', 'bench-press', [
      set('new-working', { reps: 8, weightKg: 80 }),
      set('new-drop', { reps: 12, weightKg: 55, setType: 'drop' }),
    ]),
    movement('d', 'outdoor-run', [
      set('new-run', { reps: 0, weightKg: 0, distanceMeters: 3800, durationSeconds: 1500 }),
    ]),
  ]),
  workout('active', 14, [
    movement('e', 'bench-press', [
      set('active-big', { reps: 1, weightKg: 400 }),
    ]),
  ], false),
];

test('history sorts completed workouts without mutating source order', () => {
  const original = [...samples].reverse();
  const done = finishedWorkouts(original);
  assert.deepEqual(done.map(w => w.id), ['new', 'old']);
  assert.deepEqual(original.map(w => w.id), ['active', 'new', 'old']);
});

test('summary excludes active and unfinished sets; distance/time separate from volume', () => {
  const summary = trainingSummary(samples);
  assert.equal(summary.sessions, 2);
  assert.equal(summary.completedSets, 6);
  assert.equal(summary.volumeKg, 20 * 100 + 8 * 70 + 8 * 80 + 12 * 55);
  assert.equal(summary.distanceMeters, 6300);
  assert.equal(summary.activitySeconds, 2500);
  assert.equal(summary.workoutSeconds, 7200);
});

test('weekly trend includes exactly eight local Monday buckets including zeros', () => {
  const now = new Date(2026, 9, 15, 13);
  const original = [...samples, workout('future', 25, [movement('f', 'bench-press', [set('future')])])];
  const buckets = weeklyTrends(original, now);
  assert.equal(buckets.length, 8);
  assert.equal(buckets[7].key, '2026-10-12');
  assert.equal(buckets[6].key, '2026-10-05');
  assert.equal(buckets[5].key, '2026-09-28');
  assert.equal(buckets[7].sessions, 1);
  assert.equal(buckets[6].sessions, 0);
  assert.equal(buckets[5].sessions, 1);
  assert.equal(buckets.reduce((n, bucket) => n + bucket.sessions, 0), 2);
  assert.equal(buckets[7].distanceMeters, 3800);
  assert.equal(buckets[7].volumeKg, 8 * 80 + 12 * 55);
});

test('filter history handles 30/90/all day windows, future dates and exercise IDs', () => {
  const now = new Date(2026, 9, 15, 13);
  const prior = workout('old-history', 3, [movement('old-x', 'squat', [set('old-s')])]);
  prior.finishedAt = new Date(2026, 7, 1, 13).toISOString();
  assert.deepEqual(filterHistory([...samples, prior], 30, now).map(w => w.id), ['new', 'old']);
  assert.equal(filterHistory([...samples, prior], 90, now).length, 3);
  assert.equal(filterHistory([...samples, prior], 'all', now).length, 3);
  assert.deepEqual(filterHistory([...samples, prior], 30, now, 'outdoor-run').map(w => w.id), ['new', 'old']);
  assert.deepEqual(filterHistory([...samples, prior], 30, now, 'squat'), []);
});

test('exercise progression is chronological and only uses completed sets in finished sessions', () => {
  const details = exerciseSessions(samples, 'bench-press');
  assert.deepEqual(details.map(s => s.workoutId), ['old', 'new']);
  assert.deepEqual(details.map(s => s.bestWeightKg), [70, 80]);
  assert.deepEqual(details.map(s => s.bestReps), [8, 12]);
  assert.equal(details[0].sets, 2);
  assert.equal(details[1].volumeKg, 8 * 80 + 12 * 55);
  assert.ok(details[1].bestEstimatedOneRepMaxKg > details[0].bestEstimatedOneRepMaxKg);
});

test('strength records ignore warmups, incomplete sessions and ties, and cap 1RM to ten reps', () => {
  const records = exerciseRecords(samples, 'bench-press', 'reps');
  assert.deepEqual(records.map(r => r.metric), ['weight', 'reps', 'estimated1rm']);
  assert.equal(records.find(r => r.metric === 'weight').value, 80);
  assert.equal(records.find(r => r.metric === 'reps').value, 12);
  assert.ok(records.find(r => r.metric === 'estimated1rm').value > 100);
  assert.equal(estimatedOneRepMaxKg(100, 1), 100);
  assert.equal(estimatedOneRepMaxKg(50, 8), 50 * (1 + 8 / 30));
  assert.equal(estimatedOneRepMaxKg(50, 11), 0);
  assert.equal(estimatedOneRepMaxKg(0, 8), 0);
  const old = workout('first', 2, [movement('f', 'squat', [set('1', { weightKg: 70 })])]);
  const newOne = workout('later', 12, [movement('l', 'squat', [set('2', { weightKg: 70 })])]);
  assert.equal(exerciseRecords([newOne, old], 'squat', 'reps').find(r => r.metric === 'weight').workoutId, 'first');
});

test('cardio records include distance and duration but not lifting weight', () => {
  const records = exerciseRecords(samples, 'outdoor-run', 'distance');
  assert.deepEqual(records.map(r => r.metric), ['distance', 'duration']);
  assert.equal(records.find(r => r.metric === 'distance').value, 3800);
  assert.equal(records.find(r => r.metric === 'duration').value, 1500);
  assert.deepEqual(exerciseRecords(samples, 'plank', 'duration'), []);
});

test('archived or missing catalog entries are still found from exercise IDs in history', () => {
  const withCustom = workout('custom-finish', 13, [
    movement('custom-m', 'custom:archived', [set('custom-s')]),
  ]);
  const used = exercisesInHistory([...samples, withCustom]);
  assert.equal(used.find(e => e.id === 'custom:archived').sessions, 1);
  assert.equal(used.find(e => e.id === 'bench-press').sessions, 2);
  assert.equal(used.find(e => e.id === 'outdoor-run').sessions, 2);
  assert.ok(!used.some(e => e.id === 'not-logged'));
});

test('an empty history yields no fabricated records or sessions', () => {
  assert.deepEqual(finishedWorkouts([]), []);
  assert.deepEqual(exerciseSessions([], 'bench-press'), []);
  assert.deepEqual(exerciseRecords([], 'bench-press', 'reps'), []);
  assert.deepEqual(exercisesInHistory([]), []);
  assert.ok(weeklyTrends([], new Date(2026, 9, 15)).every(b => b.sessions === 0));
  assert.throws(() => weeklyTrends([], new Date(), 0), /Invalid/);
  assert.throws(() => weeklyTrends([], new Date(), 53), /Invalid/);
});


test('multiple movement rows for the same exercise in an imported workout count as one session', () => {
  const imported = workout('legacy-duplicates', 11, [
    movement('first-copy', 'bench-press', [set('first', { reps: 5, weightKg: 90 })]),
    movement('second-copy', 'bench-press', [set('second', { reps: 8, weightKg: 75 })]),
  ]);
  const sessions = exerciseSessions([imported], 'bench-press');
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sets, 2);
  assert.equal(sessions[0].bestWeightKg, 90);
  assert.equal(sessions[0].volumeKg, 5 * 90 + 8 * 75);
  assert.equal(exercisesInHistory([imported]).find(entry => entry.id === 'bench-press').sessions, 1);
});
