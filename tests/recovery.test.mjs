import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRecovery, recoveryByDate, recoveryHistory, recoveryTrainingDays,
  summarizeRecovery, formatSleep,
} from '../src/lib/recovery.ts';

const day = (n, hour = 12) => new Date(2026, 9, n, hour).toISOString();
const entry = (id, date, extra = {}) => ({
  id, recordedOn: date, sleepMinutes: 450, sleepQuality: 4,
  energy: 3, mood: 4, soreness: 2, stress: 2, notes: '', ...extra,
});
const workout = (id, dayNum, finished = true) => ({
  id, startedAt: day(dayNum, 8), finishedAt: finished ? day(dayNum, 10) : null,
  movements: [{ id: 'm:' + id, exerciseId: 'bench-press', sets: [
    { id: 's:' + id, reps: 10, weightKg: 30, completed: true },
  ] }],
});

test('check-ins validate dates, optional ratings, notes and sleep bounds', () => {
  assert.doesNotThrow(() => validateRecovery(entry('recovery:a', '2026-10-12'), '2026-10-15'));
  assert.doesNotThrow(() => validateRecovery(entry('recovery:note', '2026-10-12', {
    sleepMinutes: null, sleepQuality: null, energy: null, mood: null, soreness: null, stress: null,
    notes: 'Rest day',
  }), '2026-10-15'));
  for (const patch of [
    { recordedOn: '2026-02-29' }, { recordedOn: '2026-10-16' },
    { sleepMinutes: 0 }, { sleepMinutes: 1441 }, { sleepMinutes: 7.5 },
    { sleepQuality: 6 }, { stress: -1 }, { mood: 2.5 },
    { energy: Number.POSITIVE_INFINITY }, { notes: 'x'.repeat(501) },
  ]) {
    assert.throws(() => validateRecovery(entry('recovery:a', '2026-10-12', patch), '2026-10-15'), /Invalid/);
  }
  assert.throws(() => validateRecovery(entry('recovery:blank', '2026-10-12', {
    sleepMinutes: null, sleepQuality: null, energy: null, mood: null, soreness: null, stress: null,
  }), '2026-10-15'), /Record sleep/);
});

test('recovery history sorting and dated lookup do not mutate input', () => {
  const records = [entry('recovery:older', '2026-10-10'), entry('recovery:newer', '2026-10-14')];
  assert.equal(recoveryByDate(records, '2026-10-14')?.id, 'recovery:newer');
  assert.deepEqual(recoveryHistory(records).map(item => item.id), ['recovery:newer', 'recovery:older']);
  assert.equal(records[0].id, 'recovery:older');
  assert.equal(formatSleep(455), '7h 35m');
});

test('calendar-aligned recovery summary counts completed workouts and excludes unfinished and future sessions', () => {
  const readings = [entry('recovery:a', '2026-10-12', { sleepMinutes: 420, energy: 2 }),
    entry('recovery:b', '2026-10-14', { sleepMinutes: 480, energy: 4 }),
    entry('recovery:c', '2026-10-15', { sleepMinutes: null, energy: null, soreness: null })];
  const history = [workout('w1', 12), workout('w2', 14), workout('w3', 14),
    workout('active', 15, false), workout('future', 24)];
  const trend = recoveryTrainingDays(readings, history, new Date(2026, 9, 15, 15));
  assert.equal(trend.length, 14);
  assert.equal(trend.at(-1).date, '2026-10-15');
  assert.equal(trend.find(day => day.date === '2026-10-14').workoutCount, 2);
  assert.equal(trend.find(day => day.date === '2026-10-14').volumeKg, 600);
  assert.equal(trend.find(day => day.date === '2026-10-14').completedSetCount, 2);
  assert.equal(trend.find(day => day.date === '2026-10-15').workoutCount, 0);
  const summary = summarizeRecovery(trend);
  assert.equal(summary.daysWithCheckins, 3);
  assert.equal(summary.daysWithSleep, 2);
  assert.equal(summary.averageSleepMinutes, 450);
  assert.equal(summary.averageEnergy, 3);
  assert.equal(summary.workoutsOnCheckinDays, 3);
});

test('missing records are not interpreted as zero quality or zero sleep', () => {
  const trend = recoveryTrainingDays([], [], new Date(2026, 9, 15), 7);
  const summary = summarizeRecovery(trend);
  assert.deepEqual(summary, {
    daysWithCheckins: 0, daysWithSleep: 0, averageSleepMinutes: null,
    averageEnergy: null, averageSoreness: null, workoutsOnCheckinDays: 0,
  });
  assert.ok(trend.every(day => day.checkin === null && day.workoutCount === 0));
  assert.throws(() => recoveryTrainingDays([], [], new Date(), 0), /Invalid/);
  assert.throws(() => recoveryTrainingDays([], [], new Date(), 91), /Invalid/);
});

test('same local completion day groups workouts independently of start day', () => {
  const w = workout('overnight', 13);
  w.startedAt = day(12, 23);
  const trend = recoveryTrainingDays([], [w], new Date(2026, 9, 15, 12), 7);
  assert.equal(trend.find(d => d.date === '2026-10-13').workoutCount, 1);
  assert.equal(trend.find(d => d.date === '2026-10-12').workoutCount, 0);
});
