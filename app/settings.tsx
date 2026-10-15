import { router } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';
import { useState } from 'react';
import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { BACKUP_MAX_BYTES, describeBackup, parseBackup } from '@/src/data/backup';
import type { GymBackup } from '@/src/types/gym';
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
  const { preferences, updatePreferences, exportBackup, restoreBackup, saveStatus } = useGym();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<GymBackup | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { colors } = useAppTheme();
  async function shareBackup() {
    if (busy) return;
    setBusy(true); setIssue(null); setNotice(null);
    try {
      if (!await Sharing.isAvailableAsync()) {
        throw new Error('File sharing is not available on this device.');
      }
      const data = await exportBackup();
      const filename = 'gym-journal-backup-' + new Date().toISOString().slice(0, 10) +
        '-' + Date.now() + '.json';
      const file = new File(Paths.cache, filename);
      file.create();
      file.write(data);
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save gym journal backup' });
      setNotice('Share sheet closed. Verify that your backup file was actually saved outside the app.');
    } catch (cause) {
      setIssue(cause instanceof Error ? cause.message : 'Unable to share backup');
    } finally { setBusy(false); }
  }

  async function chooseBackup() {
    if (busy) return;
    setBusy(true); setPending(null); setIssue(null); setNotice(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*', copyToCacheDirectory: true, multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error('No file was selected');
      if (asset.size !== undefined && asset.size > BACKUP_MAX_BYTES)
        throw new Error('Selected file exceeds the 12 MB backup limit.');
      const file = new File(asset.uri);
      if (file.size > BACKUP_MAX_BYTES) throw new Error('Selected file is too large.');
      const data = await file.text();
      const parsed = parseBackup(data);
      setPending(parsed);
      setNotice('File validated. Review the contents before replacing local data.');
    } catch (cause) {
      setIssue(cause instanceof Error ? cause.message : 'Unable to open backup');
    } finally { setBusy(false); }
  }

  function confirmRestore() {
    if (!pending || busy) return;
    const backup = pending;
    Alert.alert('Replace all local data?', [
      'This permanently replaces every workout, food, meal, measurement, goal, water log and recovery entry on this device.',
      'Back up the current journal before continuing. This cannot be undone inside the app.',
    ].join('\n\n'), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace all data', style: 'destructive', onPress: () => {
        setBusy(true); setIssue(null); setNotice(null);
        void restoreBackup(backup).then(() => {
          setPending(null);
          setNotice('Backup restored successfully. All journal sections were replaced.');
        }).catch(cause => {
          setIssue(cause instanceof Error ? cause.message : 'Restore failed; original database retained.');
        }).finally(() => setBusy(false));
      }},
    ]);
  }

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
        <SectionTitle>Backup and restore</SectionTitle>
        <Panel>
          <Text style={{ color: colors.text, fontWeight: '600' }}>Local-first data ownership</Text>
          <Text style={{ color: colors.muted, lineHeight: 20, fontSize: 13 }}>
            Your fitness records are stored on this device. A JSON backup includes workouts,
            routines, foods, meals, body measurements, goals and recovery check-ins.
            It is not encrypted. Store it privately outside the app.
          </Text>
          <AppButton title={busy ? 'Working…' : 'Export full JSON backup'}
            disabled={busy || saveStatus === 'saving'} onPress={() => { void shareBackup(); }} />
          <AppButton title="Choose JSON file to restore" secondary disabled={busy}
            onPress={() => { void chooseBackup(); }} />
          {pending ? (
            <View style={{ gap: 8, borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>Selected backup</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                Created {new Date(pending.createdAt).toLocaleString()}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
                {describeBackup(pending)}
              </Text>
              <Text style={{ color: colors.danger, fontSize: 13, lineHeight: 19 }}>
                Restore replaces ALL current local data, not just missing records.
              </Text>
              <AppButton title="Replace local data from backup" secondary destructive
                disabled={busy} onPress={confirmRestore} />
              <AppButton title="Cancel restore" secondary onPress={() => setPending(null)} />
            </View>
          ) : null}
          {issue ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{issue}</Text> : null}
          {notice ? <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{notice}</Text> : null}
          <Text style={{ color: colors.muted, lineHeight: 20, fontSize: 12 }}>
            No automatic or cloud backup is provided. Deleting the app or clearing storage can
            permanently erase records. Keep your backup somewhere you control.
          </Text>
        </Panel>
      </View>
    </Page>
  );
}
