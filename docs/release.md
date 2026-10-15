# Release preparation (EAS, Android and iOS)

**Status: release blocked, build configuration prepared.** The app remains at 0.1.0 until a release candidate has been built and signed, manually installed, audited and approved. No automated store submission, OTA publish, tag or deployment occurs on a normal push.

## Native configuration introspection and EAS linkage

CI evaluates Expo's AndroidManifest.xml and iOS Info.plist configuration in memory using
`expo config --type introspect`. It verifies that the evaluated Android backup
flag is off and forms resize with the soft keyboard. This is an additional static
native-config check, **not** evidence of a compiled or installed native binary.

The manual EAS workflow now runs `npm run check:eas-linked` to confirm
`expo.extra.eas.projectId` is a valid linked UUID before attempting authentication.
This fails until the real account owner completes `eas init` and commits
the generated identifier. Do not insert a made-up project ID. The real
signing credentials and `EXPO_TOKEN` are also needed for EAS preview builds.

## Current configuration

- `eas.json` has `preview` (internal Android APK / iOS test build), `simulator` (iOS Simulator only) and `production` (Android AAB / iOS IPA) profiles.
- Native build numbers are managed remotely and automatically increment for production builds; the public semantic version remains 0.1.0 until release approval.
- Bundle identifiers are reserved in the configuration as `com.justinangeloperez.gymapp` for both Android and iOS. Confirm that the developer accounts own or can register these identifiers before creating a production binary.
- Android app-data Auto Backup is disabled with `android.allowBackup: false` to reduce unexpected backups of personal journal data. This does **not** promise every OEM/OS device-transfer mechanism is disabled; validate native manifest/behavior.
- App icons, adaptive Android icon, splash artwork and store screenshots are **not yet finalized**. Expo's defaults must not be shipped as the production identity.

## One-time EAS setup (authorized Expo/Apple/Google account owner)

1. Install dependencies with `npm ci` and run `npm run validate` plus `npm run check:release-config`.
2. Install and authenticate the EAS CLI using [Expo's EAS Build documentation](https://docs.expo.dev/build/introduction/). Run `eas login`, then `eas init` in this repository to generate the real EAS project UUID. Commit the resulting `expo.extra.eas.projectId` in `app.json`. Never invent a UUID.
3. Configure Android signing keys and iOS Apple Developer certificates/provisioning using `eas credentials`; verify developer-account access, package IDs and distribution rights. Keep credentials in Expo's credential service or a secure vault, not this Git repo.
4. Configure the **GitHub Actions** secret `EXPO_TOKEN` for an Expo token with minimal rights. No credentials are present in this repository.
5. First run interactive `eas build -p android --profile preview` and `eas build -p ios --profile preview` as needed to complete certificate/device registration and native project setup. Non-interactive CI builds will not be able to answer setup prompts.
6. To queue builds **manually** from GitHub, go to **Actions → EAS Native Build (manual only) → Run workflow**, choose platform and profile, and run it on `main`. This workflow queues builds in EAS and exits; it does **not** wait for results, submit binaries, publish OTA updates, tag the repo or release to stores. Examine the EAS build URL in GitHub's job logs.
7. To validate the platform installers, obtain the preview Android APK, iOS internal test build or simulator build from EAS. Production Android uses an AAB for Play Console; it is not directly installable as a normal APK. Production iOS binaries use signed App Store/TestFlight distribution. <https://docs.expo.dev/build/eas-json/>

## Human approvals and release gate

Copy `release/release-evidence.example.json` to `release/release-evidence.json` (ignored by Git). After actual native tests, fill:

- Exact build URLs and tested source commit (must be the same on Android and iOS), device models, OS versions and testing dates.
- The **20** passing test IDs from `docs/qa-device-matrix.md` for *each* platform. Include external screenshots and device logs with a secure QA ticket; do not commit personally identifying log captures.
- An accessible HTTPS privacy-policy URL, verified support email, approved icons/store listing/screenshots, accurate privacy data disclosures and explicit submission approval.

Before signing off, check that Android and iOS evidence references the **same complete 40-hex source commit** as the repository's current `HEAD`. Changing code after the tested build requires new builds and a fresh native QA pass. Each `buildUrl` must link to the official Expo EAS build page; recorded test dates must be real, non-future dates. The checker also rejects reserved/example privacy domains and support addresses and verifies the icon is a 1024 × 1024 PNG by its header. **These are structural checks only**; the reviewer must verify the builds, artwork, live links, dates and evidence independently. The app and package semantic versions must agree.

Use `npm run check:release-config` to check build profiles at any time. **Do not use** `npm run check:release-ready` as proof of physical-device testing: it only validates the recorded human attestations. It deliberately fails with missing approvals until release preparation is complete.

When QA and store documentation are fully signed off, update `app.json` and `package.json` to **1.0.0 in a dedicated reviewed release commit**, re-run the entire automated and native suite, run `npm run check:release-ready`, and then perform a separately authorized manual submission. Do not assume that passing CI authorizes deployment.

### Submission is deliberately separate

- Android: after official Play Console configuration and service-account authorization, `eas submit -p android --profile production` is configured to use the **internal, draft** track by default, not a public production release.
- iOS: configure the real App Store Connect Apple ID and API/credential access in the EAS account or approved secure environment. The repo intentionally contains **no** placeholder `ascAppId` that would be mistaken for a production identity. Use `eas submit -p ios --profile production` only after the account owner authorizes it.
- App approval/availability is controlled by Apple/Google, not by successful EAS uploads.

## Mandatory outstanding tasks

- Approved launcher/adaptive icons and splash images; iOS/Android store screenshots and required listing graphics.
- Final published privacy policy and reviewed Apple privacy labels / Google Play Data safety responses (on-device body/fitness and wellness records, manual unencrypted JSON export, OS-provided sharing and storage).
- External support website/contact and any necessary entity/publisher rights.
- Signed Android and iOS binaries, test distribution, QA evidence for all 20 matrix checks on both platforms, and direct verification of the application on real devices.
- Version 1.0.0 change control, final approved source SHA, and release notes.

Review platform and account requirements before authorizing production: [Expo EAS Build](https://docs.expo.dev/build/eas-json/), [Expo iOS submission](https://docs.expo.dev/submit/ios/), [Expo Android submission](https://docs.expo.dev/submit/android/).
