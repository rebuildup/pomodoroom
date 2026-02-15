# Issue-Driven Delivery Playbook

This project can be executed efficiently from GitHub Issues using a small fixed loop.

## 1. Start from an issue

One-path autopilot (recommended):

```powershell
pnpm run autopilot -- ops/autopilot/start-next.json
```

Alternative presets:
- `ops/autopilot/full-next-draft-pr.json` (start + checks + PR + wait checks + merge)
- `ops/autopilot/from-issue-note.json` (set `issuePath` and parse issue number from file name like `305-...md`)

If you are using this through an agent chat, you can just send one file path, e.g.:
- `ops/autopilot/start-next.json`
- `ops/autopilot/full-next-draft-pr.json` (end-to-end: start to merge)

```powershell
pnpm run issue:start -- 265
```

What it does:
- Fetches issue metadata via `gh`
- Creates/checks out branch `issue-<number>-<slug>`
- Creates note file: `docs/issues/<number>-<slug>.md`
- Marks issue as `status-in-progress` (best effort)

Pick next issue automatically:

```powershell
pnpm run issue:next
pnpm run issue:next -- --start --assign-me
```

## 2. Implement in small slices

Recommended loop:
1. Add or update tests first
2. Implement minimal code
3. Run checks

```powershell
pnpm run check
cargo test -p pomodoroom-core
cargo test -p pomodoroom-cli -- --test-threads=1
```

## 3. Create PR linked to issue

```powershell
pnpm run issue:pr -- --draft
```

or

```powershell
pnpm run issue:pr -- 265 --draft
```

PR template includes `Closes #<issue>` and test checklist.
On success, script updates issue label to `status-in-review` (best effort).

## 4. Guardrails in CI

`PR Guardrails` workflow enforces:
- PR must include an issue-closing keyword (`Closes #123` etc.)
- Warns if branch is not `issue-*`
- Warns if `Test Evidence` section is missing

`Issue Status Sync` workflow updates issue status labels:
- Issue opened/reopened: `status-backlog`
- PR opened/reopened with `Closes #...`: `status-in-review`
- PR merged: `status-done`
- PR closed without merge: `status-in-progress`

## 5. Merge Safety Policy (Required)

When using `ops/autopilot/full-next-draft-pr.json`, merge is allowed only if all of the following are true:
- Local checks passed:
  - `pnpm run check`
  - `cargo test -p pomodoroom-core`
  - `cargo test -p pomodoroom-cli -- --test-threads=1`
- GitHub PR checks are all completed and clean (`SUCCESS`, `SKIPPED`, or `NEUTRAL` only)
- `StatusContext` checks are `SUCCESS`
- PR is open and mergeable (`mergeable != CONFLICTING`, `mergeStateStatus` clean)

If any condition fails or is pending, autopilot aborts without merging.

## 6. Recommended labels for execution

Use these labels to drive prioritization:
- `priority-high` / `priority-medium` / `priority-low`
- feature labels (e.g. `feature-integration-expansion`, `feature-mobile`)
- status labels (`status-*`) and size labels (`size-*`)

Bootstrap labels if missing:

```powershell
pnpm run issue:labels
```

Normalize conflicting priority labels:

```powershell
pnpm run issue:normalize-priority
```

## 7. Practical queue policy

- Keep max 1 in-progress issue per person
- Split issue when acceptance criteria exceeds one PR
- Add explicit `Out of Scope` to prevent drift

## Notes

- This setup is backend/tooling agnostic and works for frontend + Rust changes.
- The issue template standardizes acceptance criteria and test plan quality.
