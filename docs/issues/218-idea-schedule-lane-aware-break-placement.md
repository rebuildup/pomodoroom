# Issue #218

- URL: https://github.com/rebuildup/pomodoroom/issues/218
- Branch: issue-218-idea-schedule-lane-aware-break-placement

## Implementation Plan
- [ ] Read issue + related files
- [ ] Add/adjust tests first
- [ ] Implement minimal solution
- [ ] Run checks
- [ ] Open PR with Closes #218

## Notes

### Implemented

- Added lane-aware break placement in `AutoScheduler` with configurable policy:
  - `ParallelBreakPolicy::Shared` (default): single shared break block for active lanes.
  - `ParallelBreakPolicy::Isolated`: one break block per active lane.
- Extended scheduler output block model:
  - `ScheduledBlockType` (`focus` / `break`)
  - `lane` metadata for lane-aware rendering
- Updated frontend scheduler adapter (`useScheduler`) to consume backend `block_type` and `lane`.
- Added backend tests:
  - shared policy emits a single break block
  - isolated policy emits per-lane break blocks
  - parallel task uniqueness assertion now ignores break blocks

