# Issue #211

- URL: https://github.com/rebuildup/pomodoroom/issues/211
- Branch: issue-211-idea-split-parent-child-chain-for-auto-s

## Implementation Plan
- [ ] Read issue + related files
- [ ] Add/adjust tests first
- [ ] Implement minimal solution
- [ ] Run checks
- [ ] Open PR with Closes #211

## Notes

### Migration path (v8)

- Add nullable `tasks.parent_task_id` (TEXT) and `tasks.segment_order` (INTEGER).
- Add index `idx_tasks_parent_segment(parent_task_id, segment_order)` for ordered child lookup.
- Existing rows are backward-compatible (`NULL` values mean non-segmented standalone tasks).

