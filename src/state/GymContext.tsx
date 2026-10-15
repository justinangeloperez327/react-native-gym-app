import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { openGymRepository } from '@/src/data/sqlite-native';
import { findExercise, hasExerciseName, normalizeExerciseInput } from '@/src/data/exercises';
import { emptyGymData, LEGACY_KEY } from '@/src/data/legacy';
import type { GymRepository } from '@/src/data/gym-repository';
import { createId, previousCompletedSets, defaultSetForTracking, copySetForNewSession } from '@/src/lib/workouts';
import { buildStarterRoutine, createRoutineTemplate, duplicateRoutineTemplate, routineToWorkout, validateRoutine } from '@/src/data/routines';
import type { Exercise, ExerciseInput, GymData, Preferences, TrainingSet, Workout, WorkoutMovement, RoutineTemplate, BodyMeasurement, FitnessGoal, FoodItem, MealEntry, NutritionTargets, WaterEntry } from '@/src/types/gym';

type GymContextValue = {
  ready: boolean;
  error: string | null;
  saveStatus: 'saved' | 'saving' | 'error';
  retrySave: () => Promise<void>;
  workouts: Workout[];
  preferences: Preferences;
  customExercises: Exercise[];
  routines: RoutineTemplate[];
  measurements: BodyMeasurement[];
  goals: FitnessGoal[];
  foods: FoodItem[];
  meals: MealEntry[];
  nutritionTargets: NutritionTargets | null;
  waterEntries: WaterEntry[];
  saveNutritionTargets: (targets: NutritionTargets) => Promise<void>;
  clearNutritionTargets: () => Promise<void>;
  saveWaterEntry: (entry: WaterEntry) => Promise<void>;
  deleteWaterEntry: (id: string) => Promise<void>;
  saveFood: (food: FoodItem) => Promise<void>;
  archiveFood: (id: string) => Promise<void>;
  saveMeal: (entry: MealEntry) => Promise<void>;
  deleteMeal: (id: string) => Promise<void>;
  saveBodyMeasurement: (entry: BodyMeasurement) => Promise<void>;
  deleteBodyMeasurement: (id: string) => Promise<void>;
  saveFitnessGoal: (goal: FitnessGoal) => Promise<void>;
  deleteFitnessGoal: (id: string) => Promise<void>;
  saveRoutine: (routine: RoutineTemplate) => Promise<void>;
  createRoutine: (name?: string) => Promise<RoutineTemplate>;
  importStarterRoutine: (key: string) => Promise<RoutineTemplate>;
  duplicateRoutine: (id: string) => Promise<RoutineTemplate>;
  deleteRoutine: (id: string) => Promise<void>;
  startRoutineWorkout: (routineId: string) => Promise<string>;
  createCustomExercise: (input: ExerciseInput) => Promise<Exercise>;
  updateCustomExercise: (id: string, input: ExerciseInput) => Promise<void>;
  archiveCustomExercise: (id: string) => Promise<void>;
  startWorkout: () => Promise<string>;
  setWorkoutNotes: (workoutId: string, notes: string) => void;
  setMovementNotes: (workoutId: string, movementId: string, notes: string) => void;
  removeSet: (workoutId: string, movementId: string, setId: string) => void;
  copyPreviousSets: (workoutId: string, movementId: string) => void;
  addMovement: (workoutId: string, exerciseId: string) => void;
  setRestSeconds: (workoutId: string, movementId: string, seconds: number) => void;
  toggleSupersetWithPrevious: (workoutId: string, movementId: string) => void;
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
  const [routines, setRoutines] = useState<RoutineTemplate[]>([]);
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [goals, setGoals] = useState<FitnessGoal[]>([]);
  const measurementsRef = useRef<BodyMeasurement[]>([]);
  const goalsRef = useRef<FitnessGoal[]>([]);
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const foodsRef = useRef<FoodItem[]>([]);
  const mealsRef = useRef<MealEntry[]>([]);
  const [nutritionTargets, setNutritionTargets] = useState<NutritionTargets | null>(null);
  const [waterEntries, setWaterEntries] = useState<WaterEntry[]>([]);
  const waterRef = useRef<WaterEntry[]>([]);
  const routinesRef = useRef<RoutineTemplate[]>([]);
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
        const savedRoutines = await repository.readRoutines();
        const savedMeasurements = await repository.readMeasurements();
        const savedGoals = await repository.readGoals();
        const savedFoods = await repository.readFoods();
        const savedMeals = await repository.readMeals();
        const savedTargets = await repository.readNutritionTargets();
        const savedWater = await repository.readWaterEntries();
        if (!mountedRef.current) return;
        repositoryRef.current = repository;
        latestRef.current = restored;
        setData(restored);
        customRef.current = savedExercises;
        setCustomExercises(savedExercises);
        routinesRef.current = savedRoutines;
        setRoutines(savedRoutines);
        measurementsRef.current = savedMeasurements;
        setMeasurements(savedMeasurements);
        goalsRef.current = savedGoals;
        setGoals(savedGoals);
        foodsRef.current = savedFoods;
        setFoods(savedFoods);
        mealsRef.current = savedMeals;
        setMeals(savedMeals);
        setNutritionTargets(savedTargets);
        waterRef.current = savedWater;
        setWaterEntries(savedWater);
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

  const commitRoutine = useCallback(async (template: RoutineTemplate): Promise<void> => {
    validateRoutine(template);
    for (const movement of template.exercises) {
      const exercise = findExercise(movement.exerciseId, customRef.current);
      if (!exercise || exercise.archived) {
        throw new Error('This routine contains an unavailable or unsupported exercise.');
      }
    }
    await commitConfirmed((repo) => repo.saveRoutine(template));
    const next = [template, ...routinesRef.current.filter((r) => r.id !== template.id)];
    routinesRef.current = next;
    setRoutines(next);
  }, [commitConfirmed]);

  const createRoutine = useCallback(async (name = 'New routine'): Promise<RoutineTemplate> => {
    const routine = createRoutineTemplate(name);
    await commitRoutine(routine);
    return routine;
  }, [commitRoutine]);

  const importStarterRoutine = useCallback(async (key: string): Promise<RoutineTemplate> => {
    const routine = buildStarterRoutine(key);
    await commitRoutine(routine);
    return routine;
  }, [commitRoutine]);

  const saveRoutine = useCallback(async (routine: RoutineTemplate): Promise<void> => {
    const current = routinesRef.current.find((r) => r.id === routine.id);
    if (!current) throw new Error('Routine not found.');
    const updated: RoutineTemplate = { ...routine, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
    await commitRoutine(updated);
  }, [commitRoutine]);

  const duplicateRoutine = useCallback(async (id: string): Promise<RoutineTemplate> => {
    const existing = routinesRef.current.find((r) => r.id === id);
    if (!existing) throw new Error('Routine not found.');
    const copy = duplicateRoutineTemplate(existing);
    await commitRoutine(copy);
    return copy;
  }, [commitRoutine]);

  const deleteRoutine = useCallback(async (id: string): Promise<void> => {
    if (!routinesRef.current.some((r) => r.id === id)) throw new Error('Routine not found.');
    await commitConfirmed((repo) => repo.deleteRoutine(id));
    const next = routinesRef.current.filter((r) => r.id !== id);
    routinesRef.current = next;
    setRoutines(next);
  }, [commitConfirmed]);

  const startRoutineWorkout = useCallback(async (routineId: string): Promise<string> => {
    const routine = routinesRef.current.find((r) => r.id === routineId);
    if (!routine) throw new Error('Routine not found.');
    // Validate at execution time: an archived custom exercise must not create
    // a workout with an unknown movement.
    for (const movement of routine.exercises) {
      const exercise = findExercise(movement.exerciseId, customRef.current);
      if (!exercise || exercise.archived) {
        throw new Error('This routine contains an archived or unsupported exercise.');
      }
    }
    const workout = routineToWorkout(routine);
    await commitConfirmed((repo) => repo.upsertWorkout(workout));
    const snapshot: GymData = {
      ...latestRef.current, workouts: [workout, ...latestRef.current.workouts],
    };
    latestRef.current = snapshot;
    setData(snapshot);
    return workout.id;
  }, [commitConfirmed]);

  const saveBodyMeasurement = useCallback(async (entry: BodyMeasurement): Promise<void> => {
    await commitConfirmed(repo => repo.saveMeasurement(entry));
    const next = [entry, ...measurementsRef.current.filter(item => item.id !== entry.id)]
      .sort((a, b) => b.recordedOn.localeCompare(a.recordedOn) || b.id.localeCompare(a.id));
    measurementsRef.current = next;
    setMeasurements(next);
  }, [commitConfirmed]);

  const deleteBodyMeasurement = useCallback(async (id: string): Promise<void> => {
    if (!measurementsRef.current.some(item => item.id === id)) throw new Error('Measurement unavailable');
    await commitConfirmed(repo => repo.deleteMeasurement(id));
    const next = measurementsRef.current.filter(item => item.id !== id);
    measurementsRef.current = next;
    setMeasurements(next);
  }, [commitConfirmed]);

  const saveFitnessGoal = useCallback(async (goal: FitnessGoal): Promise<void> => {
    const conflicting = goalsRef.current.find(item => item.kind === goal.kind && item.id !== goal.id);
    if (conflicting) throw new Error('Update your existing goal for this category');
    await commitConfirmed(repo => repo.saveGoal(goal));
    const next = [goal, ...goalsRef.current.filter(item => item.id !== goal.id)];
    goalsRef.current = next;
    setGoals(next);
  }, [commitConfirmed]);

  const deleteFitnessGoal = useCallback(async (id: string): Promise<void> => {
    if (!goalsRef.current.some(item => item.id === id)) throw new Error('Goal unavailable');
    await commitConfirmed(repo => repo.deleteGoal(id));
    const next = goalsRef.current.filter(item => item.id !== id);
    goalsRef.current = next;
    setGoals(next);
  }, [commitConfirmed]);

  const saveFood = useCallback(async (food: FoodItem): Promise<void> => {
    await commitConfirmed(repo => repo.saveFood(food));
    const next = [food, ...foodsRef.current.filter(item => item.id !== food.id)]
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    foodsRef.current = next;
    setFoods(next);
  }, [commitConfirmed]);

  const archiveFood = useCallback(async (id: string): Promise<void> => {
    if (!foodsRef.current.some(food => food.id === id && !food.archived)) {
      throw new Error('Active food not found');
    }
    await commitConfirmed(repo => repo.archiveFood(id));
    const next = foodsRef.current.map(food => food.id === id ? { ...food, archived: true } : food);
    foodsRef.current = next;
    setFoods(next);
  }, [commitConfirmed]);

  const saveMeal = useCallback(async (entry: MealEntry): Promise<void> => {
    await commitConfirmed(repo => repo.saveMeal(entry));
    const next = [entry, ...mealsRef.current.filter(meal => meal.id !== entry.id)]
      .sort((a, b) => b.eatenOn.localeCompare(a.eatenOn) || a.id.localeCompare(b.id));
    mealsRef.current = next;
    setMeals(next);
  }, [commitConfirmed]);

  const deleteMeal = useCallback(async (id: string): Promise<void> => {
    if (!mealsRef.current.some(meal => meal.id === id)) throw new Error('Meal not found');
    await commitConfirmed(repo => repo.deleteMeal(id));
    const next = mealsRef.current.filter(meal => meal.id !== id);
    mealsRef.current = next;
    setMeals(next);
  }, [commitConfirmed]);

  const saveNutritionTargets = useCallback(async (targets: NutritionTargets): Promise<void> => {
    await commitConfirmed(repo => repo.saveNutritionTargets(targets));
    setNutritionTargets(targets);
  }, [commitConfirmed]);

  const clearNutritionTargets = useCallback(async (): Promise<void> => {
    await commitConfirmed(repo => repo.clearNutritionTargets());
    setNutritionTargets(null);
  }, [commitConfirmed]);

  const saveWaterEntry = useCallback(async (entry: WaterEntry): Promise<void> => {
    await commitConfirmed(repo => repo.saveWaterEntry(entry));
    const next = [entry, ...waterRef.current.filter(item => item.id !== entry.id)]
      .sort((a, b) => b.recordedOn.localeCompare(a.recordedOn) || a.id.localeCompare(b.id));
    waterRef.current = next;
    setWaterEntries(next);
  }, [commitConfirmed]);

  const deleteWaterEntry = useCallback(async (id: string): Promise<void> => {
    if (!waterRef.current.some(item => item.id === id)) throw new Error('Water entry not found');
    await commitConfirmed(repo => repo.deleteWaterEntry(id));
    const next = waterRef.current.filter(item => item.id !== id);
    waterRef.current = next;
    setWaterEntries(next);
  }, [commitConfirmed]);

  const applyWorkout = useCallback((
    id: string,
    operation: (workout: Workout) => Workout,
    writer?: (repo: GymRepository, next: Workout) => Promise<void>,
  ) => {
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
    queueOptimistic((repo) => writer ? writer(repo, next) : repo.upsertWorkout(next));
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
    if (!exercise || exercise.archived) return;
    applyWorkout(workoutId, (workout) => {
      if (workout.finishedAt || workout.movements.some((m) => m.exerciseId === exerciseId)) return workout;
      const movement: WorkoutMovement = {
        id: createId(), exerciseId,
        sets: [defaultSetForTracking(exercise.tracking)],
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
          const exercise = findExercise(movement.exerciseId, customRef.current);
          return {
            ...movement,
            sets: [...movement.sets, previous ? copySetForNewSession(previous)
              : defaultSetForTracking(exercise?.tracking ?? 'reps')],
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
        ? { ...item, sets: prior.map(copySetForNewSession) }
        : item),
    }));
  }, [applyWorkout]);

  const setWorkoutNotes = useCallback((workoutId: string, notes: string) => {
    applyWorkout(workoutId, (workout) => {
      if (workout.finishedAt || (workout.notes ?? '') === notes) return workout;
      return { ...workout, notes: notes.slice(0, 4000) };
    }, (repo, next) => repo.updateWorkoutNotes(workoutId, next.notes ?? ''));
  }, [applyWorkout]);

  const setMovementNotes = useCallback((workoutId: string, movementId: string, notes: string) => {
    applyWorkout(workoutId, (workout) => {
      if (workout.finishedAt) return workout;
      if (!workout.movements.some((m) => m.id === movementId && (m.notes ?? '') !== notes)) return workout;
      return { ...workout, movements: workout.movements.map((m) => m.id === movementId
        ? { ...m, notes: notes.slice(0, 2000) }
        : m) };
    }, (repo, next) => {
      const movement = next.movements.find((m) => m.id === movementId);
      return repo.updateMovementNotes(movementId, movement?.notes ?? '');
    });
  }, [applyWorkout]);

  const setRestSeconds = useCallback((workoutId: string, movementId: string, seconds: number) => {
    if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 600) return;
    applyWorkout(workoutId, (workout) => {
      if (workout.finishedAt) return workout;
      return { ...workout, movements: workout.movements.map((m) =>
        m.id === movementId ? { ...m, restSeconds: seconds } : m) };
    });
  }, [applyWorkout]);

  const toggleSupersetWithPrevious = useCallback((workoutId: string, movementId: string) => {
    applyWorkout(workoutId, (workout) => {
      if (workout.finishedAt) return workout;
      const index = workout.movements.findIndex((m) => m.id === movementId);
      if (index < 1) return workout;
      const prior = workout.movements[index - 1];
      const selected = workout.movements[index];
      if (selected.supersetGroup && selected.supersetGroup === prior.supersetGroup) {
        const group = selected.supersetGroup;
        const next = workout.movements.map(m => m.id === selected.id ? { ...m, supersetGroup: undefined } : m);
        const remaining = next.filter(m => m.supersetGroup === group);
        return { ...workout, movements: next.map(m =>
          remaining.length < 2 && m.supersetGroup === group ? { ...m, supersetGroup: undefined } : m) };
      }
      const group = prior.supersetGroup ?? 'superset:' + createId();
      return { ...workout, movements: workout.movements.map(m =>
        m.id === prior.id || m.id === selected.id ? { ...m, supersetGroup: group } : m) };
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
      routines, saveRoutine, createRoutine, importStarterRoutine, duplicateRoutine, deleteRoutine, startRoutineWorkout,
      measurements, goals, saveBodyMeasurement, deleteBodyMeasurement, saveFitnessGoal, deleteFitnessGoal,
      foods, meals, saveFood, archiveFood, saveMeal, deleteMeal,
      nutritionTargets, waterEntries, saveNutritionTargets, clearNutritionTargets, saveWaterEntry, deleteWaterEntry,
      startWorkout, addMovement, setRestSeconds, toggleSupersetWithPrevious, addSet, removeSet, copyPreviousSets,
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
