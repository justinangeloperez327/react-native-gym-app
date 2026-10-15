import test from 'node:test';
import assert from 'node:assert/strict';
import { MEAL_TYPES, validateFood, validateMeal, mealFromFood, mealCalories, totalCalories,
  mealsOnDay, caloriesByMeal, searchFoods } from '../src/lib/nutrition.ts';

const food = { id: 'food:one', name: 'Personal Rice Bowl', brand: 'Home',
  servingGrams: 180, caloriesPerServing: 230, proteinPerServing: 12,
  carbsPerServing: 38, fatPerServing: 5, archived: false };

test('validates food servings and optional nutrition fields', () => {
  assert.doesNotThrow(() => validateFood(food));
  for (const patch of [{ name: ' ' }, { servingGrams: -1 }, { servingGrams: 0 },
    { caloriesPerServing: -1 }, { proteinPerServing: Infinity }, { fatPerServing: -0.1 },
    { carbsPerServing: NaN }]) {
    assert.throws(() => validateFood({ ...food, ...patch }), /Invalid food/);
  }
});

test('meal snapshots remain independent of edits to food definitions', () => {
  const entry = mealFromFood(food, '2026-10-10', 'lunch', 1.5, 'meal:one');
  assert.equal(mealCalories(entry), 345);
  assert.equal(entry.servingGrams, 180);
  const updatedFood = { ...food, name: 'Renamed', caloriesPerServing: 300 };
  assert.equal(updatedFood.caloriesPerServing, 300);
  assert.equal(entry.foodName, 'Personal Rice Bowl');
  assert.equal(entry.caloriesPerServing, 230);
  assert.throws(() => mealFromFood({ ...food, archived: true }, '2026-10-10', 'lunch', 1, 'meal:two'), /Archived/);
});

test('meal validation rejects future dates, bad categories, and quantities', () => {
  const entry = mealFromFood(food, '2026-10-10', 'snack', 0.5, 'meal:one');
  assert.doesNotThrow(() => validateMeal(entry));
  for (const patch of [{ eatenOn: '2026-02-30' }, { eatenOn: '2099-12-01' },
    { quantity: 0 }, { quantity: 100 }, { mealType: 'midnight' }, { caloriesPerServing: -1 }]) {
    assert.throws(() => validateMeal({ ...entry, ...patch }), /Invalid meal/);
  }
  assert.equal(MEAL_TYPES.length, 4);
});

test('calorie totals are calculated only for a selected local diary day', () => {
  const a = mealFromFood(food, '2026-10-10', 'breakfast', 1, 'meal:a');
  const b = mealFromFood(food, '2026-10-10', 'dinner', 2, 'meal:b');
  const c = mealFromFood(food, '2026-10-11', 'snack', 3, 'meal:c');
  const selected = mealsOnDay([b, c, a], '2026-10-10');
  assert.deepEqual(selected.map(e => e.id), ['meal:a', 'meal:b']);
  assert.equal(totalCalories(selected), 690);
  assert.deepEqual(caloriesByMeal(selected), { breakfast: 230, lunch: 0, dinner: 460, snack: 0 });
  assert.equal(totalCalories([]), 0);
});

test('food search matches names and brands and hides archived foods', () => {
  const archived = { ...food, id: 'food:old', name: 'Old bowl', archived: true };
  const soup = { ...food, id: 'food:soup', name: 'Vegetable Soup', brand: 'Cafe' };
  assert.deepEqual(searchFoods([archived, food, soup], 'home').map(f => f.id), ['food:one']);
  assert.deepEqual(searchFoods([archived, food, soup], 'SOUP').map(f => f.id), ['food:soup']);
  assert.equal(searchFoods([archived, food, soup], '').length, 2);
  assert.equal(searchFoods([archived], '', true).length, 1);
});
