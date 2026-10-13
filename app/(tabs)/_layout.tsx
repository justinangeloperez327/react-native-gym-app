import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/src/theme/colors';
import { minTouchTarget } from '@/src/theme/tokens';

// Platform-independent glyphs; the label is always the primary navigation cue.
const glyphs: Record<string, string> = {
  index: '⌂', train: '▤', nutrition: '◫', progress: '▥', library: '☷',
};

export default function TabLayout() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const bottom = Math.max(6, insets.bottom);
  return (
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarAllowFontScaling: true,
      tabBarAccessibilityLabel: route.name === 'index' ? 'Home tab' : route.name + ' tab',
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 1 },
      tabBarIcon: ({ color }) => (
        <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={{ color, fontSize: 21, fontWeight: '500', lineHeight: 25 }}>
          {glyphs[route.name] ?? '•'}
        </Text>
      ),
      tabBarStyle: {
        backgroundColor: colors.surface,
        borderTopColor: colors.border,
        borderTopWidth: 1,
        paddingTop: 6,
        paddingBottom: bottom,
        height: minTouchTarget + 18 + bottom,
      },
    })}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="train" options={{ title: 'Train' }} />
      <Tabs.Screen name="nutrition" options={{ title: 'Nutrition' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
    </Tabs>
  );
}
