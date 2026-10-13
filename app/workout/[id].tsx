import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { AppButton, EmptyState, Heading, Page, Panel, SectionTitle } from '@/src/components/ui';
import { getExercise } from '@/src/data/exercises';
import {
  completedSets, formatDate, formatDuration, formatWeight,
  toDisplayWeight, toKg, totalVolumeKg,
} from '@/src/lib/workouts';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';
import type { TrainingSet, WeightUnit, WorkoutMovement } from '@/src/types/gym';

function SetEditor({
  set, index, unit, readOnly, onSave,
}: {
  set: TrainingSet;
  index: number;
  unit: WeightUnit;
  readOnly: boolean;
  onSave: (patch: Partial<TrainingSet>) => void;
}) {
  const { colors } = useAppTheme();
  const [reps, setReps] = useState(String(set.reps));
  const [weight, setWeight] = useState(String(Number(toDisplayWeight(set.weightKg, unit).toFixed(1))));

  useEffect(() => {
    setReps(String(set.reps));
    setWeight(String(Number(toDisplayWeight(set.weightKg, unit).toFixed(1))));
  }, [set.reps, set.weightKg, unit]);

  function commit(extra?: Partial<TrainingSet>): boolean {
    const parsedReps = Number(reps);
    const parsedWeight = Number(weight);
    if (!reps.trim() || !weight.trim() || !Number.isSafeInteger(parsedReps) || parsedReps < 0 ||
        !Number.isFinite(parsedWeight) || parsedWeight < 0) {
      Alert.alert('Invalid set', 'Enter a non-negative whole number for reps and a non-negative weight.');
      setReps(String(set.reps));
      setWeight(String(Number(toDisplayWeight(set.weightKg, unit).toFixed(1))));
      return false;
    }
    onSave({ reps: parsedReps, weightKg: toKg(parsedWeight, unit), ...extra });
    return true;
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 }}>
      <Text style={{ width: 25, color: colors.muted, fontWeight: '600' }}>{index + 1}</Text>
      <TextInput accessibilityLabel={'Set ' + (index + 1) + ' repetitions'}
        keyboardType="number-pad" selectTextOnFocus editable={!readOnly}
        value={reps} onChangeText={setReps}
        onBlur={() => { if (!readOnly) commit(); }}
        style={{
          flex: 1, textAlign: 'center', minHeight: 42, borderRadius: 6, borderWidth: 1,
          borderColor: colors.border, backgroundColor: colors.background, color: colors.text,
        }}
      />
      <TextInput accessibilityLabel={'Set ' + (index + 1) + ' weight in ' + unit}
        keyboardType="decimal-pad" selectTextOnFocus editable={!readOnly}
        value={weight} onChangeText={setWeight}
        onBlur={() => { if (!readOnly) commit(); }}
        style={{
          flex: 1, textAlign: 'center', minHeight: 42, borderRadius: 6, borderWidth: 1,
          borderColor: colors.border, backgroundColor: colors.background, color: colors.text,
        }}
      />
      <Pressable accessibilityRole="checkbox"
        accessibilityLabel={'Set ' + (index + 1) + ' complete'}
        accessibilityState={{ checked: set.completed, disabled: readOnly }}
        disabled={readOnly}
        onPress={() => commit({ completed: !set.completed })}
        style={{
          width: 48, minHeight: 42, borderRadius: 6, justifyContent: 'center', alignItems: 'center',
          borderWidth: 1, borderColor: set.completed ? colors.success : colors.border,
          backgroundColor: set.completed ? colors.subtle : colors.surface,
        }}>
        <Text style={{ color: set.completed ? colors.success : colors.muted, fontWeight: '700' }}>
          {set.completed ? '✓' : '○'}
        </Text>
      </Pressable>
    </View>
  );
}

function MovementEditor({
  movement, workoutId, unit, readOnly,
}: {
  movement: WorkoutMovement;
  workoutId: string;
  unit: WeightUnit;
  readOnly: boolean;
}) {
  const { colors } = useAppTheme();
  const { addSet, updateSet, removeMovement } = useGym();
  const exercise = getExercise(movement.exerciseId);
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
          <Pressable accessibilityRole="button"
            accessibilityLabel={'Remove ' + (exercise?.name ?? 'exercise')}
            onPress={() => Alert.alert('Remove exercise?', 'All of its sets will be removed.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => removeMovement(workoutId, movement.id) },
            ])}>
            <Text style={{ color: colors.danger, fontWeight: '600' }}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Text style={{ width: 25, color: colors.muted, fontSize: 12 }}>Set</Text>
        <Text style={{ flex: 1, textAlign: 'center', color: colors.muted, fontSize: 12 }}>Reps</Text>
        <Text style={{ flex: 1, textAlign: 'center', color: colors.muted, fontSize: 12 }}>Weight ({unit})</Text>
        <Text style={{ width: 48, textAlign: 'center', color: colors.muted, fontSize: 12 }}>Done</Text>
      </View>
      {movement.sets.map((set, index) => (
        <SetEditor key={set.id} set={set} index={index} unit={unit} readOnly={readOnly}
          onSave={(patch) => updateSet(workoutId, movement.id, set.id, patch)} />
      ))}
      {!readOnly ? <AppButton title="+ Add set" secondary onPress={() => addSet(workoutId, movement.id)} /> : null}
    </Panel>
  );
}

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workouts, preferences, finishWorkout, deleteWorkout } = useGym();
  const { colors } = useAppTheme();
  const workout = workouts.find((item) => item.id === id);

  if (!workout) {
    return (
      <Page>
        <Heading title="Workout not found" />
        <AppButton title="Back to home" secondary onPress={() => router.replace('/(tabs)')} />
      </Page>
    );
  }

  const readOnly = !!workout.finishedAt;

  function finish() {
    if (!workout || completedSets(workout) === 0) {
      Alert.alert('Log a set first', 'Mark at least one set complete before finishing.');
      return;
    }
    finishWorkout(workout.id);
    router.replace('/(tabs)/history');
  }

  function removeWorkout() {
    if (!workout) return;
    Alert.alert('Delete workout?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => {
          deleteWorkout(workout.id);
          router.replace('/(tabs)/history');
        },
      },
    ]);
  }

  return (
    <Page>
      <AppButton title="Back" secondary onPress={() => router.back()} />
      <Heading title={readOnly ? 'Workout details' : 'Active workout'}
        subtitle={formatDate(workout.startedAt) + ' · ' + formatDuration(workout)} />
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
          <MovementEditor key={movement.id} movement={movement} workoutId={workout.id}
            unit={preferences.unit} readOnly={readOnly} />
        ))}
        {!workout.movements.length ? (
          <EmptyState title="No exercises added"
            description="Choose an exercise to begin tracking sets and reps." />
        ) : null}
      </View>
      {!readOnly ? (
        <>
          <AppButton title="+ Add exercise" secondary onPress={() => router.push({
            pathname: '/exercise-picker', params: { workoutId: workout.id },
          })} />
          <AppButton title="Finish workout" onPress={finish} />
        </>
      ) : null}
      <AppButton title="Delete workout" secondary destructive onPress={removeWorkout} />
    </Page>
  );
}
