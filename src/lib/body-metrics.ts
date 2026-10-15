import type { BodyMeasurement, BodyMetricKind, FitnessGoal, FitnessGoalKind, Workout, WeightUnit } from '../types/gym';

export const BODY_METRICS: readonly { kind: BodyMetricKind; label: string }[] = [
  { kind: 'weight', label: 'Body weight' },
  { kind: 'waist', label: 'Waist' },
  { kind: 'chest', label: 'Chest' },
  { kind: 'hips', label: 'Hips' },
  { kind: 'upper_arm', label: 'Upper arm' },
  { kind: 'thigh', label: 'Thigh' },
];

const validMetricKinds: BodyMetricKind[] = ['weight', 'waist', 'chest', 'hips', 'upper_arm', 'thigh'];
const LB_PER_KG = 2.2046226218;
const CM_PER_INCH = 2.54;

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && year <= 2200 &&
    parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day;
}

export function localDateKey(date = new Date()): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
}

export function measurementUnit(kind: BodyMetricKind, unit: WeightUnit): 'kg' | 'lb' | 'cm' | 'in' {
  return kind === 'weight' ? unit : unit === 'lb' ? 'in' : 'cm';
}

export function fromCanonical(value: number, kind: BodyMetricKind, unit: WeightUnit): number {
  return kind === 'weight' ? (unit === 'lb' ? value * LB_PER_KG : value) :
    (unit === 'lb' ? value / CM_PER_INCH : value);
}

export function toCanonical(value: number, kind: BodyMetricKind, unit: WeightUnit): number {
  return kind === 'weight' ? (unit === 'lb' ? value / LB_PER_KG : value) :
    (unit === 'lb' ? value * CM_PER_INCH : value);
}

export function formatMeasurement(value: number, kind: BodyMetricKind, unit: WeightUnit): string {
  const display = fromCanonical(value, kind, unit);
  return display.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' ' + measurementUnit(kind, unit);
}

export function assertMeasurement(entry: BodyMeasurement): void {
  if (!entry.id.startsWith('body:') || entry.id.length > 90 ||
      !validMetricKinds.includes(entry.kind) || !isCalendarDate(entry.recordedOn) ||
      !Number.isFinite(entry.value) || entry.value <= 0 ||
      (entry.kind === 'weight' ? entry.value > 650 : entry.value > 500)) {
    throw new Error('Invalid body measurement, date or value');
  }
  if ((entry.notes ?? '').length > 500) throw new Error('Measurement notes exceed 500 characters');
}

export function assertGoal(goal: FitnessGoal): void {
  if (!goal.id.startsWith('goal:') || goal.id.length > 90 ||
      !['body_weight', 'weekly_workouts'].includes(goal.kind) ||
      !isCalendarDate(goal.createdOn) ||
      !Number.isFinite(goal.targetValue) || !Number.isFinite(goal.startValue)) {
    throw new Error('Invalid goal');
  }
  if (goal.kind === 'body_weight') {
    if (goal.targetValue < 20 || goal.targetValue > 650 ||
        goal.startValue < 20 || goal.startValue > 650) throw new Error('Weight goal must be in a valid range');
  } else {
    if (!Number.isSafeInteger(goal.targetValue) || goal.targetValue < 1 ||
        goal.targetValue > 14 || goal.startValue !== 0) throw new Error('Weekly workout goal must be 1–14');
  }
}

export function measurementHistory(
  readings: readonly BodyMeasurement[], kind: BodyMetricKind,
): BodyMeasurement[] {
  return readings.filter(entry => entry.kind === kind)
    .sort((a, b) => a.recordedOn.localeCompare(b.recordedOn) || a.id.localeCompare(b.id));
}

export function latestReading(readings: readonly BodyMeasurement[], kind: BodyMetricKind, now = new Date()): BodyMeasurement | undefined {
  const today = localDateKey(now);
  return measurementHistory(readings, kind).filter(item => item.recordedOn <= today).at(-1);
}

export function weeklyWorkoutCount(workouts: readonly Workout[], now = new Date()): number {
  // Local calendar weeks, Monday to Sunday. Exclude future-dated sessions.
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7);
  const ids = new Set<string>();
  for (const workout of workouts) {
    if (!workout.finishedAt) continue;
    const finished = Date.parse(workout.finishedAt);
    if (Number.isFinite(finished) && finished >= weekStart.getTime() && finished <= now.getTime()) {
      ids.add(workout.id);
    }
  }
  return ids.size;
}

export type GoalProgress = {
  currentValue: number | null;
  percent: number;
  achieved: boolean;
  remaining: number | null;
};

export function goalProgress(goal: FitnessGoal, measurements: readonly BodyMeasurement[],
  workouts: readonly Workout[], now = new Date()): GoalProgress {
  const current = goal.kind === 'weekly_workouts' ? weeklyWorkoutCount(workouts, now) :
    latestReading(measurements, 'weight', now)?.value ?? null;
  if (current === null) return { currentValue: null, percent: 0, achieved: false, remaining: null };
  if (goal.kind === 'weekly_workouts') {
    const percent = Math.max(0, Math.min(100, 100 * current / goal.targetValue));
    return { currentValue: current, percent, achieved: current >= goal.targetValue,
      remaining: Math.max(0, goal.targetValue - current) };
  }
  const delta = goal.targetValue - goal.startValue;
  const achieved = delta === 0 || (delta > 0 ? current >= goal.targetValue : current <= goal.targetValue);
  const percent = delta === 0 ? 100 :
    Math.max(0, Math.min(100, 100 * (current - goal.startValue) / delta));
  return { currentValue: current, percent, achieved,
    remaining: achieved ? 0 : Math.abs(goal.targetValue - current) };
}
