# Draft privacy policy — NOT APPROVED OR PUBLISHED

**For legal/publisher review before submitting to Google Play or Apple App Store.**

## About this app

Gym App is an offline-first mobile journal for recording workouts, training routines, body measurements, food and water intake, self-reported sleep and wellbeing. The current source code does not implement an account registration or proprietary fitness-data cloud-sync backend.

## Data entered by the user

Journal data can include exercise details, personal workout history, weight and body measurements, nutrition/meal information, goals, hydration and self-reported sleep, energy, mood, soreness, stress and notes. The app stores these records in a local SQLite database and preference flags in local app storage.

## Sharing and backups

The user can export **unencrypted JSON backups** through their device's native sharing sheet. A backup can contain every item above. The user chooses where to save it or whom to share it with. The app can also import a user-selected backup file and, with confirmation, **replace** the local journal. Copies saved outside the app are controlled by the user and the chosen provider.

Android automatic app-data backup is explicitly disabled in app configuration, but device-to-device transfer behavior and iOS system backup behavior must be verified against actual OS settings. This statement is not a guarantee that the platform never backs up the app or related files.

## Data collection, third parties, retention and deletion

[Publisher must verify the final compiled native dependency/SDK list, analytics, crash reporting, operating-system telemetry, and external data processors; then complete this section.] The current application code contains no account-based collection or in-app third-party advertising and tracking integration. EAS cloud **build service** is not itself an app runtime health-data sync service. Do not claim no network/system services until a production binary has been examined.

Locally stored app records persist until the user removes them, restores another backup, clears storage or uninstalls, subject to OS backup behavior. Removing records on-device does not remove external backups previously exported by the user.

## Security

Journal files and manually exported backups are **not end-to-end encrypted** by this application. Platform filesystem encryption, if any, depends on the device and OS. Keep exported backups in a private secure location; do not share them publicly.

## Publisher and contact details

[PUBLISHER LEGAL NAME, mailing address, verified support email, effective date, hosted HTTPS policy URL and jurisdiction-specific disclosure/rights process required.]

This is a working template only. It is **not** an approved store-facing privacy policy and must not be represented as one before publisher/legal review.
