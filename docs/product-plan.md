# Gym App — Product Plan

**Status:** Approved direction, implementation in progress  
**Target:** Android and iOS, personal fitness tracking  
**Release strategy:** One cohesive v1.0 after all 15 groups pass acceptance checks

## Decisions

| Decision | Final |
| --- | --- |
| Primary scope | Complete fitness: training, cardio, nutrition, hydration, body metrics, and wellbeing |
| Account/cloud | Optional later; v1.0 works entirely without an account |
| Visual style | Minimal and professional, compact layouts, restrained accents |
| Platforms | Android and iOS through Expo and React Native |
| Data ownership | Offline-first; on-device records, with export/import before v1.0 |
| Backend in v1.0 | None required |
| Monetization | Undecided; do not add subscription gates |

## Product definition

A personal fitness journal that helps a user plan training, log activity, track food and water, monitor recovery, and review progress. Recording today's activity should take fewer interactions than analyzing it. The app must remain useful in a gym without network coverage.

This is **not** a commercial gym operations, trainer marketplace, or membership-management system.

### Target users and workflows

1. **Strength trainee:** start an empty or templated workout, enter reps/weight, track rest, finish, review progression.
2. **Cardio user:** record duration, distance, pace and perceived exertion; compare sessions and weekly totals.
3. **Nutrition user:** set optional daily calorie/macronutrient targets; add meals, custom foods, recipes, and water; review the day.
4. **Wellbeing user:** record optional sleep duration, energy, mood, and recovery check-ins; correlate subjective trends with training without making diagnoses.
5. **Goal-focused user:** set training, consistency, bodyweight, and nutrition targets; review measurements and progress.

### V1 core feature boundaries

**Training:** exercise catalog, custom exercises, resistance/bodyweight/cardio tracking, working/warm-up sets, routines, exercise ordering, rest timer, sessions, history, personal bests, volume, and frequency.

**Nutrition:** daily food diary, meal groups, custom foods, basic seeded foods where provenance is clear, recipes, energy/macronutrient targets, portion units, manual hydration entries, and summary trends. Avoid depending on paid food databases or network access for the first release.

**Wellbeing:** optional manual sleep, fatigue, energy, mood, soreness, and recovery notes. No diagnostic scores, health claims, or automated medical advice.

**Progress:** bodyweight and measurements, workout progression, training load, consistency, achievements, goal trends, and exercise PRs. Provide neutral trends rather than value judgments.

**Data and settings:** first-run setup, local persistence, unit conversions, accessible defaults, secure data handling, export/import, local erase confirmation, light/dark themes.

### Deferred until after v1

Accounts and multi-device sync; social feeds and challenges; trainer marketplace; AI coaching; barcode scanning / comprehensive third-party food catalogs; wearable sync; Apple Health / Health Connect; wearable notifications; payments/subscriptions.

## Navigation and design

Bottom tabs (five):

| Tab | Primary actions |
| --- | --- |
| Home | Today's plan, daily summary, next workout, water, optional recovery check-in |
| Train | Start/continue session, routines, exercise picker, cardio logging |
| Nutrition | Meals, foods, recipes, targets, water |
| Progress | History, personal records, body metrics, goal and nutrition charts |
| Library | Exercise catalog, search, guidance, custom movements |

Profile/Settings from the Home header. The active workout opens a dedicated screen, not a bottom-tab overlay. Preserve input state when the keyboard opens and when the app backgrounds.

**UI rules:** neutral surfaces, one accessible accent, light/dark/system appearance, 4–8 px corner radius, consistent 8 px spacing rhythm, minimal decorative gradients, compact but accessible tap targets, high legibility of metrics, and no unnecessary copy. Primary workflows should remain usable one-handed.

## Data and architecture

- Keep Expo SDK 57 / React Native 0.86 until a verified upgrade is needed; TypeScript and Expo Router remain the main stack.
- Group 3 uses `expo-sqlite`, transactional writes, versioned migrations, repository interfaces and integrity checks; AsyncStorage remains a read-only legacy source.
- Domain modules: `training`, `activity`, `nutrition`, `hydration`, `wellbeing`, `measurements`, `goals`, `settings`. Share numeric-unit/date utilities but keep modules independent.
- Store weights internally in kg and energy in kcal, displaying selected units after conversion. Food servings should preserve both the entered quantity/unit and the normalized nutrient snapshot.
- A completed workout is an immutable historical record by default; later edits are explicit. Deleting or changing a template must not rewrite history.
- Persist active workouts and food-entry drafts at safe checkpoints. Handle interruption/recovery, multi-day travel, timezone boundaries and device clock changes.
- Exercise progression and food totals are deterministic derived metrics, covered by tests.
- The initial on-device database is not a substitute for encrypted storage of credentials. Do not place auth tokens or secrets in AsyncStorage. Health-related exports must be explicit user actions; no analytics/telemetry uploads without a deliberate privacy decision.
- Include import/export validation, versioning, backups and corruption recovery before production release.
- Cloud sync can be added after v1 using sync-capable records and stable IDs, without replacing the local source of truth.

### Initial domain entities

`exercise`, `exercise_variant`, `routine`, `routine_item`, `workout`, `workout_activity`, `workout_set`, `cardio_entry`, `food`, `recipe`, `recipe_ingredient`, `meal_entry`, `food_serving`, `hydration_entry`, `daily_targets`, `wellbeing_checkin`, `body_measurement`, `fitness_goal`, `user_preference`, and `schema_migration`. Normalize or split as implementation requires; this is a conceptual data inventory, not a finalized SQL schema.

## Fifteen implementation groups

| Group | Deliverable | Acceptance checkpoint |
| --- | --- | --- |
| **01 — Foundation** | Reproducible install, CI, unit tests, SDK dependency checks, basic Expo config, approved plan | `npm ci`, TypeScript, tests, Expo dependency check pass |
| **02 — UI system** | Five-tab architecture, compact components, typography, theme tokens, accessibility conventions | Consistent light/dark screens and keyboard/tap behavior |
| **03 — Data layer** | SQLite, migrations, repositories, AsyncStorage-to-SQLite migration, backup-safe initialization | Existing user workouts survive upgrade; migration/recovery tests |
| **04 — Exercise/activity library** | Strength, bodyweight, cardio catalog, categories, filtering, custom exercises | Exercises searchable and persist independently from session history |
| **05 — Workout engine** | Active session, sets/reps/load, notes, quick editing, persistence and restoration | Complete workout works offline and resumes after process restart |
| **06 — Routines and schedule** | Template builder, schedule, duplicate/repeat sessions, starter plans | Create and follow a repeatable weekly routine |
| **07 — Advanced training and cardio** | Rest timer, sets and supersets, cardio duration/distance, mobility/time based entries | Strength, cardio, and timed activity each have usable logs |
| **08 — History and training analytics** | Calendar, session details, volume charts, PRs, frequency and strength trends | Correct calculations across dates, units and edited histories |
| **09 — Body metrics and fitness goals** | Body measurements, goals, progress charts, adherence summaries | Entry and goal progress persist and display correctly |
| **10 — Nutrition logging** | Custom foods, common foods, recipes, meal diary, serving calculation | User can log a full day's food entirely offline |
| **11 — Nutrition and hydration insights** | Macro/calorie targets, totals, trends, meal categories, water tracking | Reconciled daily totals with reliable unit conversions |
| **12 — Wellbeing and recovery** | Optional sleep/energy/mood/soreness check-ins and trend review | Optional entries stay private and require no medical conclusions |
| **13 — Onboarding, settings, backup** | Goals/preferences onboarding, export/import, privacy controls and local data erase | New user onboards offline; portable backup round-trip verified |
| **14 — Quality and stabilization** | Integration tests, accessibility, performance, recovery, large-data, device matrix | No critical bugs; migration and primary flows proven on devices |
| **15 — App release** | App assets, EAS config/builds, privacy and policy review, store listings, internal testing | Installable signed Android/iOS builds and review-ready packages |

### Sequencing

- Groups 01–03 are prerequisites for expanding data models.
- Training functionality matures in 04–08.
- Groups 09–12 complete the agreed full-fitness scope.
- Groups 13–15 are mandatory for a public release rather than optional polish.
- Implement groups as reviewed, incremental commits directly to `main` (repository owner preference); every push must pass CI. Do not open PRs unless requested. Avoid speculative infrastructure.

## Group 1: Foundation

### Tasks
- [x] Finalize product scope, navigation and 15-group roadmap.
- [x] Pin the supported Node major for development and CI.
- [x] Add an npm lockfile generation process.
- [x] Replace dependency-installing CI with a reproducible `npm ci` validation pipeline.
- [x] Introduce tests for existing calculations and the exercise catalog.
- [x] Add an Expo SDK compatibility check to CI.
- [x] Explicitly target Android and iOS in Expo configuration.
- [x] Generate/commit `package-lock.json`.
- [x] Remove one-time lockfile bootstrapping workflow.
- [x] Verify Group 1 CI is green on `main`.

### Done means

`npm ci --no-audit --no-fund`, `npm run typecheck`, `npm run test` and `npm run check:expo` all succeed on the committed lockfile. No functionality regression to the initial training features. Device smoke testing continues in Group 14.

## Group 2: Design system and navigation

### Implementation
- [x] Replace four bottom tabs with Home, Train, Nutrition, Progress and Library.
- [x] Move Settings to a dedicated stack route, accessible through the screen headers.
- [x] Keep the existing workout editor and picker while rerouting completed sessions to Progress.
- [x] Add semantic light/dark palettes, compact spacing, radii and typography tokens.
- [x] Update shared panel, button, heading and metric components with consistent touch-target conventions.
- [x] Display existing training metrics and history using actual saved workout data.
- [x] Mark Nutrition as planned rather than presenting fabricated data.
- [ ] Test on physical Android and iOS devices, including large text, screen readers and keyboard behavior.

### Non-goals
This group does not implement nutrition storage, cardio tracking, routines or SQLite migrations. Those remain in their assigned groups.

### Quality gate
TypeScript, domain and design-token unit tests, Expo dependency checks, and GitHub Actions must pass. Emulator and device usability requires a separate smoke test and is **not** considered verified by CI alone.

## Group 3: SQLite Data Layer

### Implemented
- [x] Expo SQLite persistence adapter, versioned schema and indexed relational workout tables.
- [x] Transactional workout updates, deletions, snapshots and preferences.
- [x] Validated one-time AsyncStorage import; preserve original key and prevent reimport.
- [x] Serialized native SQLite writes with visible persistence errors.
- [x] Real SQLite integration tests for migration, rollback and recovery.
- [x] Verify final CI and Expo compatibility on `main`.
- [ ] Run Android/iOS on-device migration smoke tests.

Group 5 will harden active session persistence when the app backgrounds or is force-closed.

## Group 4: Exercise and Activity Library

### Implemented
- [x] Expand the catalog to strength, bodyweight, and cardio activities with stable built-in identifiers.
- [x] Add searchable activity categories, muscle groups and equipment filters.
- [x] Add schema migration v2 for custom exercise records.
- [x] Build create, edit and archive flows for local custom exercises.
- [x] Keep archived exercises resolvable in workout history.
- [x] Update the exercise picker and workout details to use custom definitions.
- [x] Prevent timed/distance activities from being represented as reps and weights.
- [x] Add catalog validation and SQLite integration tests.
- [ ] Verify CI and device-level interaction on Android and iOS.

### Deliberate scope boundary
The Group 4 catalog initially contained cardio as library-only. Group 7 subsequently introduced cardio and timed logging. Custom exercises are soft-archived rather than physically deleted, preserving referential meaning for historical workouts. Built-in IDs from Group 1 stay unchanged.

## Group 5: Workout Tracking Engine

### Implemented
- [x] Schema version 3 with session and exercise notes, preserving existing v2 workouts.
- [x] Previous completed-set references and copy with new, incomplete set IDs.
- [x] Individual set removal, quick add-set duplication, and notes fields.
- [x] Live persistence of valid numeric inputs and notes, with lightweight note-only SQL updates.
- [x] Restore unfinished sessions from SQLite on app restart.
- [x] Serialized writes, visible save status, full-snapshot repair and manual retry.
- [x] Wait for committed SQLite writes before navigating after start/finish.
- [x] Best-effort save flush when app backgrounds or becomes inactive.
- [x] Tests for history lookup, notes persistence, and migration.
- [x] Verify final Group 5 CI on main.
- [ ] Android/iOS keyboard, interruption and process-recovery testing.

**Limitations:** An abrupt process kill can interrupt an async save; the edit is durable only after the app confirms it. Group 14 completes broader crash-recovery and device testing.

## Group 6: Training Routines and Scheduling

### Implemented
- [x] SQLite migration version 4 for routine templates, exercise targets, and weekly weekday assignments.
- [x] Create and edit routines with ordered exercises, target sets/reps/weight and instructions.
- [x] Schedule one or more routines on any day of the weekly cycle (device-local Sunday–Saturday).
- [x] Duplicate routines with unique identifiers and without copying weekday assignments.
- [x] Delete routines without affecting completed or active workout history.
- [x] Import three optional starter programs, with no automatic onboarding data.
- [x] Start routines as fully independent saved workout sessions.
- [x] Add integration and domain tests for migrations, rollbacks, scheduling and session instantiation.
- [x] Verify CI on main.
- [ ] Smoke test routine creation, editing, scheduling and launching on Android/iOS devices.

**Group 6 scope at implementation:** Initial templates supported repetitions. Group 7 subsequently added cardio, timed and distance targets. Scheduling is recurring weekday guidance, not a notification service.

## Group 7: Advanced Training and Cardio

### Implemented
- [x] SQLite schema version 5 with backward-compatible timed/cardio set fields, set types, rest targets and superset groups.
- [x] Cardio and timed set entry with duration in seconds and distance in kilometres (stored as metres).
- [x] Strength set types: normal, warmup, drop, and failure.
- [x] Exercise-level rest targets, automatic wall-clock countdown, and manual stop/restart.
- [x] Superset grouping and unpairing using adjacent exercise links.
- [x] Advanced fields persist in active/completed workout history and survive app restart.
- [x] Extend routine targets and workout creation to support timed and distance activities.
- [x] Workout history cards and session summaries separate strength volume from cardio distance/time.
- [x] Add migration, integrity, and mixed-activity calculation tests.
- [x] Verify CI on main.
- [ ] Verify Android/iOS keyboard behavior, rest countdown on background/foreground, and native migration.

**Scope limitations:** Superset group labels do not automatically alternate or schedule sets; rest timers do not send notifications and are not durable across an app process kill. Future usability tests will address these cases.

## Group 8: Workout History and Training Analytics

### Implemented
- [x] Testable local aggregates derived strictly from completed workouts.
- [x] All-time totals for workouts, completed sets, strength volume, cardio distance and activity time.
- [x] Eight-week local Monday–Sunday trends with explicit zero-activity weeks.
- [x] Interactive native bar charts for frequency, volume and distance.
- [x] 30-day, 90-day and all-time workout-history filters with incremental disclosure.
- [x] Exercise-specific progression and individual session drilldown.
- [x] Best weight, most repetitions and estimated one-rep maximum for strength movements.
- [x] Cardio duration/distance records and archived custom exercise lookups.
- [x] Tests covering incomplete sessions, future dates, record ties and week boundaries.
- [x] Confirm CI on main.
- [ ] Android/iOS large-text, legibility and large-history performance verification.

### Metric definitions
Only completed sets from finished workouts count. Warmups count for volume but do not qualify for strength PRs. Estimated 1RM uses Epley's formula for 1–10 reps with positive external load. Cardio duration and distance are separate from lifting volume. Body metrics and goals are planned for Group 9.

## Group 9: Body Metrics and Goals

### Implemented
- [x] SQLite schema migration v6 for isolated body measurements and goal targets.
- [x] Body weight, waist, chest, hips, upper-arm and thigh tracking, with valid calendar dates and optional notes.
- [x] Create/update/delete readings and retain one unique record per metric per day.
- [x] Canonical kg/cm storage, conversions for kg/lb and cm/in display.
- [x] Measurement history and native bar-chart visualizations.
- [x] Goal creation, target editing and deletion for body weight and weekly workout frequency.
- [x] Direction-aware weight-goal progress and locally reset weekly workout counts.
- [x] Progress-tab summary and dedicated Body & Goals screen.
- [x] Validation and SQLite migration/integrity tests.
- [x] Verify final CI on main.
- [ ] Native Android/iOS keyboard, date entry, accessibility, and large-history smoke testing.

### Data boundaries
Body readings are self-reported, stored locally, and not interpreted as medical assessments. No BMI or normative ideal-body-weight calculations are made. Weekly targets use completed workouts in the current local Monday–Sunday period. Removing a goal never removes training or measurement records.

## Versioning

Keep the app prerelease until Group 15. Version `0.1.0` identifies the current development baseline; it is not a claim of production readiness. Publish v1.0.0 only after the complete fitness core and quality gates above are satisfied.
