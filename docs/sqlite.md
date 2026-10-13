# SQLite storage and legacy migration

Native database: `gym-app.db` via `expo-sqlite` for Android and iOS.

## Schema

- `workouts`: session IDs and timestamps
- `workout_movements`: ordered exercise entries, foreign-keyed to workouts
- `workout_sets`: ordered sets, weights, reps and completion flags
- `preferences`: current weight unit and appearance
- `app_metadata`: import marker

SQLite foreign keys are enabled. Schema version 1 creates workout history and preferences; version 2 adds `custom_exercises` with unique case-insensitive names, category/method metadata and an archive flag. Each migration runs within an exclusive transaction. Later migrations must increase `PRAGMA user_version`; opening a newer schema from an older app fails safely.

## Initial import

1. Open SQLite and create the versioned schema.
2. If an import marker already exists, do not read or reimport the old key.
3. Read the legacy `gym-app:data:v1` AsyncStorage value.
4. Validate the entire record, including nested IDs, timestamps, sets and preferences.
5. Import only if the SQLite database has no workouts and default preferences; otherwise keep existing SQLite data.
6. Save the import marker within the same transaction as the import.
7. Read the authoritative SQLite snapshot and initialize the UI.

The original legacy key is NEVER deleted or overwritten. Invalid or unreadable legacy records fail startup visibly rather than being replaced by empty data. A failed import rolls back and may be retried on next app start.

## Writes and recovery

UI actions update in-memory state immediately and enqueue targeted, serialized native SQLite writes. Each upsert replaces one workout's ordered exercises/sets inside a transaction. On errors, changes roll back and the app shows a persistence warning. Avoid force-closing the app right after a set edit until session write durability is improved in Group 5.

Current SQLite storage is not encrypted. Never save authentication secrets in the workout database. Backups/export are planned for Group 13.

## Verification

`npm test` runs schema and transaction integration tests using Node's built-in SQLite engine. Test coverage includes import success, import failure/rollback, no duplicate reimport, cascade deletes and snapshot validation.

Full native Android/iOS upgrade and interruption testing remains required.

## Schema version 2 — activity library

`custom_exercises` stores stable `custom:` IDs, names, category, muscle group, equipment, tracking method and archive state. Built-in definitions remain shipped in source code with stable IDs; workout movement IDs refer to either built-in or custom entries. Custom entries are never hard-deleted by the UI, allowing completed workout references to resolve after archival. Timed and distance-based exercises appear in the library but cannot be selected in the rep/weight editor until Group 7.

## Schema version 3 — workout notes and safe session completion

The third schema version adds `notes TEXT NOT NULL DEFAULT ''` to `workouts` and `workout_movements`. Both columns are added transactionally, and older records remain readable. The workout editor can save and display session and exercise notes.

New workout creation and workout completion wait for their SQLite transactions to succeed before navigating away. Intermediate set edits and notes enter a serialized write queue as valid values are typed; note-only updates use targeted SQL instead of rewriting all sets; the UI exposes save status and a retry control. If a write fails, the next save or manual retry attempts a full workout snapshot repair. The background lifecycle requests a best-effort flush, which cannot guarantee that a force-terminated process finishes writing.

Previous-performance lookups only reference earlier completed sessions and never modify old workouts.
