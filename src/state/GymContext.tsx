import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { createId } from '@/src/lib/workouts';
import type { GymData, Preferences, TrainingSet, Workout, WorkoutMovement } from '@/src/types/gym';

const STORAGE_KEY = 'gym-app:data:v1';
const DEFAULT_PREFERENCES: Preferences = { unit: 'kg', theme: 'system' };

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

function isGymData(value: unknown): value is GymData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<GymData>;
  if (data.version !== 1 || !Array.isArray(data.workouts) || !data.preferences) return false;
  if (!['kg', 'lb'].includes(data.preferences.unit)) return false;
  if (!['system', 'light', 'dark'].includes(data.preferences.theme)) return false;
  return data.workouts.every(
    (workout) =>
      typeof workout.id === 'string' &&
      typeof workout.startedAt === 'string' &&
      (workout.finishedAt === null || typeof workout.finishedAt === 'string') &&
      Array.isArray(workout.movements) &&
      workout.movements.every(
        (movement) =>
          typeof movement.id === 'string' &&
          typeof movement.exerciseId === 'string' &&
          Array.isArray(movement.sets) &&
          movement.sets.every(
            (set) =>
              typeof set.id === 'string' &&
              typeof set.reps === 'number' &&
              Number.isFinite(set.reps) &&
              typeof set.weightKg === 'number' &&
              Number.isFinite(set.weightKg) &&
              typeof set.completed === 'boolean',
          ),
      ),
  );
}

export function GymProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    let mounted = true;
    async function restore() {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!mounted) return;
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (!isGymData(parsed)) throw new Error('Invalid saved workout data');
          setWorkouts(parsed.workouts);
          setPreferences(parsed.preferences);
        }
        setReady(true);
      } catch {
        if (mounted) setError('Unable to load saved workouts. Your data has not been overwritten.');
      }
    }
    void restore();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const data: GymData = { version: 1, workouts, preferences };
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {
      setError('Unable to save changes on this device. Check available storage.');
    });
  }, [ready, workouts, preferences]);

  const startWorkout = useCallback(() => {
    const id = createId();
    setWorkouts((existing) => [
      { id, startedAt: new Date().toISOString(), finishedAt: null, movements: [] },
      ...existing,
    ]);
    return id;
  }, []);

  const addMovement = useCallback((workoutId: string, exerciseId: string) => {
    setWorkouts((existing) =>
      existing.map((workout) => {
        if (workout.id !== workoutId || workout.finishedAt) return workout;
        if (workout.movements.some((movement) => movement.exerciseId === exerciseId)) return workout;
        const movement: WorkoutMovement = {
          id: createId(),
          exerciseId,
          sets: [{ id: createId(), reps: 10, weightKg: 0, completed: false }],
        };
        return { ...workout, movements: [...workout.movements, movement] };
      }),
    );
  }, []);

  const addSet = useCallback((workoutId: string, movementId: string) => {
    setWorkouts((existing) =>
      existing.map((workout) =>
        workout.id !== workoutId || workout.finishedAt
          ? workout
          : {
              ...workout,
              movements: workout.movements.map((movement) => {
                if (movement.id !== movementId) return movement;
                const last = movement.sets[movement.sets.length - 1];
                return {
                  ...movement,
                  sets: [
                    ...movement.sets,
                    { id: createId(), reps: last?.reps ?? 10, weightKg: last?.weightKg ?? 0, completed: false },
                  ],
                };
              }),
            },
      ),
    );
  }, []);

  const updateSet = useCallback(
    (workoutId: string, movementId: string, setId: string, patch: Partial<TrainingSet>) => {
      setWorkouts((existing) =>
        existing.map((workout) =>
          workout.id !== workoutId || workout.finishedAt
            ? workout
            : {
                ...workout,
                movements: workout.movements.map((movement) =>
                  movement.id !== movementId
                    ? movement
                    : {
                        ...movement,
                        sets: movement.sets.map((set) => (set.id === setId ? { ...set, ...patch, id: set.id } : set)),
                      },
                ),
              },
        ),
      );
    },
    [],
  );

  const removeMovement = useCallback((workoutId: string, movementId: string) => {
    setWorkouts((existing) =>
      existing.map((workout) =>
        workout.id !== workoutId || workout.finishedAt
          ? workout
          : { ...workout, movements: workout.movements.filter((movement) => movement.id !== movementId) },
      ),
    );
  }, []);

  const finishWorkout = useCallback((workoutId: string) => {
    setWorkouts((existing) =>
      existing.map((workout) =>
        workout.id === workoutId && !workout.finishedAt
          ? { ...workout, finishedAt: new Date().toISOString() }
          : workout,
      ),
    );
  }, []);

  const deleteWorkout = useCallback((workoutId: string) => {
    setWorkouts((existing) => existing.filter((workout) => workout.id !== workoutId));
  }, []);

  const updatePreferences = useCallback((patch: Partial<Preferences>) => {
    setPreferences((existing) => ({ ...existing, ...patch }));
  }, []);

  return (
    <GymContext.Provider
      value={{
        ready, error, workouts, preferences, startWorkout, addMovement, addSet,
        updateSet, removeMovement, finishWorkout, deleteWorkout, updatePreferences,
      }}>
      {children}
    </GymContext.Provider>
  );
}

export function useGym(): GymContextValue {
  const value = useContext(GymContext);
  if (!value) throw new Error('useGym must be used inside GymProvider');
  return value;
}
