import { View } from 'react-native';
import { EmptyState, Heading, Page, SectionTitle } from '@/src/components/ui';
import { WorkoutPreview } from '@/src/components/WorkoutPreview';
import { useGym } from '@/src/state/GymContext';

export default function HistoryScreen() {
  const { workouts } = useGym();
  const completed = workouts.filter((workout) => !!workout.finishedAt)
    .sort((a, b) => Date.parse(b.finishedAt!) - Date.parse(a.finishedAt!));
  return (
    <Page>
      <Heading title="History" subtitle="Every finished session, in one place." />
      <View style={{ gap: 10 }}>
        <SectionTitle>{completed.length} completed workouts</SectionTitle>
        {completed.length ? completed.map((workout) => (
          <WorkoutPreview key={workout.id} workout={workout} />
        )) : (
          <EmptyState title="Your history is empty" description="Finish your first workout to see it here." />
        )}
      </View>
    </Page>
  );
}
