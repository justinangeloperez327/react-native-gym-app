export type WeightUnit = 'kg' | 'lb';
export type ThemeSetting = 'system' | 'light' | 'dark';

export type Preferences = {
  unit: WeightUnit;
  theme: ThemeSetting;
};

export type Exercise = {
  id: string;
  name: string;
  muscle: 'Chest' | 'Back' | 'Legs' | 'Shoulders' | 'Arms' | 'Core';
  equipment: string;
};

export type TrainingSet = {
  id: string;
  reps: number;
  weightKg: number;
  completed: boolean;
};

export type WorkoutMovement = {
  id: string;
  exerciseId: string;
  sets: TrainingSet[];
};

export type Workout = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  movements: WorkoutMovement[];
};

export type GymData = {
  version: 1;
  workouts: Workout[];
  preferences: Preferences;
};
