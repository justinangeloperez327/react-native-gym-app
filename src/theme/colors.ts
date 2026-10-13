import { useColorScheme } from 'react-native';
import { useGym } from '@/src/state/GymContext';

export const lightColors = {
  background: '#F6F7F9',
  surface: '#FFFFFF',
  text: '#15191E',
  muted: '#66717D',
  border: '#E2E5E9',
  primary: '#285DCE',
  onPrimary: '#FFFFFF',
  subtle: '#EDF3FF',
  success: '#157A49',
  danger: '#B93838',
} as const;

export const darkColors = {
  background: '#101317',
  surface: '#1B2026',
  text: '#EFF2F6',
  muted: '#A1ABB7',
  border: '#303840',
  primary: '#7FA8FF',
  onPrimary: '#101317',
  subtle: '#273449',
  success: '#67CF9A',
  danger: '#FF8989',
} as const;

export function useAppTheme() {
  const system = useColorScheme();
  const { preferences } = useGym();
  const dark = preferences.theme === 'dark' || (preferences.theme === 'system' && system === 'dark');
  return { colors: dark ? darkColors : lightColors, dark };
}
