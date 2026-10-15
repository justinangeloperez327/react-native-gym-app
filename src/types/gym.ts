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

export const SET_TYPES = ['normal', 'warmup', 'drop', 'failure'] as const;
export type SetType = (typeof SET_TYPES)[number];
export type TrainingSet = {
  id: string; reps: number; weightKg: number; completed: boolean;
  durationSeconds?: number; distanceMeters?: number; setType?: SetType;
};
export type WorkoutMovement = { id: string; exerciseId: string; sets: TrainingSet[]; notes?: string; restSeconds?: number; supersetGroup?: string };
export type Workout = { id: string; startedAt: string; finishedAt: string | null; movements: WorkoutMovement[]; notes?: string };
export type GymData = { version: 1; workouts: Workout[]; preferences: Preferences };

export type RoutineExercise = {
  id: string;
  exerciseId: string;
  sets: number;
  reps: number;
  weightKg: number;
  durationSeconds?: number;
  distanceMeters?: number;
};
export type RoutineTemplate = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  days: number[]; // 0=Sunday through 6=Saturday, local device calendar
  exercises: RoutineExercise[];
};

export type BodyMetricKind = 'weight' | 'waist' | 'chest' | 'hips' | 'upper_arm' | 'thigh';
export type BodyMeasurement = {
  id: string;
  kind: BodyMetricKind;
  recordedOn: string; // Device-local YYYY-MM-DD
  value: number; // Canonical kg for weight, cm for circumferences
  notes?: string;
};
export type FitnessGoalKind = 'body_weight' | 'weekly_workouts';
export type FitnessGoal = {
  id: string;
  kind: FitnessGoalKind;
  createdOn: string;
  startValue: number; // kg baseline for body_weight, 0 for weekly_workouts
  targetValue: number; // kg for body_weight, sessions/week for weekly_workouts
};

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type FoodItem = {
  id: string;
  name: string;
  brand: string;
  servingGrams: number;
  caloriesPerServing: number;
  proteinPerServing: number;
  carbsPerServing: number;
  fatPerServing: number;
  archived: boolean;
};
export type MealEntry = {
  id: string;
  eatenOn: string; // YYYY-MM-DD in device-local calendar
  mealType: MealType;
  quantity: number; // Multiplier of the food's serving size
  foodId: string; // Historical reference; food can later be archived
  foodName: string; // Immutable snapshot at time of logging
  foodBrand: string;
  servingGrams: number;
  caloriesPerServing: number;
  proteinPerServing: number;
  carbsPerServing: number;
  fatPerServing: number;
};

/** Optional targets: null means the user has not configured this dimension. */
export type NutritionTargets = {
  calories: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  waterMl: number | null;
};
export type WaterEntry = {
  id: string;
  recordedOn: string; // Local calendar date YYYY-MM-DD
  amountMl: number;
};
