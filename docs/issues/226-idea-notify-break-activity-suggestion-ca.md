# Issue #226

- URL: https://github.com/rebuildup/pomodoroom/issues/226
- Branch: issue-226-idea-notify-break-activity-suggestion-ca

## Implementation Plan
- [x] Read issue + related files
- [x] Add/adjust tests first
- [x] Implement minimal solution
- [x] Run checks
- [ ] Open PR with Closes #226

## Notes
- Added `src/utils/break-activity-catalog.ts` with editable local catalog, suggestion ranking,
  pinning, feedback scoring, and rotation by context (break minutes + fatigue).
- Added `src/utils/break-activity-catalog.test.ts` for catalog editability, pin boost,
  non-repetition rotation, and feedback-based ranking.
- `ActionNotificationView` now renders break activity suggestion cards for break-context
  notifications and records selection feedback.
- `useTauriTimer` break completion notifications now include minute context in message so
  5/10/15/30 mapping can be applied.
- `SettingsView` now includes break activity catalog management (upsert/edit, pin, enable/disable).

