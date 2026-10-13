import { Text, View } from 'react-native';
import { EmptyState, Metric, Page, Panel, ScreenHeader, SectionTitle } from '@/src/components/ui';
import { WorkoutPreview } from '@/src/components/WorkoutPreview';
import { completedSets, formatWeight, totalVolumeKg } from '@/src/lib/workouts';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';

export default function ProgressScreen() {
  const { workouts, preferences } = useGym();
  const { colors } = useAppTheme();
  const finished = workouts
    .filter((workout) => !!workout.finishedAt)
    .sort((a, b) => Date.parse(b.finishedAt!) - Date.parse(a.finishedAt!));
  const totalSets = finished.reduce((sum, workout) => sum + completedSets(workout), 0);
  const totalVolume = finished.reduce((sum, workout) => sum + totalVolumeKg(workout), 0);

  return (
    <Page>
      <ScreenHeader title="Progress" subtitle="Your completed workout history" />
      <View style={{ gap: 10 }}>
        <SectionTitle>All-time summary</SectionTitle>
        <Panel>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Metric label="Workouts" value={String(finished.length)} />
            <Metric label="Sets" value={String(totalSets)} />
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 12 }}>
            <Metric label="Training volume" value={formatWeight(totalVolume, preferences.unit)} />
          </View>
        </Panel>
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Workout history</SectionTitle>
        {finished.length ? finished.map((workout) => (
          <WorkoutPreview key={workout.id} workout={workout} />
        )) : (
          <EmptyState title="No workouts yet"
            description="Complete a workout to see its sets, volume, and duration here." />
        )}
      </View>
      <Panel>
        <Text style={{ color: colors.text, fontWeight: '600' }}>More insights are planned</Text>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
          Exercise progression, personal records, body metrics, and long-term charts will be added in Groups 8 and 9.
        </Text>
      </Panel>
    </Page>
  );
}
