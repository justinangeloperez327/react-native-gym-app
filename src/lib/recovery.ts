import type { RecoveryEntry, Workout } from '../types/gym';
import { isCalendarDate, localDateKey } from './body-metrics.ts';
import { completedSets, totalVolumeKg } from './workouts.ts';

export type RecoveryRating = 'sleepQuality' | 'energy' | 'mood' | 'soreness' | 'stress';
export const RECOVERY_RATINGS: readonly { key: RecoveryRating; label: string; explanation: string }[] = [
  { key: 'sleepQuality', label: 'Sleep quality', explanation: '1 poor · 5 excellent' },
  { key: 'energy', label: 'Energy', explanation: '1 very low · 5 very high' },
  { key: 'mood', label: 'Mood', explanation: '1 very low · 5 very positive' },
  { key: 'soreness', label: 'Soreness', explanation: '1 none · 5 very sore' },
  { key: 'stress', label: 'Stress', explanation: '1 minimal · 5 very high' },
];

export function validateRecovery(entry: RecoveryEntry, today = localDateKey()): void {
  if (typeof entry.id !== 'string' || !entry.id.startsWith('recovery:') ||
      entry.id.length > 100 || !isCalendarDate(entry.recordedOn) ||
      entry.recordedOn > today || !isCalendarDate(today) ||
      typeof entry.notes !== 'string' || entry.notes.length > 500 ||
      (entry.sleepMinutes !== null && (!Number.isSafeInteger(entry.sleepMinutes) ||
        entry.sleepMinutes < 1 || entry.sleepMinutes > 1440))) {
    throw new Error('Invalid recovery date, sleep duration or notes');
  }
  for (const { key } of RECOVERY_RATINGS) {
    const value = entry[key];
    if (value !== null && (!Number.isSafeInteger(value) || value < 1 || value > 5)) {
      throw new Error('Invalid recovery rating: ' + key);
    }
  }
  if (entry.sleepMinutes === null && RECOVERY_RATINGS.every(item => entry[item.key] === null) &&
      !entry.notes.trim()) {
    throw new Error('Record sleep, a check-in rating or a note before saving');
  }
}

export function recoveryByDate(entries: readonly RecoveryEntry[], date: string): RecoveryEntry | undefined {
  return entries.find(entry => entry.recordedOn === date);
}

export function recoveryHistory(entries: readonly RecoveryEntry[]): RecoveryEntry[] {
  return [...entries].sort((a, b) =>
    b.recordedOn.localeCompare(a.recordedOn) || a.id.localeCompare(b.id));
}

export function formatSleep(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  return hours + 'h ' + String(remain).padStart(2, '0') + 'm';
}

export type RecoveryDay = {
  date: string;
  checkin: RecoveryEntry | null;
  workoutCount: number;
  completedSetCount: number;
  volumeKg: number;
};

/**
 * Calendar-day alignment is descriptive only. Dates are based on completed
 * workout finish timestamps in local time, not workout start or active sessions.
 */
export function recoveryTrainingDays(
  entries: readonly RecoveryEntry[], workouts: readonly Workout[],
  now = new Date(), days = 14,
): RecoveryDay[] {
  if (!Number.isFinite(now.getTime()) || !Number.isSafeInteger(days) || days < 1 || days > 90) {
    throw new Error('Invalid recovery summary window');
  }
  const dates: RecoveryDay[] = Array.from({ length: days }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - i - 1));
    const date = localDateKey(d);
    return { date, checkin: recoveryByDate(entries, date) ?? null,
      workoutCount: 0, completedSetCount: 0, volumeKg: 0 };
  });
  const byDate = new Map(dates.map(day => [day.date, day]));
  for (const workout of workouts) {
    if (!workout.finishedAt) continue;
    const timestamp = Date.parse(workout.finishedAt);
    if (!Number.isFinite(timestamp) || timestamp > now.getTime()) continue;
    const bucket = byDate.get(localDateKey(new Date(timestamp)));
    if (!bucket) continue;
    bucket.workoutCount++;
    bucket.completedSetCount += completedSets(workout);
    bucket.volumeKg += totalVolumeKg(workout);
  }
  return dates;
}

export type RecoverySummary = {
  daysWithCheckins: number;
  daysWithSleep: number;
  averageSleepMinutes: number | null;
  averageEnergy: number | null;
  averageSoreness: number | null;
  workoutsOnCheckinDays: number;
};

export function summarizeRecovery(days: readonly RecoveryDay[]): RecoverySummary {
  const saved = days.flatMap(day => day.checkin ? [day.checkin] : []);
  const sleep = saved.flatMap(entry => entry.sleepMinutes === null ? [] : [entry.sleepMinutes]);
  const energy = saved.flatMap(entry => entry.energy === null ? [] : [entry.energy]);
  const soreness = saved.flatMap(entry => entry.soreness === null ? [] : [entry.soreness]);
  const avg = (values: number[]) => values.length
    ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return {
    daysWithCheckins: saved.length, daysWithSleep: sleep.length,
    averageSleepMinutes: avg(sleep), averageEnergy: avg(energy),
    averageSoreness: avg(soreness),
    workoutsOnCheckinDays: days.reduce((n, day) => n + (day.checkin ? day.workoutCount : 0), 0),
  };
}
