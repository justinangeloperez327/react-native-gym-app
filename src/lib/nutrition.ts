import type { FoodItem, MealEntry, MealType, NutritionTargets, WaterEntry } from '../types/gym';
import { isCalendarDate, localDateKey } from './body-metrics.ts';

export const MEAL_TYPES: readonly { kind: MealType; label: string }[] = [
  { kind: 'breakfast', label: 'Breakfast' },
  { kind: 'lunch', label: 'Lunch' },
  { kind: 'dinner', label: 'Dinner' },
  { kind: 'snack', label: 'Snacks' },
];

function validNumber(value: number, max: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
}

export function validateFood(food: FoodItem): void {
  if (!food.id.startsWith('food:') || food.id.length > 90 || typeof food.name !== 'string' ||
      food.name.trim().length < 2 || food.name.trim().length > 100 ||
      typeof food.brand !== 'string' || food.brand.length > 80 ||
      typeof food.archived !== 'boolean' ||
      !validNumber(food.servingGrams, 5000) || food.servingGrams <= 0 ||
      !validNumber(food.caloriesPerServing, 10000) ||
      !validNumber(food.proteinPerServing, 1000) ||
      !validNumber(food.carbsPerServing, 1000) ||
      !validNumber(food.fatPerServing, 1000)) {
    throw new Error('Invalid food name, serving size or nutrition values');
  }
}

export function validateMeal(entry: MealEntry): void {
  if (!entry.id.startsWith('meal:') || entry.id.length > 90 ||
      !isCalendarDate(entry.eatenOn) || entry.eatenOn > localDateKey() ||
      !MEAL_TYPES.some(type => type.kind === entry.mealType) ||
      !validNumber(entry.quantity, 50) || entry.quantity < 0.05 ||
      typeof entry.foodId !== 'string' || !entry.foodId.startsWith('food:') ||
      typeof entry.foodName !== 'string' || entry.foodName.trim().length < 2 ||
      entry.foodName.length > 100 || typeof entry.foodBrand !== 'string' ||
      entry.foodBrand.length > 80 || !validNumber(entry.servingGrams, 5000) ||
      entry.servingGrams <= 0 || !validNumber(entry.caloriesPerServing, 10000) ||
      !validNumber(entry.proteinPerServing, 1000) ||
      !validNumber(entry.carbsPerServing, 1000) || !validNumber(entry.fatPerServing, 1000)) {
    throw new Error('Invalid meal date, serving quantity or nutrition snapshot');
  }
}

export function mealFromFood(
  food: FoodItem, eatenOn: string, mealType: MealType, quantity: number, id: string,
): MealEntry {
  validateFood(food);
  if (food.archived) throw new Error('Archived food cannot be logged');
  const entry: MealEntry = {
    id, eatenOn, mealType, quantity, foodId: food.id,
    foodName: food.name, foodBrand: food.brand,
    servingGrams: food.servingGrams, caloriesPerServing: food.caloriesPerServing,
    proteinPerServing: food.proteinPerServing, carbsPerServing: food.carbsPerServing,
    fatPerServing: food.fatPerServing,
  };
  validateMeal(entry);
  return entry;
}

export function mealCalories(entry: MealEntry): number {
  return entry.quantity * entry.caloriesPerServing;
}

export function mealsOnDay(meals: readonly MealEntry[], date: string): MealEntry[] {
  return meals.filter(meal => meal.eatenOn === date)
    .sort((a, b) => MEAL_TYPES.findIndex(type => type.kind === a.mealType) -
      MEAL_TYPES.findIndex(type => type.kind === b.mealType) || a.id.localeCompare(b.id));
}

export function totalCalories(meals: readonly MealEntry[]): number {
  return meals.reduce((sum, meal) => sum + mealCalories(meal), 0);
}

export function caloriesByMeal(meals: readonly MealEntry[]): Record<MealType, number> {
  const totals: Record<MealType, number> = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
  for (const meal of meals) totals[meal.mealType] += mealCalories(meal);
  return totals;
}

export function searchFoods(foods: readonly FoodItem[], query: string, includeArchived = false): FoodItem[] {
  const q = query.trim().toLocaleLowerCase();
  return foods.filter(food => (includeArchived || !food.archived) &&
    (food.name + ' ' + food.brand).toLocaleLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name) || a.brand.localeCompare(b.brand));
}

export function nutritionTotals(meals: readonly MealEntry[]): {
  calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number;
} {
  return meals.reduce((result, meal) => ({
    calories: result.calories + meal.caloriesPerServing * meal.quantity,
    proteinGrams: result.proteinGrams + meal.proteinPerServing * meal.quantity,
    carbsGrams: result.carbsGrams + meal.carbsPerServing * meal.quantity,
    fatGrams: result.fatGrams + meal.fatPerServing * meal.quantity,
  }), { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 });
}

export const EMPTY_NUTRITION_TARGETS: NutritionTargets = {
  calories: null, proteinGrams: null, carbsGrams: null, fatGrams: null, waterMl: null,
};

export const TARGET_BOUNDS: Record<keyof NutritionTargets, number> = {
  calories: 10000, proteinGrams: 1000, carbsGrams: 1500, fatGrams: 500, waterMl: 10000,
};

export function validateNutritionTargets(targets: NutritionTargets): void {
  for (const key of Object.keys(TARGET_BOUNDS) as (keyof NutritionTargets)[]) {
    const value = targets[key];
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) ||
      value <= 0 || value > TARGET_BOUNDS[key])) {
      throw new Error('Invalid nutrition target: ' + key);
    }
  }
}

export function validateWaterEntry(entry: WaterEntry): void {
  if (typeof entry.id !== 'string' || !entry.id.startsWith('water:') || entry.id.length > 90 ||
    !isCalendarDate(entry.recordedOn) || entry.recordedOn > localDateKey() ||
    typeof entry.amountMl !== 'number' || !Number.isFinite(entry.amountMl) ||
    entry.amountMl <= 0 || entry.amountMl > 5000) {
    throw new Error('Invalid water entry, date, or amount');
  }
}

export function waterOnDay(water: readonly WaterEntry[], date: string): WaterEntry[] {
  return water.filter(item => item.recordedOn === date).sort((a,b) => a.id.localeCompare(b.id));
}

export function totalWaterMl(entries: readonly WaterEntry[]): number {
  return entries.reduce((sum, item) => sum + item.amountMl, 0);
}

export function progressToTarget(value: number, target: number | null): {
  percent: number; remaining: number | null; over: number | null;
} {
  if (target === null) return { percent: 0, remaining: null, over: null };
  if (!Number.isFinite(value) || value < 0 || !Number.isFinite(target) || target <= 0) throw new Error('Invalid progress inputs');
  return { percent: Math.min(100, Math.max(0, (value / target) * 100)),
    remaining: Math.max(0, target - value), over: Math.max(0, value - target) };
}

/** A rolling local seven-day summary that counts entries on each calendar day. */
export function sevenDayNutrition(
  meals: readonly MealEntry[], water: readonly WaterEntry[], now = new Date(),
): Array<{ day: string; calories: number; proteinGrams: number; carbsGrams: number;
  fatGrams: number; waterMl: number }> {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - index));
    const day = localDateKey(date);
    return { day, ...nutritionTotals(mealsOnDay(meals, day)), waterMl: totalWaterMl(waterOnDay(water, day)) };
  });
}

/** Grams-derived energy fraction is indicative only; user entered kcal may differ. */
export function macroEnergySplit(grams: Pick<ReturnType<typeof nutritionTotals>,
  'proteinGrams' | 'carbsGrams' | 'fatGrams'>): {
  proteinPercent: number; carbsPercent: number; fatPercent: number;
} {
  const p = grams.proteinGrams * 4, c = grams.carbsGrams * 4, f = grams.fatGrams * 9;
  const total = p + c + f;
  return total > 0
    ? { proteinPercent: (p / total) * 100, carbsPercent: (c / total) * 100, fatPercent: (f / total) * 100 }
    : { proteinPercent: 0, carbsPercent: 0, fatPercent: 0 };
}
