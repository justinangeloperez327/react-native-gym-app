# Dependency update policy

## Runtime baseline

Node.js **24** is required for local development, tests and both GitHub Actions workflows.
The root `package.json` engine, the npm lockfile's root engine and `.nvmrc` must agree.
GitHub Actions uses `actions/setup-node@v7` with `node-version-file: .nvmrc`; changing
that file changes CI and manual native-build Node versions together. The action's own
runtime is independent from the version provisioned by `setup-node`.

## Expo SDK dependencies

Expo SDK 57 pins tested versions of React, React Native, Expo Router, native libraries
and @expo modules. Do not merge independent framework/React major/minor bump PRs just
because npm can resolve them. Dependabot ignores this managed cohort to prevent
unusable upgrade PRs. Upgrade the cohort deliberately:

1. Check the installed SDK's guidance with `npm run check:expo`.
2. Consult the Expo SDK release guidance for the proposed target.
3. Use `npx expo install --fix` (or explicit SDK-compatible versions) to update
   `package.json` and `package-lock.json` together.
4. Run `npm ci`, `npm run typecheck`, `npm run test`,
   `npm run check:release-config`, `npm run check:expo` and native config introspection.
5. Require green Android/iOS Metro exports and native device verification for major
   SDK or React Native changes before accepting them as release ready.

Dependency bot PRs already open before this policy may remain open and **must not be
merged** without a compatible full-cohort upgrade. TypeScript *major* changes are
similarly held for review; supported patch/minor versions can still be proposed.
All upgrades remain manual decisions; there is no automatic deployment or EAS build.
