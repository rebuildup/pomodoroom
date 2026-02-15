param(
  [Parameter(Mandatory = $true)]
  [int]$IssueNumber,
  [switch]$NoCheckout,
  [switch]$AssignMe,
  [string]$BranchSuffix
)

$ErrorActionPreference = "Stop"

function Slugify([string]$Text) {
  $slug = $Text.ToLowerInvariant()
  $slug = [regex]::Replace($slug, "[^a-z0-9]+", "-")
  $slug = $slug.Trim("-")
  if ($slug.Length -gt 40) {
    $slug = $slug.Substring(0, 40).Trim("-")
  }
  if ([string]::IsNullOrWhiteSpace($slug)) {
    return "task"
  }
  return $slug
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI (gh) is required."
}

$issueJson = gh issue view $IssueNumber --json number,title,url,labels
if (-not $issueJson) {
  throw "Could not fetch issue #$IssueNumber"
}

$issueData = $issueJson | ConvertFrom-Json
$slug = Slugify $issueData.title
$branch = "issue-$($issueData.number)-$slug"
if (-not [string]::IsNullOrWhiteSpace($BranchSuffix)) {
  $suffix = $BranchSuffix.ToLowerInvariant()
  $suffix = [regex]::Replace($suffix, "[^a-z0-9-]+", "-")
  $suffix = $suffix.Trim("-")
  if ($suffix.Length -gt 24) {
    $suffix = $suffix.Substring(0, 24).Trim("-")
  }
  if (-not [string]::IsNullOrWhiteSpace($suffix)) {
    $branch = "$branch-$suffix"
  }
}

if (-not $NoCheckout) {
  $exists = git show-ref --verify --quiet "refs/heads/$branch"; $existsCode = $LASTEXITCODE
  if ($existsCode -eq 0) {
    git checkout $branch | Out-Null
  } else {
    git checkout -b $branch | Out-Null
  }
}

New-Item -ItemType Directory -Force "docs/issues" | Out-Null
$notePath = "docs/issues/$($issueData.number)-$slug.md"

if (-not (Test-Path $notePath)) {
@"
# Issue #$($issueData.number)

- URL: $($issueData.url)
- Branch: $branch

## Implementation Plan
- [ ] Read issue + related files
- [ ] Add/adjust tests first
- [ ] Implement minimal solution
- [ ] Run checks
- [ ] Open PR with Closes #$($issueData.number)

## Notes

"@ | Set-Content -Encoding utf8 $notePath
}

Write-Host "Issue: #$($issueData.number) $($issueData.title)"
Write-Host "Branch: $branch"
Write-Host "Notes:  $notePath"
Write-Host "Next:   code changes -> pnpm run check -> cargo test -p pomodoroom-core -> gh pr create"

# Best-effort workflow updates (do not fail local start).
gh issue edit $IssueNumber --add-label "status-in-progress" --remove-label "status-backlog" --remove-label "status-ready" --remove-label "status-in-review" *> $null
if ($AssignMe) {
  gh issue edit $IssueNumber --add-assignee "@me" *> $null
}
