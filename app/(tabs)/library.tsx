import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { AppButton, EmptyState, Page, Panel, ScreenHeader, SectionTitle } from '@/src/components/ui';
import { activeExercises, searchExercises } from '@/src/data/exercises';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';
import { EXERCISE_KINDS, MUSCLE_GROUPS, type ExerciseKind, type MuscleGroup } from '@/src/types/gym';

const KINDS = ['all', ...EXERCISE_KINDS] as const;
const MUSCLES = ['All', ...MUSCLE_GROUPS] as const;

export default function LibraryScreen() {
  const { colors } = useAppTheme();
  const { customExercises } = useGym();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<ExerciseKind | 'all'>('all');
  const [muscle, setMuscle] = useState<MuscleGroup | 'All'>('All');
  const [equipment, setEquipment] = useState('');
  const available = useMemo(() => activeExercises(customExercises), [customExercises]);
  const equipmentOptions = useMemo(() => Array.from(new Set(available.map((e) => e.equipment))).sort(), [available]);
  const filtered = useMemo(() => searchExercises(available, {
    query: search, kind, muscle, equipment,
  }), [available, search, kind, muscle, equipment]);

  return (
    <Page>
      <ScreenHeader title="Library" subtitle="Strength, bodyweight and cardio" />
      <AppButton title="+ Create custom exercise" secondary onPress={() => router.push('/exercise-form')} />
      <TextInput accessibilityLabel="Search exercises" value={search} onChangeText={setSearch}
        placeholder="Search exercises or equipment" placeholderTextColor={colors.muted}
        autoCorrect={false} style={{
          backgroundColor: colors.surface, color: colors.text, borderColor: colors.border,
          borderWidth: 1, paddingHorizontal: 12, minHeight: 46, borderRadius: 6, fontSize: 15,
        }}
      />
      <View style={{ gap: 8 }}>
        <SectionTitle>Activity</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {KINDS.map((item) => (
            <FilterChip key={item} label={item === 'all' ? 'All' : item[0].toUpperCase() + item.slice(1)}
              selected={kind === item} onPress={() => setKind(item)} />
          ))}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <SectionTitle>Muscle group</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MUSCLES.map((item) => (
            <FilterChip key={item} label={item} selected={muscle === item} onPress={() => setMuscle(item)} />
          ))}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <SectionTitle>Equipment</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <FilterChip label="All equipment" selected={!equipment} onPress={() => setEquipment('')} />
          {equipmentOptions.map((item) => (
            <FilterChip key={item} label={item} selected={equipment === item} onPress={() => setEquipment(item)} />
          ))}
        </View>
      </View>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{filtered.length} activities</Text>
      {filtered.map((exercise) => (
        <Panel key={exercise.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15 }}>
                {exercise.name}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {exercise.muscle} · {exercise.equipment} · {exercise.kind}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {exercise.tracking === 'reps' ? 'Repetitions' :
                  exercise.tracking === 'duration' ? 'Duration' : 'Distance'}
                {exercise.custom ? ' · Custom' : ''}
              </Text>
            </View>
            {exercise.custom ? (
              <Pressable accessibilityRole="button" accessibilityLabel={'Edit ' + exercise.name}
                onPress={() => router.push({ pathname: '/exercise-form', params: { id: exercise.id } })}
                style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Edit</Text>
              </Pressable>
            ) : null}
          </View>
        </Panel>
      ))}
      {!filtered.length ? <EmptyState title="No matching exercises"
        description="Try another filter or create a custom movement." /> : null}
    </Page>
  );
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={'Filter: ' + label}
      accessibilityState={{ selected }} onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 6, borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.subtle : colors.surface,
        opacity: pressed ? 0.7 : 1,
      })}>
      <Text style={{ color: selected ? colors.primary : colors.text, fontSize: 13, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}
