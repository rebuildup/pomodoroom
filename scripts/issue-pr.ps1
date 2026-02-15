param(
  [Parameter(Mandatory = $false)]
  [int]$IssueNumber,
  [string]$Base = "main",
  [switch]$Draft
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI (gh) is required."
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($IssueNumber -le 0) {
  $m = [regex]::Match($branch, "^issue-(\d+)")
  if ($m.Success) {
    $IssueNumber = [int]$m.Groups[1].Value
  } else {
    throw "Issue number is required (or checkout issue-* branch)."
  }
}

$issueJson = gh issue view $IssueNumber --json number,title,url
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($issueJson)) {
  throw "Could not fetch issue #$IssueNumber"
}

if ($branch -eq $Base) {
  throw "Current branch '$branch' matches base '$Base'. Checkout an issue-* branch first."
}

$issueData = ($issueJson | ConvertFrom-Json)
$title = "[Impl] $($issueData.title)"
$body = @"
## Linked Issue
Closes #$($issueData.number)

## What Changed
- 

## Why
- 

## Test Evidence
- [ ] `pnpm run check`
- [ ] `cargo test -p pomodoroom-core`
- [ ] `cargo test -p pomodoroom-cli -- --test-threads=1`
- [ ] Manual test done

## Screenshots / Logs (if needed)

## Risks
- 
"@

$args = @("pr", "create", "--base", $Base, "--title", $title, "--body", $body)
if ($Draft) {
  $args += "--draft"
}

$prUrl = & gh @args
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

# Best-effort label sync.
gh issue edit $IssueNumber --add-label "status-in-review" --remove-label "status-backlog" --remove-label "status-ready" --remove-label "status-in-progress" *> $null

if (-not [string]::IsNullOrWhiteSpace($prUrl)) {
  Write-Host $prUrl
}
