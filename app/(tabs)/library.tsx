import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { EmptyState, Page, Panel, ScreenHeader } from '@/src/components/ui';
import { EXERCISES } from '@/src/data/exercises';
import { useAppTheme } from '@/src/theme/colors';

const MUSCLES = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'] as const;

export default function LibraryScreen() {
  const { colors } = useAppTheme();
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState<(typeof MUSCLES)[number]>('All');
  const filtered = useMemo(() => EXERCISES.filter((exercise) => {
    const query = search.trim().toLowerCase();
    return (muscle === 'All' || exercise.muscle === muscle) &&
      (exercise.name.toLowerCase().includes(query) || exercise.equipment.toLowerCase().includes(query));
  }), [search, muscle]);

  return (
    <Page>
      <ScreenHeader title="Library" subtitle="Explore the starter exercise catalog" />
      <TextInput
        accessibilityLabel="Search exercises"
        value={search} onChangeText={setSearch}
        placeholder="Search exercise or equipment" placeholderTextColor={colors.muted}
        autoCorrect={false}
        style={{
          backgroundColor: colors.surface, color: colors.text, borderColor: colors.border,
          borderWidth: 1, paddingHorizontal: 14, minHeight: 46, borderRadius: 6, fontSize: 15,
        }}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {MUSCLES.map((item) => (
          <Pressable key={item} accessibilityRole="button"
            accessibilityLabel={'Filter: ' + item}
            accessibilityState={{ selected: muscle === item }}
            onPress={() => setMuscle(item)}
            style={({ pressed }) => ({
              minHeight: 44, justifyContent: 'center',
              backgroundColor: muscle === item ? colors.subtle : colors.surface,
              borderWidth: 1, borderColor: muscle === item ? colors.primary : colors.border,
              borderRadius: 6, paddingHorizontal: 12,
              opacity: pressed ? 0.7 : 1,
            })}>
            <Text style={{ color: muscle === item ? colors.primary : colors.text, fontWeight: '500' }}>
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        {filtered.length} exercises
      </Text>
      {filtered.length ? filtered.map((exercise) => (
        <Panel key={exercise.id}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{exercise.name}</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{exercise.muscle} · {exercise.equipment}</Text>
        </Panel>
      )) : <EmptyState title="Nothing found" description="Try a different exercise name or muscle group." />}
    </Page>
  );
}
