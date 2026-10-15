# Recovery and wellbeing

This screen provides an **offline, voluntary self-report journal**, not a diagnostic feature.

## Daily check-in

A check-in contains a local calendar date, optional slept hours stored as whole minutes, five optional 1–5 self-rating scales (sleep quality, energy, mood, soreness, stress) and optional notes. The label for each scale clarifies which direction is high. Any one rating, duration or note is sufficient; blank dates are never auto-filled.

Past and current dates can be selected. Only one check-in is saved per date, with editing preserving its ID. Entries can be deleted independently of exercise, body and food history. Data is stored only on the device in SQLite schema v9.

## Recovery trends and training context

The recovery view charts the last 14 local calendar days' saved sleep duration, leaving unlogged days blank. It computes average sleep, energy and soreness from available observations, not from missing days. A seven-day side-by-side overview shows duration and completed-workout count.

Workout counts, completed sets and strength volume use **finished** workouts and the date of their finish timestamp in device-local time. Correlations are not implied. The app provides neither a medical evaluation nor a prescriptive sleep duration, recovery score or automatic training recommendation.

## Validation and privacy

Check-in dates must exist on the calendar and be no later than today. Sleep duration must be within 1–1440 whole minutes if provided. Ratings must be integer 1–5; notes are limited to 500 characters. Each mutation is confirmed through an exclusive SQLite transaction before the UI considers it saved.

Missing ratings remain NULL and should never be treated as zero. No external server, wearable integration or notification service is involved. Android/iOS device and accessibility verification is scheduled for stabilization.
