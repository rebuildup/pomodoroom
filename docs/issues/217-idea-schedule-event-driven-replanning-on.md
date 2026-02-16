# Issue #217

- URL: https://github.com/rebuildup/pomodoroom/issues/217
- Branch: issue-217-idea-schedule-event-driven-replanning-on

## Implementation Plan
- [ ] Read issue + related files
- [ ] Add/adjust tests first
- [ ] Implement minimal solution
- [ ] Run checks
- [ ] Open PR with Closes #217

## Notes

### Implemented

- Added `event-driven-replan` utility module:
  - detect impacted window from calendar event delta
  - local-horizon merge (preserve/lock unaffected blocks)
  - diff generation for inspection before apply
  - churn metric outside impacted window
- Extended `useScheduler`:
  - `previewReplanOnCalendarUpdates(...)` to generate a replan preview
  - `applyReplanPreview(...)` to commit previewed schedule blocks
- Added tests validating:
  - impacted window detection with padding
  - minimal churn outside impacted window
  - diff generation for changed local horizon

