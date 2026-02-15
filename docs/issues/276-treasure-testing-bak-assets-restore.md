# Issue #276

- URL: https://github.com/rebuildup/pomodoroom/issues/276
- Branch: issue-276-treasure-testing-bak-assets-restore

## Implementation Plan
- [x] Audit `*.bak` test assets under `src/hooks`
- [x] Restore tests against current hook APIs
- [x] Remove restored `*.bak` files
- [x] Run targeted tests for restored suites
- [ ] Run full checks and open PR with Closes #276

## Notes
- Restored and reconnected these suites:
  - `src/hooks/useGoogleCalendar.test.ts`
  - `src/hooks/useScheduler.test.tsx`
  - `src/hooks/useTaskStore.test.ts`
  - `src/hooks/useTaskOperations.test.ts`
- Removed corresponding backup files:
  - `src/hooks/useGoogleCalendar.test.ts.bak`
  - `src/hooks/useScheduler.test.tsx.bak`
  - `src/hooks/useTaskStore.test.ts.bak`
  - `src/hooks/useTaskOperations.test.ts.bak`
