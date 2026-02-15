# Issue #222

- URL: https://github.com/rebuildup/pomodoroom/issues/222
- Branch: issue-222-idea-energy-build-low-energy-fallback-qu

## Implementation Plan
- [x] Read issue + related files
- [x] Add/adjust tests first
- [x] Implement minimal solution
- [x] Run checks
- [ ] Open PR with Closes #222

## Notes
- Added `src/utils/low-energy-fallback-queue.ts` and tests (`src/utils/low-energy-fallback-queue.test.ts`).
- Queue behavior:
  - Builds dynamic fallback queue from READY/PAUSED eligible tasks.
  - Non-empty whenever eligible tasks exist.
  - Includes one-click start action payload generation (`createLowEnergyStartAction`).
- Auto-suggestion trigger helper added (`shouldTriggerLowEnergySuggestion`) based on pressure/mismatch/capacity.
- Feedback loop added (`recordLowEnergyQueueFeedback`) and used to improve ranking quality over time.
- Integrated low-energy fallback suggestions into mismatch warning flow:
  - `src/views/ActionNotificationView.tsx`
  - `src/utils/window-task-operations.ts`
