# Issue #224

- URL: https://github.com/rebuildup/pomodoroom/issues/224
- Branch: issue-224-idea-energy-cognitive-load-estimator-fro

## Implementation Plan
- [x] Read issue + related files
- [x] Add/adjust tests first
- [x] Implement minimal solution
- [x] Run checks
- [ ] Open PR with Closes #224

## Notes
- Added `src/utils/cognitive-load-estimator.ts` and tests (`src/utils/cognitive-load-estimator.test.ts`).
- Implemented weighted cognitive-load index using:
  - context switch rate,
  - task/project heterogeneity,
  - interruption rate.
- Added daily stats helper with spike detection and adaptive break recommendation.
- Wired estimator into scheduler-facing flow:
  - `src/utils/auto-schedule-time.ts` now consumes cognitive load signal when recommending breaks.
  - break tasks include cognitive signal tags (`cognitive-signal-*`, `cognitive-load-spike`).
- Exposed index in daily stats UI:
  - `src/views/StatsView.tsx` shows Cognitive Load and Recommended Break cards.
- Added regression test to verify break recommendation increases on context-switch spikes.
