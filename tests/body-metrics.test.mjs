import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCalendarDate, localDateKey, measurementUnit, fromCanonical, toCanonical,
  formatMeasurement, assertMeasurement, assertGoal, measurementHistory,
  latestReading, weeklyWorkoutCount, goalProgress,
} from '../src/lib/body-metrics.ts';

const now = new Date(2026, 9, 15, 14);
const reading = (id, kind, recordedOn, value) => ({ id, kind, recordedOn, value });
const goal = (kind, startValue, targetValue) => ({
  id: 'goal:a', kind, createdOn: '2026-10-01', startValue, targetValue,
});
const session = (id, date, finished = true) => ({
  id, startedAt: new Date(2026, 9, date, 8).toISOString(),
  finishedAt: finished ? new Date(2026, 9, date, 9).toISOString() : null, movements: [],
});

test('calendar validation rejects nonexistent days, leap errors and invalid format', () => {
  assert.equal(isCalendarDate('2024-02-29'), true);
  for (const invalid of ['2026-02-29', '2026-04-31', '2026-00-12',
    '2026-12-00', '26-10-15', '2026-2-4', 'not-a-date']) assert.equal(isCalendarDate(invalid), false);
  assert.equal(localDateKey(now), '2026-10-15');
});

test('weight and circumference conversions preserve canonical values', () => {
  const weight = toCanonical(176.37, 'weight', 'lb');
  assert.ok(Math.abs(weight - 80) < 0.001);
  const inches = fromCanonical(101.6, 'waist', 'lb');
  assert.ok(Math.abs(inches - 40) < 0.000001);
  assert.ok(Math.abs(toCanonical(inches, 'waist', 'lb') - 101.6) < 0.000001);
  assert.equal(measurementUnit('weight', 'lb'), 'lb');
  assert.equal(measurementUnit('waist', 'lb'), 'in');
  assert.equal(measurementUnit('chest', 'kg'), 'cm');
  assert.ok(formatMeasurement(80, 'weight', 'kg').endsWith(' kg'));
});

test('validation excludes invalid measurements and invalid goal bounds', () => {
  assert.doesNotThrow(() => assertMeasurement(reading('body:one', 'weight', '2026-10-15', 80)));
  assert.throws(() => assertMeasurement(reading('body:one', 'weight', '2026-10-15', 0)), /Invalid/);
  assert.throws(() => assertMeasurement(reading('body:one', 'waist', '2026-10-15', 600)), /Invalid/);
  assert.throws(() => assertMeasurement(reading('body:one', 'weight', '2026-13-01', 80)), /Invalid/);
  assert.throws(() => assertGoal(goal('weekly_workouts', 0, 0)), /Weekly/);
  assert.throws(() => assertGoal(goal('weekly_workouts', 0, 1.5)), /Weekly/);
  assert.throws(() => assertGoal(goal('body_weight', 80, 900)), /Weight/);
});

test('measurement history is ordered chronologically and future entries do not affect latest reading', () => {
  const entries = [reading('body:c', 'weight', '2026-10-30', 90),
    reading('body:b', 'weight', '2026-10-14', 79),
    reading('body:a', 'weight', '2026-10-02', 82),
    reading('body:d', 'waist', '2026-10-10', 87)];
  assert.deepEqual(measurementHistory(entries, 'weight').map(e => e.value), [82, 79, 90]);
  assert.equal(latestReading(entries, 'weight', now).value, 79);
  assert.equal(latestReading(entries, 'hips', now), undefined);
  assert.equal(entries[0].id, 'body:c');
});

test('bodyweight goal progress handles decreasing, increasing, reversal and overshoot', () => {
  const decreasing = goal('body_weight', 85, 75);
  const measurements = [reading('body:now', 'weight', '2026-10-14', 80)];
  assert.equal(goalProgress(decreasing, measurements, [], now).percent, 50);
  assert.equal(goalProgress(decreasing, measurements, [], now).remaining, 5);
  assert.equal(goalProgress(decreasing, [reading('body:more', 'weight', '2026-10-14', 88)], [], now).percent, 0);
  assert.equal(goalProgress(decreasing, [reading('body:less', 'weight', '2026-10-14', 72)], [], now).percent, 100);
  assert.equal(goalProgress(decreasing, [reading('body:less', 'weight', '2026-10-14', 72)], [], now).achieved, true);
  assert.equal(goalProgress(goal('body_weight', 70, 80), [reading('body:b', 'weight', '2026-10-14', 75)], [], now).percent, 50);
  assert.equal(goalProgress(decreasing, [], [], now).currentValue, null);
});

test('weekly goal counts finished workouts in local Monday-Sunday calendar week', () => {
  const workouts = [session('monday', 12), session('wednesday', 14),
    session('prev-week', 11), session('active', 15, false),
    session('future', 23)];
  assert.equal(weeklyWorkoutCount(workouts, now), 2);
  const target = goal('weekly_workouts', 0, 3);
  assert.ok(Math.abs(goalProgress(target, [], workouts, now).percent - 66.66666666666667) < 1e-7);
  assert.equal(goalProgress(target, [], workouts, now).remaining, 1);
  assert.equal(goalProgress(target, [], [...workouts, session('thursday', 15)], now).achieved, true);
  assert.equal(goalProgress(target, [], [], now).percent, 0);
});
