import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { GymProvider, useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';
import { LoadingScreen } from '@/src/components/ui';

function Navigation() {
  const { ready, error } = useGym();
  const { colors, dark } = useAppTheme();

  if (!ready && !error) return <LoadingScreen />;
  if (!ready && error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: 24, gap: 10 }}>
        <Text style={{ color: colors.text, fontSize: 21, fontWeight: '700' }}>Unable to open gym data</Text>
        <Text style={{ color: colors.muted, lineHeight: 21 }}>{error}</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="workout/[id]" />
        <Stack.Screen name="exercise-picker" />
        <Stack.Screen name="exercise-form" />
        <Stack.Screen name="routine/[id]" />
        <Stack.Screen name="exercise-progress/[id]" />
        <Stack.Screen name="body" />
        <Stack.Screen name="food-editor" />
        <Stack.Screen name="nutrition-targets" />
        <Stack.Screen name="recovery" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return <GymProvider><Navigation /></GymProvider>;
}
