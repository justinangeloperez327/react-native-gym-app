import test from 'node:test';
import assert from 'node:assert/strict';
import { minTouchTarget, radius, space, typeScale } from '../src/theme/tokens.ts';

test('interactive controls use an accessible baseline touch target', () => {
  assert.ok(minTouchTarget >= 44);
});

test('shared spacing follows a compact ascending scale', () => {
  const values = Object.values(space);
  assert.ok(values.every(Number.isInteger));
  assert.deepEqual(values, [...values].sort((a, b) => a - b));
  assert.ok(values.every((value) => value > 0));
});

test('shared design tokens have useful font sizes and modest corners', () => {
  assert.ok(typeScale.body >= 14);
  assert.ok(typeScale.heading > typeScale.section);
  assert.ok(radius.control <= 8);
  assert.ok(radius.card <= 8);
});
