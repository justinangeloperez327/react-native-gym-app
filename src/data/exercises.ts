import type { Exercise, ExerciseInput, ExerciseKind, MuscleGroup, TrackingType } from '../types/gym';

type Seed = [string, string, MuscleGroup, string, ExerciseKind, TrackingType];
// Existing IDs are permanent: past workouts retain references to these values.
const SEEDS: Seed[] = [
  ['bench-press', 'Barbell Bench Press', 'Chest', 'Barbell', 'strength', 'reps'],
  ['incline-dumbbell-press', 'Incline Dumbbell Press', 'Chest', 'Dumbbell', 'strength', 'reps'],
  ['chest-fly', 'Cable Chest Fly', 'Chest', 'Cable', 'strength', 'reps'],
  ['deadlift', 'Deadlift', 'Back', 'Barbell', 'strength', 'reps'],
  ['lat-pulldown', 'Lat Pulldown', 'Back', 'Machine', 'strength', 'reps'],
  ['seated-row', 'Seated Cable Row', 'Back', 'Cable', 'strength', 'reps'],
  ['squat', 'Barbell Back Squat', 'Legs', 'Barbell', 'strength', 'reps'],
  ['leg-press', 'Leg Press', 'Legs', 'Machine', 'strength', 'reps'],
  ['leg-curl', 'Leg Curl', 'Legs', 'Machine', 'strength', 'reps'],
  ['romanian-deadlift', 'Romanian Deadlift', 'Legs', 'Barbell', 'strength', 'reps'],
  ['overhead-press', 'Overhead Press', 'Shoulders', 'Barbell', 'strength', 'reps'],
  ['lateral-raise', 'Lateral Raise', 'Shoulders', 'Dumbbell', 'strength', 'reps'],
  ['biceps-curl', 'Dumbbell Biceps Curl', 'Arms', 'Dumbbell', 'strength', 'reps'],
  ['triceps-pushdown', 'Triceps Pushdown', 'Arms', 'Cable', 'strength', 'reps'],
  ['plank', 'Plank', 'Core', 'Bodyweight', 'bodyweight', 'duration'],
  ['crunch', 'Crunch', 'Core', 'Bodyweight', 'bodyweight', 'reps'],
  ['push-up', 'Push-up', 'Chest', 'Bodyweight', 'bodyweight', 'reps'],
  ['pull-up', 'Pull-up', 'Back', 'Pull-up Bar', 'bodyweight', 'reps'],
  ['bodyweight-squat', 'Bodyweight Squat', 'Legs', 'Bodyweight', 'bodyweight', 'reps'],
  ['lunge', 'Walking Lunge', 'Legs', 'Bodyweight', 'bodyweight', 'reps'],
  ['dip', 'Parallel Bar Dip', 'Arms', 'Dip Bars', 'bodyweight', 'reps'],
  ['mountain-climber', 'Mountain Climber', 'Full Body', 'Bodyweight', 'bodyweight', 'reps'],
  ['side-plank', 'Side Plank', 'Core', 'Bodyweight', 'bodyweight', 'duration'],
  ['wall-sit', 'Wall Sit', 'Legs', 'Bodyweight', 'bodyweight', 'duration'],
  ['treadmill-run', 'Treadmill Running', 'Cardio', 'Treadmill', 'cardio', 'distance'],
  ['outdoor-run', 'Outdoor Running', 'Cardio', 'None', 'cardio', 'distance'],
  ['walking', 'Walking', 'Cardio', 'None', 'cardio', 'distance'],
  ['cycling', 'Cycling', 'Cardio', 'Bicycle', 'cardio', 'distance'],
  ['stationary-bike', 'Stationary Cycling', 'Cardio', 'Stationary Bike', 'cardio', 'duration'],
  ['rowing-machine', 'Rowing Machine', 'Cardio', 'Rowing Machine', 'cardio', 'distance'],
  ['elliptical', 'Elliptical', 'Cardio', 'Elliptical', 'cardio', 'duration'],
  ['jump-rope', 'Jump Rope', 'Cardio', 'Jump Rope', 'cardio', 'duration'],
  ['swimming', 'Swimming', 'Cardio', 'Pool', 'cardio', 'distance'],
  ['stair-climber', 'Stair Climber', 'Cardio', 'Machine', 'cardio', 'duration'],
];

export const EXERCISES: Exercise[] = SEEDS.map(([id, name, muscle, equipment, kind, tracking]) =>
  ({ id, name, muscle, equipment, kind, tracking }));

export function getExercise(id: string): Exercise | undefined {
  return EXERCISES.find((exercise) => exercise.id === id);
}

export function findExercise(id: string, custom: readonly Exercise[]): Exercise | undefined {
  return custom.find((exercise) => exercise.id === id) ?? getExercise(id);
}

export function activeExercises(custom: readonly Exercise[]): Exercise[] {
  return [...EXERCISES, ...custom.filter((exercise) => exercise.custom && !exercise.archived)];
}

export type ExerciseFilters = { query?: string; kind?: ExerciseKind | 'all'; muscle?: MuscleGroup | 'All'; equipment?: string };

export function searchExercises(exercises: readonly Exercise[], filters: ExerciseFilters = {}): Exercise[] {
  const q = (filters.query ?? '').trim().toLocaleLowerCase();
  const equipment = (filters.equipment ?? '').trim().toLocaleLowerCase();
  return exercises.filter((exercise) =>
    (filters.kind === undefined || filters.kind === 'all' || exercise.kind === filters.kind) &&
    (filters.muscle === undefined || filters.muscle === 'All' || exercise.muscle === filters.muscle) &&
    (!equipment || exercise.equipment.toLocaleLowerCase() === equipment) &&
    (!q || [exercise.name, exercise.muscle, exercise.equipment, exercise.kind].some((value) =>
      value.toLocaleLowerCase().includes(q)))
  ).sort((a, b) => a.name.localeCompare(b.name));
}

export function canLogRepetitions(exercise: Exercise): boolean {
  return exercise.tracking === 'reps';
}

export function normalizeExerciseInput(input: ExerciseInput): ExerciseInput {
  const name = input.name.trim().replace(/\s+/g, ' ');
  const equipment = input.equipment.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) throw new Error('Exercise name must contain 2–80 characters.');
  if (equipment.length < 1 || equipment.length > 48) throw new Error('Equipment must contain 1–48 characters.');
  if (!['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Full Body', 'Cardio'].includes(input.muscle)) throw new Error('Invalid muscle group.');
  if (!['strength', 'bodyweight', 'cardio'].includes(input.kind)) throw new Error('Invalid activity type.');
  if (!['reps', 'duration', 'distance'].includes(input.tracking)) throw new Error('Invalid tracking method.');
  if (input.kind === 'cardio' && input.tracking === 'reps') throw new Error('Cardio requires distance or duration tracking.');
  return { name, equipment, muscle: input.muscle, kind: input.kind, tracking: input.tracking };
}

export function hasExerciseName(name: string, custom: readonly Exercise[], excludingId?: string): boolean {
  const key = name.trim().toLocaleLowerCase();
  return [...EXERCISES, ...custom].some((item) => item.id !== excludingId && item.name.toLocaleLowerCase() === key);
}
