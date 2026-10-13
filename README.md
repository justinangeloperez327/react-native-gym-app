# Gym App

**Android + iOS personal fitness journal** built with Expo, React Native and TypeScript.

The approved product includes **workouts, cardio, nutrition, hydration, body measurements, goals and wellbeing**. The app is offline-first and will not require an account for v1.0.

> The repository currently contains a working *starter implementation* with five navigation tabs, workout logging, an expanded activity library, locally stored custom exercises, session history and settings. Nutrition and wellbeing are planned but **not yet implemented**. Cardio and timed exercise **logging** is planned for Group 7; these entries are currently library-only. Workout storage now uses native SQLite; existing AsyncStorage records are imported on upgrade.

See the [approved product roadmap](docs/product-plan.md) for the scope and 15 implementation groups.

## Current features

- Navigate across Home, Train, Nutrition, Progress and Library; Settings opens from the screen header.
- Start and finish strength workouts with repetition-based movements.
- Search and filter strength, bodyweight, and cardio activities by muscle group and equipment.
- Create, edit and archive custom exercises in SQLite without losing historical workout references.
- Track sets, repetitions, loads, completed sets and workout volume.
- View workouts and training history.
- Choose kg/lb and light/dark/system appearance.
- Store workout data locally in Expo SQLite with transactional writes and schema migrations.
- Import valid legacy AsyncStorage workouts without deleting the original source.
- Compact light/dark UI primitives, shared semantic colors, and accessibility labels.

The Nutrition screen is a clearly marked placeholder; it does not store or calculate meals or hydration yet.

There is no authentication, backend, cloud sync, or automated backup yet. SQLite is unencrypted by default. Do not store credentials in it.

## Requirements

- **Node.js 22** (22.13 or later); `.nvmrc` pins the supported major.
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

Or run `npm run validate` for all checks together. The GitHub Actions workflow runs these checks using `npm ci` and a committed `package-lock.json`. Unit tests use the Node.js test runner for dependency-free domain logic.

## Source layout

```text
app/                  Expo Router routes and tab layouts
src/components/       Shared UI building blocks
src/data/             Exercise catalog, schema migrations, SQLite repository
src/lib/              Workout calculations, unit conversion
src/state/            React data provider backed by SQLite
src/theme/            Shared UI tokens, semantic colors and appearance
src/types/            Workout domain types
tests/                Domain-level automated tests
docs/                 Approved product roadmap
.github/workflows/     Reproducible CI
```

## Privacy and release status

Training data stays on the device. Legacy AsyncStorage records are retained after migration. If import fails, the app reports an error without replacing the old record. Uninstalling or clearing app storage may erase both copies. Planned nutrition and wellbeing entries are personal data; exports, local deletion and data recovery must be explicit and tested before release.

Store identifiers, icons, privacy disclosures, EAS signing, installation tests and release builds are still pending. This is a development app, not a published v1.0.

## SQLite migration (Group 3)

- Native database: `gym-app.db`; schema version uses `PRAGMA user_version`.
- Tables: workouts, workout_movements, workout_sets, preferences, app_metadata.
- Foreign keys, indexes, cascading deletes, transactional writes.
- Legacy key `gym-app:data:v1` is imported atomically, never deleted or overwritten.
- Current UI uses serialized async writes. Force-killing immediately after an edit can still interrupt the last write; Group 5 hardens session recovery.
- Group 13 adds user-controlled backup/import. There is no cloud backup yet.

See [SQLite migration details](docs/sqlite.md).

## Exercise library (Group 4)

The catalog contains built-in strength, bodyweight, and cardio activities, with stable built-in IDs used by historical workouts. Custom exercises live in the version-2 SQLite `custom_exercises` table. Archiving removes entries from new-workout selection but preserves their names for existing workouts. Search supports activity type, muscle group, equipment and text. Current workout set entry supports only repetition-based activities; duration and distance logging arrives in Group 7.
