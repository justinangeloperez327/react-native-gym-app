import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { AppButton, Heading, Page, Panel, SectionTitle } from '@/src/components/ui';
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
      style={({ pressed }) => ({
        minHeight: 44, justifyContent: 'center',
        paddingHorizontal: 12, borderRadius: 6,
        borderColor: active ? colors.primary : colors.border, borderWidth: 1,
        backgroundColor: active ? colors.subtle : colors.surface, opacity: pressed ? 0.7 : 1,
      })}>
      <Text style={{ color: active ? colors.primary : colors.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { preferences, updatePreferences } = useGym();
  const { colors } = useAppTheme();
  return (
    <Page>
      <View style={{ alignSelf: 'flex-start' }}>
        <AppButton title="Back" secondary onPress={() => router.back()} />
      </View>
      <Heading title="Settings" subtitle="Your training preferences" />
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
            Weights are stored in kilograms and converted for display.
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
        <SectionTitle>On-device data</SectionTitle>
        <Panel>
          <Text style={{ color: colors.text, fontWeight: '600' }}>Local-first</Text>
          <Text style={{ color: colors.muted, lineHeight: 20, fontSize: 13 }}>
            Workout history is saved on this device. Cloud sync and backup are not available yet.
            Removing the app or clearing its storage may permanently delete your records.
          </Text>
        </Panel>
      </View>
    </Page>
  );
}
