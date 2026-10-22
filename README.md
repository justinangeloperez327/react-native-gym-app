# Gym App

**Android + iOS personal fitness journal** built with Expo, React Native and TypeScript.

The approved product includes **workouts, cardio, nutrition, hydration, body measurements, goals and wellbeing**. The app is offline-first and will not require an account for v1.0.

> **Development status:** All 15 implementation groups are in the repository, including offline nutrition, hydration, wellbeing, local JSON backups and EAS release configuration. Automated validation is passing. **Android/iOS native device QA, signing, publisher setup and store approval remain pending.** Do not treat this as a published or release-ready v1.0.

See the [approved product roadmap](docs/product-plan.md) for the scope and 15 implementation groups.

## Current features

- Navigate across Home, Train, Nutrition, Progress and Library; Settings opens from the screen header.
- Start and finish strength, bodyweight and cardio workouts using repetition, duration or distance logging.
- Search and filter strength, bodyweight, and cardio activities by muscle group and equipment.
- Create, edit and archive custom exercises in SQLite without losing historical workout references.
- Track sets, repetitions, loads, completed sets and workout volume.
- Resume unfinished sessions, write workout/exercise notes, review and copy previous sets, and remove individual sets.
- Build reusable workout routines with ordered exercises, target sets/reps/weight and recurring weekly schedules.
- See local save status and retry failed writes; workout start/finish waits for SQLite confirmation.
- View workout history with date filters, eight-week training charts, exercise progression and personal records.
- Record food servings and meals, daily macro/calorie targets, water intake, and weekly summaries locally.
- Record body metrics, fitness goals and optional wellbeing/recovery check-ins with local trend charts.
- Use first-launch introduction, local backup export, validated full-journal import, and database integrity diagnostics.
- Log body weight and circumference measurements, review historical trends and manage fitness targets.
- Choose kg/lb and light/dark/system appearance.
- Store workout data locally in Expo SQLite with transactional writes and schema migrations.
- Import valid legacy AsyncStorage workouts without deleting the original source.
- Compact light/dark UI primitives, shared semantic colors, and accessibility labels.

There is no authentication, backend, cloud sync, or automatic backup. SQLite is unencrypted by default; manually exported JSON files also contain unencrypted personal fitness and wellness records. Keep them private, verify a saved copy outside the app sandbox, and do not store credentials in SQLite.

## Requirements

- **Node.js 24** (active Node 24 release); `.nvmrc`, npm engines and GitHub Actions use the same major.
- npm.
- A recent Android/iOS emulator or a physical device with Expo Go.
- macOS and Xcode are required for the iOS simulator.

## Getting started

```sh
git clone https://github.com/justinangeloperez327/react-native-gym-app.git
cd react-native-gym-app
npm ci
npm run start
```

To launch a configured emulator directly:

```sh
npm run android
npm run ios
```

## Validation

```sh
npm run typecheck
npm run test
npm run check:expo
```

Or run `npm run validate` for all checks together. The GitHub Actions workflow runs these checks using `npm ci` and a committed `package-lock.json`. Tests include domain logic, native Node SQLite repository integration and release guardrails. CI also validates evaluated native Expo config and exports Android/iOS production JavaScript bundles; these checks do **not** replace native installation testing.

## Source layout

```text
app/                  Expo Router routes and tab layouts
src/components/       Shared UI building blocks
src/data/             Exercise catalog, schema migrations, SQLite repository
src/lib/              Workout calculations, training analytics, unit conversion
src/state/            React data provider backed by SQLite
src/theme/            Shared UI tokens, semantic colors and appearance
src/types/            Workout domain types
tests/                Domain-level automated tests
docs/                 Approved product roadmap
.github/workflows/     Reproducible CI
```

## Privacy and release status

Training, nutrition, hydration, measurements and recovery data are on-device by default. Legacy AsyncStorage records are retained after migration; an import failure does not replace the original record. Uninstalling or clearing app storage can erase data. **Settings → Export full JSON backup** creates a file for the user to save externally; the app provides no automatic cloud recovery. **Restore backup** validates a selected file and requires two confirmations before replacing the entire journal.

Provisional native package IDs and EAS build profiles are configured, but the actual Expo project link, signed installation tests, approved branding, privacy/support contacts and store submission remain outstanding. See [release preparation](docs/release.md) and the [native QA matrix](docs/qa-device-matrix.md). No version 1.0.0 or public release has been authorized.

## SQLite migration (Group 3)

- Native database: `gym-app.db`; schema version uses `PRAGMA user_version`.
- Schema version 9 covers training, routines, custom exercises, body metrics/goals, foods/meals, nutrition targets, hydration and recovery.
- Foreign keys, indexes, cascading deletes, transactional writes.
- Legacy key `gym-app:data:v1` is imported atomically, never deleted or overwritten.
- Current UI uses serialized async writes. Force-killing immediately after an edit can still interrupt the last write; Group 5 hardens session recovery.
- Manual full-journal backup/restore is implemented; there is no scheduled or cloud backup.

See [SQLite migration details](docs/sqlite.md).

## Exercise library (Group 4)

The catalog contains built-in strength, bodyweight, and cardio activities, with stable built-in IDs used by historical workouts. Custom exercises live in the version-2 SQLite `custom_exercises` table. Archiving removes entries from new-workout selection but preserves their names for existing workouts. Search supports activity type, muscle group, equipment and text. Current workout entry supports repetition, duration and distance-based activities.

## Workout persistence and recovery (Group 5)

SQLite schema version 3 adds optional session and exercise notes. Workouts and their sets remain available after restarting the app, including unfinished sessions. Starting or finishing a workout waits for SQLite confirmation before navigation. Valid numeric edits and notes enter an ordered write queue as they are typed, with visible **Saving / Saved / Save failed** status and an explicit **Retry save** action. After a failed write, the app attempts to repair persisted workouts using the latest in-memory state.

On backgrounding, the app requests a best-effort flush, but mobile operating systems can terminate the process before writes finish. **An edit is durable only after the app shows Saved on device.** Android and iOS process-kill recovery tests are still required.

Previous-performance references use the latest *completed* earlier workout for the same exercise. Copying previous sets produces fresh incomplete set IDs without modifying history.

## Routines and weekly scheduling (Group 6)

From **Train**, create a personal routine or import one of three starter programs. Edit its name, instructions, exercises, order, targets, and days of the week (Sunday–Saturday, device-local). The Train screen highlights templates assigned for the current weekday and lets you start them.

Starting a routine creates a **new saved workout** with fresh movement/set IDs and incomplete sets; the template remains unchanged. You can reuse, duplicate (without copying its schedule), or delete a routine without deleting recorded sessions. All templates and weekly assignments live in SQLite schema version 4. Assignments do not create notifications or automatically launch a workout; reminder support is outside the current scope. Routines can also contain duration and distance targets, which become independent workout entries when started.

## Advanced training and cardio (Group 7)

The workout editor supports repetitions and weights, bodyweight timed holds, and cardio with duration (seconds) and distance (kilometres). Saved values are stored as **seconds** and **metres**, independently of presentation. Completed workout summaries show logged distance and exercise duration separately from strength training volume.

Repetition sets can be marked **normal, warmup, drop, or failure**. Individual exercises have configurable rest targets (0–600 seconds). A rest countdown automatically starts after a completed set, except when the exercise is grouped with a later superset partner. The countdown is based on an absolute deadline so it corrects after backgrounding, but it does not send notifications and is not retained across process termination.

Pair an exercise with the previous workout movement to make a superset; you can also unpair it. Superset grouping is stored with the workout and survives reopening the session. This version does not implement automatic alternating sets or sophisticated superset sequencing.

The exercise picker and reusable routines now allow timed and distance-based activities. Routine targets can include duration or distance as well as rep/weight values. SQLite schema **version 5** adds the optional measurement fields, set types, rest targets, and superset group IDs; previous records retain their original meaning.


## Workout history and training analytics (Group 8)

The **Progress** tab summarizes completed training, shows interactive eight-week charts for workout frequency, training volume and distance, and filters history by last 30 days, last 90 days or all time. The weekly chart uses device-local Monday–Sunday calendar weeks, including zero-activity weeks. Workouts are dated by session completion time.

Exercise progression shows personal records and recent session charts, with a history list linked to completed workouts. Archived custom exercises remain discoverable using their historical IDs.

Strength records exclude warmup and incomplete sets. The estimated one-rep max uses Epley's formula only for positive external load and 1–10 reps; this is a calculation, not a measured maximum. Strength volume includes all completed sets (including warmups), while distance and duration are tracked separately. Cardio records reflect the longest individual completed distance/duration set.

Analytics run locally from saved workout history, without adding a backend or a new database migration. Large-history scalability, chart usability and accessibility still need native device testing.

## Body metrics and goals (Group 9)

From **Progress → Body & personal goals**, record body weight, waist, chest, hips, upper-arm and thigh circumference, with local calendar dates and optional notes. One reading per metric per date is retained; entering a value for the same metric/date updates the existing record. Each entry can be edited or deleted, and recent readings appear in a native bar chart with the full dated history below.

Storage is canonical: **kilograms for body weight and centimetres for circumference**. With the app preference set to pounds, body weight displays in pounds and circumference in inches. Changing the app's unit setting does not rewrite stored measurements. SQLite schema version 6 adds isolated `body_measurements` and `fitness_goals` tables without changing workouts.

Set one target each for **body weight** and **completed workouts per week**. Weight-goal progress is calculated from the body weight recorded when the goal is first created, with direction-aware progress for weight gain or loss. Weekly frequency counts completed sessions from the current device-local Monday to Sunday and resets with each new week. Targets can be edited or removed independently of the measurements or workout history.

These are user-entered fitness targets only, not medical recommendations. The app does not calculate BMI, prescribe an ideal weight, create diet advice or upload body measurements to a server. Native device and large-history verification remain required.

## Nutrition and meal logging (Group 10)

The **Nutrition** tab now provides a fully offline meal diary and a user-managed food library. You can create, edit or archive foods, search by name/brand, and record foods under Breakfast, Lunch, Dinner or Snacks on valid current or past diary dates. Each food defines its serving size in grams and its **calories per serving**, taken from the product label or another source selected by the user. No food data is automatically invented or fetched from a remote service.

Add any number of servings from 0.05 to 50, then view the day's calorie total and the breakdown per meal. Existing entries can be adjusted for quantity or deleted. The diary stores a **nutrition snapshot** when an entry is created, so changing the food's name or calorie values later never silently rewrites historical intake. Archived foods are excluded from new selections while existing diary entries remain intact.

SQLite schema **version 7** adds `foods` and `meal_entries`. Both use confirmed transactions and keep training and body-measurement data unchanged. The food editor can also store protein/carbohydrate/fat values per serving for future use, but calculated macro targets, hydration, daily target comparisons, and detailed nutrition reporting are **Group 11** functionality. Zero macro fields are not automatically verified nutrition values.

A personal nutrition diary is not a medical assessment or a guarantee of nutritional accuracy. User-entered food values and quantities determine the displayed calorie estimates.

## Nutrition targets, macros and hydration (Group 11)

The **Nutrition** tab now shows calories, protein, carbohydrates and fat from the saved, per-serving food snapshots. Macro-energy percentage is calculated as 4 kcal/g protein, 4 kcal/g carbohydrate and 9 kcal/g fat; this approximate distribution can differ from recorded label calories. A zero stored macro value may mean that the user left a food-label field unprovided, rather than that the food truly contains none of it.

Users can configure any combination of optional daily targets for calories, protein, carbs, fat and water via **Nutrition → Configure daily targets**. Targets have no automatic or medically prescribed defaults. Daily bars show percentage filled, remaining amounts and over-target amounts. Clearing targets does not affect foods or diary entries.

**Hydration** supports quick additions of 250 or 500 ml and custom millilitre amounts (up to 5,000 ml per entry), as well as editing/deleting individual records and logging against the currently selected diary date. Only manually logged water is included; beverages and water from food are not inferred. The last-seven-day summary shows recorded calorie and water totals for each local calendar day, including days without entries as zero *logged* amounts.

SQLite schema **v8** adds optional `nutrition_targets` and dated `water_entries`. All changes use confirmed database transactions. Training, food and meal history remain unchanged by nutrition-target edits or water-entry deletion.

## Wellbeing and recovery (Group 12)

The **Overview** and **Progress** screens link to **Wellbeing & recovery**. Record a daily self-reported check-in with optional hours slept, sleep quality, energy, mood, muscle soreness, stress (all 1–5 scales) and private notes. At least one value or a note is needed; each local calendar date holds at most one entry. You can update or delete saved entries. Empty days stay unrecorded rather than being interpreted as zero recovery or zero sleep.

The recovery screen shows a 14-day sleep-duration chart, average sleep/energy/soreness based only on available observations, and a side-by-side summary of logged sleep and training. A workout is aligned to its **completion date in the device's local timezone**, and unfinished/future-dated sessions are excluded. The view is descriptive: **it does not calculate a readiness score, diagnose health, or imply that sleep caused any training outcome**.

SQLite schema **v9** introduces `recovery_entries` with a unique date, optional validated ratings and sleep duration (stored as integer minutes), and notes. The migration leaves workouts, nutrition, hydration, routines and body records intact; recovery updates use confirmed exclusive transactions. Native device verification is still required.

## First launch, settings and complete data backup (Group 13)

First launch introduces workout logging, optional nutrition/recovery journals, and the importance of keeping a personal backup. It can be skipped; existing local records bypass the introduction. The completed introduction flag is stored locally and does not require an account or an internet connection.

Settings allows you to select kilograms or pounds and system/light/dark appearance. **Export full JSON backup** generates a versioned local file and opens the system share sheet. Choose a destination outside the app (e.g. a private local folder or an account you control) and verify that the file was saved. Merely opening/closing the share sheet does not guarantee an external copy.

**Restore backup** uses the system document picker. Files are checked for size (12 MB limit), JSON format, supported backup version, field validity, unique identifiers, numeric constraints and dates *before* the user can confirm replacement. The app presents a data summary and then requires a second destructive confirmation. An accepted restore **replaces the entire local journal** in one exclusive SQLite transaction. A validation failure, disk error or uniqueness violation rolls it back and preserves the previous journal. Restoration is not merge/sync.

The backup includes preferences, workouts and sets, custom exercise definitions (including archives), routines, body metrics and fitness goals, foods, meal history, nutrition targets, water logs and recovery check-ins. It contains personal information and is **not encrypted**. Avoid sharing the file publicly. The one-time introduction flag is not user health data and is retained across restore. This group does not offer automatic scheduling or cloud backup. On-device share/picker behavior and large-file performance require Android/iOS verification in Group 14.

## Production stabilization and QA (Group 14)

Settings now offers a read-only **Check local database integrity** action and recovery controls for failed local writes. A failed database startup presents **Retry opening local database**, which does not clear or repair records. SQLite's quick check and foreign-key diagnostics are deliberately opt-in because a full-table scan can be costly on a large offline journal.

Overview now selects the most recently *finished* workout rather than the most recently started one. Workouts in the future are excluded from recent-activity summaries. Long routine lists, active sessions and the saved-food library render a limited initial batch with **Show more** controls. The JSON backup limit is enforced using UTF-8 bytes rather than JS string length. Destructive primary buttons have corrected foreground/background contrast.

CI runs TypeScript, unit/SQLite integration tests, Expo SDK compatibility and production JavaScript export for Android/iOS. This export checks Metro module resolution; it does **not** prove the app is installable on physical phones. Mandatory device/manual checks remain documented in `docs/qa-device-matrix.md` and must be passed before v1.0.0.


## Group 15 — Manual Android/iOS release builds

EAS Build profiles in `eas.json` support internal Android APK/iOS previews, iOS simulator builds and production Android AAB/iOS App Store signing. Native builds are *never* automatically triggered by a push. **Actions → EAS Native Build (manual only)** requires account setup and the GitHub `EXPO_TOKEN` secret; it queues builds without submitting to either store.

Run `npm run check:release-config` for repeatable EAS configuration validation. The stricter `npm run check:release-ready` is expected to fail until the app icon and real EAS project ID are committed, the publisher approves privacy/support/asset details, and native QA evidence exists for every Android/iOS test. See `docs/release.md`, `docs/qa-device-matrix.md` and the unapproved store/legal drafts.

**No app version bump, EAS build, store submission, or v1.0.0 tag has been performed.** The implementation remains a prerelease while required external credentials and device tests are outstanding.
