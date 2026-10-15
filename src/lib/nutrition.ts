import type { FoodItem, MealEntry, MealType } from '../types/gym';
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
