# Architectural Decisions

## 2026-04-15 - Persist manual task date overrides (Issue 19)
- Added `manual_start` and `manual_finish` as first-class fields in frontend task state and DB sync payloads.
- Scheduling engine now preserves these fields during recalculation and applies them as overrides for `calculated_start` and `calculated_finish`.
- Side panel date inputs now initialize from manual override values when present, preventing edited dates from reverting after save/reload.
- Edit Project modal task rows continue to expose editable Start/Finish date inputs (with calendar affordances), and those values are persisted when saving project drafts.
- This keeps manual date edits deterministic while preserving existing dependency/resource calculations for non-overridden tasks.
