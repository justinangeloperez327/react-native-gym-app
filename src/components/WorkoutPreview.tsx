import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { findExercise } from '@/src/data/exercises';
import { completedSets, formatDate, formatDuration, formatWeight, totalVolumeKg } from '@/src/lib/workouts';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';
import type { Workout } from '@/src/types/gym';
import { Panel } from './ui';

export function WorkoutPreview({ workout }: { workout: Workout }) {
  const { preferences, customExercises } = useGym();
  const { colors } = useAppTheme();
  const title = workout.movements.slice(0, 2)
    .map((movement) => findExercise(movement.exerciseId, customExercises)?.name ?? 'Exercise').join(', ');
  return (
    <Pressable accessibilityRole="button"
      accessibilityLabel={'View workout from ' + formatDate(workout.startedAt)}
      onPress={() => router.push({ pathname: '/workout/[id]', params: { id: workout.id } })}>
      <Panel>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
            {formatDate(workout.startedAt)}
          </Text>
          <Text style={{ color: workout.finishedAt ? colors.muted : colors.success, fontWeight: '600' }}>
            {workout.finishedAt ? formatDuration(workout) : 'In progress'}
          </Text>
        </View>
        <Text style={{ color: colors.muted }} numberOfLines={2}>{title || 'No exercises yet'}</Text>
        <Text style={{ color: colors.text, fontSize: 13 }}>
          {completedSets(workout)} sets · {formatWeight(totalVolumeKg(workout), preferences.unit)} volume
        </Text>
      </Panel>
    </Pressable>
  );
}
