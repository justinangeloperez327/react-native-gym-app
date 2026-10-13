import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { openGymRepository } from '@/src/data/sqlite-native';
import { emptyGymData, LEGACY_KEY } from '@/src/data/legacy';
import type { GymRepository } from '@/src/data/gym-repository';
import { createId } from '@/src/lib/workouts';
import type { GymData, Preferences, TrainingSet, Workout, WorkoutMovement } from '@/src/types/gym';

type GymContextValue = {
  ready: boolean;
  error: string | null;
  workouts: Workout[];
  preferences: Preferences;
  startWorkout: () => string;
  addMovement: (workoutId: string, exerciseId: string) => void;
  addSet: (workoutId: string, movementId: string) => void;
  updateSet: (workoutId: string, movementId: string, setId: string, patch: Partial<TrainingSet>) => void;
  removeMovement: (workoutId: string, movementId: string) => void;
  finishWorkout: (workoutId: string) => void;
  deleteWorkout: (workoutId: string) => void;
  updatePreferences: (patch: Partial<Preferences>) => void;
};

const GymContext = createContext<GymContextValue | null>(null);
const SAVE_ERROR = 'Unable to save changes to SQLite. Your latest edits may exist only in memory. Check device storage.';

/**
 * Keep synchronous UI action signatures for the existing screens. Mutations
 * update an in-memory snapshot immediately and enqueue targeted SQLite writes.
 * Serializing writes prevents a stale asynchronous save overwriting a newer one.
 */
export function GymProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GymData>(emptyGymData);
  const latestRef = useRef<GymData>(data);
  const repositoryRef = useRef<GymRepository | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    async function restore() {
      try {
        const repository = await openGymRepository();
        await repository.initialize(() => AsyncStorage.getItem(LEGACY_KEY));
        const restored = await repository.readSnapshot();
        if (!mountedRef.current) return;
        repositoryRef.current = repository;
        latestRef.current = restored;
        setData(restored);
        setReady(true);
      } catch (cause) {
        if (!mountedRef.current) return;
        const reason = cause instanceof Error ? cause.message : 'Unknown database error';
        // Stay on the fatal-error screen instead of treating an import failure
        // as a brand-new, empty database. Existing data is never overwritten.
        setError('Could not open your training data: ' + reason);
      }
    }
    void restore();
    return () => { mountedRef.current = false; };
  }, []);

  const persist = useCallback((operation: (repo: GymRepository) => Promise<void>) => {
    const repository = repositoryRef.current;
    if (!repository) return;
    queueRef.current = queueRef.current
      .then(() => operation(repository))
      .then(() => {
        if (mountedRef.current) setError(null);
      })
      .catch(() => {
        if (mountedRef.current) setError(SAVE_ERROR);
      });
  }, []);

  const applyWorkout = useCallback((id: string, operation: (workout: Workout) => Workout) => {
    const current = latestRef.current;
    const index = current.workouts.findIndex((workout) => workout.id === id);
    if (index < 0) return;
    const previous = current.workouts[index];
    const next = operation(previous);
    if (next === previous) return;
    const workouts = current.workouts.slice();
    workouts[index] = next;
    const snapshot: GymData = { ...current, workouts };
    latestRef.current = snapshot;
    setData(snapshot);
    persist((repo) => repo.upsertWorkout(next));
  }, [persist]);

  const startWorkout = useCallback(() => {
    const id = createId();
    const workout: Workout = {
      id, startedAt: new Date().toISOString(), finishedAt: null, movements: [],
    };
    const snapshot: GymData = {
      ...latestRef.current, workouts: [workout, ...latestRef.current.workouts],
    };
    latestRef.current = snapshot;
    setData(snapshot);
    persist((repo) => repo.upsertWorkout(workout));
    return id;
  }, [persist]);

  const addMovement = useCallback((workoutId: string, exerciseId: string) => {
    applyWorkout(workoutId, (workout) => {
      if (workout.finishedAt || workout.movements.some((m) => m.exerciseId === exerciseId)) return workout;
      const movement: WorkoutMovement = {
        id: createId(), exerciseId,
        sets: [{ id: createId(), reps: 10, weightKg: 0, completed: false }],
      };
      return { ...workout, movements: [...workout.movements, movement] };
    });
  }, [applyWorkout]);

  const addSet = useCallback((workoutId: string, movementId: string) => {
    applyWorkout(workoutId, (workout) => {
      if (workout.finishedAt || !workout.movements.some((m) => m.id === movementId)) return workout;
      return {
        ...workout,
        movements: workout.movements.map((movement) => {
          if (movement.id !== movementId) return movement;
          const previous = movement.sets[movement.sets.length - 1];
          return {
            ...movement,
            sets: [...movement.sets, {
              id: createId(), reps: previous?.reps ?? 10,
              weightKg: previous?.weightKg ?? 0, completed: false,
            }],
          };
        }),
      };
    });
  }, [applyWorkout]);

  const updateSet = useCallback((workoutId: string, movementId: string, setId: string, patch: Partial<TrainingSet>) => {
    applyWorkout(workoutId, (workout) => {
      if (workout.finishedAt || !workout.movements.some((m) =>
        m.id === movementId && m.sets.some((s) => s.id === setId))) return workout;
      return {
        ...workout,
        movements: workout.movements.map((movement) => movement.id !== movementId
          ? movement
          : {
              ...movement,
              sets: movement.sets.map((set) => set.id === setId
                ? { ...set, ...patch, id: set.id }
                : set),
            }),
      };
    });
  }, [applyWorkout]);

  const removeMovement = useCallback((workoutId: string, movementId: string) => {
    applyWorkout(workoutId, (workout) => {
      if (workout.finishedAt || !workout.movements.some((m) => m.id === movementId)) return workout;
      return { ...workout, movements: workout.movements.filter((m) => m.id !== movementId) };
    });
  }, [applyWorkout]);

  const finishWorkout = useCallback((workoutId: string) => {
    applyWorkout(workoutId, (workout) => workout.finishedAt
      ? workout
      : { ...workout, finishedAt: new Date().toISOString() });
  }, [applyWorkout]);

  const deleteWorkout = useCallback((workoutId: string) => {
    const current = latestRef.current;
    if (!current.workouts.some((workout) => workout.id === workoutId)) return;
    const snapshot: GymData = {
      ...current, workouts: current.workouts.filter((workout) => workout.id !== workoutId),
    };
    latestRef.current = snapshot;
    setData(snapshot);
    persist((repo) => repo.deleteWorkout(workoutId));
  }, [persist]);

  const updatePreferences = useCallback((patch: Partial<Preferences>) => {
    const snapshot: GymData = {
      ...latestRef.current,
      preferences: { ...latestRef.current.preferences, ...patch },
    };
    latestRef.current = snapshot;
    setData(snapshot);
    persist((repo) => repo.updatePreferences(snapshot.preferences));
  }, [persist]);

  return (
    <GymContext.Provider value={{
      ready, error, workouts: data.workouts, preferences: data.preferences,
      startWorkout, addMovement, addSet, updateSet, removeMovement,
      finishWorkout, deleteWorkout, updatePreferences,
    }}>
      {children}
    </GymContext.Provider>
  );
}

export function useGym(): GymContextValue {
  const context = useContext(GymContext);
  if (!context) throw new Error('useGym must be used inside GymProvider');
  return context;
}
