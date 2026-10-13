import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { AppButton, EmptyState, Page, Panel, ScreenHeader, SectionTitle } from '@/src/components/ui';
import { WorkoutPreview } from '@/src/components/WorkoutPreview';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';

export default function TrainScreen() {
  const { workouts, startWorkout } = useGym();
  const { colors } = useAppTheme();
  const [starting, setStarting] = useState(false);
  const active = workouts.filter((workout) => !workout.finishedAt);

  async function begin() {
    if (starting) return;
    setStarting(true);
    try {
      const id = await startWorkout();
      router.push({ pathname: '/workout/[id]', params: { id } });
    } catch {
      Alert.alert('Unable to start workout', 'The session could not be saved. Check storage and try again.');
    } finally {
      setStarting(false);
    }
  }

  return (
    <Page>
      <ScreenHeader title="Train" subtitle="Log every set, one session at a time" />
      <View style={{ gap: 10 }}>
        <SectionTitle>Start a session</SectionTitle>
        <Panel>
          <Text style={{ color: colors.text, fontWeight: '600', fontSize: 16 }}>Empty workout</Text>
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
            Choose exercises and track reps, weight, and sets at your own pace.
          </Text>
          <AppButton title="Start workout" onPress={() => { void begin(); }} disabled={starting} />
        </Panel>
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Active sessions</SectionTitle>
        {active.length ? active.map((workout) => (
          <WorkoutPreview key={workout.id} workout={workout} />
        )) : (
          <EmptyState title="No active session"
            description="Your next workout will appear here until it is completed or deleted." />
        )}
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Training plans</SectionTitle>
        <Panel>
          <Text style={{ color: colors.text, fontWeight: '600' }}>Routine builder is planned</Text>
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
            Saved routines, training schedules, advanced sets, and cardio tracking are coming in Groups 6 and 7.
          </Text>
        </Panel>
      </View>
      <AppButton title="View completed workouts" secondary onPress={() => router.push('/(tabs)/progress')} />
    </Page>
  );
}
