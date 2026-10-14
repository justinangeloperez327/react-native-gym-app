import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { AppButton, EmptyState, Heading, Page, Panel, SectionTitle } from '@/src/components/ui';
import { activeExercises, canLogRepetitions, findExercise, searchExercises } from '@/src/data/exercises';
import { WEEKDAYS } from '@/src/data/routines';
import { createId, toDisplayWeight, toKg } from '@/src/lib/workouts';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';
import type { RoutineExercise, RoutineTemplate } from '@/src/types/gym';

export default function RoutineEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    routines, customExercises, preferences, saveRoutine, duplicateRoutine,
    deleteRoutine, startRoutineWorkout,
  } = useGym();
  const { colors } = useAppTheme();
  const current = routines.find(r => r.id === id);
  const [draft, setDraft] = useState<RoutineTemplate | null>(current ?? null);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (current && draft?.id !== current.id) setDraft(current);
  }, [current?.id, draft?.id]);

  if (!current || !draft) {
    return (
      <Page>
        <Heading title="Routine not found" />
        <AppButton title="Back to training" secondary onPress={() => router.replace('/(tabs)/train')} />
      </Page>
    );
  }

  const editor = draft;
  const candidates = searchExercises(activeExercises(customExercises).filter(canLogRepetitions), { query: search })
    .filter(exercise => !editor.exercises.some(m => m.exerciseId === exercise.id));

  function update(next: Partial<RoutineTemplate>) {
    setDraft(previous => previous ? { ...previous, ...next } : previous);
  }

  function updateExercise(movementId: string, change: Partial<RoutineExercise>) {
    update({ exercises: editor.exercises.map(m => m.id === movementId ? { ...m, ...change } : m) });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= editor.exercises.length) return;
    const next = [...editor.exercises];
    [next[index], next[target]] = [next[target], next[index]];
    update({ exercises: next });
  }

  async function save() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await saveRoutine(editor);
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save routine');
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const copy = await duplicateRoutine(editor.id);
      router.replace({ pathname: '/routine/[id]', params: { id: copy.id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to duplicate routine');
    } finally {
      setBusy(false);
    }
  }

  async function begin() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveRoutine(editor);
      const workoutId = await startRoutineWorkout(editor.id);
      router.replace({ pathname: '/workout/[id]', params: { id: workoutId } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to start routine');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (busy) return;
    Alert.alert('Delete routine?', 'This removes the saved routine and its weekly schedule, not previously completed workouts.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        setBusy(true);
        void deleteRoutine(editor.id)
          .then(() => router.replace('/(tabs)/train'))
          .catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to delete routine'))
          .finally(() => setBusy(false));
      }},
    ]);
  }

  return (
    <Page>
      <View style={{ alignSelf: 'flex-start' }}>
        <AppButton title="Back to training" secondary onPress={() => router.back()} />
      </View>
      <Heading title="Routine editor" subtitle="Build a reusable strength session" />
      <Panel>
        <SectionTitle>Name</SectionTitle>
        <TextInput accessibilityLabel="Routine name" value={editor.name} onChangeText={name => update({ name })}
          maxLength={80} placeholder="Routine name" placeholderTextColor={colors.muted}
          style={{ borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, minHeight: 46,
            color: colors.text, borderColor: colors.border, backgroundColor: colors.background }} />
        <SectionTitle>Description</SectionTitle>
        <TextInput accessibilityLabel="Routine description" value={editor.description}
          onChangeText={description => update({ description })}
          maxLength={500} multiline placeholder="Optional instructions"
          placeholderTextColor={colors.muted}
          style={{ borderWidth: 1, borderRadius: 6, padding: 12, minHeight: 65,
            color: colors.text, borderColor: colors.border, backgroundColor: colors.background, textAlignVertical: 'top' }} />
      </Panel>
      <View style={{ gap: 8 }}>
        <SectionTitle>Weekly schedule</SectionTitle>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Select the days you plan to train. All assignments repeat weekly.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {WEEKDAYS.map((label, day) => {
            const selected = editor.days.includes(day);
            return (
              <Pressable key={label} accessibilityRole="button"
                accessibilityLabel={'Schedule ' + label}
                accessibilityState={{ selected }}
                onPress={() => update({ days: selected
                  ? editor.days.filter(value => value !== day)
                  : [...editor.days, day].sort((a, b) => a - b) })}
                style={({ pressed }) => ({
                  minHeight: 44, minWidth: 48, paddingHorizontal: 10,
                  justifyContent: 'center', alignItems: 'center', borderRadius: 6, borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.subtle : colors.surface,
                  opacity: pressed ? 0.7 : 1,
                })}>
                <Text style={{ color: selected ? colors.primary : colors.text, fontWeight: '600', fontSize: 13 }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Exercises ({editor.exercises.length})</SectionTitle>
        {editor.exercises.length ? editor.exercises.map((movement, index) => {
          const exercise = findExercise(movement.exerciseId, customExercises);
          return (
            <Panel key={movement.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15 }}>
                    {index + 1}. {exercise?.name ?? 'Exercise unavailable'}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{exercise?.muscle ?? 'Unknown'}</Text>
                </View>
                <SmallAction label="Up" disabled={index === 0} onPress={() => move(index, -1)} />
                <SmallAction label="Down" disabled={index === editor.exercises.length - 1} onPress={() => move(index, 1)} />
                <SmallAction label="Remove" destructive onPress={() =>
                  update({ exercises: editor.exercises.filter(m => m.id !== movement.id) })} />
              </View>
              <TargetStepper label="Sets" value={movement.sets} min={1} max={20}
                onChange={sets => updateExercise(movement.id, { sets })} />
              <TargetStepper label="Repetitions" value={movement.reps} min={1} max={1000}
                onChange={reps => updateExercise(movement.id, { reps })} />
              <Text style={{ color: colors.muted, fontSize: 13 }}>Target weight ({preferences.unit})</Text>
              <TargetWeightInput
                exerciseName={exercise?.name ?? 'exercise'}
                weightKg={movement.weightKg}
                unit={preferences.unit}
                colors={colors}
                onChange={weightKg => updateExercise(movement.id, { weightKg })}
              />
            </Panel>
          );
        }) : <EmptyState title="No exercises added"
          description="Add repetition-based exercises below. Timed and distance-based routines arrive with cardio logging." />}
        <AppButton title={adding ? 'Hide exercise picker' : '+ Add exercise'} secondary
          onPress={() => setAdding(value => !value)} />
        {adding ? (
          <Panel>
            <TextInput accessibilityLabel="Search routine exercises" placeholder="Search by exercise or equipment"
              placeholderTextColor={colors.muted} value={search} onChangeText={setSearch}
              style={{ minHeight: 44, borderWidth: 1, borderRadius: 6, paddingHorizontal: 12,
                color: colors.text, borderColor: colors.border, backgroundColor: colors.background }} />
            {candidates.slice(0, 30).map(exercise => (
              <Pressable key={exercise.id} accessibilityRole="button"
                accessibilityLabel={'Add ' + exercise.name}
                onPress={() => {
                  update({ exercises: [...editor.exercises, {
                    id: createId(), exerciseId: exercise.id, sets: 3, reps: 10, weightKg: 0,
                  }] });
                  setAdding(false);
                  setSearch('');
                }} style={{ minHeight: 44, borderBottomColor: colors.border, borderBottomWidth: 1,
                  justifyContent: 'center' }}>
                <Text style={{ color: colors.text, fontWeight: '500' }}>{exercise.name}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{exercise.muscle} · {exercise.equipment}</Text>
              </Pressable>
            ))}
            {candidates.length > 30 ? (
              <Text style={{ color: colors.muted, fontSize: 12 }}>Refine your search to see more exercises.</Text>
            ) : null}
            {!candidates.length ? <Text style={{ color: colors.muted }}>No matching exercises.</Text> : null}
          </Panel>
        ) : null}
      </View>
      {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
      <AppButton title={busy ? 'Saving…' : 'Save routine'} disabled={busy}
        onPress={() => { void save(); }} />
      <AppButton title="Save and start workout" disabled={busy || editor.exercises.length === 0}
        secondary onPress={() => { void begin(); }} />
      <AppButton title="Duplicate saved routine" secondary disabled={busy}
        onPress={() => { void duplicate(); }} />
      <AppButton title="Delete saved routine" secondary destructive disabled={busy} onPress={confirmDelete} />
    </Page>
  );
}

function SmallAction({ label, onPress, disabled = false, destructive = false }: {
  label: string; onPress: () => void; disabled?: boolean; destructive?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: destructive ? colors.danger : colors.primary,
        opacity: disabled ? 0.4 : 1, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function TargetStepper({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (next: number) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <SmallAction label="−" disabled={value <= min} onPress={() => onChange(Math.max(min, value - 1))} />
        <Text style={{ color: colors.text, minWidth: 32, textAlign: 'center', fontWeight: '600' }}>{value}</Text>
        <SmallAction label="+" disabled={value >= max} onPress={() => onChange(Math.min(max, value + 1))} />
      </View>
    </View>
  );
}


function TargetWeightInput({ exerciseName, weightKg, unit, colors, onChange }: {
  exerciseName: string;
  weightKg: number;
  unit: 'kg' | 'lb';
  colors: ReturnType<typeof useAppTheme>['colors'];
  onChange: (value: number) => void;
}) {
  const display = () => String(Number(toDisplayWeight(weightKg, unit).toFixed(1)));
  const [value, setValue] = useState(display);
  useEffect(() => { setValue(display()); }, [weightKg, unit]);
  return (
    <TextInput accessibilityLabel={'Target weight for ' + exerciseName}
      keyboardType="decimal-pad" selectTextOnFocus value={value}
      onChangeText={setValue} onBlur={() => {
        const amount = Number(value);
        if (value.trim() && Number.isFinite(amount) && amount >= 0 && amount <= 20000) {
          onChange(toKg(amount, unit));
        } else {
          setValue(display());
        }
      }}
      style={{
        minHeight: 44, borderWidth: 1, borderRadius: 6, paddingHorizontal: 12,
        color: colors.text, backgroundColor: colors.background, borderColor: colors.border,
      }}
    />
  );
}
