import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { AppButton, EmptyState, Heading, Metric, Page, Panel, SectionTitle } from '@/src/components/ui';
import { isCalendarDate, localDateKey } from '@/src/lib/body-metrics';
import {
  formatSleep, RECOVERY_RATINGS, recoveryByDate, recoveryHistory,
  recoveryTrainingDays, summarizeRecovery, validateRecovery, type RecoveryRating,
} from '@/src/lib/recovery';
import { createId, formatWeight } from '@/src/lib/workouts';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';
import type { RecoveryEntry } from '@/src/types/gym';

type Ratings = Pick<RecoveryEntry, RecoveryRating>;
const emptyRatings: Ratings = {
  sleepQuality: null, energy: null, mood: null, soreness: null, stress: null,
};

export default function RecoveryScreen() {
  const { recoveryEntries, workouts, preferences, saveRecoveryEntry, deleteRecoveryEntry } = useGym();
  const { colors } = useAppTheme();
  const [date, setDate] = useState(localDateKey());
  const [sleepHours, setSleepHours] = useState('');
  const [ratings, setRatings] = useState<Ratings>(emptyRatings);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(10);
  const today = localDateKey();
  const validDay = isCalendarDate(date) && date <= today;
  const selected = recoveryByDate(recoveryEntries, date);
  const trend = useMemo(() => recoveryTrainingDays(recoveryEntries, workouts), [recoveryEntries, workouts]);
  const summary = useMemo(() => summarizeRecovery(trend), [trend]);
  const history = useMemo(() => recoveryHistory(recoveryEntries), [recoveryEntries]);
  const selectedTraining = trend.find(day => day.date === date);

  useEffect(() => {
    const saved = recoveryByDate(recoveryEntries, date);
    setSleepHours(saved?.sleepMinutes === null || saved?.sleepMinutes === undefined
      ? '' : String(Number((saved.sleepMinutes / 60).toFixed(2))));
    setRatings({
      sleepQuality: saved?.sleepQuality ?? null,
      energy: saved?.energy ?? null,
      mood: saved?.mood ?? null,
      soreness: saved?.soreness ?? null,
      stress: saved?.stress ?? null,
    });
    setNotes(saved?.notes ?? '');
  }, [date, recoveryEntries]);

  function selectDate(next: string) {
    setDate(next);
    setError(null);
  }

  function shiftDay(offset: number) {
    if (!isCalendarDate(date)) { selectDate(today); return; }
    const parts = date.split('-').map(Number);
    const moved = new Date(parts[0], parts[1] - 1, parts[2] + offset);
    const next = localDateKey(moved);
    if (next <= today) selectDate(next);
  }

  async function save() {
    if (busy) return;
    if (!validDay) { setError('Use a valid date on or before today.'); return; }
    const hours = sleepHours.trim() ? Number(sleepHours) : null;
    if (hours !== null && (!Number.isFinite(hours) || hours <= 0 || hours > 24)) {
      setError('Enter sleep duration between 0 and 24 hours, or leave it blank.'); return;
    }
    const entry: RecoveryEntry = {
      id: selected?.id ?? 'recovery:' + createId(),
      recordedOn: date,
      sleepMinutes: hours === null ? null : Math.round(hours * 60),
      ...ratings,
      notes: notes.trim(),
    };
    try { validateRecovery(entry); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid check-in'); return; }
    setBusy(true); setError(null);
    try { await saveRecoveryEntry(entry); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save check-in'); }
    finally { setBusy(false); }
  }

  function remove() {
    if (busy || !selected) return;
    const id = selected.id;
    Alert.alert('Delete recovery check-in?', 'This removes the self-reported values for this day. Workouts remain saved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        setBusy(true); setError(null);
        void deleteRecoveryEntry(id)
          .catch(cause => setError(cause instanceof Error ? cause.message : 'Could not delete check-in'))
          .finally(() => setBusy(false));
      } },
    ]);
  }

  return (
    <Page>
      <View style={{ alignSelf: 'flex-start' }}>
        <AppButton title="Back" secondary onPress={() => router.back()} />
      </View>
      <Heading title="Wellbeing & recovery" subtitle="Private, self-reported sleep and daily check-ins" />
      <View style={{ gap: 10 }}>
        <SectionTitle>Daily check-in</SectionTitle>
        <Panel>
          <Text style={{ color: colors.muted, fontSize: 13 }}>Date (YYYY-MM-DD)</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <NavDay label="Previous day" title="←" onPress={() => shiftDay(-1)} />
            <TextInput accessibilityLabel="Recovery check-in date" value={date}
              onChangeText={selectDate} autoCapitalize="none" maxLength={10}
              style={{ minHeight: 46, flex: 1, borderColor: colors.border, borderWidth: 1,
                borderRadius: 6, backgroundColor: colors.background, textAlign: 'center', color: colors.text }} />
            <NavDay label="Next day" title="→" disabled={date >= today} onPress={() => shiftDay(1)} />
          </View>
          {!validDay ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>
            Enter a valid date on or before today.
          </Text> : null}
          <AppButton title="Today" secondary onPress={() => selectDate(today)} />
          <Text style={{ color: colors.muted, fontSize: 13 }}>Hours slept (optional)</Text>
          <TextInput accessibilityLabel="Sleep duration in hours" value={sleepHours}
            onChangeText={setSleepHours} keyboardType="decimal-pad" placeholder="e.g. 7.5"
            placeholderTextColor={colors.muted}
            style={{ minHeight: 46, borderColor: colors.border, borderWidth: 1,
              borderRadius: 6, backgroundColor: colors.background, color: colors.text, paddingHorizontal: 12 }} />
          {RECOVERY_RATINGS.map(item => (
            <View key={item.key} style={{ gap: 6 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
                {item.label}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{item.explanation}</Text>
              <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap' }}>
                {([1, 2, 3, 4, 5] as const).map(value => (
                  <Pressable key={value} accessibilityRole="button"
                    accessibilityLabel={item.label + ': ' + value + ' out of 5'}
                    accessibilityState={{ selected: ratings[item.key] === value }}
                    onPress={() => setRatings(current => ({ ...current, [item.key]: value }))}
                    style={{ minHeight: 44, minWidth: 44, borderWidth: 1, borderRadius: 6,
                      alignItems: 'center', justifyContent: 'center',
                      borderColor: ratings[item.key] === value ? colors.primary : colors.border,
                      backgroundColor: ratings[item.key] === value ? colors.subtle : colors.surface }}>
                    <Text style={{ color: ratings[item.key] === value ? colors.primary : colors.text,
                      fontWeight: '600' }}>{value}</Text>
                  </Pressable>
                ))}
                <Pressable accessibilityRole="button" accessibilityLabel={'Clear ' + item.label}
                  onPress={() => setRatings(current => ({ ...current, [item.key]: null }))}
                  style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>Clear</Text>
                </Pressable>
              </View>
            </View>
          ))}
          <Text style={{ color: colors.muted, fontSize: 13 }}>Notes (optional, max 500 characters)</Text>
          <TextInput accessibilityLabel="Recovery notes" value={notes} onChangeText={setNotes}
            maxLength={500} multiline placeholder="What might help you understand today?"
            placeholderTextColor={colors.muted}
            style={{ minHeight: 76, borderRadius: 6, borderWidth: 1,
              borderColor: colors.border, backgroundColor: colors.background,
              color: colors.text, padding: 12, textAlignVertical: 'top' }} />
          <AppButton title={busy ? 'Saving…' : selected ? 'Update check-in' : 'Save check-in'}
            disabled={!validDay || busy} onPress={() => { void save(); }} />
          {selected ? <AppButton title="Delete this check-in" secondary destructive
            disabled={busy} onPress={remove} /> : null}
          {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
        </Panel>
        {selectedTraining && selectedTraining.workoutCount ? <Panel>
          <Text style={{ color: colors.text, fontWeight: '600' }}>Training on selected day</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {selectedTraining.workoutCount} completed workouts ·
            {selectedTraining.completedSetCount} sets ·
            {formatWeight(selectedTraining.volumeKg, preferences.unit)} volume
          </Text>
        </Panel> : null}
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Last 14 days</SectionTitle>
        <Panel>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Metric label="Check-in days" value={String(summary.daysWithCheckins)} />
            <Metric label="Avg. sleep" value={summary.averageSleepMinutes === null
              ? '—' : formatSleep(Math.round(summary.averageSleepMinutes))} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Metric label="Avg. energy" value={summary.averageEnergy === null
              ? '—' : summary.averageEnergy.toFixed(1) + '/5'} />
            <Metric label="Avg. soreness" value={summary.averageSoreness === null
              ? '—' : summary.averageSoreness.toFixed(1) + '/5'} />
          </View>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Averages use days with that measurement, never unlogged days.
          </Text>
          <SleepBars days={trend} />
        </Panel>
        <Panel>
          <SectionTitle>Sleep and training, side by side</SectionTitle>
          {trend.slice(-7).reverse().map(day => (
            <View key={day.date} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Text style={{ color: colors.muted, fontSize: 12, minWidth: 56 }}>
                {day.date.slice(5)}
              </Text>
              <Text style={{ color: colors.text, fontSize: 12, flex: 1 }}>
                {day.checkin?.sleepMinutes ? formatSleep(day.checkin.sleepMinutes) : 'No sleep log'}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {day.workoutCount} workouts
              </Text>
            </View>
          ))}
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
            This displays logs recorded on the same date. It does not establish
            that training affected sleep, or that sleep caused a change in performance.
          </Text>
        </Panel>
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Recovery history</SectionTitle>
        {history.length ? history.slice(0, limit).map(entry => (
          <Pressable key={entry.id} accessibilityRole="button"
            accessibilityLabel={'Edit check-in for ' + entry.recordedOn}
            onPress={() => selectDate(entry.recordedOn)}>
            <Panel>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{entry.recordedOn}</Text>
                <Text style={{ color: colors.primary, fontSize: 13 }}>Edit</Text>
              </View>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {entry.sleepMinutes ? 'Sleep ' + formatSleep(entry.sleepMinutes) + ' · ' : ''}
                {entry.energy === null ? 'Energy not rated' : 'Energy ' + entry.energy + '/5'}
                {entry.soreness === null ? '' : ' · Soreness ' + entry.soreness + '/5'}
              </Text>
              {entry.notes ? <Text style={{ color: colors.muted, fontSize: 12 }}>{entry.notes}</Text> : null}
            </Panel>
          </Pressable>
        )) : <EmptyState title="No recovery logs yet"
          description="Add sleep or a wellbeing rating to start your private daily history." />}
        {history.length > limit ? <AppButton title="Show more check-ins" secondary
          onPress={() => setLimit(n => n + 10)} /> : null}
      </View>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
        These are personal observations, not medical tests. The app does not
        diagnose sleep problems, recommend sleep duration, or calculate a
        medical or training-readiness score.
      </Text>
    </Page>
  );
}

function NavDay({ label, title, disabled = false, onPress }: {
  label: string; title: string; disabled?: boolean; onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    disabled={disabled} onPress={onPress}
    style={{ minHeight: 44, minWidth: 44, borderRadius: 6, borderWidth: 1,
      borderColor: colors.border, backgroundColor: colors.surface,
      opacity: disabled ? 0.4 : 1, justifyContent: 'center', alignItems: 'center' }}>
    <Text style={{ color: colors.text, fontSize: 18 }}>{title}</Text>
  </Pressable>;
}

function SleepBars({ days }: { days: ReturnType<typeof recoveryTrainingDays> }) {
  const { colors } = useAppTheme();
  const recent = days.slice(-14);
  const max = Math.max(1, ...recent.map(day => day.checkin?.sleepMinutes ?? 0));
  return <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
    {recent.map(day => {
      const minutes = day.checkin?.sleepMinutes ?? null;
      return <View key={day.date} accessible
        accessibilityLabel={day.date + ': ' + (minutes === null ? 'No sleep recorded' : formatSleep(minutes))}
        style={{ flex: 1, minWidth: 0, gap: 4, alignItems: 'center' }}>
        <View style={{ height: 80, width: '80%', justifyContent: 'flex-end' }}>
          {minutes !== null ? <View style={{ height: Math.max(4, 77 * minutes / max),
            backgroundColor: colors.primary, borderRadius: 2 }} /> : null}
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
          style={{ color: colors.muted, fontSize: 9, width: '100%', textAlign: 'center' }}>
          {day.date.slice(-2)}
        </Text>
      </View>;
    })}
  </View>;
}
