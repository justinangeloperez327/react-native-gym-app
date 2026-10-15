import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { AppButton, EmptyState, Metric, Page, Panel, ScreenHeader, SectionTitle } from '@/src/components/ui';
import { isCalendarDate, localDateKey } from '@/src/lib/body-metrics';
import { caloriesByMeal, mealCalories, mealFromFood, mealsOnDay, MEAL_TYPES, searchFoods, totalCalories } from '@/src/lib/nutrition';
import { createId } from '@/src/lib/workouts';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';
import type { FoodItem, MealEntry, MealType } from '@/src/types/gym';

const numeric = (text: string): number | null => {
  const value = Number(text);
  return text.trim() && Number.isFinite(value) ? value : null;
};

export default function NutritionScreen() {
  const { foods, meals, saveMeal, deleteMeal } = useGym();
  const { colors } = useAppTheme();
  const [date, setDate] = useState(localDateKey());
  const [search, setSearch] = useState('');
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [showLibrary, setShowLibrary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validDay = isCalendarDate(date) && date <= localDateKey();
  const entries = useMemo(() => validDay ? mealsOnDay(meals, date) : [], [meals, date, validDay]);
  const totals = useMemo(() => caloriesByMeal(entries), [entries]);
  const options = useMemo(() => searchFoods(foods, search), [foods, search]);
  const selected = foods.find(food => food.id === selectedId && !food.archived);
  const activeCount = foods.filter(food => !food.archived).length;

  function shiftDay(offset: number) {
    const current = date.split('-').map(Number);
    if (!isCalendarDate(date)) return setDate(localDateKey());
    const day = new Date(current[0], current[1] - 1, current[2] + offset);
    const next = localDateKey(day);
    if (next <= localDateKey()) setDate(next);
  }

  async function addMeal() {
    if (busy) return;
    if (!selected) { setError('Choose a food from your library first.'); return; }
    if (!validDay) { setError('Enter a valid date on or before today.'); return; }
    const count = numeric(quantity);
    if (count === null) { setError('Enter a valid serving quantity.'); return; }
    let entry: MealEntry;
    try { entry = mealFromFood(selected, date, mealType, count, 'meal:' + createId()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid meal'); return; }
    setBusy(true); setError(null);
    try {
      await saveMeal(entry);
      setSelectedId(null); setSearch(''); setQuantity('1');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save meal');
    } finally { setBusy(false); }
  }

  function removeMeal(entry: MealEntry) {
    if (busy) return;
    Alert.alert('Delete meal entry?', 'This removes the diary entry only; your personal food remains saved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        setBusy(true);
        void deleteMeal(entry.id).catch(cause =>
          setError(cause instanceof Error ? cause.message : 'Unable to delete meal'))
          .finally(() => setBusy(false));
      } },
    ]);
  }

  return (
    <Page>
      <ScreenHeader title="Nutrition" subtitle="A personal food library and daily meal diary" />
      <Panel>
        <SectionTitle>Diary date</SectionTitle>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MiniButton title="Previous day" label="←" onPress={() => shiftDay(-1)} />
          <TextInput accessibilityLabel="Diary date YYYY-MM-DD" value={date} onChangeText={setDate}
            maxLength={10} autoCapitalize="none" style={{ flex: 1, minHeight: 46, borderWidth: 1,
              borderColor: colors.border, borderRadius: 6, color: colors.text,
              textAlign: 'center', backgroundColor: colors.background }} />
          <MiniButton title="Next day" label="→" disabled={date >= localDateKey()} onPress={() => shiftDay(1)} />
        </View>
        {!validDay ? <Text style={{ color: colors.danger, fontSize: 13 }}>
          Enter a valid calendar date on or before today.
        </Text> : null}
        <AppButton title="Today" secondary onPress={() => setDate(localDateKey())} />
      </Panel>
      <Panel>
        <SectionTitle>Daily energy</SectionTitle>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Metric label="Total calories" value={validDay ? Math.round(totalCalories(entries)) + ' kcal' : '—'} />
          <Metric label="Foods logged" value={String(entries.length)} />
        </View>
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          Calories are estimated from nutrition values you enter. Daily calorie and macro targets are planned for Group 11.
        </Text>
      </Panel>
      <View style={{ gap: 10 }}>
        <SectionTitle>Meal diary</SectionTitle>
        {MEAL_TYPES.map(type => {
          const portion = entries.filter(entry => entry.mealType === type.kind);
          return <Panel key={type.kind}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{type.label}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>{Math.round(totals[type.kind])} kcal</Text>
            </View>
            {portion.length ? portion.map(entry => (
              <DiaryRow key={entry.id} entry={entry} busy={busy}
                onSave={async updated => { setBusy(true); setError(null);
                  try { await saveMeal(updated); } catch (cause) {
                    setError(cause instanceof Error ? cause.message : 'Unable to edit meal');
                  throw cause;
                  } finally { setBusy(false); }
                }} onDelete={() => removeMeal(entry)} />
            )) : <Text style={{ color: colors.muted, fontSize: 13 }}>No foods logged.</Text>}
          </Panel>;
        })}
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Add a meal</SectionTitle>
        <Panel>
          <Text style={{ color: colors.muted, fontSize: 13 }}>Meal category</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {MEAL_TYPES.map(type => <MiniChip key={type.kind} title={type.label}
              selected={mealType === type.kind} onPress={() => setMealType(type.kind)} />)}
          </View>
          <Text style={{ color: colors.muted, fontSize: 13 }}>Search personal foods</Text>
          <TextInput accessibilityLabel="Search foods" value={search} onChangeText={setSearch}
            placeholder="Name or brand" placeholderTextColor={colors.muted}
            style={{ minHeight: 46, borderColor: colors.border, borderWidth: 1,
              borderRadius: 6, paddingHorizontal: 12, color: colors.text,
              backgroundColor: colors.background }} />
          {options.slice(0, 18).map(food => (
            <Pressable key={food.id} accessibilityRole="button"
              accessibilityLabel={'Select ' + food.name} accessibilityState={{ selected: selectedId === food.id }}
              onPress={() => setSelectedId(food.id)}
              style={{ minHeight: 44, borderBottomWidth: 1, borderColor: colors.divider,
                justifyContent: 'center', gap: 3 }}>
              <Text style={{ color: selectedId === food.id ? colors.primary : colors.text, fontWeight: '600' }}>
                {selectedId === food.id ? '✓ ' : ''}{food.name}{food.brand ? ' · ' + food.brand : ''}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {food.servingGrams} g/serving · {food.caloriesPerServing} kcal
              </Text>
            </Pressable>
          ))}
          {options.length > 18 ? <Text style={{ color: colors.muted, fontSize: 12 }}>
            Refine search to see more foods.
          </Text> : null}
          {!options.length ? <EmptyState title="No matching foods"
            description={activeCount ? 'Try another search or add a custom food.' :
              'Create your first food using verified nutrition label values.'} /> : null}
          <Text style={{ color: colors.muted, fontSize: 13 }}>Number of servings (0.05–50)</Text>
          <TextInput accessibilityLabel="Number of servings" value={quantity} onChangeText={setQuantity}
            keyboardType="decimal-pad" style={{ minHeight: 46, borderWidth: 1,
              borderColor: colors.border, borderRadius: 6, paddingHorizontal: 12,
              color: colors.text, backgroundColor: colors.background }} />
          {selected ? <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>
            {numeric(quantity) !== null ? Math.round(selected.caloriesPerServing * numeric(quantity)!) + ' kcal' : 'Invalid servings'}
          </Text> : null}
          <AppButton title={busy ? 'Saving meal…' : 'Log food'} disabled={busy || !validDay || !selected}
            onPress={() => { void addMeal(); }} />
          <AppButton title="+ Create custom food" secondary onPress={() => router.push('/food-editor')} />
        </Panel>
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>My foods ({activeCount})</SectionTitle>
        <AppButton title={showLibrary ? 'Hide food library' : 'Manage food library'} secondary
          onPress={() => setShowLibrary(v => !v)} />
        {showLibrary ? foods.filter(food => !food.archived).map(food => (
          <Pressable key={food.id} accessibilityRole="button"
            accessibilityLabel={'Edit ' + food.name}
            onPress={() => router.push({ pathname: '/food-editor', params: { id: food.id } })}>
            <Panel>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{food.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {food.brand ? food.brand + ' · ' : ''}{food.servingGrams} g · {food.caloriesPerServing} kcal/serving
              </Text>
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>Edit or archive →</Text>
            </Panel>
          </Pressable>
        )) : null}
      </View>
      {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
        All foods and meals are stored locally. Existing diary entries retain the nutritional
        values recorded when they were logged, even if you later edit or archive a food.
      </Text>
    </Page>
  );
}

function MiniButton({ label, title, onPress, disabled = false }: {
  label: string; title: string; onPress: () => void; disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled}
    onPress={onPress} style={{ minWidth: 44, minHeight: 44, borderWidth: 1,
      borderColor: colors.border, backgroundColor: colors.surface,
      borderRadius: 6, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
    <Text style={{ color: colors.text, fontSize: 19 }}>{label}</Text>
  </Pressable>;
}

function MiniChip({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={title}
    accessibilityState={{ selected }} onPress={onPress}
    style={{ minHeight: 44, borderColor: selected ? colors.primary : colors.border,
      backgroundColor: selected ? colors.subtle : colors.surface,
      borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, justifyContent: 'center' }}>
    <Text style={{ color: selected ? colors.primary : colors.text, fontSize: 13, fontWeight: '600' }}>{title}</Text>
  </Pressable>;
}

function DiaryRow({ entry, onSave, onDelete, busy }: {
  entry: MealEntry; busy: boolean; onSave: (entry: MealEntry) => Promise<void>; onDelete: () => void;
}) {
  const { colors } = useAppTheme();
  const [quantity, setQuantity] = useState(String(entry.quantity));
  const [editing, setEditing] = useState(false);
  return <View style={{ gap: 6, paddingTop: 9, borderTopColor: colors.divider, borderTopWidth: 1 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>{entry.foodName}</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {entry.quantity} servings · {Math.round(mealCalories(entry))} kcal
        </Text>
      </View>
      <MiniButton label="Edit" title={'Edit ' + entry.foodName + ' serving'} onPress={() => setEditing(v => !v)} />
      <MiniButton label="×" title={'Remove ' + entry.foodName} disabled={busy} onPress={onDelete} />
    </View>
    {editing ? <View style={{ gap: 7 }}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Serving quantity</Text>
      <TextInput accessibilityLabel="Edit meal servings" value={quantity} onChangeText={setQuantity}
        keyboardType="decimal-pad" style={{ borderColor: colors.border, borderWidth: 1,
          minHeight: 44, color: colors.text, paddingHorizontal: 12, borderRadius: 6 }} />
      <AppButton title="Save servings" disabled={busy} onPress={() => {
        const amount = numeric(quantity);
        if (amount === null || amount < 0.05 || amount > 50) {
          Alert.alert('Invalid quantity', 'Enter a serving amount from 0.05 to 50.');
          return;
        }
        void onSave({ ...entry, quantity: amount }).then(() => setEditing(false)).catch(() => {});
      }} />
    </View> : null}
  </View>;
}
