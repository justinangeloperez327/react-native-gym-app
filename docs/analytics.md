# Training history and analytics

All trends and personal records are calculated locally from completed workouts already saved in SQLite. This group does not create new database tables or synthetic exercise history.

## Eligibility and date handling

- A workout qualifies only with a valid completion timestamp.
- A set qualifies only when its completed flag is true.
- Strength volume equals the sum of kilograms multiplied by repetitions, including completed warmup sets.
- Distance and active exercise duration are separate measurements, stored as metres and seconds.
- Workouts are grouped by completion time, not workout start.
- Eight calendar-week buckets use device-local Monday–Sunday boundaries and include empty weeks. Day-number arithmetic avoids daylight-saving-time mistakes.
- History windows support 30 and 90 rolling days plus all time; future-dated completions are excluded from history filters and charts.

## Personal record definitions

- Strength: heaviest external working set and highest repetition count exclude warmups.
- Estimated one-rep max is calculated using Epley's formula for positive external load and sets of 1–10 reps. One rep uses the actual lifted load. This is an approximation, not a measured result.
- Cardio: maximum distance and duration come from individual completed sets, not combined session totals.
- A tied record keeps the earlier observation.
- Archived custom exercise history continues to resolve through stable exercise IDs.

## User interface

Progress includes all-time totals, an accessible selectable eight-week bar chart, date filtering and an exercise-history directory. Individual exercises show records, up to twelve plotted sessions and links to all historical sessions (incrementally revealed). No third-party chart library is required.

Remaining verification includes Android and iOS UI usability, large-text accessibility and performance on extensive workout databases. Body measurements and goals belong to Group 9.
