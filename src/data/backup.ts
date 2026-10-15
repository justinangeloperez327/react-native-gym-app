import { isGymData } from './legacy.ts';
import { normalizeExerciseInput } from './exercises.ts';
import { validateRoutine } from './routines.ts';
import { assertMeasurement, assertGoal } from '../lib/body-metrics.ts';
import { validateFood, validateMeal, validateNutritionTargets, validateWaterEntry } from '../lib/nutrition.ts';
import { validateRecovery } from '../lib/recovery.ts';
import type { GymBackup } from '../types/gym';

export const BACKUP_VERSION = 1;
export const BACKUP_MAX_BYTES = 12 * 1024 * 1024;
const MAX_ITEMS = 100000;

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('Invalid backup: ' + message);
}
function record(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === 'object' && !Array.isArray(input);
}
function unique(items: readonly { id: string }[], label: string): void {
  const ids = items.map(item => item.id);
  ensure(new Set(ids).size === ids.length, 'duplicate ' + label + ' IDs');
}
function array(input: unknown, label: string): asserts input is unknown[] {
  ensure(Array.isArray(input) && input.length <= MAX_ITEMS, label + ' must be an array within size limits');
}
function requireKeys(input: Record<string, unknown>, keys: readonly string[]): void {
  for (const key of keys) ensure(Object.hasOwn(input, key), 'missing ' + key);
}

export function validateBackup(input: unknown): GymBackup {
  ensure(record(input), 'expected a JSON object');
  ensure(input.format === 'react-native-gym-app-backup', 'unrecognized format');
  ensure(input.version === BACKUP_VERSION, 'unsupported backup version; no data was changed');
  ensure(typeof input.createdAt === 'string' &&
    Number.isFinite(Date.parse(input.createdAt)), 'creation time is missing');
  ensure(isGymData(input.snapshot), 'workout data is invalid');
  const names = [
    'customExercises', 'routines', 'measurements', 'goals', 'foods',
    'meals', 'waterEntries', 'recoveryEntries',
  ] as const;
  for (const name of names) array(input[name], name);
  ensure(Object.hasOwn(input, 'nutritionTargets'), 'missing nutrition targets');
  const backup = input as unknown as GymBackup;

  // Validate all input before beginning a single SQLite replacement transaction.
  for (const exercise of backup.customExercises) {
    ensure(record(exercise) && typeof exercise.id === 'string' &&
      exercise.id.startsWith('custom:') && exercise.custom === true &&
      typeof exercise.archived === 'boolean' && typeof exercise.name === 'string' &&
      typeof exercise.equipment === 'string', 'invalid custom exercise');
    normalizeExerciseInput(exercise);
  }
  unique(backup.customExercises, 'custom exercise');
  const namesSeen = new Set<string>();
  for (const exercise of backup.customExercises) {
    const normalized = exercise.name.trim().toLocaleLowerCase();
    ensure(!namesSeen.has(normalized), 'duplicate custom exercise names');
    namesSeen.add(normalized);
  }
  for (const routine of backup.routines) {
    ensure(record(routine) && typeof routine.id === 'string' &&
      typeof routine.name === 'string' && typeof routine.description === 'string' &&
      typeof routine.createdAt === 'string' && typeof routine.updatedAt === 'string' &&
      Array.isArray(routine.days) && Array.isArray(routine.exercises), 'invalid routine');
    validateRoutine(routine);
  }
  unique(backup.routines, 'routine');
  const routineItemIds = backup.routines.flatMap(r => r.exercises.map(e => e.id));
  ensure(new Set(routineItemIds).size === routineItemIds.length, 'duplicate routine exercise IDs');

  for (const item of backup.measurements) {
    ensure(record(item) && typeof item.id === 'string' && typeof item.kind === 'string' &&
      typeof item.recordedOn === 'string' && typeof item.value === 'number' &&
      (item.notes === undefined || typeof item.notes === 'string'), 'invalid measurement');
    assertMeasurement(item);
  }
  unique(backup.measurements, 'measurement');
  ensure(new Set(backup.measurements.map(i => i.kind + ':' + i.recordedOn)).size === backup.measurements.length,
    'duplicate measurement date');
  for (const item of backup.goals) {
    ensure(record(item) && typeof item.id === 'string' && typeof item.kind === 'string' &&
      typeof item.createdOn === 'string' && typeof item.startValue === 'number' &&
      typeof item.targetValue === 'number', 'invalid fitness goal');
    assertGoal(item);
  }
  unique(backup.goals, 'goal');
  ensure(new Set(backup.goals.map(g => g.kind)).size === backup.goals.length, 'duplicate goal category');

  for (const food of backup.foods) {
    ensure(record(food) && typeof food.id === 'string' && typeof food.name === 'string' &&
      typeof food.brand === 'string' && typeof food.archived === 'boolean' &&
      typeof food.servingGrams === 'number' && typeof food.caloriesPerServing === 'number' &&
      typeof food.proteinPerServing === 'number' && typeof food.carbsPerServing === 'number' &&
      typeof food.fatPerServing === 'number', 'invalid food');
    validateFood(food);
  }
  unique(backup.foods, 'food');

  for (const meal of backup.meals) {
    ensure(record(meal) && typeof meal.id === 'string' && typeof meal.eatenOn === 'string' &&
      typeof meal.mealType === 'string' && typeof meal.quantity === 'number' &&
      typeof meal.foodId === 'string' && typeof meal.foodName === 'string' &&
      typeof meal.foodBrand === 'string' && typeof meal.servingGrams === 'number' &&
      typeof meal.caloriesPerServing === 'number' && typeof meal.proteinPerServing === 'number' &&
      typeof meal.carbsPerServing === 'number' && typeof meal.fatPerServing === 'number', 'invalid meal');
    validateMeal(meal);
  }
  unique(backup.meals, 'meal');
  if (backup.nutritionTargets !== null) {
    ensure(record(backup.nutritionTargets), 'invalid nutrition targets');
    requireKeys(backup.nutritionTargets, [
      'calories', 'proteinGrams', 'carbsGrams', 'fatGrams', 'waterMl',
    ]);
    validateNutritionTargets(backup.nutritionTargets);
  }
  for (const water of backup.waterEntries) {
    ensure(record(water) && typeof water.id === 'string' &&
      typeof water.recordedOn === 'string' && typeof water.amountMl === 'number',
      'invalid water entry');
    validateWaterEntry(water);
  }
  unique(backup.waterEntries, 'water');
  for (const entry of backup.recoveryEntries) {
    ensure(record(entry) && typeof entry.id === 'string' &&
      typeof entry.recordedOn === 'string' && typeof entry.notes === 'string' &&
      (['sleepMinutes', 'sleepQuality', 'energy', 'mood', 'soreness', 'stress'] as const).every(key =>
        (entry[key] === null || typeof entry[key] === 'number') && Object.hasOwn(entry, key)),
      'invalid recovery entry');
    validateRecovery(entry);
  }
  unique(backup.recoveryEntries, 'recovery');
  ensure(new Set(backup.recoveryEntries.map(i => i.recordedOn)).size === backup.recoveryEntries.length,
    'duplicate recovery date');
  return backup;
}

export function parseBackup(text: string): GymBackup {
  ensure(typeof text === 'string' && text.length <= BACKUP_MAX_BYTES && text.length > 0,
    'file is empty or exceeds 12 MB');
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error('Selected backup is not valid JSON. Current data was not changed.'); }
  return validateBackup(value);
}

export function serializeBackup(backup: GymBackup): string {
  validateBackup(backup);
  const output = JSON.stringify(backup, null, 2);
  ensure(output.length <= BACKUP_MAX_BYTES, 'backup exceeds the supported 12 MB export limit');
  return output;
}

export function describeBackup(backup: GymBackup): string {
  return [
    backup.snapshot.workouts.length + ' workouts',
    backup.routines.length + ' routines',
    backup.foods.length + ' foods',
    backup.meals.length + ' meals',
    backup.measurements.length + ' measurements',
    backup.waterEntries.length + ' water logs',
    backup.recoveryEntries.length + ' recovery check-ins',
  ].join(' · ');
}
