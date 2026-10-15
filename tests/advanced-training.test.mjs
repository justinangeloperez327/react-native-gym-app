import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completedSets, totalVolumeKg, totalDistanceMeters, totalActivitySeconds,
  defaultSetForTracking, copySetForNewSession, formatActivityTime,
} from '../src/lib/workouts.ts';
import { isGymData } from '../src/data/legacy.ts';

function mixed() {
  return {
    version: 1, preferences: { unit: 'kg', theme: 'system' }, workouts: [{
      id: 'mixed', startedAt: '2026-10-12T10:00:00.000Z', finishedAt: null,
      movements: [
        { id: 'strength', exerciseId: 'bench-press', restSeconds: 90, supersetGroup: 'superset:a',
          sets: [{ id: 'warm', reps: 8, weightKg: 20, completed: true, setType: 'warmup' },
            { id: 'work', reps: 10, weightKg: 50, completed: true, setType: 'failure' }] },
        { id: 'run', exerciseId: 'outdoor-run', restSeconds: 0, supersetGroup: 'superset:a',
          sets: [{ id: 'cardio', reps: 0, weightKg: 0, completed: true, durationSeconds: 1200,
            distanceMeters: 3000 }] },
        { id: 'plank', exerciseId: 'plank',
          sets: [{ id: 'time', reps: 0, weightKg: 0, completed: false, durationSeconds: 45 }] },
      ],
    }],
  };
}

test('counts mixed work without treating time or distance as lifting volume', () => {
  const workout = mixed().workouts[0];
  assert.equal(completedSets(workout), 3);
  assert.equal(totalVolumeKg(workout), 8 * 20 + 10 * 50);
  assert.equal(totalDistanceMeters(workout), 3000);
  assert.equal(totalActivitySeconds(workout), 1200);
  assert.equal(formatActivityTime(83), '1:23');
  assert.equal(formatActivityTime(3700), '1:01:40');
});

test('new session sets preserve targets and type, but not completed status or IDs', () => {
  for (const tracking of ['reps', 'duration', 'distance']) {
    const starter = defaultSetForTracking(tracking);
    const copy = copySetForNewSession({ ...starter, completed: true, setType: 'drop' });
    assert.notEqual(copy.id, starter.id);
    assert.equal(copy.completed, false);
    assert.equal(copy.setType, 'drop');
    if (tracking === 'duration') assert.equal(copy.durationSeconds, 60);
    if (tracking === 'distance') assert.equal(copy.distanceMeters, 1000);
    if (tracking === 'reps') assert.equal(copy.reps, 10);
  }
});

test('expanded workout validation remains backward compatible', () => {
  assert.equal(isGymData(mixed()), true);
  const original = mixed();
  assert.equal(isGymData({ ...original, workouts: [{
    ...original.workouts[0], movements: original.workouts[0].movements.map(m => ({
      ...m, restSeconds: undefined, supersetGroup: undefined, sets: m.sets.map(s => ({
        id: s.id, reps: s.reps, weightKg: s.weightKg, completed: s.completed,
      })),
    })) }] }), true);
  for (const item of [{ restSeconds: -1 }, { restSeconds: 601 }, { supersetGroup: '' }]) {
    const bad = mixed(); Object.assign(bad.workouts[0].movements[0], item);
    assert.equal(isGymData(bad), false);
  }
});
