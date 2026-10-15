import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { AppButton, Heading, Page, Panel, SectionTitle } from '@/src/components/ui';
import { EMPTY_NUTRITION_TARGETS, validateNutritionTargets } from '@/src/lib/nutrition';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';
import type { NutritionTargets } from '@/src/types/gym';

const fields: { key: keyof NutritionTargets; title: string; unit: string }[] = [
  { key: 'calories', title: 'Daily energy', unit: 'kcal' },
  { key: 'proteinGrams', title: 'Protein', unit: 'g' },
  { key: 'carbsGrams', title: 'Carbohydrates', unit: 'g' },
  { key: 'fatGrams', title: 'Fat', unit: 'g' },
  { key: 'waterMl', title: 'Water', unit: 'ml' },
];

export default function NutritionTargetsScreen() {
  const { nutritionTargets, saveNutritionTargets, clearNutritionTargets } = useGym();
  const { colors } = useAppTheme();
  const [form, setForm] = useState<Record<keyof NutritionTargets, string>>({
    calories: '', proteinGrams: '', carbsGrams: '', fatGrams: '', waterMl: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const values = nutritionTargets ?? EMPTY_NUTRITION_TARGETS;
    setForm({
      calories: values.calories === null ? '' : String(values.calories),
      proteinGrams: values.proteinGrams === null ? '' : String(values.proteinGrams),
      carbsGrams: values.carbsGrams === null ? '' : String(values.carbsGrams),
      fatGrams: values.fatGrams === null ? '' : String(values.fatGrams),
      waterMl: values.waterMl === null ? '' : String(values.waterMl),
    });
  }, [nutritionTargets]);

  async function submit() {
    if (busy) return;
    const targets = Object.fromEntries(fields.map(field => {
      const value = form[field.key].trim();
      return [field.key, value ? Number(value) : null];
    })) as NutritionTargets;
    if (fields.every(field => targets[field.key] === null)) {
      setError('Enter at least one target or clear existing targets.'); return;
    }
    try { validateNutritionTargets(targets); } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid nutrition targets'); return;
    }
    setBusy(true); setError(null);
    try { await saveNutritionTargets(targets); router.back(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save targets'); }
    finally { setBusy(false); }
  }

  function confirmClear() {
    if (!nutritionTargets || busy) return;
    Alert.alert('Clear nutrition targets?', 'Food, meal and water history will be preserved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => {
        setBusy(true); setError(null);
        void clearNutritionTargets().then(() => router.back())
          .catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to clear targets'))
          .finally(() => setBusy(false));
      }},
    ]);
  }

  return <Page>
    <View style={{ alignSelf: 'flex-start' }}>
      <AppButton title="Back" secondary onPress={() => router.back()} />
    </View>
    <Heading title="Nutrition targets" subtitle="Optional personal daily targets" />
    <Panel>
      <SectionTitle>Configure daily totals</SectionTitle>
      {fields.map(field => <View key={field.key} style={{ gap: 5 }}>
        <Text style={{ color: colors.muted, fontSize: 13 }}>{field.title} ({field.unit})</Text>
        <TextInput accessibilityLabel={field.title + ' target in ' + field.unit}
          value={form[field.key]} onChangeText={value => setForm(prev => ({ ...prev, [field.key]: value }))}
          keyboardType="decimal-pad" placeholder="Blank = no target" placeholderTextColor={colors.muted}
          style={{ minHeight: 46, borderRadius: 6, borderWidth: 1, paddingHorizontal: 12,
            backgroundColor: colors.background, borderColor: colors.border, color: colors.text }} />
      </View>)}
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
        The app does not prescribe calories, macros or water intake. Enter your own targets;
        leave any field empty to avoid setting that goal.
      </Text>
    </Panel>
    {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
    <AppButton title={busy ? 'Saving…' : 'Save targets'} disabled={busy} onPress={() => { void submit(); }} />
    {nutritionTargets ? <AppButton title="Clear all targets" secondary destructive
      disabled={busy} onPress={confirmClear} /> : null}
  </Page>;
}
