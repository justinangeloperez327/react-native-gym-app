# Backup, restore and first-launch flow

The app works without an account and stores the user's journal in local SQLite. First launch displays three short explanations (training, wellbeing, and data ownership); users can advance or skip. Existing nonempty data skips onboarding. Completion is stored in AsyncStorage separately from the fitness database.

## Export a full backup

Open **Settings → Export full JSON backup**. The app waits for pending workout writes, reads all local entities, validates the generated backup and writes a JSON file to temporary app cache using `expo-file-system`. The system sharing sheet from `expo-sharing` lets you save/send that file outside the app. **Verify the file exists in the destination**; dismissing the share sheet is not proof of a completed backup.

Exports include training history, notes, set types, custom exercises, routines and scheduled days, body measurements, fitness goals, personal foods including archived foods, historic meals and nutrient snapshots, calorie/macro/water targets, water entries, recovery logs and user preferences. User IDs and positions are preserved for restoring relationships.

## Restore a backup

Open **Settings → Choose JSON file to restore**. The system file picker uses `copyToCacheDirectory: true` for immediate local reading. The selected file is limited to 12 MB, parsed as JSON, validated against backup format v1, and checked for duplicate IDs, unique dates, valid measurement bounds and supported data values. Unknown backup versions are rejected, rather than silently discarded.

The app displays a summary of the backed-up items before offering **Replace local data from backup**. A second native confirmation warns that all existing journal records will be replaced. Restore replaces the data, not merges it. Save the current journal first if it may be needed.

The SQLite transaction deletes and reinserts all journal records, their child records, and the included preferences. If any statement fails, SQLite rolls back all changes. Only after the transaction commits does the app update the screen state. The previous legacy-migration marker and introduction completion flag are intentionally preserved.

## Privacy and limitations

Backup JSON is **unencrypted** and may contain intimate health/wellbeing information. Keep it in a private, access-controlled location; do not send it to untrusted recipients. Exports are user-initiated; there is no automatic backup, no sync, and no account login. Backups larger than 12 MB cannot currently be imported. Physical Android/iOS file-provider, share-sheet and interrupted-restore testing is scheduled for Group 14.
