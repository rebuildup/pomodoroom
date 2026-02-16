# Issue #270

- URL: https://github.com/rebuildup/pomodoroom/issues/270
- Branch: issue-270-treasure-cli-sync-real-sync

## Implementation Plan
- [x] Replace placeholder sync flow in CLI
- [x] Implement Google Tasks fetch + local upsert path
- [x] Add dry-run diff summary counts (create/update/unchanged)
- [x] Add unit tests for diff classification
- [ ] Open PR with Closes #270

## Notes
- `sync google` now fetches Google Task Lists/Tasks via OAuth token and computes diffs against local tasks keyed by `source_service=google_tasks` + `source_external_id`.
- `--dry-run` now runs actual fetch and prints concrete diff counts instead of `Would sync` placeholders.
- non-Google services now report authenticated push-only status explicitly instead of placeholder wording.
