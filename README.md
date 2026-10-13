# Gym App

A local-first gym training journal for **Android and iOS**, built with Expo SDK 57, React Native, TypeScript, and Expo Router.

## Features

- Start, edit, and finish workout sessions.
- Browse and search a starter exercise library.
- Track sets, reps, and weights.
- Review completed sessions and training volume.
- Switch between kilograms and pounds, and system/light/dark themes.
- Store training history locally on the device (no account required).

Workout data stays on the device. The app has **no backend, cloud sync, or authentication** at this stage. AsyncStorage is unencrypted; do not store secrets or sensitive credentials in it.

## Requirements

- Node.js 22.13+ (Node 22 LTS recommended).
- npm and a recent Android/iOS simulator or the Expo Go application.
- macOS/Xcode is needed to run an iOS simulator; a physical iPhone can use Expo Go.

## Start

```sh
npm install
npm run start
```

Then scan the QR code with Expo Go, or run `npm run android` / `npm run ios` with an emulator configured.

## Quality checks

```sh
npm run typecheck
npx expo install --check
```

There is no lockfile in this initial bootstrap. After installing dependencies, commit the generated `package-lock.json` so CI can switch to `npm ci` for reproducible installs.

## Project structure

```text
app/                  Expo Router screens and layouts
src/components/       Reusable interface components
src/data/             Exercise catalog
src/lib/              Formatting and workout calculations
src/state/            Local-first data provider and persistence
src/theme/            Color palettes and theme selection
src/types/            Domain models
.github/workflows/     CI checks
```

## Release notes

Before submitting builds to stores, finalize the app name, bundle identifiers, icons, splash screen, privacy disclosures, and EAS credentials. Running locally does not require a backend.
