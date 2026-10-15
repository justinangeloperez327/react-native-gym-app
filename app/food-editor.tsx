import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { AppButton, Heading, Page, Panel, SectionTitle } from '@/src/components/ui';
import { createId } from '@/src/lib/workouts';
import { validateFood } from '@/src/lib/nutrition';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';
import type { FoodItem } from '@/src/types/gym';

function Field({ label, value, onChange, numeric = false, placeholder = '' }: {
  label: string; value: string; onChange: (text: string) => void; numeric?: boolean; placeholder?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChange}
        keyboardType={numeric ? 'decimal-pad' : 'default'} maxLength={numeric ? 12 : 100}
        placeholder={placeholder} placeholderTextColor={colors.muted}
        style={{ minHeight: 46, borderRadius: 6, borderWidth: 1, borderColor: colors.border,
          backgroundColor: colors.background, color: colors.text, paddingHorizontal: 12 }} />
    </View>
  );
}

export default function FoodEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { foods, saveFood, archiveFood } = useGym();
  const { colors } = useAppTheme();
  const existing = foods.find(food => food.id === id);
  const [name, setName] = useState(existing?.name ?? '');
  const [brand, setBrand] = useState(existing?.brand ?? '');
  const [grams, setGrams] = useState(String(existing?.servingGrams ?? 100));
  const [calories, setCalories] = useState(String(existing?.caloriesPerServing ?? ''));
  const [protein, setProtein] = useState(String(existing?.proteinPerServing ?? 0));
  const [carbs, setCarbs] = useState(String(existing?.carbsPerServing ?? 0));
  const [fat, setFat] = useState(String(existing?.fatPerServing ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setName(existing.name); setBrand(existing.brand);
      setGrams(String(existing.servingGrams)); setCalories(String(existing.caloriesPerServing));
      setProtein(String(existing.proteinPerServing)); setCarbs(String(existing.carbsPerServing));
      setFat(String(existing.fatPerServing));
    }
  }, [existing?.id]);

  if (id && !existing) {
    return <Page><Heading title="Food not found" />
      <AppButton title="Back to nutrition" secondary onPress={() => router.replace('/(tabs)/nutrition')} />
    </Page>;
  }

  async function submit() {
    if (busy) return;
    if (![grams, calories, protein, carbs, fat].every(v => v.trim())) {
      setError('Enter serving size, calories and all nutrition fields. Use 0 for values not provided.');
      return;
    }
    const item: FoodItem = {
      id: existing?.id ?? 'food:' + createId(),
      name: name.trim(), brand: brand.trim(),
      servingGrams: Number(grams), caloriesPerServing: Number(calories),
      proteinPerServing: Number(protein), carbsPerServing: Number(carbs),
      fatPerServing: Number(fat), archived: false,
    };
    try { validateFood(item); } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid food values');
      return;
    }
    if (foods.some(other => !other.archived && other.id !== item.id &&
      other.name.trim().toLocaleLowerCase() === item.name.toLocaleLowerCase() &&
      other.brand.trim().toLocaleLowerCase() === item.brand.toLocaleLowerCase())) {
      setError('A food with this name and brand already exists.');
      return;
    }
    setBusy(true); setError(null);
    try {
      await saveFood(item);
      router.replace('/(tabs)/nutrition');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save food');
    } finally { setBusy(false); }
  }

  function confirmArchive() {
    if (!existing || busy || existing.archived) return;
    Alert.alert('Archive food?', 'It will no longer appear in new meal selections. Previous meals keep their original values.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => {
        setBusy(true);
        void archiveFood(existing.id).then(() => router.replace('/(tabs)/nutrition'))
          .catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to archive food'))
          .finally(() => setBusy(false));
      } },
    ]);
  }

  return (
    <Page>
      <AppButton title="Back" secondary onPress={() => router.back()} />
      <Heading title={existing ? 'Edit food' : 'Create food'} subtitle="Use values from a nutrition label or a source you trust" />
      <Panel>
        <SectionTitle>Food details</SectionTitle>
        <Field label="Food name" value={name} onChange={setName} placeholder="e.g. Greek yogurt" />
        <Field label="Brand (optional)" value={brand} onChange={setBrand} placeholder="Product brand" />
        <Field label="Serving size in grams" numeric value={grams} onChange={setGrams} />
        <Field label="Calories per serving (kcal)" numeric value={calories} onChange={setCalories} />
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
          Nutrition values are per serving, not per 100 grams. The meal diary multiplies calories by your selected number of servings.
        </Text>
      </Panel>
      <Panel>
        <SectionTitle>Additional nutrition facts</SectionTitle>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
          Optional for future macro tracking. Enter values from the label; 0 can mean not provided and will not be treated as verified.
        </Text>
        <Field label="Protein per serving (g)" numeric value={protein} onChange={setProtein} />
        <Field label="Carbohydrates per serving (g)" numeric value={carbs} onChange={setCarbs} />
        <Field label="Fat per serving (g)" numeric value={fat} onChange={setFat} />
      </Panel>
      {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
      <AppButton title={busy ? 'Saving…' : existing ? 'Update food' : 'Save to my foods'}
        disabled={busy || !!existing?.archived} onPress={() => { void submit(); }} />
      {existing && !existing.archived ? (
        <AppButton title="Archive food" secondary destructive disabled={busy} onPress={confirmArchive} />
      ) : null}
      {existing?.archived ? <Text style={{ color: colors.muted }}>
        This food is archived. Past meal entries remain unchanged.
      </Text> : null}
    </Page>
  );
}
