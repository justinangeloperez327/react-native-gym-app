import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AppButton, EmptyState, Heading, Metric, Page, Panel, SectionTitle } from '@/src/components/ui';
import { findExercise } from '@/src/data/exercises';
import {
  exerciseRecords, exerciseSessions, type ExerciseSession, type PersonalRecord,
} from '@/src/lib/analytics';
import { formatActivityTime, formatDate, formatWeight, toDisplayWeight } from '@/src/lib/workouts';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';
import type { Exercise, WeightUnit } from '@/src/types/gym';

type MetricKey = 'bestWeightKg' | 'volumeKg' | 'bestEstimatedOneRepMaxKg' | 'distanceMeters' | 'durationSeconds';

function displayValue(value: number, metric: MetricKey, unit: WeightUnit): string {
  if (metric === 'distanceMeters') return (value / 1000).toFixed(2) + ' km';
  if (metric === 'durationSeconds') return formatActivityTime(value);
  return formatWeight(value, unit);
}

function recordValue(record: PersonalRecord, unit: WeightUnit): string {
  if (record.metric === 'distance') return (record.value / 1000).toFixed(2) + ' km';
  if (record.metric === 'duration') return formatActivityTime(record.value);
  if (record.metric === 'reps') return String(record.value) + ' reps';
  return formatWeight(record.value, unit);
}

const names: Record<PersonalRecord['metric'], string> = {
  weight: 'Heaviest working set', reps: 'Most repetitions',
  estimated1rm: 'Estimated 1-rep max', distance: 'Longest recorded distance',
  duration: 'Longest duration',
};

export default function ExerciseProgressScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workouts, preferences, customExercises } = useGym();
  const { colors } = useAppTheme();
  const exercise = findExercise(id, customExercises);
  const sessions = useMemo(() => exerciseSessions(workouts, id), [workouts, id]);
  const inferred: Exercise['tracking'] = sessions.some(s => s.distanceMeters > 0)
    ? 'distance' : sessions.some(s => s.durationSeconds > 0) ? 'duration' : 'reps';
  const tracking = exercise?.tracking ?? inferred;
  const options: { label: string; key: MetricKey }[] = tracking === 'reps'
    ? [{ label: 'Best load', key: 'bestWeightKg' }, { label: 'Volume', key: 'volumeKg' },
      { label: 'Est. 1RM', key: 'bestEstimatedOneRepMaxKg' }]
    : tracking === 'distance'
      ? [{ label: 'Distance', key: 'distanceMeters' }, { label: 'Duration', key: 'durationSeconds' }]
      : [{ label: 'Duration', key: 'durationSeconds' }];
  const [selectedMetric, setSelectedMetric] = useState<MetricKey | null>(null);
  const [limit, setLimit] = useState(12);
  const metric = options.find(o => o.key === selectedMetric)?.key ?? options[0].key;
  const records = useMemo(() => exerciseRecords(workouts, id, tracking), [workouts, id, tracking]);
  const plotted = sessions.slice(-12);
  const peak = Math.max(1, ...plotted.map(s => s[metric]));

  return (
    <Page>
      <View style={{ alignSelf: 'flex-start' }}>
        <AppButton title="Back to progress" secondary onPress={() => router.back()} />
      </View>
      <Heading title={exercise?.name ?? 'Exercise history'}
        subtitle={exercise ? exercise.muscle + ' · ' + exercise.equipment : 'Archived or unavailable exercise definition'} />
      {sessions.length ? (
        <>
          <Panel>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Metric label="Logged workouts" value={String(sessions.length)} />
              <Metric label="Completed sets" value={String(sessions.reduce((n, s) => n + s.sets, 0))} />
            </View>
          </Panel>
          <View style={{ gap: 10 }}>
            <SectionTitle>Personal records</SectionTitle>
            {records.length ? records.map(record => (
              <Panel key={record.metric}>
                <Text style={{ color: colors.muted, fontSize: 13 }}>{names[record.metric]}</Text>
                <Text style={{ color: colors.text, fontSize: 21, fontWeight: '700' }}>
                  {recordValue(record, preferences.unit)}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {formatDate(record.date)} · Completed session
                </Text>
              </Panel>
            )) : (
              <EmptyState title="No eligible records" description="Complete a measurable exercise set to establish a best." />
            )}
          </View>
          <View style={{ gap: 10 }}>
            <SectionTitle>Exercise progression</SectionTitle>
            <Panel>
              <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap' }}>
                {options.map(option => (
                  <Pressable key={option.key} accessibilityRole="button"
                    accessibilityState={{ selected: metric === option.key }}
                    onPress={() => setSelectedMetric(option.key)}
                    style={{ paddingHorizontal: 11, minHeight: 44, borderWidth: 1,
                      borderColor: metric === option.key ? colors.primary : colors.border,
                      backgroundColor: metric === option.key ? colors.subtle : colors.surface,
                      borderRadius: 6, justifyContent: 'center' }}>
                    <Text style={{ color: metric === option.key ? colors.primary : colors.text,
                      fontSize: 13, fontWeight: '600' }}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Last {plotted.length} completed sessions · earliest to latest
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5 }}>
                {plotted.map((session, index) => {
                  const value = session[metric];
                  const height = value > 0 ? Math.max(4, 100 * value / peak) : 2;
                  return (
                    <View key={session.workoutId} accessible
                      accessibilityLabel={'Session ' + (index + 1) + ', ' +
                        formatDate(session.date) + ', ' + displayValue(value, metric, preferences.unit)}
                      style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                      <View style={{ height: 105, width: '78%', justifyContent: 'flex-end' }}>
                        <View style={{ height, backgroundColor: colors.primary, borderRadius: 3 }} />
                      </View>
                      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
                        style={{ color: colors.muted, fontSize: 10, textAlign: 'center' }}>
                        {index + 1}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Latest: {displayValue(plotted[plotted.length - 1][metric], metric, preferences.unit)}
              </Text>
            </Panel>
          </View>
          <View style={{ gap: 10 }}>
            <SectionTitle>Session history</SectionTitle>
            {[...sessions].reverse().slice(0, limit).map(session =>
              <SessionCard key={session.workoutId} session={session}
                tracking={tracking} unit={preferences.unit} />)}
            {sessions.length > limit ? (
              <AppButton title={'Show more (' + (sessions.length - limit) + ')'} secondary
                onPress={() => setLimit(n => n + 12)} />
            ) : null}
          </View>
        </>
      ) : (
        <EmptyState title="No completed sessions" description="Finish a workout to see history and personal records." />
      )}
      {tracking === 'reps' ? (
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
          Heaviest load and repetitions exclude warmup sets. Estimated 1RM uses the
          Epley formula for completed sets of 1–10 reps with positive external load;
          it is not a tested maximum. Volume includes all completed sets.
        </Text>
      ) : null}
    </Page>
  );
}

function SessionCard({ session, tracking, unit }: {
  session: ExerciseSession; tracking: Exercise['tracking']; unit: WeightUnit;
}) {
  const { colors } = useAppTheme();
  const detail = tracking === 'reps'
    ? formatWeight(session.bestWeightKg, unit) + ' best load · ' + session.bestReps + ' best reps'
    : (session.distanceMeters / 1000).toFixed(2) + ' km · ' +
      formatActivityTime(session.durationSeconds);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={'View workout from ' + formatDate(session.date)}
      onPress={() => router.push({ pathname: '/workout/[id]', params: { id: session.workoutId } })}>
      <Panel>
        <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'space-between' }}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>{formatDate(session.date)}</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{session.sets} sets</Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 13 }}>{detail}</Text>
      </Panel>
    </Pressable>
  );
}
