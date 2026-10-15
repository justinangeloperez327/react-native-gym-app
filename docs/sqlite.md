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

## Schema version 4 — reusable routines

`routine_templates` stores local routine identity, descriptions and timestamps. `routine_exercises` stores ordered exercise IDs plus target sets, repetitions and weight in kilograms. `routine_weekdays` assigns weekday integers 0–6 (Sunday–Saturday). All child rows cascade when a template is deleted.

Each save replaces a routine's exercises and weekday assignments within a single transaction. On error, SQLite rolls the entire change back. Starting a routine creates a new workout with independent movement and set identifiers. Existing workout records do not depend on the template remaining present.

Starter programs are available as user-initiated copies and are never installed automatically. Scheduling does not implement notifications.

## Schema version 5 — advanced training and cardio

The fifth migration adds nullable duration in seconds, distance in metres, and a set-type classification to `workout_sets`. It also introduces per-exercise rest targets and superset grouping IDs in `workout_movements`. `routine_exercises` receives optional duration/distance targets. Existing strength sets continue to store their original repetitions and kilogram weights, with default normal set type and 90-second rest preference.

All new fields use the existing transactional workout and routine repositories. Legacy JSON imports remain valid; optional new fields are validated when present. Completed distance and activity-duration metrics are calculated only from completed sets and do not contribute to strength volume.

Rest countdown state is UI-local and uses a wall-clock deadline; it is not a persisted background alarm or a notification.

## Schema version 6 — measurements and fitness goals

The v6 transaction introduces `body_measurements` with a unique (kind, recorded_on) pair and a reverse-dated index. Supported kinds: weight, waist, chest, hips, upper_arm, thigh. The app writes all body weights in kg and circumferences in cm. Entry dates use local YYYY-MM-DD calendars, with date/value validation before every transaction. Original workout tables remain untouched.

`fitness_goals` stores one goal per kind: body_weight (starting and target weights in kg) or weekly_workouts (integer sessions/week, starting at zero). Goals use a stable ID across target edits. Goal progression is computed dynamically from existing body measurements and completed workouts, not persisted as a counter.

Readings, goals and deletions use confirmed, exclusive SQLite transactions. An unsuccessful save leaves in-memory lists unchanged. Neither deleting a measurement nor removing a goal changes any workout history.

## Schema version 7 — personal foods and meal history

`foods` stores user-defined food names, optional brand, serving mass in grams, calories per serving and optional stored protein/carbohydrate/fat values per serving. Archiving is soft; the record is retained and excluded from new diary selection. No external food database or automatically seeded nutrition catalog is used.

`meal_entries` stores local-date `eaten_on`, meal type (breakfast/lunch/dinner/snack), serving multiplier, historical food identity and **all nutrition values copied at log time**. Entries do not cascade from foods: editing/archiving a food never changes previously saved meals. Quantity edits only change the serving multiplier on that snapshot.

All writes are validated and run in exclusive SQLite transactions. Date rules reject future/noncalendar days. The default nutrition screen calculates daily kcal by summing `quantity * calories_per_serving` of entries for the selected date. Group 11 will add detailed macro targets, hydration, and goal comparisons.

## Schema version 8 — targets, macros and hydration

`nutrition_targets` is an optional singleton keyed by id=1. Columns for calories, protein grams, carbohydrate grams, fat grams and water ml are individually nullable; NULL means no user target. No record is created on upgrade. Updates replace the values transactionally, and clearing targets deletes only that singleton.

`water_entries` contains independent stable IDs, a local YYYY-MM-DD diary date and a positive water amount in ml. Indexed date access allows logging several entries per day. All writes and deletions are exclusive SQLite transactions. New water amounts must be positive and at most 5,000 ml per entry.

Daily nutrition calculations use the existing immutable `meal_entries` serving and nutrient snapshots; no migration rewrites older meal records. Macro totals are grams/serving multiplied by logged quantity. Estimates use macro energy factors of 4/4/9 kcal/g and may differ from saved food-label calories. Water totals include only manually logged water.

## Schema version 9 — recovery and wellbeing journal

`recovery_entries` stores one self-reported check-in per local YYYY-MM-DD date. Columns include `sleep_minutes` (optional integer 1–1440), `sleep_quality`, `energy`, `mood`, `soreness` and `stress` (each nullable 1–5), plus a short optional notes field. A UNIQUE date index prevents accidental duplicate entries for the same day. Entry IDs remain stable when records are edited; deletes do not cascade into workouts or other fitness data.

Data reads and writes run through the same confirmed transactional repository used by body measurements and nutrition. Domain validation checks real calendar days (not future dates), input bounds, notes length and that a check-in is not completely empty. Migration v9 is additive and guarded by SQLite `PRAGMA user_version`; it is rolled back atomically if schema creation fails.

Summary calculations use completed workout finish timestamps assigned to the local calendar date. Unlogged recovery fields are excluded from averages, and incomplete workouts are excluded from training counts. No physiological interpretation or readiness score is generated.
