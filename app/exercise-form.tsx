import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { AppButton, Heading, Page, Panel, SectionTitle } from '@/src/components/ui';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';
import {
  EXERCISE_KINDS, MUSCLE_GROUPS, type ExerciseInput,
  type ExerciseKind, type MuscleGroup, type TrackingType,
} from '@/src/types/gym';

export default function ExerciseForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { customExercises, createCustomExercise, updateCustomExercise, archiveCustomExercise } = useGym();
  const original = customExercises.find((item) => item.id === id && !item.archived);
  const { colors } = useAppTheme();
  const [name, setName] = useState(original?.name ?? '');
  const [equipment, setEquipment] = useState(original?.equipment ?? 'Bodyweight');
  const [kind, setKind] = useState<ExerciseKind>(original?.kind ?? 'strength');
  const [muscle, setMuscle] = useState<MuscleGroup>(original?.muscle ?? 'Chest');
  const [tracking, setTracking] = useState<TrackingType>(original?.tracking ?? 'reps');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function changeKind(value: ExerciseKind) {
    setKind(value);
    if (value === 'cardio') {
      setMuscle('Cardio');
      if (tracking === 'reps') setTracking('duration');
    } else if (tracking === 'distance') setTracking('reps');
  }

  async function submit() {
    if (saving) return;
    const input: ExerciseInput = { name, equipment, kind, muscle, tracking };
    setSaving(true);
    setMessage(null);
    try {
      if (original) {
        await updateCustomExercise(original.id, input);
      } else {
        await createCustomExercise(input);
      }
      router.back();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Unable to save exercise.');
    } finally {
      setSaving(false);
    }
  }

  function confirmArchive() {
    if (!original || saving) return;
    Alert.alert('Archive exercise?', 'It will disappear from the library and picker. Past workouts will retain its name.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => {
        setSaving(true);
        void archiveCustomExercise(original.id).then(() => router.back()).catch((cause: unknown) => {
          setMessage(cause instanceof Error ? cause.message : 'Unable to archive exercise.');
        }).finally(() => setSaving(false));
      } },
    ]);
  }

  if (id && !original) {
    return <Page><Heading title="Exercise unavailable" />
      <AppButton title="Back to library" onPress={() => router.back()} /></Page>;
  }

  return (
    <Page>
      <View style={{ alignSelf: 'flex-start' }}>
        <AppButton title="Back" secondary onPress={() => router.back()} />
      </View>
      <Heading title={original ? 'Edit exercise' : 'New exercise'}
        subtitle="Custom movements are stored on this device." />
      <Panel>
        <SectionTitle>Name</SectionTitle>
        <TextInput accessibilityLabel="Exercise name" value={name} onChangeText={setName}
          placeholder="e.g. Landmine Press" placeholderTextColor={colors.muted}
          maxLength={80} style={{
            color: colors.text, backgroundColor: colors.background, borderColor: colors.border,
            borderWidth: 1, borderRadius: 6, minHeight: 46, paddingHorizontal: 12,
          }} />
        <SectionTitle>Equipment</SectionTitle>
        <TextInput accessibilityLabel="Equipment" value={equipment} onChangeText={setEquipment}
          placeholder="e.g. Barbell, Mat, None" placeholderTextColor={colors.muted}
          maxLength={48} style={{
            color: colors.text, backgroundColor: colors.background, borderColor: colors.border,
            borderWidth: 1, borderRadius: 6, minHeight: 46, paddingHorizontal: 12,
          }} />
      </Panel>
      <View style={{ gap: 8 }}>
        <SectionTitle>Activity type</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {EXERCISE_KINDS.map((value) => (
            <Choice key={value} title={value} selected={value === kind} onPress={() => changeKind(value)} />
          ))}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <SectionTitle>Primary muscle group</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MUSCLE_GROUPS.map((value) => (
            <Choice key={value} title={value} selected={value === muscle} onPress={() => setMuscle(value)} />
          ))}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <SectionTitle>Tracking method</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(kind === 'cardio' ? ['duration', 'distance'] : ['reps', 'duration', 'distance']).map((value) => (
            <Choice key={value} title={value} selected={tracking === value}
              onPress={() => setTracking(value as TrackingType)} />
          ))}
        </View>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
          Only repetition-based movements can be added to workouts right now.
          Timed and distance-based logging is scheduled for Group 7.
        </Text>
      </View>
      {message ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{message}</Text> : null}
      <AppButton title={saving ? 'Saving…' : original ? 'Save changes' : 'Create exercise'}
        onPress={() => { void submit(); }} disabled={saving} />
      {original ? <AppButton title="Archive exercise" secondary destructive
        onPress={confirmArchive} disabled={saving} /> : null}
    </Page>
  );
}

function Choice({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44, minWidth: 68, justifyContent: 'center', paddingHorizontal: 12,
        borderWidth: 1, borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.subtle : colors.surface, borderRadius: 6, opacity: pressed ? 0.7 : 1,
      })}>
      <Text style={{ color: selected ? colors.primary : colors.text, fontWeight: '500', fontSize: 13 }}>{title}</Text>
    </Pressable>
  );
}
