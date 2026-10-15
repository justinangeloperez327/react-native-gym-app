import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View, type DimensionValue } from 'react-native';
import { AppButton, Panel, SectionTitle } from '@/src/components/ui';
import { isCalendarDate, localDateKey } from '@/src/lib/body-metrics';
import { macroEnergySplit, nutritionTotals, progressToTarget, sevenDayNutrition, totalWaterMl, waterOnDay } from '@/src/lib/nutrition';
import { createId } from '@/src/lib/workouts';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';
import type { WaterEntry } from '@/src/types/gym';

function GoalLine({ label, value, target, unit }: {
  label: string; value: number; target: number | null; unit: string;
}) {
  const { colors } = useAppTheme();
  const progress = progressToTarget(value, target);
  return <View style={{ gap: 5 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
      <Text style={{ color: colors.text, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        {Number(value.toFixed(1))}{unit}{target === null ? ' · No target' : ' / ' + target + unit}
      </Text>
    </View>
    {target !== null ? <>
      <View style={{ height: 7, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' }}>
        <View style={{ height: 7, width: (progress.percent + '%') as DimensionValue,
          backgroundColor: colors.primary }} />
      </View>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        {progress.over! > 0 ? Number(progress.over!.toFixed(1)) + unit + ' over'
          : Number(progress.remaining!.toFixed(1)) + unit + ' remaining'}
      </Text>
    </> : null}
  </View>;
}

export function NutritionInsights({ day }: { day: string }) {
  const { meals, waterEntries, nutritionTargets, saveWaterEntry, deleteWaterEntry } = useGym();
  const { colors } = useAppTheme();
  const [amount, setAmount] = useState('250');
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = isCalendarDate(day) && day <= localDateKey();
  const dayMeals = useMemo(() => valid ? meals.filter(m => m.eatenOn === day) : [], [meals, day, valid]);
  const totals = useMemo(() => nutritionTotals(dayMeals), [dayMeals]);
  const water = useMemo(() => valid ? waterOnDay(waterEntries, day) : [], [waterEntries, day, valid]);
  const waterMl = totalWaterMl(water);
  const split = macroEnergySplit(totals);
  const sevenDays = useMemo(() => sevenDayNutrition(meals, waterEntries), [meals, waterEntries]);

  async function addWater(ml: number, id?: string) {
    if (!valid || busy) return;
    if (!Number.isFinite(ml) || ml <= 0 || ml > 5000) {
      setError('Water entries must be greater than 0 and at most 5,000 ml.'); return;
    }
    setBusy(true); setError(null);
    try {
      await saveWaterEntry({ id: id ?? 'water:' + createId(), recordedOn: day, amountMl: ml });
      setEditing(null); setAmount('250');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save water'); }
    finally { setBusy(false); }
  }

  function remove(entry: WaterEntry) {
    if (busy) return;
    Alert.alert('Delete water entry?', 'This removes the selected log only.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        setBusy(true); setError(null);
        void deleteWaterEntry(entry.id)
          .then(() => { if (editing === entry.id) { setEditing(null); setAmount('250'); } })
          .catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to delete water'))
          .finally(() => setBusy(false));
      } },
    ]);
  }

  return <>
    <View style={{ gap: 10 }}>
      <SectionTitle>Daily nutrition & targets</SectionTitle>
      <Panel>
        <GoalLine label="Energy" value={totals.calories} target={nutritionTargets?.calories ?? null} unit=" kcal" />
        <GoalLine label="Protein" value={totals.proteinGrams} target={nutritionTargets?.proteinGrams ?? null} unit=" g" />
        <GoalLine label="Carbohydrates" value={totals.carbsGrams} target={nutritionTargets?.carbsGrams ?? null} unit=" g" />
        <GoalLine label="Fat" value={totals.fatGrams} target={nutritionTargets?.fatGrams ?? null} unit=" g" />
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          Macro energy split (4/4/9 kcal/g): P {split.proteinPercent.toFixed(0)}% ·
          C {split.carbsPercent.toFixed(0)}% · F {split.fatPercent.toFixed(0)}%
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          Macro values come from saved food labels; zero can mean not provided.
          Derived macro energy may differ from the food's recorded calories.
        </Text>
        <AppButton title={nutritionTargets ? 'Edit nutrition targets' : 'Configure daily targets'}
          secondary onPress={() => router.push('/nutrition-targets')} />
      </Panel>
    </View>
    <View style={{ gap: 10 }}>
      <SectionTitle>Hydration</SectionTitle>
      <Panel>
        <GoalLine label="Logged water" value={waterMl} target={nutritionTargets?.waterMl ?? null} unit=" ml" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <AppButton title="+250 ml" secondary disabled={!valid || busy}
              onPress={() => { void addWater(250); }} />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton title="+500 ml" secondary disabled={!valid || busy}
              onPress={() => { void addWater(500); }} />
          </View>
        </View>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {editing ? 'Edit water amount' : 'Custom water amount'} (ml)
        </Text>
        <TextInput accessibilityLabel="Water amount in millilitres" keyboardType="decimal-pad"
          value={amount} onChangeText={setAmount}
          style={{ minHeight: 46, borderColor: colors.border, borderWidth: 1, borderRadius: 6,
            color: colors.text, paddingHorizontal: 12, backgroundColor: colors.background }} />
        <AppButton title={busy ? 'Saving…' : editing ? 'Update water entry' : 'Log water'}
          disabled={busy || !valid} onPress={() => {
            if (!amount.trim()) { setError('Enter a water amount.'); return; }
            void addWater(Number(amount), editing ?? undefined);
          }} />
        {editing ? <AppButton title="Cancel water edit" secondary onPress={() => {
          setEditing(null); setAmount('250');
        }} /> : null}
        {water.map(entry => <View key={entry.id} style={{ flexDirection: 'row',
          gap: 8, alignItems: 'center', borderTopWidth: 1, borderColor: colors.divider }}>
          <Text style={{ flex: 1, color: colors.text, fontSize: 13 }}>{entry.amountMl} ml</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Edit water entry"
            onPress={() => { setEditing(entry.id); setAmount(String(entry.amountMl)); }}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Edit</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Delete water entry"
            disabled={busy} onPress={() => remove(entry)}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
            <Text style={{ color: colors.danger, fontWeight: '600' }}>Delete</Text>
          </Pressable>
        </View>)}
        {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          This records water only, not other beverages or fluids from food. No hydration target is assumed.
        </Text>
      </Panel>
    </View>
    <View style={{ gap: 10 }}>
      <SectionTitle>Last 7 days</SectionTitle>
      <Panel>
        {sevenDays.map(item => <View key={item.day} style={{
          flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.muted, fontSize: 13, minWidth: 60 }}>{item.day.slice(5)}</Text>
          <Text style={{ color: colors.text, fontSize: 13, flex: 1, textAlign: 'center' }}>
            {Math.round(item.calories)} kcal
          </Text>
          <Text style={{ color: colors.text, fontSize: 13, flex: 1, textAlign: 'right' }}>
            {item.waterMl} ml
          </Text>
        </View>)}
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          Days without records show zero logged intake, not verified zero consumption.
        </Text>
      </Panel>
    </View>
  </>;
}
