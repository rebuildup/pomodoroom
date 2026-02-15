# Issue #223

- URL: https://github.com/rebuildup/pomodoroom/issues/223
- Branch: issue-223-idea-energy-auto-calibrate-pressure-thre

## Implementation Plan
- [x] Read issue + related files
- [x] Add/adjust tests first
- [x] Implement minimal solution
- [x] Run checks
- [ ] Open PR with Closes #223

## Notes
- Added `src/utils/pressure-threshold-calibration.ts` and tests (`src/utils/pressure-threshold-calibration.test.ts`).
- Calibration model now:
  - adjusts overload/critical thresholds from missed-deadline + interruption rates,
  - applies gradual step limits (max 5 per calibration),
  - stores auditable history entries with before/after and input.
- Added reset API to restore default thresholds and clear history.
- Integrated calibrated critical threshold into UI pressure mode logic in `src/hooks/usePressure.ts`.
- Exposed current calibrated values + history count + reset action in `src/views/SettingsView.tsx`.
