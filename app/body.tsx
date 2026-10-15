import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { AppButton, EmptyState, Heading, Page, Panel, SectionTitle } from '@/src/components/ui';
import {
  BODY_METRICS, assertGoal, assertMeasurement, formatMeasurement, fromCanonical,
  goalProgress, isCalendarDate, latestReading, localDateKey, measurementHistory,
  measurementUnit, toCanonical,
} from '@/src/lib/body-metrics';
import { createId } from '@/src/lib/workouts';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';
import type { BodyMeasurement, BodyMetricKind, FitnessGoalKind } from '@/src/types/gym';

const GOAL_KINDS: readonly { kind: FitnessGoalKind; label: string }[] = [
  { kind: 'body_weight', label: 'Body weight' },
  { kind: 'weekly_workouts', label: 'Weekly workouts' },
];
const fieldStyle = (colors: ReturnType<typeof useAppTheme>['colors']) => ({
  color: colors.text, borderColor: colors.border, borderWidth: 1,
  borderRadius: 6, minHeight: 46, paddingHorizontal: 12, backgroundColor: colors.surface,
} as const);

export default function BodyProgressScreen() {
  const { measurements, goals, workouts, preferences, saveBodyMeasurement, deleteBodyMeasurement,
    saveFitnessGoal, deleteFitnessGoal } = useGym();
  const { colors } = useAppTheme();
  const [kind, setKind] = useState<BodyMetricKind>('weight');
  const [date, setDate] = useState(localDateKey());
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [goalKind, setGoalKind] = useState<FitnessGoalKind>('body_weight');
  const [goalTarget, setGoalTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(8);

  const series = useMemo(() => measurementHistory(measurements, kind), [measurements, kind]);
  const latest = latestReading(measurements, kind);
  const goal = goals.find(item => item.kind === goalKind);
  const selectedGoal = goals.find(item => item.kind === goalKind);
  const progress = selectedGoal && goalProgress(selectedGoal, measurements, workouts);
  const unit = measurementUnit(kind, preferences.unit);
  const today = localDateKey();
  const currentEdit = editingId ? measurements.find(item => item.id === editingId) : undefined;
  const chart = series.filter(item => item.recordedOn <= today).slice(-10);

  function chooseKind(next: BodyMetricKind) {
    setKind(next);
    setEditingId(null);
    setValue('');
    setDate(localDateKey());
    setNotes('');
    setError(null);
    setVisible(8);
  }

  function editMeasurement(entry: BodyMeasurement) {
    setKind(entry.kind);
    setEditingId(entry.id);
    setDate(entry.recordedOn);
    setValue(String(Number(fromCanonical(entry.value, entry.kind, preferences.unit).toFixed(2))));
    setNotes(entry.notes ?? '');
    setError(null);
  }

  function resetEntry() {
    setEditingId(null);
    setDate(localDateKey());
    setValue('');
    setNotes('');
    setError(null);
  }

  async function submitMeasurement() {
    if (busy) return;
    const amount = Number(value);
    if (!value.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError('Enter a positive measurement.');
      return;
    }
    if (!isCalendarDate(date) || date > today) {
      setError('Enter a valid calendar date on or before today (YYYY-MM-DD).');
      return;
    }
    // Same metric/day is one record; edits keep the original stable ID.
    const sameDay = measurements.find(item => item.kind === kind && item.recordedOn === date);
    if (sameDay && editingId && sameDay.id !== editingId) {
      setError('Another entry already exists for this metric on that date.');
      return;
    }
    const entry: BodyMeasurement = {
      id: editingId ?? sameDay?.id ?? 'body:' + createId(),
      kind, recordedOn: date,
      value: toCanonical(amount, kind, preferences.unit),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    try { assertMeasurement(entry); } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid measurement');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveBodyMeasurement(entry);
      resetEntry();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save measurement');
    } finally { setBusy(false); }
  }

  function deleteReading(entry: BodyMeasurement) {
    Alert.alert('Delete measurement?', 'This saved reading will be removed. Training history is unaffected.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        setBusy(true);
        void deleteBodyMeasurement(entry.id)
          .then(() => { if (editingId === entry.id) resetEntry(); })
          .catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to delete measurement'))
          .finally(() => setBusy(false));
      }},
    ]);
  }

  function chooseGoalKind(next: FitnessGoalKind) {
    setGoalKind(next);
    const existing = goals.find(g => g.kind === next);
    setGoalTarget(existing
      ? String(Number((next === 'body_weight' ? fromCanonical(existing.targetValue, 'weight', preferences.unit)
        : existing.targetValue).toFixed(1))) : '');
    setError(null);
  }

  async function submitGoal() {
    if (busy) return;
    const parsed = Number(goalTarget);
    if (!goalTarget.trim() || !Number.isFinite(parsed)) {
      setError('Enter a valid goal target.');
      return;
    }
    const existing = goals.find(item => item.kind === goalKind);
    const baseline = latestReading(measurements, 'weight')?.value;
    if (goalKind === 'body_weight' && baseline === undefined && !existing) {
      setError('Log your current body weight before setting a weight target.');
      return;
    }
    const next = {
      id: existing?.id ?? 'goal:' + createId(),
      kind: goalKind,
      createdOn: existing?.createdOn ?? localDateKey(),
      startValue: existing?.startValue ?? (goalKind === 'body_weight' ? baseline! : 0),
      targetValue: goalKind === 'body_weight' ? toCanonical(parsed, 'weight', preferences.unit) : parsed,
    };
    try { assertGoal(next); } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid goal');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveFitnessGoal(next);
      setGoalTarget('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save goal');
    } finally { setBusy(false); }
  }

  function removeGoal() {
    if (!goal || busy) return;
    Alert.alert('Remove goal?', 'Your measurements and workout history will remain saved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        setBusy(true);
        void deleteFitnessGoal(goal.id)
          .then(() => setGoalTarget(''))
          .catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to remove goal'))
          .finally(() => setBusy(false));
      }},
    ]);
  }

  const inputLabel = BODY_METRICS.find(item => item.kind === kind)?.label ?? kind;

  return (
    <Page>
      <View style={{ alignSelf: 'flex-start' }}>
        <AppButton title="Back to progress" secondary onPress={() => router.back()} />
      </View>
      <Heading title="Body & goals" subtitle="Private measurements and personal targets, stored on device" />
      <View style={{ gap: 10 }}>
        <SectionTitle>Measurements</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {BODY_METRICS.map(item => <Chip key={item.kind} label={item.label}
            selected={kind === item.kind} onPress={() => chooseKind(item.kind)} />)}
        </View>
        <Panel>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{inputLabel} · Latest reading</Text>
          <Text style={{ color: colors.text, fontSize: 23, fontWeight: '700' }}>
            {latest ? formatMeasurement(latest.value, kind, preferences.unit) : 'No measurements yet'}
          </Text>
          {latest ? <Text style={{ color: colors.muted, fontSize: 12 }}>Recorded {latest.recordedOn}</Text> : null}
        </Panel>
        <SectionTitle>{editingId ? 'Edit reading' : 'Log a reading'}</SectionTitle>
        <Panel>
          <Text style={{ color: colors.muted, fontSize: 13 }}>Date (YYYY-MM-DD)</Text>
          <TextInput accessibilityLabel="Measurement date" value={date} onChangeText={setDate}
            autoCapitalize="none" maxLength={10} placeholder={localDateKey()}
            placeholderTextColor={colors.muted} style={fieldStyle(colors)} />
          <Text style={{ color: colors.muted, fontSize: 13 }}>{inputLabel} ({unit})</Text>
          <TextInput accessibilityLabel={inputLabel + ' in ' + unit} value={value} onChangeText={setValue}
            keyboardType="decimal-pad" placeholder="Enter measurement"
            placeholderTextColor={colors.muted} style={fieldStyle(colors)} />
          <Text style={{ color: colors.muted, fontSize: 13 }}>Notes (optional)</Text>
          <TextInput accessibilityLabel="Measurement notes" multiline maxLength={500}
            value={notes} onChangeText={setNotes} placeholder="e.g. morning, after waking up"
            placeholderTextColor={colors.muted} style={[fieldStyle(colors), { minHeight: 65, textAlignVertical: 'top', padding: 10 }]} />
          <AppButton title={busy ? 'Saving…' : editingId ? 'Update measurement' : 'Save measurement'}
            disabled={busy} onPress={() => { void submitMeasurement(); }} />
          {editingId ? <AppButton title="Cancel edit" secondary disabled={busy} onPress={resetEntry} /> : null}
        </Panel>
        <SectionTitle>Measurement trend</SectionTitle>
        {chart.length ? <Panel>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Last {chart.length} dated readings · values shown from zero
          </Text>
          <MeasurementBars entries={chart} kind={kind} unit={preferences.unit} />
        </Panel> : <EmptyState title="No chart data" description="Save a measurement to start your trend." />}
        <SectionTitle>Recorded history</SectionTitle>
        {series.length ? [...series].reverse().slice(0, visible).map(entry => (
          <Panel key={entry.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>
                  {formatMeasurement(entry.value, entry.kind, preferences.unit)}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{entry.recordedOn}</Text>
                {entry.notes ? <Text style={{ color: colors.muted, fontSize: 12 }}>{entry.notes}</Text> : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Edit measurement"
                onPress={() => editMeasurement(entry)} style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Edit</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Delete measurement"
                onPress={() => deleteReading(entry)} disabled={busy}
                style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}>
                <Text style={{ color: colors.danger, fontWeight: '600' }}>Delete</Text>
              </Pressable>
            </View>
          </Panel>
        )) : <EmptyState title="No history" description="Body measurements you save will appear here." />}
        {series.length > visible ? <AppButton title="Show more measurements" secondary
          onPress={() => setVisible(v => v + 8)} /> : null}
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Fitness goals</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {GOAL_KINDS.map(item => <Chip key={item.kind} label={item.label}
            selected={goalKind === item.kind} onPress={() => chooseGoalKind(item.kind)} />)}
        </View>
        {selectedGoal && progress ? (
          <Panel>
            <Text style={{ color: colors.text, fontWeight: '600' }}>
              {goalKind === 'body_weight' ? 'Body weight target' : 'Weekly workout target'}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Target: {goalKind === 'body_weight'
                ? formatMeasurement(selectedGoal.targetValue, 'weight', preferences.unit)
                : String(selectedGoal.targetValue) + ' workouts/week'}
            </Text>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}>
              <View style={{ height: 8, borderRadius: 4, width: (progress.percent + '%') as `${number}%`,
                backgroundColor: colors.primary }} />
            </View>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
              {progress.percent.toFixed(0)}% · {progress.achieved ? 'Target reached' : 'In progress'}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {progress.currentValue === null ? 'No current reading' :
                'Current: ' + (goalKind === 'body_weight'
                  ? formatMeasurement(progress.currentValue, 'weight', preferences.unit)
                  : String(progress.currentValue) + ' completed sessions this week')}
            </Text>
          </Panel>
        ) : (
          <EmptyState title="No target for this category"
            description="Set a target below; no goals are prefilled." />
        )}
        <Panel>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {goalKind === 'body_weight' ? 'Target weight (' + preferences.unit + ')' : 'Target completed workouts per week (1–14)'}
          </Text>
          <TextInput accessibilityLabel="Fitness goal target" value={goalTarget} onChangeText={setGoalTarget}
            keyboardType="decimal-pad" placeholder={goalKind === 'body_weight' ? 'Target body weight' : 'e.g. 3'}
            placeholderTextColor={colors.muted} style={fieldStyle(colors)} />
          <AppButton title={busy ? 'Saving…' : goal ? 'Update goal' : 'Create goal'}
            disabled={busy} onPress={() => { void submitGoal(); }} />
          {goal ? <AppButton title="Remove goal" destructive secondary disabled={busy} onPress={removeGoal} /> : null}
        </Panel>
      </View>
      {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
        Body readings are self-reported and not medical assessments. Weight-goal progress uses
        the starting weight when you first create the target; weekly workout progress resets
        on Monday. No calorie, BMI or health interpretation is calculated.
      </Text>
    </Page>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }}
    accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 44, borderWidth: 1,
      borderColor: selected ? colors.primary : colors.border,
      backgroundColor: selected ? colors.subtle : colors.surface,
      paddingHorizontal: 11, borderRadius: 6, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
    <Text style={{ color: selected ? colors.primary : colors.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
  </Pressable>;
}

function MeasurementBars({ entries, kind, unit }: {
  entries: BodyMeasurement[]; kind: BodyMetricKind; unit: 'kg' | 'lb';
}) {
  const { colors } = useAppTheme();
  const max = Math.max(...entries.map(item => item.value), 1);
  return <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5 }}>
    {entries.map(entry => {
      const height = Math.max(3, 92 * entry.value / max);
      return <View key={entry.id} accessible
        accessibilityLabel={entry.recordedOn + ': ' + formatMeasurement(entry.value, kind, unit)}
        style={{ flex: 1, alignItems: 'center', gap: 5 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}
          style={{ color: colors.text, fontSize: 10, width: '100%', textAlign: 'center' }}>
          {Number(fromCanonical(entry.value, kind, unit).toFixed(1))}
        </Text>
        <View style={{ height: 94, width: '75%', justifyContent: 'flex-end' }}>
          <View style={{ height, width: '100%', backgroundColor: colors.primary, borderRadius: 3 }} />
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}
          style={{ color: colors.muted, fontSize: 10, width: '100%', textAlign: 'center' }}>
          {entry.recordedOn.slice(5)}
        </Text>
      </View>;
    })}
  </View>;
}
