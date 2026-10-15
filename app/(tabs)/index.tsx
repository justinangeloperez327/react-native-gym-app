import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { AppButton, EmptyState, Metric, Page, Panel, ScreenHeader, SectionTitle } from '@/src/components/ui';
import { WorkoutPreview } from '@/src/components/WorkoutPreview';
import { completedSets, formatWeight, totalVolumeKg } from '@/src/lib/workouts';
import { formatSleep, recoveryByDate } from '@/src/lib/recovery';
import { localDateKey } from '@/src/lib/body-metrics';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';

export default function HomeScreen() {
  const { workouts, preferences, startWorkout, error, recoveryEntries } = useGym();
  const { colors } = useAppTheme();
  const [starting, setStarting] = useState(false);
  const finished = workouts.filter((workout) => workout.finishedAt);
  const active = workouts.filter((workout) => !workout.finishedAt);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekly = finished.filter((workout) =>
    workout.finishedAt && Date.parse(workout.finishedAt) >= cutoff,
  );
  const sets = weekly.reduce((sum, workout) => sum + completedSets(workout), 0);
  const volume = weekly.reduce((sum, workout) => sum + totalVolumeKg(workout), 0);

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
      <ScreenHeader title="Overview" subtitle="Your training at a glance" />
      {error ? <Panel><Text style={{ color: colors.danger }}>{error}</Text></Panel> : null}
      <View style={{ gap: 10 }}>
        <SectionTitle>Quick start</SectionTitle>
        <AppButton title="Start an empty workout" onPress={() => { void begin(); }} disabled={starting} />
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
        <SectionTitle>Wellbeing & recovery</SectionTitle>
        <Panel>
          {(() => {
            const checkin = recoveryByDate(recoveryEntries, localDateKey());
            return <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
              {checkin ? [
                checkin.sleepMinutes ? 'Sleep ' + formatSleep(checkin.sleepMinutes) : null,
                checkin.energy !== null ? 'Energy ' + checkin.energy + '/5' : null,
                checkin.soreness !== null ? 'Soreness ' + checkin.soreness + '/5' : null,
              ].filter(Boolean).join(' · ') || 'Today’s check-in saved'
                : 'No check-in logged today. Track sleep and how you feel.'}
            </Text>;
          })()}
          <AppButton title="Open daily recovery check-in" secondary
            onPress={() => router.push('/recovery')} />
        </Panel>
      </View>
    </Page>
  );
}
