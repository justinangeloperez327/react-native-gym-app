import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { AppButton, EmptyState, Heading, Page, Panel, SectionTitle } from '@/src/components/ui';
import { findExercise } from '@/src/data/exercises';
import {
  completedSets, formatDate, formatDuration, formatWeight,
  previousCompletedSets, toDisplayWeight, toKg, totalVolumeKg,
} from '@/src/lib/workouts';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';
import type { TrainingSet, WeightUnit, Workout, WorkoutMovement } from '@/src/types/gym';

function SetEditor({
  set, index, unit, readOnly, onSave, onRemove,
}: {
  set: TrainingSet;
  index: number;
  unit: WeightUnit;
  readOnly: boolean;
  onSave: (patch: Partial<TrainingSet>) => void;
  onRemove: () => void;
}) {
  const { colors } = useAppTheme();
  const [reps, setReps] = useState(String(set.reps));
  const [weight, setWeight] = useState(String(Number(toDisplayWeight(set.weightKg, unit).toFixed(1))));

  useEffect(() => {
    setReps(String(set.reps));
    setWeight(String(Number(toDisplayWeight(set.weightKg, unit).toFixed(1))));
  }, [set.reps, set.weightKg, unit]);

  function commit(extra?: Partial<TrainingSet>): boolean {
    const repValue = Number(reps);
    const weightValue = Number(weight);
    if (!reps.trim() || !weight.trim() || !Number.isSafeInteger(repValue) || repValue < 0 ||
        !Number.isFinite(weightValue) || weightValue < 0) {
      Alert.alert('Invalid set', 'Enter a non-negative whole number of reps and a non-negative weight.');
      setReps(String(set.reps));
      setWeight(String(Number(toDisplayWeight(set.weightKg, unit).toFixed(1))));
      return false;
    }
    const patch = { reps: repValue, weightKg: toKg(weightValue, unit), ...extra };
    // Avoid redundant disk transactions when no value has changed.
    if (patch.reps !== set.reps || Math.abs(patch.weightKg - set.weightKg) > 0.00001 ||
      (patch.completed !== undefined && patch.completed !== set.completed)) {
      onSave(patch);
    }
    return true;
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 }}>
      <Text style={{ width: 24, color: colors.muted, fontSize: 13, fontWeight: '600' }}>{index + 1}</Text>
      <TextInput accessibilityLabel={'Set ' + (index + 1) + ' repetitions'}
        keyboardType="number-pad" selectTextOnFocus editable={!readOnly}
        value={reps} onChangeText={setReps} onBlur={() => { if (!readOnly) commit(); }}
        style={{
          flex: 1, textAlign: 'center', minHeight: 44, borderRadius: 6, borderWidth: 1,
          borderColor: colors.border, backgroundColor: colors.background, color: colors.text,
        }}
      />
      <TextInput accessibilityLabel={'Set ' + (index + 1) + ' weight in ' + unit}
        keyboardType="decimal-pad" selectTextOnFocus editable={!readOnly}
        value={weight} onChangeText={setWeight} onBlur={() => { if (!readOnly) commit(); }}
        style={{
          flex: 1, textAlign: 'center', minHeight: 44, borderRadius: 6, borderWidth: 1,
          borderColor: colors.border, backgroundColor: colors.background, color: colors.text,
        }}
      />
      <Pressable accessibilityRole="checkbox"
        accessibilityLabel={'Set ' + (index + 1) + ' complete'}
        accessibilityState={{ checked: set.completed, disabled: readOnly }}
        disabled={readOnly} onPress={() => commit({ completed: !set.completed })}
        style={{
          width: 44, minHeight: 44, borderRadius: 6, justifyContent: 'center', alignItems: 'center',
          borderWidth: 1, borderColor: set.completed ? colors.success : colors.border,
          backgroundColor: set.completed ? colors.subtle : colors.surface,
        }}>
        <Text style={{ color: set.completed ? colors.success : colors.muted, fontWeight: '700' }}>
          {set.completed ? '✓' : '○'}
        </Text>
      </Pressable>
      {!readOnly ? (
        <Pressable accessibilityRole="button" accessibilityLabel={'Remove set ' + (index + 1)}
          onPress={onRemove} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.danger, fontSize: 16, fontWeight: '600' }}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function MovementEditor({
  movement, workout, workouts, unit, readOnly,
}: {
  movement: WorkoutMovement;
  workout: Workout;
  workouts: readonly Workout[];
  unit: WeightUnit;
  readOnly: boolean;
}) {
  const { colors } = useAppTheme();
  const { addSet, removeSet, updateSet, removeMovement, copyPreviousSets, setMovementNotes, customExercises } = useGym();
  const exercise = findExercise(movement.exerciseId, customExercises);
  const prior = previousCompletedSets(workouts, workout, movement.exerciseId);
  const [notes, setNotes] = useState(movement.notes ?? '');

  useEffect(() => {
    setNotes(movement.notes ?? '');
  }, [movement.id, movement.notes]);

  return (
    <Panel>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>
            {exercise?.name ?? 'Unknown exercise'}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{exercise?.muscle ?? 'Other'}</Text>
        </View>
        {!readOnly ? (
          <Pressable accessibilityRole="button" accessibilityLabel={'Remove ' + (exercise?.name ?? 'exercise')}
            onPress={() => Alert.alert('Remove exercise?', 'All its sets will be removed.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => removeMovement(workout.id, movement.id) },
            ])} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: colors.danger, fontWeight: '600' }}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ gap: 5, paddingVertical: 6, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>Previous completed session</Text>
        <Text style={{ color: colors.text, fontSize: 13 }}>
          {prior.length
            ? prior.map((set) => String(set.reps) + ' × ' + formatWeight(set.weightKg, unit)).join('   ·   ')
            : 'No previous completed sets'}
        </Text>
        {prior.length && !readOnly ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Copy previous completed sets"
            onPress={() => Alert.alert('Use previous sets?', 'Replace the current sets with the last completed values?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Replace sets', onPress: () => copyPreviousSets(workout.id, movement.id) },
            ])} style={{ minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' }}>
            <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>Copy previous sets</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Text style={{ width: 24, color: colors.muted, fontSize: 12 }}>Set</Text>
        <Text style={{ flex: 1, textAlign: 'center', color: colors.muted, fontSize: 12 }}>Reps</Text>
        <Text style={{ flex: 1, textAlign: 'center', color: colors.muted, fontSize: 12 }}>Weight ({unit})</Text>
        <Text style={{ width: 44, textAlign: 'center', color: colors.muted, fontSize: 12 }}>Done</Text>
        {!readOnly ? <Text style={{ width: 44, textAlign: 'center', color: colors.muted, fontSize: 12 }}>Del.</Text> : null}
      </View>
      {movement.sets.map((set, index) => (
        <SetEditor key={set.id} set={set} index={index} unit={unit} readOnly={readOnly}
          onSave={(patch) => updateSet(workout.id, movement.id, set.id, patch)}
          onRemove={() => removeSet(workout.id, movement.id, set.id)} />
      ))}
      {!readOnly ? <AppButton title="+ Add set" secondary onPress={() => addSet(workout.id, movement.id)} /> : null}
      <Text style={{ color: colors.muted, fontSize: 13 }}>Exercise notes</Text>
      <TextInput accessibilityLabel={'Notes for ' + (exercise?.name ?? 'exercise')}
        multiline maxLength={2000} editable={!readOnly} placeholder="Technique, form, or reminders"
        placeholderTextColor={colors.muted} value={notes} onChangeText={setNotes}
        onBlur={() => { if (!readOnly) setMovementNotes(workout.id, movement.id, notes); }}
        style={{
          minHeight: 54, borderColor: colors.border, borderWidth: 1, borderRadius: 6,
          padding: 10, backgroundColor: colors.background, color: colors.text, textAlignVertical: 'top',
        }}
      />
    </Panel>
  );
}

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    workouts, preferences, finishWorkout, deleteWorkout, setWorkoutNotes,
    saveStatus, retrySave, error,
  } = useGym();
  const { colors } = useAppTheme();
  const [busy, setBusy] = useState(false);
  const workout = workouts.find((item) => item.id === id);
  const [notes, setNotes] = useState(workout?.notes ?? '');

  useEffect(() => {
    setNotes(workout?.notes ?? '');
  }, [workout?.id, workout?.notes]);

  if (!workout) {
    return (
      <Page>
        <Heading title="Workout not found" />
        <AppButton title="Back to home" secondary onPress={() => router.replace('/(tabs)')} />
      </Page>
    );
  }
  const readOnly = !!workout.finishedAt;

  async function finish() {
    if (!workout || busy) return;
    if (completedSets(workout) === 0) {
      Alert.alert('Log a set first', 'Mark at least one set complete before finishing.');
      return;
    }
    setBusy(true);
    try {
      setWorkoutNotes(workout.id, notes);
      await finishWorkout(workout.id);
      router.replace('/(tabs)/progress');
    } catch {
      Alert.alert('Workout not saved', 'The workout is still available here. Retry saving before leaving the session.');
    } finally {
      setBusy(false);
    }
  }

  function removeWorkout() {
    if (!workout || busy) return;
    Alert.alert('Delete workout?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => {
          deleteWorkout(workout.id);
          router.replace('/(tabs)/progress');
        },
      },
    ]);
  }

  async function retry() {
    setBusy(true);
    try {
      await retrySave();
    } catch {
      Alert.alert('Save failed', 'The changes are still in memory. Check your device storage and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <AppButton title="Back" secondary onPress={() => router.back()} />
      <Heading title={readOnly ? 'Workout details' : 'Active workout'}
        subtitle={formatDate(workout.startedAt) + ' · ' + formatDuration(workout)} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text accessibilityLiveRegion="polite" style={{
          color: saveStatus === 'error' ? colors.danger : colors.muted, fontSize: 13, fontWeight: '600',
        }}>
          {saveStatus === 'error' ? 'Save failed' : saveStatus === 'saving' ? 'Saving changes…' : 'Saved on device'}
        </Text>
        {saveStatus === 'error' ? (
          <Pressable accessibilityRole="button" onPress={() => { void retry(); }}
            disabled={busy} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry save</Text>
          </Pressable>
        ) : null}
      </View>
      {saveStatus === 'error' && error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
      <Panel>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={{ color: colors.muted }}>Completed sets</Text>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>
              {completedSets(workout)}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={{ color: colors.muted }}>Volume</Text>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>
              {formatWeight(totalVolumeKg(workout), preferences.unit)}
            </Text>
          </View>
        </View>
      </Panel>
      <View style={{ gap: 10 }}>
        <SectionTitle>Exercises ({workout.movements.length})</SectionTitle>
        {workout.movements.map((movement) => (
          <MovementEditor key={movement.id} movement={movement} workout={workout}
            workouts={workouts} unit={preferences.unit} readOnly={readOnly} />
        ))}
        {!workout.movements.length ? (
          <EmptyState title="No exercises added" description="Choose an exercise to begin tracking sets and reps." />
        ) : null}
      </View>
      <View style={{ gap: 8 }}>
        <SectionTitle>Session notes</SectionTitle>
        <TextInput accessibilityLabel="Workout notes" placeholder="How did this session feel?"
          placeholderTextColor={colors.muted} value={notes} onChangeText={setNotes}
          multiline maxLength={4000} editable={!readOnly}
          onBlur={() => { if (!readOnly) setWorkoutNotes(workout.id, notes); }}
          style={{
            minHeight: 80, borderColor: colors.border, borderWidth: 1, borderRadius: 6,
            padding: 12, backgroundColor: colors.surface, color: colors.text, textAlignVertical: 'top',
          }}
        />
      </View>
      {!readOnly ? (
        <>
          <AppButton title="+ Add exercise" secondary onPress={() => router.push({
            pathname: '/exercise-picker', params: { workoutId: workout.id },
          })} />
          <AppButton title={busy ? 'Finishing…' : 'Finish workout'}
            disabled={busy} onPress={() => { void finish(); }} />
        </>
      ) : null}
      <AppButton title="Delete workout" secondary destructive onPress={removeWorkout} disabled={busy} />
    </Page>
  );
}
