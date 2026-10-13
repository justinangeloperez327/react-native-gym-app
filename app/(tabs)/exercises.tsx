import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Heading, Page, Panel } from '@/src/components/ui';
import { EXERCISES } from '@/src/data/exercises';
import { useAppTheme } from '@/src/theme/colors';

const MUSCLES = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'] as const;

export default function ExercisesScreen() {
  const { colors } = useAppTheme();
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState<(typeof MUSCLES)[number]>('All');
  const filtered = useMemo(
    () => EXERCISES.filter((exercise) =>
      (muscle === 'All' || exercise.muscle === muscle) &&
      (exercise.name.toLowerCase().includes(search.trim().toLowerCase()) ||
       exercise.equipment.toLowerCase().includes(search.trim().toLowerCase())),
    ),
    [search, muscle],
  );
  return (
    <Page>
      <Heading title="Exercises" subtitle="Explore movements for your next workout." />
      <TextInput accessibilityLabel="Search exercises" value={search} onChangeText={setSearch}
        placeholder="Search exercises or equipment" placeholderTextColor={colors.muted}
        style={{
          backgroundColor: colors.surface, color: colors.text, borderColor: colors.border,
          borderWidth: 1, paddingHorizontal: 14, minHeight: 46, borderRadius: 8,
        }}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {MUSCLES.map((item) => (
          <Pressable key={item} accessibilityRole="button"
            accessibilityState={{ selected: muscle === item }}
            onPress={() => setMuscle(item)}
            style={{
              backgroundColor: muscle === item ? colors.subtle : colors.surface,
              borderWidth: 1, borderColor: muscle === item ? colors.primary : colors.border,
              borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8,
            }}>
            <Text style={{ color: muscle === item ? colors.primary : colors.text, fontWeight: '500' }}>
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ color: colors.muted }}>{filtered.length} exercises</Text>
      {filtered.map((exercise) => (
        <Panel key={exercise.id}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{exercise.name}</Text>
          <Text style={{ color: colors.muted }}>{exercise.muscle} · {exercise.equipment}</Text>
        </Panel>
      ))}
      {filtered.length === 0 ? <Text style={{ color: colors.muted }}>No matching exercises.</Text> : null}
    </Page>
  );
}
