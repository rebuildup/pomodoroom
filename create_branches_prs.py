#!/usr/bin/env python3
"""Create branches and draft PRs for each v2 issue.

Each branch gets an empty initial commit so a draft PR can be opened.
The claude-code agent checks out the branch, works, and pushes.

Usage:
  python create_branches_prs.py
  python create_branches_prs.py --dry-run
"""
import json
import subprocess
import sys
import time

ISSUES_FILE = "issues_v2.json"
BASE_BRANCH = "main"

# Map each issue to a branch name and the GitHub issue number
# Issue numbers start at 121 based on the creation output
ISSUE_START_NUMBER = 121

BRANCH_MAP = [
    "feature/phase0-1-use-task-store",
    "feature/phase0-2-shellview-real-data",
    "feature/phase0-3-timer-task-bridge",
    "feature/phase1-1-nowhub-anchor-controls",
    "feature/phase1-2-ambient-task-list",
    "feature/phase1-3-next-candidates-real-data",
    "feature/phase1-4-pressure-model",
    "feature/phase1-5-timer-layout",
    "feature/phase2-1-taskboard-two-columns",
    "feature/phase2-2-taskcard-all-actions",
    "feature/phase2-3-task-create-dialog",
    "feature/phase2-4-task-detail-drawer",
    "feature/phase3-1-schedule-timeline",
    "feature/phase3-2-google-calendar",
    "feature/phase4-1-stats-dashboard",
    "feature/phase5-1-settings-view",
    "feature/phase5-2-anchor-floating",
    "feature/phase5-3-final-integration",
]


def run(cmd, check=True):
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if check and result.returncode != 0:
        print(f"  ERROR: {result.stderr.strip()}")
    return result


def main():
    dry_run = "--dry-run" in sys.argv

    with open(ISSUES_FILE, "r", encoding="utf-8") as f:
        issues = json.load(f)

    assert len(issues) == len(BRANCH_MAP), f"Mismatch: {len(issues)} issues vs {len(BRANCH_MAP)} branches"

    print(f"{'[DRY RUN] ' if dry_run else ''}Creating {len(issues)} branches + draft PRs...\n")

    for idx, (issue, branch) in enumerate(zip(issues, BRANCH_MAP)):
        issue_num = ISSUE_START_NUMBER + idx
        title = issue["title"]
        labels = issue.get("labels", [])

        print(f"[{idx+1}/{len(issues)}] #{issue_num} {title}")
        print(f"  Branch: {branch}")

        if dry_run:
            print()
            continue

        # Create branch from main
        run(["git", "checkout", BASE_BRANCH], check=True)
        run(["git", "branch", "-D", branch], check=False)  # delete if exists
        run(["git", "checkout", "-b", branch], check=True)

        # Create an empty initial commit
        run(["git", "commit", "--allow-empty", "-m", f"chore: init branch for #{issue_num} - {title}"], check=True)

        # Push branch
        result = run(["git", "push", "-u", "origin", branch], check=True)
        if result.returncode != 0:
            print(f"  SKIP PR (push failed)")
            print()
            continue

        # Create draft PR
        pr_body = f"Closes #{issue_num}\n\n---\n\n{issue['body']}"
        pr_cmd = [
            "gh", "pr", "create",
            "--base", BASE_BRANCH,
            "--head", branch,
            "--title", title,
            "--body", pr_body,
            "--draft",
        ]
        for label in labels:
            pr_cmd.extend(["--label", label])

        result = run(pr_cmd, check=True)
        if result.returncode == 0:
            pr_url = result.stdout.strip()
            print(f"  ✓ PR: {pr_url}")
        else:
            # Retry without labels
            pr_cmd_no_labels = [
                "gh", "pr", "create",
                "--base", BASE_BRANCH,
                "--head", branch,
                "--title", title,
                "--body", pr_body,
                "--draft",
            ]
            result2 = run(pr_cmd_no_labels, check=False)
            if result2.returncode == 0:
                print(f"  ✓ PR (no labels): {result2.stdout.strip()}")
            else:
                print(f"  ✗ PR failed: {result2.stderr.strip()}")

        print()
        time.sleep(1)

    # Return to main
    run(["git", "checkout", BASE_BRANCH])
    print("Done! Returned to main branch.")


if __name__ == "__main__":
    main()
