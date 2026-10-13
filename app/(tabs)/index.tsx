import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { AppButton, EmptyState, Metric, Page, Panel, ScreenHeader, SectionTitle } from '@/src/components/ui';
import { WorkoutPreview } from '@/src/components/WorkoutPreview';
import { completedSets, formatWeight, totalVolumeKg } from '@/src/lib/workouts';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';

export default function HomeScreen() {
  const { workouts, preferences, startWorkout, error } = useGym();
  const { colors } = useAppTheme();
  const finished = workouts.filter((workout) => workout.finishedAt);
  const active = workouts.filter((workout) => !workout.finishedAt);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekly = finished.filter((workout) =>
    workout.finishedAt && Date.parse(workout.finishedAt) >= cutoff,
  );
  const sets = weekly.reduce((sum, workout) => sum + completedSets(workout), 0);
  const volume = weekly.reduce((sum, workout) => sum + totalVolumeKg(workout), 0);

  function begin() {
    const id = startWorkout();
    router.push({ pathname: '/workout/[id]', params: { id } });
  }

  return (
    <Page>
      <ScreenHeader title="Overview" subtitle="Your training at a glance" />
      {error ? <Panel><Text style={{ color: colors.danger }}>{error}</Text></Panel> : null}
      <View style={{ gap: 10 }}>
        <SectionTitle>Quick start</SectionTitle>
        <AppButton title="Start an empty workout" onPress={begin} />
      </View>
      {active.length ? (
        <View style={{ gap: 10 }}>
          <SectionTitle>In progress</SectionTitle>
          {active.map((workout) => <WorkoutPreview key={workout.id} workout={workout} />)}
        </View>
      ) : null}
      <View style={{ gap: 10 }}>
        <SectionTitle>Last 7 days</SectionTitle>
        <Panel>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Metric label="Workouts" value={String(weekly.length)} />
            <Metric label="Completed sets" value={String(sets)} />
          </View>
          <View style={{ paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider }}>
            <Metric label="Training volume" value={formatWeight(volume, preferences.unit)} />
          </View>
        </Panel>
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Last workout</SectionTitle>
        {finished.length ? (
          <WorkoutPreview workout={finished[0]} />
        ) : (
          <EmptyState title="No completed workout yet"
            description="Start a session to build your personal training history." />
        )}
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Beyond workouts</SectionTitle>
        <Panel>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
            Your fitness journal is growing
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>
            Nutrition, hydration, body measurements and wellbeing tracking are planned for later groups.
            These features are not recording data yet.
          </Text>
        </Panel>
      </View>
    </Page>
  );
}
