import type { Exercise, TrainingSet, Workout } from '../types/gym';
import { completedSets, totalActivitySeconds, totalDistanceMeters, totalVolumeKg } from './workouts.ts';

/** Read-only analytics over completed workouts. No synthetic sessions or stored aggregates. */
export function finishedWorkouts(workouts: readonly Workout[]): Workout[] {
  return workouts.filter(w => !!w.finishedAt && Number.isFinite(Date.parse(w.finishedAt)))
    .sort((a, b) => Date.parse(b.finishedAt!) - Date.parse(a.finishedAt!) || a.id.localeCompare(b.id));
}

export type TrainingSummary = {
  sessions: number; completedSets: number; volumeKg: number; distanceMeters: number;
  activitySeconds: number; workoutSeconds: number;
};

export function trainingSummary(workouts: readonly Workout[]): TrainingSummary {
  const sessions = finishedWorkouts(workouts);
  return sessions.reduce<TrainingSummary>((total, workout) => ({
    sessions: total.sessions + 1,
    completedSets: total.completedSets + completedSets(workout),
    volumeKg: total.volumeKg + totalVolumeKg(workout),
    distanceMeters: total.distanceMeters + totalDistanceMeters(workout),
    activitySeconds: total.activitySeconds + totalActivitySeconds(workout),
    workoutSeconds: total.workoutSeconds + Math.max(0,
      (Date.parse(workout.finishedAt!) - Date.parse(workout.startedAt)) / 1000),
  }), { sessions: 0, completedSets: 0, volumeKg: 0, distanceMeters: 0,
    activitySeconds: 0, workoutSeconds: 0 });
}

export type WeeklyTrend = {
  key: string; label: string; start: string;
  sessions: number; completedSets: number; volumeKg: number;
  distanceMeters: number; activitySeconds: number;
};

function localDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}

function mondayDayNumber(date: Date): number {
  // Date.getDay(): Sunday=0, Monday=1. Avoid millisecond subtraction across DST.
  return localDayNumber(date) - (date.getDay() + 6) % 7;
}

function dateFromDayNumber(day: number): Date {
  const utc = new Date(day * 86400000);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

function dayKey(day: number): string {
  const d = new Date(day * 86400000);
  return [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0')].join('-');
}

/** Includes zero-valued weeks, up to the present local week; future workouts are excluded. */
export function weeklyTrends(workouts: readonly Workout[], now = new Date(), weeks = 8): WeeklyTrend[] {
  if (!Number.isSafeInteger(weeks) || weeks < 1 || weeks > 52 ||
      !Number.isFinite(now.getTime())) throw new Error('Invalid weekly trend window');
  const currentMonday = mondayDayNumber(now);
  const buckets: WeeklyTrend[] = Array.from({ length: weeks }, (_, index) => {
    const firstDay = currentMonday - (weeks - index - 1) * 7;
    const localDate = dateFromDayNumber(firstDay);
    return {
      key: dayKey(firstDay),
      start: dayKey(firstDay),
      label: localDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      sessions: 0, completedSets: 0, volumeKg: 0, distanceMeters: 0, activitySeconds: 0,
    };
  });
  const first = currentMonday - (weeks - 1) * 7;
  for (const workout of finishedWorkouts(workouts)) {
    const finish = new Date(workout.finishedAt!);
    if (finish.getTime() > now.getTime()) continue;
    const day = mondayDayNumber(finish);
    const index = Math.floor((day - first) / 7);
    if (index < 0 || index >= weeks) continue;
    const bucket = buckets[index];
    bucket.sessions++;
    bucket.completedSets += completedSets(workout);
    bucket.volumeKg += totalVolumeKg(workout);
    bucket.distanceMeters += totalDistanceMeters(workout);
    bucket.activitySeconds += totalActivitySeconds(workout);
  }
  return buckets;
}

export function filterHistory(
  workouts: readonly Workout[],
  days: 30 | 90 | 'all',
  now = new Date(),
  exerciseId?: string,
): Workout[] {
  const threshold = days === 'all' ? Number.NEGATIVE_INFINITY : now.getTime() - days * 86400000;
  return finishedWorkouts(workouts).filter(w => {
    const finished = Date.parse(w.finishedAt!);
    return finished <= now.getTime() && finished >= threshold &&
      (!exerciseId || w.movements.some(m => m.exerciseId === exerciseId));
  });
}

export type ExerciseSession = {
  workoutId: string; date: string;
  sets: number; volumeKg: number;
  bestWeightKg: number; bestReps: number; distanceMeters: number;
  durationSeconds: number; bestEstimatedOneRepMaxKg: number;
};

function eligibleForStrengthPr(set: TrainingSet): boolean {
  // Warmups are logged in work volume, but excluded from performance bests.
  return set.completed && set.reps > 0 && set.setType !== 'warmup';
}

export function estimatedOneRepMaxKg(weightKg: number, reps: number): number {
  // Epley formula, only for one to ten reps. A zero-load/bodyweight set
  // does not provide enough information about external total load.
  if (!Number.isFinite(weightKg) || weightKg <= 0 ||
      !Number.isSafeInteger(reps) || reps < 1 || reps > 10) return 0;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

export function exerciseSessions(workouts: readonly Workout[], exerciseId: string): ExerciseSession[] {
  return finishedWorkouts(workouts).flatMap(workout => {
    // Import data may contain multiple movement rows for one exercise. Combine
    // them into one session, preserving all its completed sets and only one date.
    const completed = workout.movements
      .filter(movement => movement.exerciseId === exerciseId)
      .flatMap(movement => movement.sets.filter(set => set.completed));
    if (!completed.length) return [];
    const strength = completed.filter(eligibleForStrengthPr);
    return [{
      workoutId: workout.id,
      date: workout.finishedAt!,
      sets: completed.length,
      volumeKg: completed.reduce((sum, set) => sum + set.reps * set.weightKg, 0),
      bestWeightKg: strength.reduce((best, set) => Math.max(best, set.weightKg), 0),
      bestReps: strength.reduce((best, set) => Math.max(best, set.reps), 0),
      distanceMeters: completed.reduce((sum, set) => sum + (set.distanceMeters ?? 0), 0),
      durationSeconds: completed.reduce((sum, set) => sum + (set.durationSeconds ?? 0), 0),
      bestEstimatedOneRepMaxKg: strength.reduce((best, set) =>
        Math.max(best, estimatedOneRepMaxKg(set.weightKg, set.reps)), 0),
    }];
  }).reverse(); // Oldest finished session to latest.
}

export type PersonalRecord = {
  exerciseId: string;
  metric: 'weight' | 'reps' | 'estimated1rm' | 'distance' | 'duration';
  value: number; date: string; workoutId: string;
};

/** Strictly greater values are records; ties keep the earlier record. */
export function exerciseRecords(
  workouts: readonly Workout[], exerciseId: string,
  tracking: Exercise['tracking'],
): PersonalRecord[] {
  const best = new Map<PersonalRecord['metric'], PersonalRecord>();
  const sessions = finishedWorkouts(workouts).reverse();
  for (const workout of sessions) {
    for (const movement of workout.movements) {
      if (movement.exerciseId !== exerciseId) continue;
      for (const set of movement.sets) {
        if (!set.completed) continue;
        const values: Array<[PersonalRecord['metric'], number]> = [];
        if (tracking === 'reps' && eligibleForStrengthPr(set)) {
          if (set.weightKg > 0) {
            values.push(['weight', set.weightKg],
              ['estimated1rm', estimatedOneRepMaxKg(set.weightKg, set.reps)]);
          }
          values.push(['reps', set.reps]);
        }
        if (tracking === 'distance' && (set.distanceMeters ?? 0) > 0)
          values.push(['distance', set.distanceMeters!]);
        if (tracking !== 'reps' && (set.durationSeconds ?? 0) > 0)
          values.push(['duration', set.durationSeconds!]);
        for (const [metric, value] of values) {
          if (value <= 0 || (best.get(metric)?.value ?? 0) >= value) continue;
          best.set(metric, { exerciseId, metric, value, date: workout.finishedAt!, workoutId: workout.id });
        }
      }
    }
  }
  const order: PersonalRecord['metric'][] = tracking === 'reps'
    ? ['weight', 'reps', 'estimated1rm'] : tracking === 'distance'
      ? ['distance', 'duration'] : ['duration'];
  return order.flatMap(metric => best.has(metric) ? [best.get(metric)!] : []);
}

export type ExerciseHistoryOption = { id: string; sessions: number; lastUsed: string };

/** Includes archived custom exercise IDs referenced by historical workouts. */
export function exercisesInHistory(workouts: readonly Workout[]): ExerciseHistoryOption[] {
  const entries = new Map<string, ExerciseHistoryOption>();
  for (const workout of finishedWorkouts(workouts)) {
    const seen = new Set<string>();
    for (const movement of workout.movements) {
      if (!movement.sets.some(s => s.completed) || seen.has(movement.exerciseId)) continue;
      seen.add(movement.exerciseId);
      const previous = entries.get(movement.exerciseId);
      if (previous) previous.sessions++;
      else entries.set(movement.exerciseId, {
        id: movement.exerciseId, sessions: 1, lastUsed: workout.finishedAt!,
      });
    }
  }
  return [...entries.values()].sort((a, b) => b.sessions - a.sessions ||
    Date.parse(b.lastUsed) - Date.parse(a.lastUsed) || a.id.localeCompare(b.id));
}
