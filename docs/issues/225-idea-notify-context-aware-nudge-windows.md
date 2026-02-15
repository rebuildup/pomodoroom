# Issue #225

- URL: https://github.com/rebuildup/pomodoroom/issues/225
- Branch: issue-225-idea-notify-context-aware-nudge-windows

## Implementation Plan
- [x] Read issue + related files
- [x] Add/adjust tests first
- [x] Implement minimal solution
- [x] Run checks
- [ ] Open PR with Closes #225

## Notes
- Added `src/utils/nudge-window-policy.ts` and tests (`src/utils/nudge-window-policy.test.ts`).
- Implemented nudge-safe window policy with configurable rules:
  - suppress during active focus,
  - defer duration,
  - safe-hour window.
- Added deferred nudge queue with safe replay (`enqueueDeferredNudge` / `dequeueReplayableNudge`).
- Added nudge metrics tracking and acceptance-rate calculation.
- Integrated policy at notification entrypoint in `src/hooks/useActionNotification.ts`:
  - evaluate show/defer,
  - auto-enqueue deferred nudges,
  - replay deferred nudges safely when possible.
- Integrated acceptance outcome tracking in `src/views/ActionNotificationView.tsx`.
- Exposed configurable policy + visible metrics in `src/views/SettingsView.tsx`.
