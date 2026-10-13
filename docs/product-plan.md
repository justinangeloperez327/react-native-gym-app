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
- Group 1 uses the existing AsyncStorage data provider as-is. **Group 3** migrates to `expo-sqlite` with transactions, versioned migrations, a domain repository layer, indexes and integrity checks.
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
- Each group should be a focused PR with code, tests, concise documentation and a checked CI run. Avoid adding speculative infrastructure.

## Group 1: Foundation

### Tasks
- [x] Finalize product scope, navigation and 15-group roadmap.
- [x] Pin the supported Node major for development and CI.
- [x] Add an npm lockfile generation process.
- [x] Replace dependency-installing CI with a reproducible `npm ci` validation pipeline.
- [x] Introduce tests for existing calculations and the exercise catalog.
- [x] Add an Expo SDK compatibility check to CI.
- [x] Explicitly target Android and iOS in Expo configuration.
- [ ] Generate/commit `package-lock.json`.
- [ ] Remove one-time lockfile bootstrapping workflow.
- [ ] Verify final PR CI is green.

### Done means

`npm ci --no-audit --no-fund`, `npm run typecheck`, `npm run test` and `npm run check:expo` all succeed on the committed lockfile. No functionality regression to Home, Exercises, History, Settings or active workout. Device smoke testing follows in Group 2 and expands in Group 14.

## Versioning

Keep the app prerelease until Group 15. Version `0.1.0` identifies the current development baseline; it is not a claim of production readiness. Publish v1.0.0 only after the complete fitness core and quality gates above are satisfied.
