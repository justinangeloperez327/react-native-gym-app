# Android and iOS Release Verification Matrix

**Status: UNVERIFIED — device testing required before a production release.** These are reproducible acceptance tests, not test results. Record model, OS version, build SHA, tester, date, observed result and evidence (screenshot/video/log) for each platform. A failure is release-blocking unless explicitly triaged and accepted.

| ID | Device test | Expected acceptance criteria | Android | iOS |
|---|---|---|---|---|
| 01 | Fresh install with cleared local data | Intro visible; Skip/Next finish; relaunch does not repeat | Pending | Pending |
| 02 | Existing database update from schema 1–8 | All records and settings retained; upgraded to schema 9 | Pending | Pending |
| 03 | Startup failure / retry | Error screen never creates blank journal; retry non-destructive | Pending | Pending |
| 04 | Train offline in airplane mode | Start, log sets, complete, resume history without network | Pending | Pending |
| 05 | Background/rest timer, lock screen, return | No wrong elapsed time or missing workout sets | Pending | Pending |
| 06 | Force-stop during active workout | Previously confirmed saves persist on reopening | Pending | Pending |
| 07 | Routine edit, duplicate, archived custom exercise | History stays readable; unusable exercise blocked when starting | Pending | Pending |
| 08 | kg/lb, system/light/dark settings | Correct unit display and readable color contrast after relaunch | Pending | Pending |
| 09 | Sleep, recovery, body metrics and workout charts | Correct local-day grouping, sensible empty state, readable visuals | Pending | Pending |
| 10 | Meal selection, nutrition quantities, hydration | Keyboard never obscures action; totals correct after restart | Pending | Pending |
| 11 | Backup to system share sheet | JSON saved at real external location and accessible afterward | Pending | Pending |
| 12 | Import a saved JSON file | Preview and two-stage confirm; all domains restored exactly | Pending | Pending |
| 13 | Cancel import/share; invalid/bad backup | No local data altered; actionable message appears | Pending | Pending |
| 14 | Restore with very large valid backup | No excessive freeze or OS kill; 12 MB limit enforced | Pending | Pending |
| 15 | Database health check | Healthy database reports schema 9; read-only and no data changes | Pending | Pending |
| 16 | VoiceOver / TalkBack traversal | Controls labeled and focusable; selected state conveyed | Pending | Pending |
| 17 | Large system font, smallest supported phone | All controls accessible; no clipped critical text or unpressable button | Pending | Pending |
| 18 | Low storage, OS termination during writes | Save failure surfaced, retry works; confirmed records survive | Pending | Pending |
| 19 | Long list with 100+ routines, foods and sessions | UI remains responsive; Show more reaches all records | Pending | Pending |
| 20 | Production binary install and launch | Correct native module linkage, no startup crash, background safe | Pending | Pending |

## Automated evidence vs native evidence

CI validates TypeScript, pure domain tests, Node SQLite integration tests, Expo SDK dependency compatibility, and Metro's production JS bundle for iOS/Android. None exercises the device OS, on-device SQLite/native module bridge, system document providers, touchscreen keyboard, accessibility tree or store signing.

Before release:
1. Run the matrix on **at least one Android device and one iOS device**; additionally test a small screen and large text.
2. Confirm third-party file providers and verify a backup exists *outside* the app sandbox before uninstalling.
3. Track failures with exact reproduction, expected vs actual, device logs, severity, remediation and retest.
4. Require **all release-blocking checks to pass**, an approved privacy disclosure for unencrypted local JSON exports, and a final production release build.
5. Keep prerelease version 0.1.0 until all Group 15 store/binary gates complete. No automatic store release is performed by this work.
