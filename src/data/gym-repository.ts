import { emptyGymData, isGymData, parseLegacy } from './legacy.ts';
import { MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4, MIGRATION_V5, MIGRATION_V6, MIGRATION_V7, MIGRATION_V8, MIGRATION_V9, SCHEMA_VERSION } from './migrations.ts';
import { normalizeExerciseInput } from './exercises.ts';
import { validateRoutine } from './routines.ts';
import { assertMeasurement, assertGoal } from '../lib/body-metrics.ts';
import { validateFood, validateMeal, validateNutritionTargets, validateWaterEntry } from '../lib/nutrition.ts';
import { validateRecovery } from '../lib/recovery.ts';
import { validateBackup } from './backup.ts';
import type { GymData, Preferences, Workout, WorkoutMovement, TrainingSet, Exercise, RoutineTemplate, RoutineExercise, BodyMeasurement, FitnessGoal, FoodItem, MealEntry, NutritionTargets, WaterEntry, RecoveryEntry, GymBackup } from '../types/gym';

export type SqlParam = string | number | null;

/**
 * Narrow adapter around expo-sqlite, deliberately portable to Node's sqlite
 * module for real SQL integration tests. All writes use exclusive transactions.
 */
export interface SqlClient {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: SqlParam[]): Promise<unknown>;
  getFirstAsync(source: string, ...params: SqlParam[]): Promise<unknown | null>;
  getAllAsync(source: string, ...params: SqlParam[]): Promise<unknown[]>;
}

export interface SqlDatabase extends SqlClient {
  withExclusiveTransactionAsync(callback: (transaction: SqlClient) => Promise<void>): Promise<void>;
}

type CountRow = { total: number };
type SchemaRow = { user_version: number };
type KeyRow = { value: string };
type PrefRow = { weight_unit: string; theme: string };
type WorkoutRow = { id: string; started_at: string; finished_at: string | null; notes: string };
type MovementRow = { id: string; workout_id: string; exercise_id: string; position: number; notes: string; rest_seconds: number; superset_group: string | null };
type ExerciseRow = { id: string; name: string; muscle: Exercise['muscle']; equipment: string; kind: Exercise['kind']; tracking: Exercise['tracking']; archived: number };
type RoutineRow = { id: string; name: string; description: string; created_at: string; updated_at: string };
type RoutineExerciseRow = { id: string; routine_id: string; exercise_id: string; position: number; target_sets: number; target_reps: number; target_weight_kg: number; target_duration_seconds: number | null; target_distance_meters: number | null };
type RoutineDayRow = { routine_id: string; weekday: number };
type BodyRow = { id: string; kind: BodyMeasurement['kind']; recorded_on: string; value: number; notes: string };
type GoalRow = { id: string; kind: FitnessGoal['kind']; created_on: string; start_value: number; target_value: number };
type FoodRow = {
  id: string; name: string; brand: string; serving_grams: number; calories_per_serving: number;
  protein_per_serving: number; carbs_per_serving: number; fat_per_serving: number; archived: number;
};
type MealRow = {
  id: string; eaten_on: string; meal_type: MealEntry['mealType']; quantity: number;
  food_id: string; food_name: string; food_brand: string; serving_grams: number;
  calories_per_serving: number; protein_per_serving: number; carbs_per_serving: number; fat_per_serving: number;
};
type TargetRow = {
  calories: number | null; protein_grams: number | null; carbs_grams: number | null;
  fat_grams: number | null; water_ml: number | null;
};
type WaterRow = { id: string; recorded_on: string; amount_ml: number };
type RecoveryRow = {
  id: string; recorded_on: string; sleep_minutes: number | null;
  sleep_quality: number | null; energy: number | null; mood: number | null;
  soreness: number | null; stress: number | null; notes: string;
};
type SetRow = { id: string; movement_id: string; position: number; reps: number; weight_kg: number; completed: number; duration_seconds: number | null; distance_meters: number | null; set_type: string };

const LEGACY_STATUS = 'legacy_async_storage_v1';

/**
 * SQLite is the source of truth after initialization. This class does not
 * delete AsyncStorage records or create synthetic workouts on migration errors.
 */
export class GymRepository {
  private readonly db: SqlDatabase;

  constructor(db: SqlDatabase) {
    this.db = db;
  }

  async initialize(readLegacy: () => Promise<string | null>): Promise<void> {
    await this.db.execAsync('PRAGMA foreign_keys = ON;');
    await this.db.execAsync('PRAGMA journal_mode = WAL;');
    const row = await this.db.getFirstAsync('PRAGMA user_version') as SchemaRow | null;
    const currentVersion = row?.user_version ?? 0;
    if (currentVersion > SCHEMA_VERSION) {
      throw new Error('This workout database was created by a newer app version. Nothing was changed.');
    }
    if (currentVersion < 1) {
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.execAsync(MIGRATION_V1);
      });
    }

    if (currentVersion < 2) {
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.execAsync(MIGRATION_V2);
      });
    }

    if (currentVersion < 3) {
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.execAsync(MIGRATION_V3);
      });
    }

    if (currentVersion < 4) {
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.execAsync(MIGRATION_V4);
      });
    }

    if (currentVersion < 5) {
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.execAsync(MIGRATION_V5);
      });
    }

    if (currentVersion < 6) {
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.execAsync(MIGRATION_V6);
      });
    }

    if (currentVersion < 7) {
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.execAsync(MIGRATION_V7);
      });
    }

    if (currentVersion < 8) {
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.execAsync(MIGRATION_V8);
      });
    }

    if (currentVersion < 9) {
      await this.db.withExclusiveTransactionAsync(async tx => {
        await tx.execAsync(MIGRATION_V9);
      });
    }

    // If the legacy key is still present after an import, do not import it again.
    const previous = await this.db.getFirstAsync(
      'SELECT value FROM app_metadata WHERE key = ?', LEGACY_STATUS,
    ) as KeyRow | null;
    if (previous) return;

    const saved = await readLegacy(); // A read failure is fatal: do not mark migration completed.
    const legacy = saved === null ? null : parseLegacy(saved);
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      const marker = await tx.getFirstAsync(
        'SELECT value FROM app_metadata WHERE key = ?', LEGACY_STATUS,
      ) as KeyRow | null;
      if (marker) return;
      const count = await tx.getFirstAsync('SELECT COUNT(*) AS total FROM workouts') as CountRow;
      const current = await tx.getFirstAsync(
        'SELECT weight_unit, theme FROM preferences WHERE id = 1',
      ) as PrefRow | null;
      const customized = current !== null && (current.weight_unit !== 'kg' || current.theme !== 'system');
      if (legacy && count.total === 0 && !customized) {
        await writeSnapshot(tx, legacy);
      }
      await tx.runAsync(
        'INSERT INTO app_metadata (key, value) VALUES (?, ?)',
        LEGACY_STATUS,
        legacy ? (count.total === 0 && !customized ? 'imported' : 'existing_sqlite_kept') : 'absent',
      );
    });
  }

  async readSnapshot(): Promise<GymData> {
    const prefs = await this.db.getFirstAsync(
      'SELECT weight_unit, theme FROM preferences WHERE id = 1',
    ) as PrefRow | null;
    if (!prefs) throw new Error('Database preferences missing');
    const rows = await this.db.getAllAsync(
      'SELECT id, started_at, finished_at, notes FROM workouts ORDER BY started_at DESC, id DESC',
    ) as WorkoutRow[];
    const movements = await this.db.getAllAsync(
      'SELECT id, workout_id, exercise_id, position, notes, rest_seconds, superset_group FROM workout_movements ORDER BY position',
    ) as MovementRow[];
    const sets = await this.db.getAllAsync(
      'SELECT id, movement_id, position, reps, weight_kg, completed, duration_seconds, distance_meters, set_type FROM workout_sets ORDER BY position',
    ) as SetRow[];
    const byWorkout = new Map<string, WorkoutMovement[]>();
    const byMovement = new Map<string, TrainingSet[]>();
    for (const s of sets) {
      const list = byMovement.get(s.movement_id) ?? [];
      list.push({ id: s.id, reps: s.reps, weightKg: s.weight_kg, completed: s.completed === 1,
        ...(s.duration_seconds !== null ? { durationSeconds: s.duration_seconds } : {}),
        ...(s.distance_meters !== null ? { distanceMeters: s.distance_meters } : {}),
        ...(s.set_type !== 'normal' ? { setType: s.set_type as TrainingSet['setType'] } : {}),
      });
      byMovement.set(s.movement_id, list);
    }
    for (const m of movements) {
      const list = byWorkout.get(m.workout_id) ?? [];
      list.push({ id: m.id, exerciseId: m.exercise_id, sets: byMovement.get(m.id) ?? [],
        ...(m.notes ? { notes: m.notes } : {}),
        ...(m.rest_seconds !== 90 ? { restSeconds: m.rest_seconds } : {}),
        ...(m.superset_group ? { supersetGroup: m.superset_group } : {}),
      });
      byWorkout.set(m.workout_id, list);
    }
    const snapshot: GymData = {
      version: 1,
      workouts: rows.map((w) => ({
        id: w.id, startedAt: w.started_at, finishedAt: w.finished_at, ...(w.notes ? { notes: w.notes } : {}),
        movements: byWorkout.get(w.id) ?? [],
      })),
      preferences: { unit: prefs.weight_unit as Preferences['unit'], theme: prefs.theme as Preferences['theme'] },
    };
    if (!isGymData(snapshot)) throw new Error('Stored workouts failed integrity validation');
    return snapshot;
  }

  async readCustomExercises(): Promise<Exercise[]> {
    const rows = await this.db.getAllAsync(
      'SELECT id, name, muscle, equipment, kind, tracking, archived FROM custom_exercises ORDER BY name COLLATE NOCASE',
    ) as ExerciseRow[];
    return rows.map((row) => ({
      id: row.id, name: row.name, muscle: row.muscle, equipment: row.equipment,
      kind: row.kind, tracking: row.tracking, custom: true, archived: row.archived === 1,
    }));
  }

  async saveCustomExercise(exercise: Exercise): Promise<void> {
    if (!exercise.custom || !exercise.id.startsWith('custom:')) {
      throw new Error('Only custom exercise records may be saved.');
    }
    const input = normalizeExerciseInput(exercise);
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        'INSERT INTO custom_exercises (id, name, muscle, equipment, kind, tracking, archived) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, muscle=excluded.muscle, equipment=excluded.equipment, kind=excluded.kind, tracking=excluded.tracking, archived=excluded.archived',
        exercise.id, input.name, input.muscle, input.equipment, input.kind,
        input.tracking, exercise.archived ? 1 : 0,
      );
    });
  }

  async archiveCustomExercise(id: string): Promise<void> {
    if (!id.startsWith('custom:')) throw new Error('Built-in exercises cannot be archived.');
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('UPDATE custom_exercises SET archived = 1 WHERE id = ?', id);
    });
  }

  async updateWorkoutNotes(id: string, notes: string): Promise<void> {
    if (notes.length > 4000) throw new Error('Workout notes exceed the supported length');
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('UPDATE workouts SET notes = ? WHERE id = ?', notes, id);
    });
  }

  async updateMovementNotes(id: string, notes: string): Promise<void> {
    if (notes.length > 2000) throw new Error('Exercise notes exceed the supported length');
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('UPDATE workout_movements SET notes = ? WHERE id = ?', notes, id);
    });
  }

  async readRoutines(): Promise<RoutineTemplate[]> {
    const rows = await this.db.getAllAsync(
      'SELECT id, name, description, created_at, updated_at FROM routine_templates ORDER BY updated_at DESC, id',
    ) as RoutineRow[];
    const movements = await this.db.getAllAsync(
      'SELECT id, routine_id, exercise_id, position, target_sets, target_reps, target_weight_kg, target_duration_seconds, target_distance_meters FROM routine_exercises ORDER BY routine_id, position',
    ) as RoutineExerciseRow[];
    const days = await this.db.getAllAsync(
      'SELECT routine_id, weekday FROM routine_weekdays ORDER BY weekday',
    ) as RoutineDayRow[];
    const exercisesByRoutine = new Map<string, RoutineExercise[]>();
    const daysByRoutine = new Map<string, number[]>();
    for (const row of movements) {
      const list = exercisesByRoutine.get(row.routine_id) ?? [];
      list.push({ id: row.id, exerciseId: row.exercise_id, sets: row.target_sets, reps: row.target_reps, weightKg: row.target_weight_kg,
        ...(row.target_duration_seconds !== null ? { durationSeconds: row.target_duration_seconds } : {}),
        ...(row.target_distance_meters !== null ? { distanceMeters: row.target_distance_meters } : {}),
      });
      exercisesByRoutine.set(row.routine_id, list);
    }
    for (const row of days) {
      const list = daysByRoutine.get(row.routine_id) ?? [];
      list.push(row.weekday);
      daysByRoutine.set(row.routine_id, list);
    }
    return rows.map((row) => ({
      id: row.id, name: row.name, description: row.description,
      createdAt: row.created_at, updatedAt: row.updated_at,
      days: daysByRoutine.get(row.id) ?? [],
      exercises: exercisesByRoutine.get(row.id) ?? [],
    }));
  }

  async saveRoutine(routine: RoutineTemplate): Promise<void> {
    validateRoutine(routine);
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        'INSERT INTO routine_templates (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, updated_at=excluded.updated_at',
        routine.id, routine.name.trim(), routine.description.trim(), routine.createdAt, routine.updatedAt,
      );
      await tx.runAsync('DELETE FROM routine_exercises WHERE routine_id = ?', routine.id);
      await tx.runAsync('DELETE FROM routine_weekdays WHERE routine_id = ?', routine.id);
      for (const [position, movement] of routine.exercises.entries()) {
        await tx.runAsync(
          'INSERT INTO routine_exercises (id, routine_id, exercise_id, position, target_sets, target_reps, target_weight_kg, target_duration_seconds, target_distance_meters) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          movement.id, routine.id, movement.exerciseId, position, movement.sets, movement.reps, movement.weightKg,
          movement.durationSeconds ?? null, movement.distanceMeters ?? null,
        );
      }
      for (const day of routine.days) {
        await tx.runAsync('INSERT INTO routine_weekdays (routine_id, weekday) VALUES (?, ?)', routine.id, day);
      }
    });
  }

  async deleteRoutine(id: string): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('DELETE FROM routine_templates WHERE id = ?', id);
    });
  }

  async readMeasurements(): Promise<BodyMeasurement[]> {
    const rows = await this.db.getAllAsync(
      'SELECT id, kind, recorded_on, value, notes FROM body_measurements ORDER BY recorded_on DESC, id DESC',
    ) as BodyRow[];
    return rows.map(row => {
      const entry: BodyMeasurement = {
        id: row.id, kind: row.kind, recordedOn: row.recorded_on, value: row.value,
        ...(row.notes ? { notes: row.notes } : {}),
      };
      assertMeasurement(entry);
      return entry;
    });
  }

  async saveMeasurement(entry: BodyMeasurement): Promise<void> {
    assertMeasurement(entry);
    await this.db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync(
        'INSERT INTO body_measurements(id,kind,recorded_on,value,notes) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, recorded_on=excluded.recorded_on, value=excluded.value, notes=excluded.notes',
        entry.id, entry.kind, entry.recordedOn, entry.value, entry.notes ?? '',
      );
    });
  }

  async deleteMeasurement(id: string): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync('DELETE FROM body_measurements WHERE id = ?', id);
    });
  }

  async readGoals(): Promise<FitnessGoal[]> {
    const rows = await this.db.getAllAsync(
      'SELECT id, kind, created_on, start_value, target_value FROM fitness_goals ORDER BY kind',
    ) as GoalRow[];
    return rows.map(row => {
      const goal: FitnessGoal = {
        id: row.id, kind: row.kind, createdOn: row.created_on,
        startValue: row.start_value, targetValue: row.target_value,
      };
      assertGoal(goal);
      return goal;
    });
  }

  async saveGoal(goal: FitnessGoal): Promise<void> {
    assertGoal(goal);
    await this.db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync(
        'INSERT INTO fitness_goals(id,kind,created_on,start_value,target_value) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, created_on=excluded.created_on, start_value=excluded.start_value, target_value=excluded.target_value',
        goal.id, goal.kind, goal.createdOn, goal.startValue, goal.targetValue,
      );
    });
  }

  async deleteGoal(id: string): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync('DELETE FROM fitness_goals WHERE id = ?', id);
    });
  }

  async readFoods(): Promise<FoodItem[]> {
    const rows = await this.db.getAllAsync(
      'SELECT id, name, brand, serving_grams, calories_per_serving, protein_per_serving, carbs_per_serving, fat_per_serving, archived FROM foods ORDER BY name COLLATE NOCASE, id',
    ) as FoodRow[];
    return rows.map(row => {
      const food: FoodItem = {
        id: row.id, name: row.name, brand: row.brand, servingGrams: row.serving_grams,
        caloriesPerServing: row.calories_per_serving, proteinPerServing: row.protein_per_serving,
        carbsPerServing: row.carbs_per_serving, fatPerServing: row.fat_per_serving,
        archived: row.archived === 1,
      };
      validateFood(food);
      return food;
    });
  }

  async saveFood(food: FoodItem): Promise<void> {
    validateFood(food);
    await this.db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync(
        'INSERT INTO foods(id,name,brand,serving_grams,calories_per_serving,protein_per_serving,carbs_per_serving,fat_per_serving,archived) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, brand=excluded.brand, serving_grams=excluded.serving_grams, calories_per_serving=excluded.calories_per_serving, protein_per_serving=excluded.protein_per_serving, carbs_per_serving=excluded.carbs_per_serving, fat_per_serving=excluded.fat_per_serving, archived=excluded.archived',
        food.id, food.name.trim(), food.brand.trim(), food.servingGrams, food.caloriesPerServing,
        food.proteinPerServing, food.carbsPerServing, food.fatPerServing, food.archived ? 1 : 0,
      );
    });
  }

  async archiveFood(id: string): Promise<void> {
    if (!id.startsWith('food:')) throw new Error('Invalid food ID');
    await this.db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync('UPDATE foods SET archived = 1 WHERE id = ?', id);
    });
  }

  async readMeals(): Promise<MealEntry[]> {
    const rows = await this.db.getAllAsync(
      'SELECT id,eaten_on,meal_type,quantity,food_id,food_name,food_brand,serving_grams,calories_per_serving,protein_per_serving,carbs_per_serving,fat_per_serving FROM meal_entries ORDER BY eaten_on DESC, meal_type, id',
    ) as MealRow[];
    return rows.map(row => {
      const entry: MealEntry = {
        id: row.id, eatenOn: row.eaten_on, mealType: row.meal_type, quantity: row.quantity,
        foodId: row.food_id, foodName: row.food_name, foodBrand: row.food_brand,
        servingGrams: row.serving_grams, caloriesPerServing: row.calories_per_serving,
        proteinPerServing: row.protein_per_serving, carbsPerServing: row.carbs_per_serving,
        fatPerServing: row.fat_per_serving,
      };
      validateMeal(entry);
      return entry;
    });
  }

  async saveMeal(entry: MealEntry): Promise<void> {
    validateMeal(entry);
    await this.db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync(
        'INSERT INTO meal_entries(id,eaten_on,meal_type,quantity,food_id,food_name,food_brand,serving_grams,calories_per_serving,protein_per_serving,carbs_per_serving,fat_per_serving) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET eaten_on=excluded.eaten_on, meal_type=excluded.meal_type, quantity=excluded.quantity, food_id=excluded.food_id, food_name=excluded.food_name, food_brand=excluded.food_brand, serving_grams=excluded.serving_grams, calories_per_serving=excluded.calories_per_serving, protein_per_serving=excluded.protein_per_serving, carbs_per_serving=excluded.carbs_per_serving, fat_per_serving=excluded.fat_per_serving',
        entry.id, entry.eatenOn, entry.mealType, entry.quantity, entry.foodId, entry.foodName,
        entry.foodBrand, entry.servingGrams, entry.caloriesPerServing, entry.proteinPerServing,
        entry.carbsPerServing, entry.fatPerServing,
      );
    });
  }

  async deleteMeal(id: string): Promise<void> {
    if (!id.startsWith('meal:')) throw new Error('Invalid meal ID');
    await this.db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync('DELETE FROM meal_entries WHERE id = ?', id);
    });
  }

  async readNutritionTargets(): Promise<NutritionTargets | null> {
    const row = await this.db.getFirstAsync(
      'SELECT calories, protein_grams, carbs_grams, fat_grams, water_ml FROM nutrition_targets WHERE id = 1',
    ) as TargetRow | null;
    if (!row) return null;
    const targets: NutritionTargets = {
      calories: row.calories, proteinGrams: row.protein_grams, carbsGrams: row.carbs_grams,
      fatGrams: row.fat_grams, waterMl: row.water_ml,
    };
    validateNutritionTargets(targets);
    return targets;
  }

  async saveNutritionTargets(targets: NutritionTargets): Promise<void> {
    validateNutritionTargets(targets);
    await this.db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync(
        'INSERT INTO nutrition_targets(id,calories,protein_grams,carbs_grams,fat_grams,water_ml) VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET calories=excluded.calories,protein_grams=excluded.protein_grams,carbs_grams=excluded.carbs_grams,fat_grams=excluded.fat_grams,water_ml=excluded.water_ml',
        targets.calories, targets.proteinGrams, targets.carbsGrams, targets.fatGrams, targets.waterMl,
      );
    });
  }

  async clearNutritionTargets(): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync('DELETE FROM nutrition_targets WHERE id = 1');
    });
  }

  async readWaterEntries(): Promise<WaterEntry[]> {
    const rows = await this.db.getAllAsync(
      'SELECT id, recorded_on, amount_ml FROM water_entries ORDER BY recorded_on DESC, id',
    ) as WaterRow[];
    return rows.map(row => {
      const entry: WaterEntry = { id: row.id, recordedOn: row.recorded_on, amountMl: row.amount_ml };
      validateWaterEntry(entry);
      return entry;
    });
  }

  async saveWaterEntry(entry: WaterEntry): Promise<void> {
    validateWaterEntry(entry);
    await this.db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync(
        'INSERT INTO water_entries(id,recorded_on,amount_ml) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET recorded_on=excluded.recorded_on,amount_ml=excluded.amount_ml',
        entry.id, entry.recordedOn, entry.amountMl,
      );
    });
  }

  async deleteWaterEntry(id: string): Promise<void> {
    if (!id.startsWith('water:')) throw new Error('Invalid water entry ID');
    await this.db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync('DELETE FROM water_entries WHERE id = ?', id);
    });
  }

  async readRecoveryEntries(): Promise<RecoveryEntry[]> {
    const rows = await this.db.getAllAsync(
      'SELECT id,recorded_on,sleep_minutes,sleep_quality,energy,mood,soreness,stress,notes FROM recovery_entries ORDER BY recorded_on DESC, id',
    ) as RecoveryRow[];
    return rows.map(row => {
      const entry: RecoveryEntry = {
        id: row.id, recordedOn: row.recorded_on, sleepMinutes: row.sleep_minutes,
        sleepQuality: row.sleep_quality, energy: row.energy, mood: row.mood,
        soreness: row.soreness, stress: row.stress, notes: row.notes,
      };
      validateRecovery(entry);
      return entry;
    });
  }

  async saveRecoveryEntry(entry: RecoveryEntry): Promise<void> {
    validateRecovery(entry);
    await this.db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync(
        'INSERT INTO recovery_entries(id,recorded_on,sleep_minutes,sleep_quality,energy,mood,soreness,stress,notes) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET recorded_on=excluded.recorded_on,sleep_minutes=excluded.sleep_minutes,sleep_quality=excluded.sleep_quality,energy=excluded.energy,mood=excluded.mood,soreness=excluded.soreness,stress=excluded.stress,notes=excluded.notes',
        entry.id, entry.recordedOn, entry.sleepMinutes, entry.sleepQuality,
        entry.energy, entry.mood, entry.soreness, entry.stress, entry.notes,
      );
    });
  }

  async deleteRecoveryEntry(id: string): Promise<void> {
    if (!id.startsWith('recovery:')) throw new Error('Invalid recovery ID');
    await this.db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync('DELETE FROM recovery_entries WHERE id = ?', id);
    });
  }

  async readFullBackup(): Promise<GymBackup> {
    // Reads are ordered and the provider serializes writes before this call.
    const [snapshot, customExercises, routines, measurements, goals, foods, meals,
      nutritionTargets, waterEntries, recoveryEntries] = await Promise.all([
      this.readSnapshot(), this.readCustomExercises(), this.readRoutines(),
      this.readMeasurements(), this.readGoals(), this.readFoods(), this.readMeals(),
      this.readNutritionTargets(), this.readWaterEntries(), this.readRecoveryEntries(),
    ]);
    return validateBackup({
      format: 'react-native-gym-app-backup', version: 1,
      createdAt: new Date().toISOString(),
      snapshot, customExercises, routines, measurements, goals,
      foods, meals, nutritionTargets, waterEntries, recoveryEntries,
    });
  }

  /**
   * Destructive full restore. Every table is rewritten in ONE SQLite transaction:
   * any validation, uniqueness or I/O failure rolls back the entire restore.
   * Legacy migration markers and onboarding metadata are intentionally retained.
   */
  async restoreFullBackup(input: GymBackup): Promise<void> {
    const backup = validateBackup(input);
    await this.db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync('DELETE FROM workouts');
      await tx.runAsync('DELETE FROM routine_templates');
      await tx.runAsync('DELETE FROM custom_exercises');
      await tx.runAsync('DELETE FROM body_measurements');
      await tx.runAsync('DELETE FROM fitness_goals');
      await tx.runAsync('DELETE FROM foods');
      await tx.runAsync('DELETE FROM meal_entries');
      await tx.runAsync('DELETE FROM nutrition_targets');
      await tx.runAsync('DELETE FROM water_entries');
      await tx.runAsync('DELETE FROM recovery_entries');
      await writeSnapshot(tx, backup.snapshot);
      for (const e of backup.customExercises) {
        const normalized = normalizeExerciseInput(e);
        await tx.runAsync(
          'INSERT INTO custom_exercises (id,name,muscle,equipment,kind,tracking,archived) VALUES(?,?,?,?,?,?,?)',
          e.id, normalized.name, normalized.muscle, normalized.equipment, normalized.kind,
          normalized.tracking, e.archived ? 1 : 0,
        );
      }
      for (const routine of backup.routines) {
        await tx.runAsync(
          'INSERT INTO routine_templates (id,name,description,created_at,updated_at) VALUES(?,?,?,?,?)',
          routine.id, routine.name.trim(), routine.description.trim(),
          routine.createdAt, routine.updatedAt,
        );
        for (const [index, movement] of routine.exercises.entries()) {
          await tx.runAsync(
            'INSERT INTO routine_exercises (id,routine_id,exercise_id,position,target_sets,target_reps,target_weight_kg,target_duration_seconds,target_distance_meters) VALUES(?,?,?,?,?,?,?,?,?)',
            movement.id, routine.id, movement.exerciseId, index, movement.sets, movement.reps,
            movement.weightKg, movement.durationSeconds ?? null, movement.distanceMeters ?? null,
          );
        }
        for (const day of routine.days) {
          await tx.runAsync('INSERT INTO routine_weekdays (routine_id,weekday) VALUES(?,?)',
            routine.id, day);
        }
      }
      for (const e of backup.measurements) {
        await tx.runAsync(
          'INSERT INTO body_measurements (id,kind,recorded_on,value,notes) VALUES(?,?,?,?,?)',
          e.id, e.kind, e.recordedOn, e.value, e.notes ?? '',
        );
      }
      for (const e of backup.goals) {
        await tx.runAsync(
          'INSERT INTO fitness_goals (id,kind,created_on,start_value,target_value) VALUES(?,?,?,?,?)',
          e.id, e.kind, e.createdOn, e.startValue, e.targetValue,
        );
      }
      for (const e of backup.foods) {
        await tx.runAsync(
          'INSERT INTO foods (id,name,brand,serving_grams,calories_per_serving,protein_per_serving,carbs_per_serving,fat_per_serving,archived) VALUES(?,?,?,?,?,?,?,?,?)',
          e.id, e.name, e.brand, e.servingGrams, e.caloriesPerServing,
          e.proteinPerServing, e.carbsPerServing, e.fatPerServing, e.archived ? 1 : 0,
        );
      }
      for (const e of backup.meals) {
        await tx.runAsync(
          'INSERT INTO meal_entries (id,eaten_on,meal_type,quantity,food_id,food_name,food_brand,serving_grams,calories_per_serving,protein_per_serving,carbs_per_serving,fat_per_serving) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
          e.id, e.eatenOn, e.mealType, e.quantity, e.foodId, e.foodName, e.foodBrand,
          e.servingGrams, e.caloriesPerServing, e.proteinPerServing, e.carbsPerServing, e.fatPerServing,
        );
      }
      if (backup.nutritionTargets) {
        const t = backup.nutritionTargets;
        await tx.runAsync(
          'INSERT INTO nutrition_targets (id,calories,protein_grams,carbs_grams,fat_grams,water_ml) VALUES(1,?,?,?,?,?)',
          t.calories, t.proteinGrams, t.carbsGrams, t.fatGrams, t.waterMl,
        );
      }
      for (const e of backup.waterEntries) {
        await tx.runAsync('INSERT INTO water_entries (id,recorded_on,amount_ml) VALUES(?,?,?)',
          e.id, e.recordedOn, e.amountMl);
      }
      for (const e of backup.recoveryEntries) {
        await tx.runAsync(
          'INSERT INTO recovery_entries (id,recorded_on,sleep_minutes,sleep_quality,energy,mood,soreness,stress,notes) VALUES(?,?,?,?,?,?,?,?,?)',
          e.id, e.recordedOn, e.sleepMinutes, e.sleepQuality, e.energy,
          e.mood, e.soreness, e.stress, e.notes,
        );
      }
    });
  }

  async upsertWorkout(workout: Workout): Promise<void> {
    // Enforce domain validity before changing persistent state.
    if (!isGymData({ version: 1, workouts: [workout], preferences: emptyGymData().preferences })) {
      throw new Error('Invalid workout cannot be saved');
    }
    await this.db.withExclusiveTransactionAsync((tx) => writeWorkout(tx, workout));
  }

  async deleteWorkout(id: string): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('DELETE FROM workouts WHERE id = ?', id);
    });
  }

  async updatePreferences(preferences: Preferences): Promise<void> {
    if (!isGymData({ version: 1, workouts: [], preferences })) throw new Error('Invalid preferences');
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        'UPDATE preferences SET weight_unit = ?, theme = ? WHERE id = 1',
        preferences.unit, preferences.theme,
      );
    });
  }

  // Import/restore operation: intentionally replaces the complete snapshot atomically.
  async replaceSnapshot(data: GymData): Promise<void> {
    if (!isGymData(data)) throw new Error('Invalid snapshot cannot be imported');
    await this.db.withExclusiveTransactionAsync((tx) => writeSnapshot(tx, data));
  }
}

async function writeWorkout(tx: SqlClient, workout: Workout): Promise<void> {
  await tx.runAsync(
    'INSERT INTO workouts(id, started_at, finished_at, notes) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET started_at=excluded.started_at, finished_at=excluded.finished_at, notes=excluded.notes',
    workout.id, workout.startedAt, workout.finishedAt, workout.notes ?? '',
  );
  // Cascade-removal ensures no stale child rows; all changes roll back together.
  await tx.runAsync('DELETE FROM workout_movements WHERE workout_id = ?', workout.id);
  for (const [mIndex, movement] of workout.movements.entries()) {
    await tx.runAsync(
      'INSERT INTO workout_movements(id, workout_id, exercise_id, position, notes, rest_seconds, superset_group) VALUES (?, ?, ?, ?, ?, ?, ?)',
      movement.id, workout.id, movement.exerciseId, mIndex, movement.notes ?? '',
      movement.restSeconds ?? 90, movement.supersetGroup ?? null,
    );
    for (const [sIndex, set] of movement.sets.entries()) {
      await tx.runAsync(
        'INSERT INTO workout_sets(id, movement_id, position, reps, weight_kg, completed, duration_seconds, distance_meters, set_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        set.id, movement.id, sIndex, set.reps, set.weightKg, set.completed ? 1 : 0,
        set.durationSeconds ?? null, set.distanceMeters ?? null, set.setType ?? 'normal',
      );
    }
  }
}

async function writeSnapshot(tx: SqlClient, data: GymData): Promise<void> {
  await tx.runAsync('DELETE FROM workouts');
  await tx.runAsync(
    'UPDATE preferences SET weight_unit = ?, theme = ? WHERE id = 1',
    data.preferences.unit, data.preferences.theme,
  );
  for (const workout of data.workouts) await writeWorkout(tx, workout);
}
