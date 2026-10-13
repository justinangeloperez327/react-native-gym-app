# Gym App

**Android + iOS personal fitness journal** built with Expo, React Native and TypeScript.

The approved product includes **workouts, cardio, nutrition, hydration, body measurements, goals and wellbeing**. The app is offline-first and will not require an account for v1.0.

> The repository currently contains a working *starter implementation* of workout logging, exercise search, session history and settings. Nutrition, wellbeing and the persistent SQLite architecture are planned but **not yet implemented**.

See the [approved product roadmap](docs/product-plan.md) for the scope and 15 implementation groups.

## Current features

- Start and finish strength workouts.
- Choose from a starter exercise library.
- Track sets, repetitions, loads, completed sets and workout volume.
- View workouts and training history.
- Choose kg/lb and light/dark/system appearance.
- Store workout data locally using AsyncStorage.

There is no authentication, backend, cloud sync or automated backup yet. Do not store secrets or credentials in AsyncStorage.

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
src/data/             Exercise catalog
src/lib/              Workout calculations, unit conversion
src/state/            Current AsyncStorage provider
src/theme/            Theme values and appearance
src/types/            Workout domain types
tests/                Domain-level automated tests
docs/                 Approved product roadmap
.github/workflows/     Reproducible CI
```

## Privacy and release status

Training data currently stays on the device. Uninstalling the application or clearing app storage may erase it. Planned nutrition and wellbeing entries are personal data; exports, local deletion and data recovery must be explicit and tested before release.

Store identifiers, icons, privacy disclosures, EAS signing, installation tests and release builds are still pending. This is a development app, not a published v1.0.
