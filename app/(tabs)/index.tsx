import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { AppButton, EmptyState, Heading, Page, Panel, SectionTitle } from '@/src/components/ui';
import { WorkoutPreview } from '@/src/components/WorkoutPreview';
import { completedSets, formatWeight, totalVolumeKg } from '@/src/lib/workouts';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';

export default function HomeScreen() {
  const { workouts, preferences, startWorkout, error } = useGym();
  const { colors } = useAppTheme();
  const completed = workouts.filter((workout) => workout.finishedAt);
  const active = workouts.filter((workout) => !workout.finishedAt);
  const recent = completed.slice(0, 3);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const monthly = completed.filter((workout) =>
    workout.finishedAt && Date.parse(workout.finishedAt) >= cutoff,
  );
  const sets = monthly.reduce((sum, workout) => sum + completedSets(workout), 0);
  const volume = monthly.reduce((sum, workout) => sum + totalVolumeKg(workout), 0);

  function begin() {
    const id = startWorkout();
    router.push({ pathname: '/workout/[id]', params: { id } });
  }

  return (
    <Page>
      <Heading title="Your training" subtitle="Stay consistent. Track every session." />
      {error ? <Panel><Text style={{ color: colors.danger }}>{error}</Text></Panel> : null}
      <AppButton title="Start workout" onPress={begin} />
      {active.length ? (
        <View style={{ gap: 10 }}>
          <SectionTitle>Continue your workout</SectionTitle>
          {active.map((workout) => <WorkoutPreview key={workout.id} workout={workout} />)}
        </View>
      ) : null}
      <View style={{ gap: 10 }}>
        <SectionTitle>Last 30 days</SectionTitle>
        <Panel>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ color: colors.muted }}>Workouts</Text>
              <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700' }}>{monthly.length}</Text>
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ color: colors.muted }}>Completed sets</Text>
              <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700' }}>{sets}</Text>
            </View>
          </View>
          <View style={{ borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 12, gap: 4 }}>
            <Text style={{ color: colors.muted }}>Total training volume</Text>
            <Text style={{ color: colors.text, fontSize: 21, fontWeight: '600' }}>
              {formatWeight(volume, preferences.unit)}
            </Text>
          </View>
        </Panel>
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Recent sessions</SectionTitle>
        {recent.length ? recent.map((workout) => (
          <WorkoutPreview key={workout.id} workout={workout} />
        )) : (
          <EmptyState title="No sessions recorded"
            description="Start a workout and log your first set to build your training history." />
        )}
      </View>
    </Page>
  );
}
