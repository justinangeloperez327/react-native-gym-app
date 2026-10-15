import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { EmptyState, Metric, Page, Panel, ScreenHeader, SectionTitle } from '@/src/components/ui';
import { WorkoutPreview } from '@/src/components/WorkoutPreview';
import { goalProgress, formatMeasurement, latestReading } from '@/src/lib/body-metrics';
import { findExercise } from '@/src/data/exercises';
import { exercisesInHistory, filterHistory, trainingSummary, weeklyTrends, type WeeklyTrend } from '@/src/lib/analytics';
import { formatActivityTime, formatWeight } from '@/src/lib/workouts';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';

type Window = 30 | 90 | 'all';
type Measure = 'sessions' | 'volumeKg' | 'distanceMeters';
const metrics: { key: Measure; title: string }[] = [
  { key: 'sessions', title: 'Sessions' }, { key: 'volumeKg', title: 'Volume' },
  { key: 'distanceMeters', title: 'Distance' },
];

export default function ProgressScreen() {
  const { workouts, preferences, customExercises, measurements, goals } = useGym();
  const { colors } = useAppTheme();
  const [window, setWindow] = useState<Window>(30);
  const [measure, setMeasure] = useState<Measure>('sessions');
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(15);
  const history = useMemo(() => filterHistory(workouts, window, new Date()),
    [workouts, window]);
  const summary = useMemo(() => trainingSummary(workouts), [workouts]);
  const trends = useMemo(() => weeklyTrends(workouts, new Date()), [workouts]);
  const exercised = useMemo(() => exercisesInHistory(workouts), [workouts]);
  const matches = exercised.filter(item => (findExercise(item.id, customExercises)?.name ?? item.id)
    .toLowerCase().includes(query.trim().toLowerCase()));
  const week = trends.find(item => item.key === selectedWeek) ?? trends[trends.length - 1];

  return (
    <Page>
      <ScreenHeader title="Progress" subtitle="History, training trends and personal bests" />
      <View style={{ gap: 10 }}>
        <SectionTitle>All-time performance</SectionTitle>
        <Panel>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Metric label="Workouts" value={String(summary.sessions)} />
            <Metric label="Completed sets" value={String(summary.completedSets)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12, paddingTop: 12,
            borderTopColor: colors.divider, borderTopWidth: 1 }}>
            <Metric label="Training volume" value={formatWeight(summary.volumeKg, preferences.unit)} />
            <Metric label="Distance" value={(summary.distanceMeters / 1000).toFixed(1) + ' km'} />
          </View>
          {summary.activitySeconds > 0 ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Logged activity time: {formatActivityTime(summary.activitySeconds)}
            </Text>
          ) : null}
        </Panel>
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Body & personal goals</SectionTitle>
        <Panel>
          <Text style={{ color: colors.muted, fontSize: 13 }}>Latest body weight</Text>
          <Text style={{ color: colors.text, fontSize: 21, fontWeight: '700' }}>
            {latestReading(measurements, 'weight')
              ? formatMeasurement(latestReading(measurements, 'weight')!.value, 'weight', preferences.unit)
              : 'No reading yet'}
          </Text>
          {goals.map(goal => {
            const progress = goalProgress(goal, measurements, workouts);
            return <View key={goal.id} style={{ gap: 3, paddingTop: 6 }}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {goal.kind === 'body_weight' ? 'Weight goal' : 'Weekly training goal'} · {progress.percent.toFixed(0)}%
              </Text>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
                <View style={{ width: String(progress.percent) + '%', height: 6, backgroundColor: colors.primary }} />
              </View>
            </View>;
          })}
          <Pressable accessibilityRole="button" accessibilityLabel="Open body measurements and goals"
            onPress={() => router.push('/body')} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>View measurements & goals →</Text>
          </Pressable>
        </Panel>
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Training trends</SectionTitle>
        <Panel>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {metrics.map(item => (
              <Choice key={item.key} label={item.title} selected={measure === item.key}
                onPress={() => setMeasure(item.key)} />
            ))}
          </View>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Last 8 calendar weeks · Monday–Sunday · completed workouts
          </Text>
          <WeeklyBars weeks={trends} measure={measure} selected={week.key}
            onSelect={setSelectedWeek} />
          <View style={{ borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 8, gap: 4 }}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>Week of {week.label}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {week.sessions} workouts · {week.completedSets} sets · {formatWeight(week.volumeKg, preferences.unit)}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {(week.distanceMeters / 1000).toFixed(2)} km · {formatActivityTime(week.activitySeconds)} activity
            </Text>
          </View>
        </Panel>
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Exercise progression and records</SectionTitle>
        <TextInput accessibilityLabel="Search exercise history" value={query} onChangeText={setQuery}
          placeholder="Find an exercise you've logged" placeholderTextColor={colors.muted}
          style={{ color: colors.text, backgroundColor: colors.surface, borderColor: colors.border,
            borderWidth: 1, minHeight: 46, paddingHorizontal: 12, borderRadius: 6 }} />
        {matches.slice(0, query.trim() ? 30 : 8).map(item => (
          <Pressable key={item.id} accessibilityRole="button"
            accessibilityLabel={'View progress for ' + (findExercise(item.id, customExercises)?.name ?? item.id)}
            onPress={() => router.push({ pathname: '/exercise-progress/[id]', params: { id: item.id } })}>
            <Panel>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>
                    {findExercise(item.id, customExercises)?.name ?? 'Unknown exercise (' + item.id + ')'}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{item.sessions} logged sessions</Text>
                </View>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>View</Text>
              </View>
            </Panel>
          </Pressable>
        ))}
        {!exercised.length ? (
          <EmptyState title="No exercise history yet"
            description="Finish a workout with completed sets to unlock progression." />
        ) : !matches.length ? (
          <EmptyState title="No matching history" description="Try another exercise name." />
        ) : matches.length > (query.trim() ? 30 : 8) ? (
          <Text style={{ color: colors.muted, fontSize: 12 }}>Search to see more exercises.</Text>
        ) : null}
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Workout history</SectionTitle>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([30, 90, 'all'] as const).map(value => (
            <Choice key={value} label={value === 'all' ? 'All time' : 'Last ' + value + ' days'}
              selected={window === value} onPress={() => { setWindow(value); setVisible(15); }} />
          ))}
        </View>
        {history.length ? (
          <>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{history.length} completed workouts</Text>
            {history.slice(0, visible).map(workout => <WorkoutPreview key={workout.id} workout={workout} />)}
            {visible < history.length ? (
              <Pressable accessibilityRole="button" onPress={() => setVisible(value => value + 15)}
                style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>
                  Show more ({history.length - visible} remaining)
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <EmptyState title="No workouts in this period"
            description="Try a longer date range or complete a workout." />
        )}
      </View>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
        Strength records use completed non-warmup sets. Estimated 1RM is a calculated
        approximation, not a measured maximum. Body measurements and goal targets are available in Body & personal goals.
      </Text>
    </Page>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ selected }} onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44, paddingHorizontal: 11, justifyContent: 'center', borderRadius: 6, borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.subtle : colors.surface, opacity: pressed ? 0.75 : 1,
      })}>
      <Text style={{ color: selected ? colors.primary : colors.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function WeeklyBars({ weeks, measure, selected, onSelect }: {
  weeks: WeeklyTrend[]; measure: Measure; selected: string; onSelect: (key: string) => void;
}) {
  const { colors } = useAppTheme();
  const max = Math.max(1, ...weeks.map(item => item[measure]));
  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'flex-end', paddingTop: 12 }}>
      {weeks.map(week => {
        const value = week[measure];
        const isSelected = selected === week.key;
        const height = value > 0 ? Math.max(5, 92 * value / max) : 2;
        const display = measure === 'distanceMeters' ? (value / 1000).toFixed(1) + ' km'
          : measure === 'volumeKg' ? Math.round(value) + ' kg' : String(value);
        return (
          <Pressable key={week.key} accessibilityRole="button"
            accessibilityLabel={'Week ' + week.label + ': ' + display + '. View weekly details'}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(week.key)}
            style={{ flex: 1, minWidth: 0, minHeight: 128, justifyContent: 'flex-end',
              alignItems: 'center', gap: 5 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}
              style={{ color: colors.muted, fontSize: 10, textAlign: 'center', width: '100%' }}>
              {measure === 'sessions' ? value : measure === 'distanceMeters'
                ? (value / 1000).toFixed(1) : Math.round(value)}
            </Text>
            <View style={{ height: 94, width: '75%', justifyContent: 'flex-end' }}>
              <View style={{ height, width: '100%', borderRadius: 3,
                backgroundColor: isSelected ? colors.primary : colors.border }} />
            </View>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}
              style={{ color: isSelected ? colors.primary : colors.muted,
                fontSize: 10, textAlign: 'center', width: '100%' }}>
              {week.start.slice(5)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
