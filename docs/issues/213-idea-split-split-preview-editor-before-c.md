# Issue #213

- URL: https://github.com/rebuildup/pomodoroom/issues/213
- Branch: issue-213-idea-split-split-preview-editor-before-c

## Implementation Plan
- [ ] Read issue + related files
- [ ] Add/adjust tests first
- [ ] Implement minimal solution
- [ ] Run checks
- [ ] Open PR with Closes #213

## Notes

### Implemented

- Added `SplitPreviewEditor` modal for pre-commit split editing.
- Supports duration edits, title edits, and drag/drop or button-based reordering.
- Real-time validation:
  - total minutes must match target
  - no break at first/last position
  - no consecutive breaks
  - duration lower bounds
- `TaskCreateDialog` now supports "Split Preview" flow:
  - `Cancel` closes safely without creating tasks
  - `Apply` creates tasks exactly from edited preview items

