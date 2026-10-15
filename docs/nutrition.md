# Nutrition diary and personal food library

All data is local to the mobile app's SQLite database. Users create foods using their own nutrition labels or reference values; no fictional or server-sourced foods are added.

## Food definition
- A food has a name, optional brand, serving size (grams), calories per serving, and stored protein, carbohydrate and fat values per serving.
- A serving represents exactly the grams recorded on the food definition, **not necessarily 100 grams**.
- A food's values should come from an appropriate food label or a source trusted by the user. Zero in an optional macro field may mean it has not been supplied.
- Foods can be edited or archived. Archived foods remain in local storage but are hidden from new meal selection.
- The food library is searchable by name/brand, and no account or remote service is needed.

## Meal diary
- Dated meal categories: breakfast, lunch, dinner, snacks.
- A meal references its original food ID but saves its own **name, brand, serving size, calories and macro snapshot** at time of entry.
- A serving quantity is a multiplier (for example, 1.5 servings), not a number of grams.
- Total calories equal the sum of servings times stored kcal per serving for the selected local date. Each category has its own total.
- Diary entries can have their serving quantity edited or can be deleted without modifying the underlying food.
- The diary supports historical dates up to today. Future dates are rejected.

## Data integrity
- Schema version 7 introduces `foods` and `meal_entries` with indexes and transactionally applied migrations.
- Inputs reject invalid dates, unsupported meal types, non-finite values, negative nutrients and out-of-range serving sizes or quantities.
- A failed write does not update food or diary lists in memory; a saved meal is durable only after its SQLite transaction resolves.
- Snapshot values are independent from future food edits or archival, including the already stored macronutrient fields.

## Deferred until Group 11
Calorie target setup, macro goal totals/targets, hydration intake and target-comparison dashboards. Group 10 records caloric intake only; it does not prescribe dietary goals or interpret a person's health.

## Group 11 — daily goals, macronutrients and water

- The daily nutrition section calculates protein, carbs and fat from each logged food snapshot multiplied by its serving quantity. Macro calorie percentages use 4/4/9 factors and are indicative rather than exact label calories.
- Personal energy, macro and water targets are optional. A blank field removes that target and no defaults are supplied.
- Progress bars are capped at 100%, with over-target quantities still shown as text. Recorded values are not adjusted to match a target.
- Dated water entries can be added, edited and removed. Water logging is distinct from the food diary and does not infer water from other drinks or meals.
- Last-seven-day summaries use local calendar dates. A day without logs is shown as zero logged intake and is not evidence of zero actual consumption.
- Changing targets never alters food, workout or water history.
- Android/iOS interactive behavior requires physical-device checks in the stabilization group.
