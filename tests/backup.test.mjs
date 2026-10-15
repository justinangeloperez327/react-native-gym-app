import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBackup, serializeBackup, validateBackup, BACKUP_MAX_BYTES, describeBackup, utf8ByteLength } from '../src/data/backup.ts';

const base = () => ({
  format: 'react-native-gym-app-backup', version: 1, createdAt: '2026-10-15T07:00:00.000Z',
  snapshot: { version: 1, workouts: [], preferences: { unit: 'kg', theme: 'system' } },
  customExercises: [], routines: [], measurements: [], goals: [],
  foods: [], meals: [], nutritionTargets: null, waterEntries: [], recoveryEntries: [],
});

test('versioned empty full backup can serialize, parse and describe', () => {
  const source = base();
  const text = serializeBackup(source);
  assert.deepEqual(parseBackup(text), source);
  assert.match(describeBackup(source), /0 workouts/);
  assert.equal(validateBackup(source).version, 1);
});

test('backup rejects invalid JSON, unknown versions, missing sections and duplicate IDs', () => {
  assert.throws(() => parseBackup('not json'), /valid JSON/);
  assert.throws(() => parseBackup(''), /empty/);
  assert.throws(() => parseBackup('x'.repeat(BACKUP_MAX_BYTES + 1)), /12 MB/);
  assert.throws(() => validateBackup({ ...base(), version: 2 }), /unsupported backup version/);
  const { waterEntries: _removed, ...incomplete } = base();
  assert.throws(() => validateBackup(incomplete), /waterEntries/);
  const food = { id: 'food:x', name: 'Rice', brand: '', servingGrams: 100,
    caloriesPerServing: 110, proteinPerServing: 2, carbsPerServing: 21, fatPerServing: 1, archived: false };
  assert.throws(() => validateBackup({ ...base(), foods: [food, food] }), /duplicate food IDs/);
  assert.throws(() => validateBackup({ ...base(), meals: [{
    id: 'meal:a', eatenOn: '2026-10-14', mealType: 'supper',
    quantity: 1, foodId: 'food:x', foodName: 'Rice', foodBrand: '', servingGrams: 100,
    caloriesPerServing: 110, proteinPerServing: 2, carbsPerServing: 21, fatPerServing: 1,
  }] }), /Invalid meal/);
});

test('format preserves optional goals and exact floating-point nutrition snapshot', () => {
  const backup = { ...base(),
    nutritionTargets: { calories: 1900, proteinGrams: 115.5, carbsGrams: null,
      fatGrams: null, waterMl: null },
    meals: [{
      id: 'meal:float', eatenOn: '2026-10-12', mealType: 'breakfast', quantity: 1.25,
      foodId: 'food:x', foodName: 'Food label', foodBrand: '', servingGrams: 123.4,
      caloriesPerServing: 234.5, proteinPerServing: 21.1, carbsPerServing: 22.3,
      fatPerServing: 6.7,
    }] };
  assert.deepEqual(parseBackup(serializeBackup(backup)), backup);
});


test('backup size limit uses UTF-8 bytes, not JavaScript code units', () => {
  assert.equal(utf8ByteLength('plain'), 5);
  assert.equal(utf8ByteLength('你好'), 6);
  assert.equal(utf8ByteLength('🙂'), 4);
  const huge = '🔥'.repeat(Math.floor(BACKUP_MAX_BYTES / 4) + 1);
  assert.ok(huge.length < BACKUP_MAX_BYTES);
  assert.throws(() => parseBackup(huge), /12 MB/);
});
