import { Pressable, Text, View } from 'react-native';
import { Heading, Page, Panel, SectionTitle } from '@/src/components/ui';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';
import type { ThemeSetting, WeightUnit } from '@/src/types/gym';

function Option<T extends string>({
  label, value, active, onSelect,
}: {
  label: string;
  value: T;
  active: boolean;
  onSelect: (value: T) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }}
      onPress={() => onSelect(value)}
      style={{
        paddingVertical: 11, paddingHorizontal: 12, borderRadius: 7,
        borderColor: active ? colors.primary : colors.border, borderWidth: 1,
        backgroundColor: active ? colors.subtle : colors.surface,
      }}>
      <Text style={{ color: active ? colors.primary : colors.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { preferences, updatePreferences } = useGym();
  const { colors } = useAppTheme();
  return (
    <Page>
      <Heading title="Settings" subtitle="Make your training journal yours." />
      <View style={{ gap: 10 }}>
        <SectionTitle>Weight unit</SectionTitle>
        <Panel>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Option<WeightUnit> label="Kilograms (kg)" value="kg" active={preferences.unit === 'kg'}
                onSelect={(unit) => updatePreferences({ unit })} />
            </View>
            <View style={{ flex: 1 }}>
              <Option<WeightUnit> label="Pounds (lb)" value="lb" active={preferences.unit === 'lb'}
                onSelect={(unit) => updatePreferences({ unit })} />
            </View>
          </View>
          <Text style={{ color: colors.muted, lineHeight: 19, fontSize: 13 }}>
            Weights are stored in kilograms and converted for display to avoid rounding errors.
          </Text>
        </Panel>
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Appearance</SectionTitle>
        <Panel>
          <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
            {([
              ['system', 'Use device setting'], ['light', 'Light'], ['dark', 'Dark'],
            ] as const).map(([value, label]) => (
              <Option<ThemeSetting> key={value} label={label} value={value}
                active={preferences.theme === value}
                onSelect={(theme) => updatePreferences({ theme })} />
            ))}
          </View>
        </Panel>
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle>Your data</SectionTitle>
        <Panel>
          <Text style={{ color: colors.text, fontWeight: '600' }}>Saved on this device</Text>
          <Text style={{ color: colors.muted, lineHeight: 20 }}>
            Workout history is stored locally without an account. There is no backup or cloud sync yet.
            Uninstalling the app or clearing app storage may permanently delete your records.
          </Text>
        </Panel>
      </View>
    </Page>
  );
}
