import type { GymData, Preferences, Workout } from '../types/gym';

export const LEGACY_KEY = 'gym-app:data:v1';
export const DEFAULT_PREFERENCES: Preferences = { unit: 'kg', theme: 'system' };

export function emptyGymData(): GymData {
  return { version: 1, workouts: [], preferences: { ...DEFAULT_PREFERENCES } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isGymData(value: unknown): value is GymData {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.workouts)) return false;
  const prefs = value.preferences;
  if (!isRecord(prefs) || (prefs.unit !== 'kg' && prefs.unit !== 'lb') ||
    !['system', 'light', 'dark'].includes(String(prefs.theme))) return false;
  const workoutIds = new Set<string>();
  const movementIds = new Set<string>();
  const setIds = new Set<string>();
  return value.workouts.every((workout: unknown) => {
    if (!isRecord(workout) || typeof workout.id !== 'string' || !workout.id ||
      workoutIds.has(workout.id) || typeof workout.startedAt !== 'string' ||
      !Number.isFinite(Date.parse(workout.startedAt)) ||
      (workout.finishedAt !== null && (typeof workout.finishedAt !== 'string' ||
        !Number.isFinite(Date.parse(workout.finishedAt)))) ||
      !Array.isArray(workout.movements) ||
      (workout.notes !== undefined && (typeof workout.notes !== 'string' || workout.notes.length > 4000))) return false;
    workoutIds.add(workout.id);
    return workout.movements.every((movement: unknown) => {
      if (!isRecord(movement) || typeof movement.id !== 'string' || !movement.id ||
        movementIds.has(movement.id) || typeof movement.exerciseId !== 'string' ||
        !movement.exerciseId || !Array.isArray(movement.sets) ||
      (movement.notes !== undefined && (typeof movement.notes !== 'string' || movement.notes.length > 2000)) ||
      (movement.restSeconds !== undefined && (!Number.isSafeInteger(movement.restSeconds) || (movement.restSeconds as number) < 0 || (movement.restSeconds as number) > 600)) ||
      (movement.supersetGroup !== undefined && (typeof movement.supersetGroup !== 'string' || !movement.supersetGroup || movement.supersetGroup.length > 80))) return false;
      movementIds.add(movement.id);
      return movement.sets.every((set: unknown) => {
        if (!isRecord(set) || typeof set.id !== 'string' || !set.id ||
          setIds.has(set.id) || typeof set.reps !== 'number' ||
          !Number.isSafeInteger(set.reps) || set.reps < 0 ||
          typeof set.weightKg !== 'number' || !Number.isFinite(set.weightKg) ||
          set.weightKg < 0 || typeof set.completed !== 'boolean' ||
          (set.durationSeconds !== undefined && (!Number.isSafeInteger(set.durationSeconds) || (set.durationSeconds as number) < 0 || (set.durationSeconds as number) > 86400)) ||
          (set.distanceMeters !== undefined && (typeof set.distanceMeters !== 'number' || !Number.isFinite(set.distanceMeters) || set.distanceMeters < 0 || set.distanceMeters > 1000000)) ||
          (set.setType !== undefined && !['normal','warmup','drop','failure'].includes(String(set.setType)))) return false;
        setIds.add(set.id);
        return true;
      });
    });
  });
}

export function parseLegacy(raw: string): GymData {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Legacy workout data is not valid JSON. The original copy was not modified.');
  }
  if (!isGymData(value)) {
    throw new Error('Legacy workout data is invalid. The original copy was not modified.');
  }
  return value;
}

export function cloneGymData(data: GymData): GymData {
  return {
    version: 1,
    preferences: { ...data.preferences },
    workouts: data.workouts.map((w: Workout) => ({
      ...w,
      movements: w.movements.map((m) => ({
        ...m, sets: m.sets.map((s) => ({ ...s })),
      })),
    })),
  };
}
