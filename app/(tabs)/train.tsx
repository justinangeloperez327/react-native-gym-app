import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { AppButton, EmptyState, Page, Panel, ScreenHeader, SectionTitle } from '@/src/components/ui';
import { WorkoutPreview } from '@/src/components/WorkoutPreview';
import { STARTER_PROGRAMS, WEEKDAYS } from '@/src/data/routines';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';
import type { RoutineTemplate } from '@/src/types/gym';

export default function TrainScreen() {
  const { workouts, routines, startWorkout, startRoutineWorkout, createRoutine, importStarterRoutine } = useGym();
  const { colors } = useAppTheme();
  const [busy, setBusy] = useState(false);
  const active = workouts.filter((workout) => !workout.finishedAt);
  const today = new Date().getDay();
  const scheduled = routines.filter((routine) => routine.days.includes(today));

  async function run(action: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    try {
      const id = await action();
      router.push({ pathname: '/workout/[id]', params: { id } });
    } catch (error) {
      Alert.alert('Unable to start workout', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function makeRoutine(key?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const result = key ? await importStarterRoutine(key) : await createRoutine();
      router.push({ pathname: '/routine/[id]', params: { id: result.id } });
    } catch (error) {
      Alert.alert('Unable to save routine', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <ScreenHeader title="Train" subtitle="Repeat a plan or log a fresh session" />
      <View style={{ gap: 10 }}>
        <SectionTitle>Today · {WEEKDAYS[today]}</SectionTitle>
        {scheduled.length ? scheduled.map((routine) => (
          <RoutineCard key={routine.id} routine={routine}
            onStart={() => { void run(() => startRoutineWorkout(routine.id)); }} busy={busy} />
        )) : <EmptyState title="No routine scheduled for today"
          description="Assign weekdays to any saved routine to build your weekly training plan." />}
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Quick start</SectionTitle>
        <AppButton title="Start an empty workout" onPress={() => { void run(startWorkout); }} disabled={busy} />
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Your routines</SectionTitle>
        <AppButton title="+ Create routine" secondary onPress={() => { void makeRoutine(); }} disabled={busy} />
        {routines.length ? routines.map((routine) => (
          <RoutineCard key={routine.id} routine={routine} onStart={() => { void run(() => startRoutineWorkout(routine.id)); }} busy={busy} />
        )) : (
          <EmptyState title="No saved routines"
            description="Create a routine or copy a starter program to build a repeatable weekly plan." />
        )}
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Starter programs</SectionTitle>
        {STARTER_PROGRAMS.map((program) => (
          <Panel key={program.key}>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15 }}>{program.label}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{program.detail}</Text>
            <AppButton title="Add to my routines" secondary disabled={busy}
              onPress={() => { void makeRoutine(program.key); }} />
          </Panel>
        ))}
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Active sessions</SectionTitle>
        {active.length ? active.map((workout) => (
          <WorkoutPreview key={workout.id} workout={workout} />
        )) : (
          <EmptyState title="No active session"
            description="An unfinished session stays available here until you complete or delete it." />
        )}
      </View>
      <AppButton title="View workout history" secondary
        onPress={() => router.push('/(tabs)/progress')} />
    </Page>
  );
}

function RoutineCard({
  routine, onStart, busy,
}: { routine: RoutineTemplate; onStart: () => void; busy: boolean }) {
  const { colors } = useAppTheme();
  const description = routine.days.length
    ? [...routine.days].sort((a, b) => a - b).map((day) => WEEKDAYS[day]).join(' · ')
    : 'Not scheduled';
  return (
    <Panel>
      <Pressable accessibilityRole="button" accessibilityLabel={'Edit ' + routine.name}
        onPress={() => router.push({ pathname: '/routine/[id]', params: { id: routine.id } })}
        style={{ minHeight: 44, justifyContent: 'center', gap: 5 }}>
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 16 }}>{routine.name}</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {routine.exercises.length} exercises · {description}
        </Text>
      </Pressable>
      <AppButton title="Start this routine" disabled={busy || !routine.exercises.length} onPress={onStart} />
    </Panel>
  );
}
