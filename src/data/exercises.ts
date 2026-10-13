import type { Exercise } from '@/src/types/gym';

export const EXERCISES: Exercise[] = [
  { id: 'bench-press', name: 'Barbell Bench Press', muscle: 'Chest', equipment: 'Barbell' },
  { id: 'incline-dumbbell-press', name: 'Incline Dumbbell Press', muscle: 'Chest', equipment: 'Dumbbell' },
  { id: 'chest-fly', name: 'Cable Chest Fly', muscle: 'Chest', equipment: 'Cable' },
  { id: 'deadlift', name: 'Deadlift', muscle: 'Back', equipment: 'Barbell' },
  { id: 'lat-pulldown', name: 'Lat Pulldown', muscle: 'Back', equipment: 'Machine' },
  { id: 'seated-row', name: 'Seated Cable Row', muscle: 'Back', equipment: 'Cable' },
  { id: 'squat', name: 'Barbell Back Squat', muscle: 'Legs', equipment: 'Barbell' },
  { id: 'leg-press', name: 'Leg Press', muscle: 'Legs', equipment: 'Machine' },
  { id: 'leg-curl', name: 'Leg Curl', muscle: 'Legs', equipment: 'Machine' },
  { id: 'romanian-deadlift', name: 'Romanian Deadlift', muscle: 'Legs', equipment: 'Barbell' },
  { id: 'overhead-press', name: 'Overhead Press', muscle: 'Shoulders', equipment: 'Barbell' },
  { id: 'lateral-raise', name: 'Lateral Raise', muscle: 'Shoulders', equipment: 'Dumbbell' },
  { id: 'biceps-curl', name: 'Dumbbell Biceps Curl', muscle: 'Arms', equipment: 'Dumbbell' },
  { id: 'triceps-pushdown', name: 'Triceps Pushdown', muscle: 'Arms', equipment: 'Cable' },
  { id: 'plank', name: 'Plank', muscle: 'Core', equipment: 'Bodyweight' },
  { id: 'crunch', name: 'Crunch', muscle: 'Core', equipment: 'Bodyweight' },
];

export function getExercise(id: string): Exercise | undefined {
  return EXERCISES.find((exercise) => exercise.id === id);
}
