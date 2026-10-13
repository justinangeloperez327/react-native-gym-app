import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { openGymRepository } from '@/src/data/sqlite-native';
import { canLogRepetitions, findExercise, hasExerciseName, normalizeExerciseInput } from '@/src/data/exercises';
import { emptyGymData, LEGACY_KEY } from '@/src/data/legacy';
import type { GymRepository } from '@/src/data/gym-repository';
import { createId, previousCompletedSets } from '@/src/lib/workouts';
import type { Exercise, ExerciseInput, GymData, Preferences, TrainingSet, Workout, WorkoutMovement } from '@/src/types/gym';

type GymContextValue = {
  ready: boolean;
  error: string | null;
  saveStatus: 'saved' | 'saving' | 'error';
  retrySave: () => Promise<void>;
  workouts: Workout[];
  preferences: Preferences;
  customExercises: Exercise[];
  createCustomExercise: (input: ExerciseInput) => Promise<Exercise>;
  updateCustomExercise: (id: string, input: ExerciseInput) => Promise<void>;
  archiveCustomExercise: (id: string) => Promise<void>;
  startWorkout: () => Promise<string>;
  setWorkoutNotes: (workoutId: string, notes: string) => void;
  setMovementNotes: (workoutId: string, movementId: string, notes: string) => void;
  removeSet: (workoutId: string, movementId: string, setId: string) => void;
  copyPreviousSets: (workoutId: string, movementId: string) => void;
  addMovement: (workoutId: string, exerciseId: string) => void;
  addSet: (workoutId: string, movementId: string) => void;
  updateSet: (workoutId: string, movementId: string, setId: string, patch: Partial<TrainingSet>) => void;
  removeMovement: (workoutId: string, movementId: string) => void;
  finishWorkout: (workoutId: string) => Promise<void>;
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
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [data, setData] = useState<GymData>(emptyGymData);
  const [customExercises, setCustomExercises] = useState<Exercise[]>([]);
  const customRef = useRef<Exercise[]>([]);
  const latestRef = useRef<GymData>(data);
  const repositoryRef = useRef<GymRepository | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const failedRef = useRef(false);
  const revisionRef = useRef(0);
  const repairedThroughRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    async function restore() {
      try {
        const repository = await openGymRepository();
        await repository.initialize(() => AsyncStorage.getItem(LEGACY_KEY));
        const restored = await repository.readSnapshot();
        const savedExercises = await repository.readCustomExercises();
        if (!mountedRef.current) return;
        repositoryRef.current = repository;
        latestRef.current = restored;
        setData(restored);
        customRef.current = savedExercises;
        setCustomExercises(savedExercises);
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

  const queueOptimistic = useCallback((operation: (repo: GymRepository) => Promise<void>) => {
    const repo = repositoryRef.current;
    if (!repo) return;
    const revision = ++revisionRef.current;
    if (!failedRef.current && mountedRef.current) setSaveStatus('saving');

    // On failure, the next queued write first restores the full authoritative
    // in-memory snapshot. Operations already included in that repair are skipped.
    const task = queueRef.current.then(async () => {
      if (failedRef.current) {
        await repo.replaceSnapshot(latestRef.current);
        repairedThroughRef.current = revisionRef.current;
        failedRef.current = false;
      }
      if (revision > repairedThroughRef.current) await operation(repo);
    });
    queueRef.current = task.then(() => {
      if (mountedRef.current && !failedRef.current && revision === revisionRef.current) {
        setSaveStatus('saved');
        setError(null);
      }
    }, () => {
      failedRef.current = true;
      if (mountedRef.current) {
        setSaveStatus('error');
        setError(SAVE_ERROR);
      }
    });
  }, []);

  const retrySave = useCallback(async (): Promise<void> => {
    const repo = repositoryRef.current;
    if (!repo) throw new Error('Workout database is unavailable');
    const revision = ++revisionRef.current;
    if (mountedRef.current) setSaveStatus('saving');
    const task = queueRef.current.then(() => repo.replaceSnapshot(latestRef.current));
    queueRef.current = task.then(() => {
      failedRef.current = false;
      repairedThroughRef.current = revision;
      if (mountedRef.current) {
        setSaveStatus('saved');
        setError(null);
      }
    }, () => {
      failedRef.current = true;
      if (mountedRef.current) {
        setSaveStatus('error');
        setError(SAVE_ERROR);
      }
    });
    await task;
  }, []);

  const flushChanges = useCallback(async (): Promise<void> => {
    await queueRef.current;
    if (failedRef.current) await retrySave();
    if (failedRef.current) throw new Error(SAVE_ERROR);
  }, [retrySave]);

  // Navigation is blocked on these writes: a session should not appear to have
  // started or finished until its corresponding SQLite transaction succeeds.
  const commitConfirmed = useCallback(async (operation: (repo: GymRepository) => Promise<void>) => {
    const repo = repositoryRef.current;
    if (!repo) throw new Error('Workout database is unavailable');
    await flushChanges();
    if (mountedRef.current) setSaveStatus('saving');
    const task = queueRef.current.then(() => operation(repo));
    queueRef.current = task.then(() => {
      if (mountedRef.current) {
        setSaveStatus('saved');
        setError(null);
      }
    }, () => {
      if (mountedRef.current) {
        setSaveStatus('error');
        setError(SAVE_ERROR);
      }
    });
    await task;
  }, [flushChanges]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        // Best-effort flush; the OS may still terminate the process immediately.
        void flushChanges().catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [flushChanges]);

  // Custom exercise edits are only reflected in UI after durable confirmation.
  const commitExercise = useCallback(async (operation: (repo: GymRepository) => Promise<void>) => {
    await commitConfirmed(operation);
  }, [commitConfirmed]);

  const createCustomExercise = useCallback(async (input: ExerciseInput): Promise<Exercise> => {
    const normalized = normalizeExerciseInput(input);
    if (hasExerciseName(normalized.name, customRef.current)) {
      throw new Error('An exercise with this name already exists.');
    }
    const exercise: Exercise = { ...normalized, id: 'custom:' + createId(), custom: true, archived: false };
    await commitExercise((repo) => repo.saveCustomExercise(exercise));
    const next = [...customRef.current, exercise];
    customRef.current = next;
    setCustomExercises(next);
    return exercise;
  }, [commitExercise]);

  const updateCustomExercise = useCallback(async (id: string, input: ExerciseInput): Promise<void> => {
    const existing = customRef.current.find((exercise) => exercise.id === id);
    if (!existing || existing.archived) throw new Error('Custom exercise unavailable.');
    const normalized = normalizeExerciseInput(input);
    if (hasExerciseName(normalized.name, customRef.current, id)) {
      throw new Error('An exercise with this name already exists.');
    }
    const exercise = { ...existing, ...normalized };
    await commitExercise((repo) => repo.saveCustomExercise(exercise));
    const next = customRef.current.map((entry) => entry.id === id ? exercise : entry);
    customRef.current = next;
    setCustomExercises(next);
  }, [commitExercise]);

  const archiveCustomExercise = useCallback(async (id: string): Promise<void> => {
    const existing = customRef.current.find((exercise) => exercise.id === id);
    if (!existing || existing.archived) throw new Error('Custom exercise unavailable.');
    await commitExercise((repo) => repo.archiveCustomExercise(id));
    const next = customRef.current.map((entry) =>
      entry.id === id ? { ...entry, archived: true } : entry);
    customRef.current = next;
    setCustomExercises(next);
  }, [commitExercise]);

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
    queueOptimistic((repo) => repo.upsertWorkout(next));
  }, [queueOptimistic]);

  const startWorkout = useCallback(async (): Promise<string> => {
    const id = createId();
    const workout: Workout = {
      id, startedAt: new Date().toISOString(), finishedAt: null, movements: [],
    };
    await commitConfirmed((repo) => repo.upsertWorkout(workout));
    const snapshot: GymData = {
      ...latestRef.current, workouts: [workout, ...latestRef.current.workouts],
    };
    latestRef.current = snapshot;
    setData(snapshot);
    return id;
  }, [commitConfirmed]);

  const addMovement = useCallback((workoutId: string, exerciseId: string) => {
    const exercise = findExercise(exerciseId, customRef.current);
    if (!exercise || exercise.archived || !canLogRepetitions(exercise)) return;
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

  const removeSet = useCallback((workoutId: string, movementId: string, setId: string) => {
    applyWorkout(workoutId, (workout) => {
      if (workout.finishedAt) return workout;
      return {
        ...workout, movements: workout.movements.map((movement) =>
          movement.id === movementId
            ? { ...movement, sets: movement.sets.filter((set) => set.id !== setId) }
            : movement),
      };
    });
  }, [applyWorkout]);

  const copyPreviousSets = useCallback((workoutId: string, movementId: string) => {
    const current = latestRef.current;
    const workout = current.workouts.find((w) => w.id === workoutId);
    const movement = workout?.movements.find((m) => m.id === movementId);
    if (!workout || !movement || workout.finishedAt) return;
    const prior = previousCompletedSets(current.workouts, workout, movement.exerciseId);
    if (!prior.length) return;
    applyWorkout(workoutId, (existing) => ({
      ...existing,
      movements: existing.movements.map((item) => item.id === movementId
        ? { ...item, sets: prior.map((set) => ({
            id: createId(), reps: set.reps, weightKg: set.weightKg, completed: false,
          })) }
        : item),
    }));
  }, [applyWorkout]);

  const setWorkoutNotes = useCallback((workoutId: string, notes: string) => {
    applyWorkout(workoutId, (workout) => {
      if (workout.finishedAt || (workout.notes ?? '') === notes) return workout;
      return { ...workout, notes: notes.slice(0, 4000) };
    });
  }, [applyWorkout]);

  const setMovementNotes = useCallback((workoutId: string, movementId: string, notes: string) => {
    applyWorkout(workoutId, (workout) => {
      if (workout.finishedAt) return workout;
      if (!workout.movements.some((m) => m.id === movementId && (m.notes ?? '') !== notes)) return workout;
      return { ...workout, movements: workout.movements.map((m) => m.id === movementId
        ? { ...m, notes: notes.slice(0, 2000) }
        : m) };
    });
  }, [applyWorkout]);

  const removeMovement = useCallback((workoutId: string, movementId: string) => {
    applyWorkout(workoutId, (workout) => {
      if (workout.finishedAt || !workout.movements.some((m) => m.id === movementId)) return workout;
      return { ...workout, movements: workout.movements.filter((m) => m.id !== movementId) };
    });
  }, [applyWorkout]);

  const finishWorkout = useCallback(async (workoutId: string): Promise<void> => {
    const selected = latestRef.current.workouts.find((workout) => workout.id === workoutId);
    if (!selected || selected.finishedAt) return;
    const finished: Workout = { ...selected, finishedAt: new Date().toISOString() };
    await commitConfirmed((repo) => repo.upsertWorkout(finished));
    const snapshot: GymData = {
      ...latestRef.current,
      workouts: latestRef.current.workouts.map((w) => w.id === workoutId ? finished : w),
    };
    latestRef.current = snapshot;
    setData(snapshot);
  }, [commitConfirmed]);

  const deleteWorkout = useCallback((workoutId: string) => {
    const current = latestRef.current;
    if (!current.workouts.some((workout) => workout.id === workoutId)) return;
    const snapshot: GymData = {
      ...current, workouts: current.workouts.filter((workout) => workout.id !== workoutId),
    };
    latestRef.current = snapshot;
    setData(snapshot);
    queueOptimistic((repo) => repo.deleteWorkout(workoutId));
  }, [queueOptimistic]);

  const updatePreferences = useCallback((patch: Partial<Preferences>) => {
    const snapshot: GymData = {
      ...latestRef.current,
      preferences: { ...latestRef.current.preferences, ...patch },
    };
    latestRef.current = snapshot;
    setData(snapshot);
    queueOptimistic((repo) => repo.updatePreferences(snapshot.preferences));
  }, [queueOptimistic]);

  return (
    <GymContext.Provider value={{
      ready, error, saveStatus, retrySave, workouts: data.workouts, preferences: data.preferences,
      customExercises, createCustomExercise, updateCustomExercise, archiveCustomExercise,
      startWorkout, addMovement, addSet, removeSet, copyPreviousSets,
      setWorkoutNotes, setMovementNotes, updateSet, removeMovement,
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
