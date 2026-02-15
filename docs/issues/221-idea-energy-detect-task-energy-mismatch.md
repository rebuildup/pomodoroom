# Issue #221

- URL: https://github.com/rebuildup/pomodoroom/issues/221
- Branch: issue-221-idea-energy-detect-task-energy-mismatch

## Implementation Plan
- [x] Read issue + related files
- [x] Add/adjust tests first
- [x] Implement minimal solution
- [x] Run checks
- [ ] Open PR with Closes #221

## Notes
- Added `src/utils/task-energy-mismatch.ts` and tests (`src/utils/task-energy-mismatch.test.ts`).
- Mismatch score now combines:
  - task energy demand,
  - estimated pressure,
  - time-of-day,
  - duration penalty.
- Warnings only trigger when score >= threshold (default 60).
- Added ranked alternatives with actionable flag and reason.
- Added localStorage-based accept/reject tracking for mismatch suggestions:
  - key: `energy_mismatch_feedback_stats`
  - exposes false-positive proxy rate (`rejected/total`).
- Integrated pre-start mismatch warning into:
  - `src/views/ActionNotificationView.tsx` (`start_task` flow)
  - `src/utils/window-task-operations.ts` (direct start ops)
- Added bypass/decision fields to start action payload:
  - `ignoreEnergyMismatch`
  - `mismatchDecision` (`accepted` / `rejected`)
