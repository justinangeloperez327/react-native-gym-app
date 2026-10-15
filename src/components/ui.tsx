import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '@/src/theme/colors';
import { minTouchTarget, radius, space, typeScale } from '@/src/theme/tokens';

export function Page({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function ScreenHeader({
  title, subtitle, settings = true,
}: { title: string; subtitle?: string; settings?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.header}>
      <View style={{ flex: 1, gap: space.xs }}>
        <Text accessibilityRole="header" style={{ color: colors.text, fontSize: typeScale.heading, fontWeight: '700', letterSpacing: -0.7 }}>
          {title}
        </Text>
        {subtitle ? <Text style={{ color: colors.muted, fontSize: typeScale.bodySmall, lineHeight: 19 }}>{subtitle}</Text> : null}
      </View>
      {settings ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          hitSlop={6}
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [
            styles.headerAction,
            { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Text style={{ color: colors.text, fontWeight: '600', fontSize: typeScale.bodySmall }}>Settings</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: space.xs }}>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: typeScale.heading, fontWeight: '700', letterSpacing: -0.7 }}>
        {title}
      </Text>
      {subtitle ? <Text style={{ color: colors.muted, fontSize: typeScale.bodySmall, lineHeight: 19 }}>{subtitle}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return <Text style={{ color: colors.text, fontWeight: '600', fontSize: typeScale.section }}>{children}</Text>;
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useAppTheme();
  return <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
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
  const bg = secondary ? colors.surface : destructive ? colors.danger : colors.primary;
  const fg = secondary ? (destructive ? colors.danger : colors.text) : colors.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: secondary ? colors.border : bg, opacity: disabled ? 0.5 : pressed ? 0.75 : 1 },
      ]}>
      <Text style={{ color: fg, fontWeight: '600', fontSize: typeScale.body }}>{title}</Text>
    </Pressable>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  const { colors } = useAppTheme();
  return (
    <Panel>
      <Text style={{ color: colors.text, fontWeight: '600', fontSize: typeScale.body }}>{title}</Text>
      <Text style={{ color: colors.muted, lineHeight: 20, fontSize: typeScale.bodySmall }}>{description}</Text>
    </Panel>
  );
}

export function Metric({ label, value, footnote }: { label: string; value: string; footnote?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flex: 1, minWidth: 100, gap: space.xs }}>
      <Text style={{ color: colors.muted, fontSize: typeScale.bodySmall }}>{label}</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.75}
        style={{ color: colors.text, fontSize: typeScale.number, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      {footnote ? <Text style={{ color: colors.muted, fontSize: typeScale.caption }}>{footnote}</Text> : null}
    </View>
  );
}

export function LoadingScreen({ message = 'Loading workouts…' }: { message?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.md, backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} />
      <Text style={{ color: colors.muted }}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.xxxl, gap: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 50 },
  headerAction: {
    paddingHorizontal: space.md, minHeight: minTouchTarget, minWidth: 70,
    alignItems: 'center', justifyContent: 'center', borderRadius: radius.control, borderWidth: 1,
  },
  panel: { padding: space.lg, borderRadius: radius.card, borderWidth: 1, gap: space.md },
  button: {
    minHeight: minTouchTarget + 2, justifyContent: 'center', alignItems: 'center',
    borderRadius: radius.control, borderWidth: 1, paddingHorizontal: space.lg,
  },
});
