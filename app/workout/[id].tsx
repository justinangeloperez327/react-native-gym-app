import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { AppButton, EmptyState, Heading, Page, Panel, SectionTitle } from '@/src/components/ui';
import { findExercise } from '@/src/data/exercises';
import {
  completedSets, formatDate, formatDuration, formatWeight, formatActivityTime,
  totalActivitySeconds, totalDistanceMeters, previousCompletedSets, toDisplayWeight, toKg, totalVolumeKg,
} from '@/src/lib/workouts';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';
import type { Exercise, TrainingSet, WeightUnit, Workout, WorkoutMovement } from '@/src/types/gym';

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
  const editing = useRef<'reps' | 'weight' | null>(null);

  useEffect(() => {
    // Live saves must not erase partial decimal input (such as "12.") mid-edit.
    if (editing.current !== 'reps') setReps(String(set.reps));
    if (editing.current !== 'weight') {
      setWeight(String(Number(toDisplayWeight(set.weightKg, unit).toFixed(1))));
    }
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
        value={reps} onFocus={() => { editing.current = 'reps'; }}
        onChangeText={(next) => {
          setReps(next);
          const parsed = Number(next);
          if (!readOnly && next.trim() && Number.isSafeInteger(parsed) && parsed >= 0 &&
              parsed !== set.reps) onSave({ reps: parsed });
        }} onBlur={() => { editing.current = null; if (!readOnly) commit(); }}
        style={{
          flex: 1, textAlign: 'center', minHeight: 44, borderRadius: 6, borderWidth: 1,
          borderColor: colors.border, backgroundColor: colors.background, color: colors.text,
        }}
      />
      <TextInput accessibilityLabel={'Set ' + (index + 1) + ' weight in ' + unit}
        keyboardType="decimal-pad" selectTextOnFocus editable={!readOnly}
        value={weight} onFocus={() => { editing.current = 'weight'; }}
        onChangeText={(next) => {
          setWeight(next);
          const parsed = Number(next);
          if (!readOnly && next.trim() && Number.isFinite(parsed) && parsed >= 0 &&
              Math.abs(toKg(parsed, unit) - set.weightKg) > 0.00001) {
            onSave({ weightKg: toKg(parsed, unit) });
          }
        }} onBlur={() => { editing.current = null; if (!readOnly) commit(); }}
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
        <Pressable accessibilityRole="button"
          accessibilityLabel={'Set ' + (index + 1) + ' type: ' + (set.setType ?? 'normal')}
          onPress={() => {
            const types = ['normal', 'warmup', 'drop', 'failure'] as const;
            const current = types.indexOf(set.setType ?? 'normal');
            onSave({ setType: types[(current + 1) % types.length] });
          }}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>
            {set.setType === 'warmup' ? 'Warm' : set.setType === 'drop' ? 'Drop' :
              set.setType === 'failure' ? 'Fail' : 'Std'}
          </Text>
        </Pressable>
      ) : set.setType && set.setType !== 'normal' ? (
        <Text style={{ color: colors.muted, fontSize: 11 }}>{set.setType}</Text>
      ) : null}
      {!readOnly ? (
        <Pressable accessibilityRole="button" accessibilityLabel={'Remove set ' + (index + 1)}
          onPress={onRemove} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.danger, fontSize: 16, fontWeight: '600' }}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}


function CardioSetEditor({
  set, index, tracking, cardio, readOnly, onSave, onRemove,
}: {
  set: TrainingSet; index: number; tracking: Exercise['tracking']; cardio: boolean;
  readOnly: boolean; onSave: (patch: Partial<TrainingSet>) => void; onRemove: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 7, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: colors.muted, minWidth: 44 }}>Set {index + 1}</Text>
        <View style={{ flex: 1 }}>
          <ActivityInput label="Duration (seconds)" stored={set.durationSeconds ?? 0}
            integer disabled={readOnly} onChange={(durationSeconds) => onSave({ durationSeconds })} />
        </View>
        {tracking === 'distance' || cardio ? (
          <View style={{ flex: 1 }}>
            <ActivityInput label="Distance (km)" stored={set.distanceMeters ?? 0}
              scale={1000} disabled={readOnly} onChange={(distanceMeters) => onSave({ distanceMeters })} />
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
        <Pressable accessibilityRole="checkbox"
          accessibilityLabel={'Set ' + (index + 1) + ' complete'}
          accessibilityState={{ checked: set.completed, disabled: readOnly }}
          disabled={readOnly} onPress={() => onSave({ completed: !set.completed })}
          style={{ minHeight: 44, minWidth: 84, borderWidth: 1, borderRadius: 6,
            borderColor: set.completed ? colors.success : colors.border,
            backgroundColor: set.completed ? colors.subtle : colors.surface,
            justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: set.completed ? colors.success : colors.text, fontWeight: '600', fontSize: 13 }}>
            {set.completed ? '✓ Done' : 'Mark done'}
          </Text>
        </Pressable>
        {!readOnly ? (
          <Pressable accessibilityRole="button" accessibilityLabel={'Remove set ' + (index + 1)}
            onPress={onRemove} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
            <Text style={{ color: colors.danger }}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ActivityInput({ label, stored, scale = 1, integer = false, disabled, onChange }: {
  label: string; stored: number; scale?: number; integer?: boolean;
  disabled: boolean; onChange: (value: number) => void;
}) {
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState(String(Number((stored / scale).toFixed(scale === 1000 ? 3 : 0))));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(String(Number((stored / scale).toFixed(scale === 1000 ? 3 : 0))));
  }, [stored, scale]);
  function validate(value: string) {
    const parsed = Number(value);
    if (!value.trim() || !Number.isFinite(parsed) || parsed < 0 ||
      (integer && !Number.isSafeInteger(parsed)) ||
      parsed * scale > (scale === 1000 ? 1000000 : 86400)) return null;
    return parsed * scale;
  }
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
      <TextInput accessibilityLabel={label} value={draft} editable={!disabled}
        keyboardType={integer ? 'number-pad' : 'decimal-pad'}
        onFocus={() => { focused.current = true; }} onChangeText={value => {
          setDraft(value);
          const parsed = validate(value);
          if (parsed !== null && parsed !== stored) onChange(parsed);
        }}
        onBlur={() => {
          focused.current = false;
          const parsed = validate(draft);
          if (parsed === null) setDraft(String(Number((stored / scale).toFixed(scale === 1000 ? 3 : 0))));
          else if (parsed !== stored) onChange(parsed);
        }}
        style={{ minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 6,
          paddingHorizontal: 8, color: colors.text, backgroundColor: colors.background }}
      />
    </View>
  );
}

function MovementEditor({
  movement, workout, workouts, unit, readOnly, index, onRest,
}: {
  movement: WorkoutMovement;
  workout: Workout;
  workouts: readonly Workout[];
  unit: WeightUnit;
  readOnly: boolean;
  index: number;
  onRest: (seconds: number) => void;
}) {
  const { colors } = useAppTheme();
  const { addSet, removeSet, updateSet, removeMovement, copyPreviousSets, setMovementNotes, customExercises, setRestSeconds, toggleSupersetWithPrevious } = useGym();
  const exercise = findExercise(movement.exerciseId, customExercises);
  const prior = previousCompletedSets(workouts, workout, movement.exerciseId);
  const [notes, setNotes] = useState(movement.notes ?? '');
  const hasPrevious = index > 0;
  const previousMovement = hasPrevious ? workout.movements[index - 1] : undefined;
  const paired = !!(movement.supersetGroup && movement.supersetGroup === previousMovement?.supersetGroup);
  const lastInGroup = !movement.supersetGroup ||
    !workout.movements.slice(index + 1).some(m => m.supersetGroup === movement.supersetGroup);
  const restSeconds = movement.restSeconds ?? 90;
  function saveSet(set: TrainingSet, patch: Partial<TrainingSet>) {
    updateSet(workout.id, movement.id, set.id, patch);
    if (!set.completed && patch.completed && lastInGroup && restSeconds > 0) onRest(restSeconds);
  }
  function describe(set: TrainingSet): string {
    if (exercise?.tracking === 'reps') return set.reps + ' × ' + formatWeight(set.weightKg, unit);
    const duration = set.durationSeconds ? formatActivityTime(set.durationSeconds) : '0:00';
    const distance = set.distanceMeters ? ' · ' + (set.distanceMeters / 1000).toFixed(2) + ' km' : '';
    return duration + distance;
  }

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
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {exercise?.muscle ?? 'Other'} · {exercise?.tracking ?? 'reps'}
          </Text>
          {movement.supersetGroup ? (
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>Superset</Text>
          ) : null}
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
            ? prior.map(describe).join('   ·   ')
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
      {!readOnly ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>Rest after set: {restSeconds}s</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Reduce rest by 15 seconds"
                onPress={() => setRestSeconds(workout.id, movement.id, Math.max(0, restSeconds - 15))}
                style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: colors.primary, fontSize: 18 }}>−</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Increase rest by 15 seconds"
                onPress={() => setRestSeconds(workout.id, movement.id, Math.min(600, restSeconds + 15))}
                style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: colors.primary, fontSize: 18 }}>+</Text>
              </Pressable>
            </View>
          </View>
          {hasPrevious ? (
            <Pressable accessibilityRole="button" accessibilityLabel={paired ? 'Unpair superset' : 'Pair with previous exercise'}
              onPress={() => toggleSupersetWithPrevious(workout.id, movement.id)}
              style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>
                {paired ? 'Remove from previous superset' : 'Pair as superset with previous exercise'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : restSeconds !== 90 ? (
        <Text style={{ color: colors.muted, fontSize: 12 }}>Rest target: {restSeconds}s</Text>
      ) : null}
      {exercise?.tracking === 'reps' ? (
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Text style={{ width: 24, color: colors.muted, fontSize: 12 }}>Set</Text>
        <Text style={{ flex: 1, textAlign: 'center', color: colors.muted, fontSize: 12 }}>Reps</Text>
        <Text style={{ flex: 1, textAlign: 'center', color: colors.muted, fontSize: 12 }}>Weight ({unit})</Text>
        <Text style={{ width: 44, textAlign: 'center', color: colors.muted, fontSize: 12 }}>Done</Text>
        {!readOnly ? <Text style={{ width: 88, textAlign: 'center', color: colors.muted, fontSize: 12 }}>Type / Del.</Text> : null}
      </View>
      ) : null}
      {movement.sets.map((set, setIndex) => exercise?.tracking === 'reps' || !exercise ? (
        <SetEditor key={set.id} set={set} index={setIndex} unit={unit} readOnly={readOnly}
          onSave={(patch) => saveSet(set, patch)}
          onRemove={() => removeSet(workout.id, movement.id, set.id)} />
      ) : (
        <CardioSetEditor key={set.id} set={set} index={setIndex}
          tracking={exercise.tracking} cardio={exercise.kind === 'cardio'} readOnly={readOnly}
          onSave={(patch) => saveSet(set, patch)}
          onRemove={() => removeSet(workout.id, movement.id, set.id)} />
      ))}
      {!readOnly ? <AppButton title="+ Add set" secondary onPress={() => addSet(workout.id, movement.id)} /> : null}
      <Text style={{ color: colors.muted, fontSize: 13 }}>Exercise notes</Text>
      <TextInput accessibilityLabel={'Notes for ' + (exercise?.name ?? 'exercise')}
        multiline maxLength={2000} editable={!readOnly} placeholder="Technique, form, or reminders"
        placeholderTextColor={colors.muted} value={notes} onChangeText={(value) => {
          setNotes(value);
          if (!readOnly) setMovementNotes(workout.id, movement.id, value);
        }}
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
  const [restDeadline, setRestDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (restDeadline === null) return;
    const handle = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(handle);
  }, [restDeadline]);
  const remaining = restDeadline === null ? 0 : Math.max(0, Math.ceil((restDeadline - now) / 1000));
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
      {!readOnly ? (
        <Panel>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Rest timer</Text>
              <Text accessibilityLiveRegion="polite" style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>
                {restDeadline === null ? 'Ready' : remaining ? formatActivityTime(remaining) : 'Rest complete'}
              </Text>
            </View>
            <AppButton title={restDeadline === null ? 'Start 90s' : 'Stop'} secondary
              onPress={() => {
                if (restDeadline !== null) setRestDeadline(null);
                else { setNow(Date.now()); setRestDeadline(Date.now() + 90000); }
              }} />
          </View>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Rest uses elapsed wall time and adjusts after backgrounding. No background notification is sent.
          </Text>
        </Panel>
      ) : null}
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
      <Panel>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Activity summary</Text>
        <Text style={{ color: colors.text, fontWeight: '600' }}>
          {(totalDistanceMeters(workout) / 1000).toFixed(2)} km · {formatActivityTime(totalActivitySeconds(workout))}
        </Text>
      </Panel>
      <View style={{ gap: 10 }}>
        <SectionTitle>Exercises ({workout.movements.length})</SectionTitle>
        {workout.movements.map((movement, index) => (
          <MovementEditor key={movement.id} movement={movement} workout={workout}
            workouts={workouts} unit={preferences.unit} readOnly={readOnly} index={index}
            onRest={seconds => { setNow(Date.now()); setRestDeadline(Date.now() + seconds * 1000); }} />
        ))}
        {!workout.movements.length ? (
          <EmptyState title="No exercises added" description="Choose an activity to log sets, duration or distance." />
        ) : null}
      </View>
      <View style={{ gap: 8 }}>
        <SectionTitle>Session notes</SectionTitle>
        <TextInput accessibilityLabel="Workout notes" placeholder="How did this session feel?"
          placeholderTextColor={colors.muted} value={notes} onChangeText={(value) => {
            setNotes(value);
            if (!readOnly) setWorkoutNotes(workout.id, value);
          }}
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
