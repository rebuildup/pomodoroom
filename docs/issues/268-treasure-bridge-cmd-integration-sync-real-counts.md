# Issue #268

- URL: https://github.com/rebuildup/pomodoroom/issues/268
- Branch: issue-268-treasure-bridge-cmd-integration-sync-real-counts

## Implementation Plan
- [x] Locate placeholder `items_fetched = 0` in `cmd_integration_sync`
- [x] Implement real Google counts (calendar events + tasks)
- [x] Add task diff counters (create/update/unchanged) based on local DB snapshots
- [x] Return per-sync count fields in response payload
- [ ] Open PR with Closes #268

## Notes
- `google_calendar` sync now fetches real event count + Google Tasks list/tasks count.
- Google Tasks are upserted into local DB and diffed against existing `source_service=google_tasks` snapshots.
- Response now includes `items_fetched`, `items_created`, `items_updated`, `items_unchanged`.
- Non-Google services return explicit zero counts as current push-only behavior.
