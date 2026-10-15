import { useState } from 'react';
import { Text, View } from 'react-native';
import { AppButton, Heading, Page, Panel, SectionTitle } from '@/src/components/ui';
import { useGym } from '@/src/state/GymContext';
import { useAppTheme } from '@/src/theme/colors';

const slides = [
  {
    title: 'Your training, one place',
    description: 'Plan routines, track strength and cardio, and review past sessions — even without internet.',
    details: ['Start a quick workout or save a recurring routine.', 'Every completed set becomes part of your progress history.'],
  },
  {
    title: 'Your wellbeing, your pace',
    description: 'Log meals, water, body measurements and recovery when you choose. No goals are automatically prescribed.',
    details: ['Nutrition values come from foods you add.', 'Sleep and wellbeing ratings are private personal observations.'],
  },
  {
    title: 'Your data stays yours',
    description: 'The journal works locally without an account. Export a backup file regularly and save it outside your phone.',
    details: ['Settings includes JSON backup export and restore.', 'Deleting the app can remove local records if they are not backed up.'],
  },
] as const;

export function WelcomeScreen() {
  const { colors } = useAppTheme();
  const { completeWelcome } = useGym();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = slides[step];

  async function finish() {
    if (busy) return;
    setBusy(true); setError(null);
    try { await completeWelcome(); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save first-launch status');
    } finally { setBusy(false); }
  }

  return <Page>
    <Heading title="Welcome to your fitness journal"
      subtitle="Offline-first · No account required" />
    <Text style={{ color: colors.muted, fontSize: 13 }}>
      Introduction {step + 1} of {slides.length}
    </Text>
    <Panel>
      <SectionTitle>{current.title}</SectionTitle>
      <Text style={{ color: colors.text, fontSize: 15, lineHeight: 24 }}>{current.description}</Text>
      {current.details.map(item => <Text key={item} style={{
        color: colors.muted, fontSize: 13, lineHeight: 21,
      }}>• {item}</Text>)}
    </Panel>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {step > 0 ? <View style={{ flex: 1 }}>
        <AppButton title="Back" secondary disabled={busy} onPress={() => setStep(i => i - 1)} />
      </View> : null}
      <View style={{ flex: 1 }}>
        <AppButton title={busy ? 'Saving…' : step === slides.length - 1 ? 'Start tracking' : 'Next'}
          disabled={busy} onPress={() => {
            if (step < slides.length - 1) setStep(i => i + 1);
            else void finish();
          }} />
      </View>
    </View>
    <AppButton title="Skip introduction" secondary disabled={busy} onPress={() => { void finish(); }} />
    {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
    <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
      You can change units and appearance later in Settings. Backups are not automatic.
    </Text>
  </Page>;
}
