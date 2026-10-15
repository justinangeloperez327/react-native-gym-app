import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_NUTRITION_TARGETS, validateNutritionTargets, validateWaterEntry,
  nutritionTotals, totalWaterMl, waterOnDay, sevenDayNutrition, progressToTarget, macroEnergySplit,
} from '../src/lib/nutrition.ts';

const meal = (id, eatenOn, quantity = 1) => ({
  id, eatenOn, mealType: 'lunch', quantity, foodId: 'food:meal', foodName: 'Meal', foodBrand: '',
  servingGrams: 100, caloriesPerServing: 200, proteinPerServing: 10,
  carbsPerServing: 30, fatPerServing: 4,
});

test('macro totals multiply logged serving snapshots without estimating omitted facts', () => {
  const totals = nutritionTotals([meal('meal:a', '2026-10-12', 1.5), meal('meal:b', '2026-10-12', 2)]);
  assert.deepEqual(totals, { calories: 700, proteinGrams: 35, carbsGrams: 105, fatGrams: 14 });
  assert.deepEqual(nutritionTotals([]), { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 });
});

test('targets are strictly optional and values are finite, positive and bounded', () => {
  assert.doesNotThrow(() => validateNutritionTargets(EMPTY_NUTRITION_TARGETS));
  assert.doesNotThrow(() => validateNutritionTargets({
    calories: 2200, proteinGrams: null, carbsGrams: 240, fatGrams: null, waterMl: 2000,
  }));
  for (const value of [-1, 0, Infinity, NaN, 11000]) {
    assert.throws(() => validateNutritionTargets({ ...EMPTY_NUTRITION_TARGETS, calories: value }), /Invalid/);
  }
  assert.throws(() => validateNutritionTargets({ ...EMPTY_NUTRITION_TARGETS, waterMl: 20000 }), /Invalid/);
});

test('daily target comparisons show remaining or over, and cap visual fill', () => {
  assert.deepEqual(progressToTarget(900, 1800), { percent: 50, remaining: 900, over: 0 });
  assert.deepEqual(progressToTarget(2100, 1800), { percent: 100, remaining: 0, over: 300 });
  assert.deepEqual(progressToTarget(150, null), { percent: 0, remaining: null, over: null });
  assert.throws(() => progressToTarget(-1, 150), /Invalid|progress/i);
});

test('water validation, date scoping and totals exclude other days', () => {
  const entries = [
    { id: 'water:a', recordedOn: '2026-10-12', amountMl: 250 },
    { id: 'water:b', recordedOn: '2026-10-12', amountMl: 500 },
    { id: 'water:c', recordedOn: '2026-10-13', amountMl: 300 },
  ];
  for (const item of entries) assert.doesNotThrow(() => validateWaterEntry(item));
  assert.equal(totalWaterMl(waterOnDay(entries, '2026-10-12')), 750);
  assert.equal(totalWaterMl(waterOnDay(entries, '2026-10-13')), 300);
  assert.equal(totalWaterMl([]), 0);
  for (const patch of [{ amountMl: -1 }, { amountMl: 5001 }, { amountMl: NaN },
    { recordedOn: '2099-01-01' }, { recordedOn: '2026-02-30' }]) {
    assert.throws(() => validateWaterEntry({ ...entries[0], ...patch }), /Invalid water/);
  }
});

test('seven-day local calendar summary includes empty days with no invented measurements', () => {
  const now = new Date(2026, 9, 15, 12);
  const totals = sevenDayNutrition([
    meal('meal:a', '2026-10-12', 2),
    meal('meal:b', '2026-10-15', 1.5),
    meal('meal:c', '2026-09-28', 8),
  ], [
    { id: 'water:one', recordedOn: '2026-10-12', amountMl: 200 },
    { id: 'water:two', recordedOn: '2026-10-15', amountMl: 500 },
  ], now);
  assert.equal(totals.length, 7);
  assert.equal(totals[0].day, '2026-10-09');
  assert.equal(totals[6].day, '2026-10-15');
  assert.equal(totals[3].calories, 400);
  assert.equal(totals[3].waterMl, 200);
  assert.equal(totals[6].calories, 300);
  assert.equal(totals[6].waterMl, 500);
  assert.equal(totals[1].calories, 0);
});

test('macro energy split uses 4/4/9 factors rather than label kcal', () => {
  const split = macroEnergySplit({ proteinGrams: 25, carbsGrams: 25, fatGrams: 0 });
  assert.equal(split.proteinPercent, 50);
  assert.equal(split.carbsPercent, 50);
  assert.equal(split.fatPercent, 0);
  assert.deepEqual(macroEnergySplit({ proteinGrams: 0, carbsGrams: 0, fatGrams: 0 }),
    { proteinPercent: 0, carbsPercent: 0, fatPercent: 0 });
});
