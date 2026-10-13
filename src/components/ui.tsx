import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '@/src/theme/colors';

export function Page({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 5, marginBottom: 8 }}>
      <Text style={{ color: colors.text, fontSize: 27, fontWeight: '700', letterSpacing: -0.6 }}>{title}</Text>
      {subtitle ? <Text style={{ color: colors.muted, fontSize: 14 }}>{subtitle}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return <Text style={{ color: colors.text, fontWeight: '600', fontSize: 17 }}>{children}</Text>;
}

export function Panel({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

export function AppButton({
  title, onPress, secondary = false, disabled = false, destructive = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const { colors } = useAppTheme();
  const bg = secondary ? colors.surface : colors.primary;
  const fg = destructive ? colors.danger : secondary ? colors.text : colors.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: secondary ? colors.border : bg, opacity: disabled ? 0.5 : pressed ? 0.75 : 1 },
      ]}>
      <Text style={{ color: fg, fontWeight: '600', fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  const { colors } = useAppTheme();
  return (
    <Panel>
      <Text style={{ color: colors.text, fontWeight: '600', fontSize: 16 }}>{title}</Text>
      <Text style={{ color: colors.muted, lineHeight: 20, marginTop: 8 }}>{description}</Text>
    </Panel>
  );
}

export function LoadingScreen({ message = 'Loading workouts…' }: { message?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} />
      <Text style={{ color: colors.muted }}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 36, gap: 18 },
  panel: { padding: 16, borderRadius: 10, borderWidth: 1, gap: 10 },
  button: { minHeight: 46, justifyContent: 'center', alignItems: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 14 },
});
