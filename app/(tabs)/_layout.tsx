import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useAppTheme } from '@/src/theme/colors';

const icons: Record<string, string> = { index: '⌂', exercises: '▤', history: '◷', settings: '⚙' };

export default function TabLayout() {
  const { colors } = useAppTheme();
  return (
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      tabBarIcon: ({ color }) => (
        <Text style={{ color, fontSize: 23, fontWeight: '600' }}>{icons[route.name] ?? '•'}</Text>
      ),
      tabBarStyle: {
        backgroundColor: colors.surface, borderTopColor: colors.border,
        borderTopWidth: 1, height: 60, paddingTop: 4,
      },
    })}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="exercises" options={{ title: 'Exercises' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
