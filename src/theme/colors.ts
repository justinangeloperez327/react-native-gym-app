import { useColorScheme } from 'react-native';
import { useGym } from '@/src/state/GymContext';

// Semantic color roles shared by both themes.
export const lightColors = {
  background: '#F7F8FA',
  surface: '#FFFFFF',
  text: '#161B22',
  muted: '#626C79',
  border: '#E1E5E9',
  primary: '#285DCE',
  onPrimary: '#FFFFFF',
  subtle: '#EAF0FC',
  success: '#18764C',
  danger: '#B43232',
  divider: '#EFF1F3',
} as const;
export const darkColors = {
  background: '#11151A',
  surface: '#1B2128',
  text: '#F0F3F7',
  muted: '#ADB6C2',
  border: '#343D48',
  primary: '#89B0FF',
  onPrimary: '#10151B',
  subtle: '#26354A',
  success: '#79D5A7',
  danger: '#FF9696',
  divider: '#2B323A',
} as const;
export function useAppTheme() {
  const system = useColorScheme();
  const { preferences } = useGym();
  const dark = preferences.theme === 'dark' || (preferences.theme === 'system' && system === 'dark');
  return { colors: dark ? darkColors : lightColors, dark };
}
