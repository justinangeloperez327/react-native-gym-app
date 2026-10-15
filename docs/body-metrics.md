# Body measurements and goal calculations

Body readings and goal targets are stored entirely offline, as separate SQLite schema v6 tables. No records are automatically created.

## Measurement units and limits

- Body weight is stored in kilograms, shown in kilograms or pounds following Settings.
- Circumference measurements (waist, chest, hips, upper arm and thigh) are stored in centimetres; shown in centimetres with kg mode or inches with lb mode.
- Dates are local YYYY-MM-DD calendar dates. The entry form rejects invalid or future days.
- Measurement values must be finite, positive and within conservative data-integrity bounds; self-reported results are not assessed against medical or body-image targets.
- At most one reading per metric/day is stored; history editing preserves the record ID.
- Recent readings are displayed in a native, zero-baseline bar visualization, and older entries remain accessible in a paginated list.

## Goal methodology

### Body-weight goal
A goal saves the user's starting weight at its creation and a user-selected target in kilograms. Progress is `(current-start)/(target-start)` clamped from 0% to 100%; the direction naturally handles gain and loss. When start equals target the goal is already at 100%. A future-dated reading is not considered the current weight. Editing a target retains the original starting weight.

### Weekly workout target
The goal stores an integer target of 1–14 completed workouts per week. Progress counts workouts with valid finish timestamps in the current local calendar week, Monday to Sunday; in-progress sessions and future timestamps do not count. The count resets with the calendar week and is not stored.

Deleting a goal retains measurements and workouts. The goal system is a voluntary logging feature; it does not prescribe a weight or exercise frequency.

## Verification

Node SQLite integration tests cover schema upgrades, unique dates, update/delete, rollback, invalid values and goals. Pure unit tests cover kg/lb and cm/in conversions, date parsing, out-of-range values, direction-aware progress, future-dated readings and weekly boundaries. Native Android/iOS input and screen-reader tests remain outstanding.
