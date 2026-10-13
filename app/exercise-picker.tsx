import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { AppButton, EmptyState, Heading, Page, Panel } from '@/src/components/ui';
import { EXERCISES } from '@/src/data/exercises';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';

export default function ExercisePicker() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const { workouts, addMovement } = useGym();
  const { colors } = useAppTheme();
  const [search, setSearch] = useState('');
  const workout = workouts.find((item) => item.id === workoutId);
  const matches = useMemo(
    () => EXERCISES.filter((exercise) =>
      (exercise.name + ' ' + exercise.muscle + ' ' + exercise.equipment)
        .toLowerCase().includes(search.trim().toLowerCase()),
    ), [search],
  );

  if (!workout || workout.finishedAt) {
    return <Page><Heading title="Workout unavailable" />
      <AppButton title="Go back" onPress={() => router.back()} /></Page>;
  }

  return (
    <Page>
      <AppButton title="Back to workout" onPress={() => router.back()} secondary />
      <Heading title="Add an exercise" subtitle="Choose a movement to track your sets." />
      <TextInput accessibilityLabel="Search exercise to add" placeholder="Search exercise library"
        placeholderTextColor={colors.muted} value={search} onChangeText={setSearch}
        style={{
          backgroundColor: colors.surface, color: colors.text, borderColor: colors.border,
          borderWidth: 1, paddingHorizontal: 14, minHeight: 46, borderRadius: 8,
        }}
      />
      {matches.map((exercise) => {
        const added = workout.movements.some((movement) => movement.exerciseId === exercise.id);
        return (
          <Pressable key={exercise.id} disabled={added} accessibilityRole="button"
            accessibilityState={{ disabled: added }}
            onPress={() => { addMovement(workout.id, exercise.id); router.back(); }}>
            <Panel>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: 16 }}>{exercise.name}</Text>
                  <Text style={{ color: colors.muted }}>{exercise.muscle} · {exercise.equipment}</Text>
                </View>
                <Text style={{ color: added ? colors.muted : colors.primary, fontWeight: '600' }}>
                  {added ? 'Added' : '+ Add'}
                </Text>
              </View>
            </Panel>
          </Pressable>
        );
      })}
      {!matches.length ? <EmptyState title="Nothing found" description="Try another exercise name." /> : null}
    </Page>
  );
}
