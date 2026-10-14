import type { RoutineTemplate, RoutineExercise, Workout } from '../types/gym';
import { createId } from '../lib/workouts.ts';

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function validateRoutine(routine: RoutineTemplate): void {
  if (!routine.id || !routine.id.startsWith('routine:')) throw new Error('Invalid routine ID');
  if (routine.name.trim().length < 2 || routine.name.trim().length > 80) throw new Error('Routine name must be 2–80 characters');
  if (routine.description.length > 500) throw new Error('Routine description is too long');
  if (!Number.isFinite(Date.parse(routine.createdAt)) || !Number.isFinite(Date.parse(routine.updatedAt))) {
    throw new Error('Routine timestamps are invalid');
  }
  if (routine.exercises.length > 30) throw new Error('A routine cannot contain more than 30 exercises');
  if (new Set(routine.days).size !== routine.days.length ||
      routine.days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error('Invalid weekly schedule');
  }
  if (new Set(routine.exercises.map(m => m.id)).size !== routine.exercises.length ||
      new Set(routine.exercises.map(m => m.exerciseId)).size !== routine.exercises.length) {
    throw new Error('Routine exercises must be unique');
  }
  for (const movement of routine.exercises) {
    if (!movement.id || !movement.exerciseId || !Number.isSafeInteger(movement.sets) ||
      movement.sets < 1 || movement.sets > 20 ||
      !Number.isSafeInteger(movement.reps) || movement.reps < 1 || movement.reps > 1000 ||
      !Number.isFinite(movement.weightKg) || movement.weightKg < 0 || movement.weightKg > 10000) {
      throw new Error('Invalid exercise targets');
    }
  }
}

export function createRoutineTemplate(name = 'New routine'): RoutineTemplate {
  const now = new Date().toISOString();
  return {
    id: 'routine:' + createId(), name, description: '', days: [],
    createdAt: now, updatedAt: now, exercises: [],
  };
}

export function duplicateRoutineTemplate(template: RoutineTemplate): RoutineTemplate {
  const next = createRoutineTemplate(template.name + ' (copy)');
  return {
    ...next, description: template.description,
    exercises: template.exercises.map(m => ({ ...m, id: createId() })),
    days: [],
  };
}

export function routineToWorkout(template: RoutineTemplate): Workout {
  validateRoutine(template);
  if (template.exercises.length === 0) throw new Error('Add exercises before starting this routine');
  return {
    id: createId(), startedAt: new Date().toISOString(), finishedAt: null,
    movements: template.exercises.map(m => ({
      id: createId(), exerciseId: m.exerciseId,
      sets: Array.from({ length: m.sets }, () => ({
        id: createId(), reps: m.reps, weightKg: m.weightKg, completed: false,
      })),
    })),
  };
}

function preset(name: string, description: string, days: number[],
  values: Array<[string, number, number]>): RoutineTemplate {
  const base = createRoutineTemplate(name);
  return {
    ...base, description, days,
    exercises: values.map(([exerciseId, sets, reps]) => ({
      id: createId(), exerciseId, sets, reps, weightKg: 0,
    })),
  };
}

// Starter plans are copied into a personal template. Nothing is automatically assigned.
export const STARTER_PROGRAMS = [
  { key: 'full-body', label: 'Full Body Starter', detail: '3 days/week • basic full-body movements' },
  { key: 'upper-body', label: 'Upper Body', detail: '2 days/week • push and pull' },
  { key: 'lower-body', label: 'Lower Body', detail: '2 days/week • legs and core' },
] as const;

export function buildStarterRoutine(key: string): RoutineTemplate {
  switch (key) {
    case 'full-body': return preset('Full Body Starter', 'A simple full-body strength routine', [1, 3, 5],
      [['squat', 3, 8], ['bench-press', 3, 10], ['seated-row', 3, 10]]);
    case 'upper-body': return preset('Upper Body', 'Push and pull training', [1, 4],
      [['bench-press', 3, 8], ['lat-pulldown', 3, 10], ['overhead-press', 3, 8]]);
    case 'lower-body': return preset('Lower Body', 'Legs with a core finisher', [2, 5],
      [['squat', 3, 8], ['romanian-deadlift', 3, 10], ['crunch', 3, 15]]);
    default: throw new Error('Unknown starter routine');
  }
}
