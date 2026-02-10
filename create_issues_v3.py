#!/usr/bin/env python3
"""Create GitHub issues from Pomodoroom v2 redesign spec.

Usage:
  python create_issues_v3.py              # Create all issues
  python create_issues_v3.py --dry-run    # Preview without creating
  python create_issues_v3.py --phase 0    # Create only Phase 0 issues
"""
import json
import subprocess
import sys
import time

ISSUES_FILE = "issues_v2.json"

def create_issues(dry_run=False, phase_filter=None):
    with open(ISSUES_FILE, "r", encoding="utf-8") as f:
        issues = json.load(f)

    if phase_filter is not None:
        phase_tag = f"phase-{phase_filter}"
        issues = [i for i in issues if phase_tag in i.get("labels", [])]

    print(f"{'[DRY RUN] ' if dry_run else ''}Creating {len(issues)} issues...\n")

    for idx, issue in enumerate(issues, 1):
        title = issue["title"]
        body = issue["body"]
        labels = issue.get("labels", [])

        print(f"[{idx}/{len(issues)}] {title}")

        if dry_run:
            print(f"  Labels: {', '.join(labels)}")
            print(f"  Body length: {len(body)} chars")
            print()
            continue

        cmd = ["gh", "issue", "create", "--title", title, "--body", body]
        for label in labels:
            cmd.extend(["--label", label])

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8"
        )

        if result.returncode == 0:
            url = result.stdout.strip()
            print(f"  ✓ Created: {url}")
        else:
            # Labels might not exist yet, retry without labels
            if "label" in result.stderr.lower():
                cmd_no_labels = ["gh", "issue", "create", "--title", title, "--body", body]
                result2 = subprocess.run(
                    cmd_no_labels,
                    capture_output=True,
                    text=True,
                    encoding="utf-8"
                )
                if result2.returncode == 0:
                    url = result2.stdout.strip()
                    print(f"  ✓ Created (without labels): {url}")
                else:
                    print(f"  ✗ Failed: {result2.stderr.strip()}")
            else:
                print(f"  ✗ Failed: {result.stderr.strip()}")

        print()
        time.sleep(1)  # Rate limit

    print("Done!")

if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    phase_filter = None

    if "--phase" in sys.argv:
        idx = sys.argv.index("--phase")
        if idx + 1 < len(sys.argv):
            phase_filter = sys.argv[idx + 1]

    create_issues(dry_run=dry_run, phase_filter=phase_filter)
