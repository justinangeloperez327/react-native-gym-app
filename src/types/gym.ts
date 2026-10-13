export type WeightUnit = 'kg' | 'lb';
export type ThemeSetting = 'system' | 'light' | 'dark';
export type Preferences = { unit: WeightUnit; theme: ThemeSetting };

export const EXERCISE_KINDS = ['strength', 'bodyweight', 'cardio'] as const;
export type ExerciseKind = (typeof EXERCISE_KINDS)[number];
export const MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Full Body', 'Cardio'] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export const TRACKING_TYPES = ['reps', 'duration', 'distance'] as const;
export type TrackingType = (typeof TRACKING_TYPES)[number];

export type Exercise = {
  id: string;
  name: string;
  muscle: MuscleGroup;
  equipment: string;
  kind: ExerciseKind;
  tracking: TrackingType;
  custom?: boolean;
  archived?: boolean;
};
export type ExerciseInput = Pick<Exercise, 'name' | 'muscle' | 'equipment' | 'kind' | 'tracking'>;

export type TrainingSet = { id: string; reps: number; weightKg: number; completed: boolean };
export type WorkoutMovement = { id: string; exerciseId: string; sets: TrainingSet[] };
export type Workout = { id: string; startedAt: string; finishedAt: string | null; movements: WorkoutMovement[] };
export type GymData = { version: 1; workouts: Workout[]; preferences: Preferences };
