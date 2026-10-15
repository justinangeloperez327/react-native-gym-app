import type { Workout, TrainingSet, WeightUnit } from '@/src/types/gym';

export function createId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function completedSets(workout: Workout): number {
  return workout.movements.reduce(
    (total, movement) => total + movement.sets.filter((set) => set.completed).length,
    0,
  );
}

export function totalVolumeKg(workout: Workout): number {
  return workout.movements.reduce(
    (total, movement) =>
      total +
      movement.sets.reduce(
        (sum, set) => sum + (set.completed ? set.weightKg * set.reps : 0),
        0,
      ),
    0,
  );
}

const LB_PER_KG = 2.2046226218;

export function toDisplayWeight(weightKg: number, unit: WeightUnit): number {
  return unit === 'lb' ? weightKg * LB_PER_KG : weightKg;
}

export function toKg(weight: number, unit: WeightUnit): number {
  return unit === 'lb' ? weight / LB_PER_KG : weight;
}

export function formatWeight(weightKg: number, unit: WeightUnit): string {
  return toDisplayWeight(weightKg, unit).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  }) + ' ' + unit;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDuration(workout: Workout): string {
  const end = workout.finishedAt ? Date.parse(workout.finishedAt) : Date.now();
  const minutes = Math.max(0, Math.floor((end - Date.parse(workout.startedAt)) / 60000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? hours + 'h ' + (minutes % 60) + 'm' : minutes + 'm';
}

// Historic performance never uses a currently active workout. The reference
// is the latest *finished* session that began before the selected workout.
export function previousCompletedSets(
  workouts: readonly Workout[], currentWorkout: Workout, exerciseId: string,
): TrainingSet[] {
  const previous = workouts
    .filter((workout) =>
      workout.id !== currentWorkout.id &&
      !!workout.finishedAt &&
      Date.parse(workout.startedAt) < Date.parse(currentWorkout.startedAt) &&
      workout.movements.some((movement) => movement.exerciseId === exerciseId))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
  return previous?.movements.find((movement) => movement.exerciseId === exerciseId)
    ?.sets.filter((set) => set.completed).map((set) => ({ ...set })) ?? [];
}

export function completedWorkoutCount(workouts: readonly Workout[]): number {
  return workouts.filter((workout) => !!workout.finishedAt).length;
}

export function totalDistanceMeters(workout: Workout): number {
  return workout.movements.reduce((sum, m) => sum +
    m.sets.reduce((n, s) => n + (s.completed ? (s.distanceMeters ?? 0) : 0), 0), 0);
}

export function totalActivitySeconds(workout: Workout): number {
  return workout.movements.reduce((sum, m) => sum +
    m.sets.reduce((n, s) => n + (s.completed ? (s.durationSeconds ?? 0) : 0), 0), 0);
}

export function formatActivityTime(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(value / 3600);
  const mm = Math.floor((value % 3600) / 60);
  const ss = value % 60;
  return hh ? String(hh) + ':' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0')
    : String(mm) + ':' + String(ss).padStart(2, '0');
}

export function defaultSetForTracking(tracking: 'reps' | 'duration' | 'distance'): TrainingSet {
  return {
    id: createId(), reps: tracking === 'reps' ? 10 : 0, weightKg: 0, completed: false,
    ...(tracking === 'duration' ? { durationSeconds: 60 } : {}),
    ...(tracking === 'distance' ? { distanceMeters: 1000 } : {}),
  };
}

export function copySetForNewSession(set: TrainingSet): TrainingSet {
  return { ...set, id: createId(), completed: false };
}
