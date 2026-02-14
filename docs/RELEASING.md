# Release Process

This document describes how to create a new release for Pomodoroom.

## Quick Release (Automated)

After merging a version bump PR to main:

```bash
./scripts/create-release.sh
```

This script will:
1. Pull latest changes from main
2. Create an annotated git tag (e.g., `v1.2.2`)
3. Push the tag to GitHub
4. GitHub Actions will automatically build and publish the release

## Manual Release

### Option 1: Using Git Tags (Recommended)

1. **Update version** in these files:
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
   - Run `cargo update -p pomodoroom-desktop` to update `Cargo.lock`

2. **Commit and merge to main**:
   ```bash
   git add .
   git commit -m "chore: Bump version to X.Y.Z"
   git push origin your-branch
   # Create PR and merge to main
   ```

3. **Create and push tag**:
   ```bash
   git checkout main
   git pull origin main
   git tag -a vX.Y.Z -m "Release vX.Y.Z - Description"
   git push origin vX.Y.Z
   ```

4. **Monitor the release**:
   - Go to [Actions](https://github.com/rebuildup/pomodoroom/actions)
   - The "Release" workflow will start automatically
   - It builds packages for Linux (.deb, .rpm, .AppImage)
   - Release will be created as draft, then auto-published

### Option 2: Using Workflow Dispatch

1. Go to [Release Workflow](https://github.com/rebuildup/pomodoroom/actions/workflows/release.yml)
2. Click **"Run workflow"**
3. Select the branch to release from
4. Enter version number (e.g., `1.2.2` without the `v` prefix)
5. Click **"Run workflow"**

The workflow will:
- Create a tag `v{version}` automatically
- Build all release artifacts
- Create and publish the release

### Option 3: Using GitHub CLI

```bash
gh workflow run release.yml --ref main -f version=1.2.2
```

## Release Checklist

Before creating a release:

- [ ] All tests are passing
- [ ] Version numbers are updated in all files
- [ ] `Cargo.lock` is updated
- [ ] PR is reviewed and merged to main
- [ ] CHANGELOG or release notes are prepared

## Versioning

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0): Breaking changes
- **MINOR** (x.Y.0): New features, backwards compatible
- **PATCH** (x.y.Z): Bug fixes, backwards compatible

## Release Contents

Each release includes:

- **Linux packages**:
  - `.deb` (Debian/Ubuntu)
  - `.rpm` (Fedora/RedHat)
  - `.AppImage` (Universal Linux)
- **Source code** (zip, tar.gz)
- **Auto-updater JSON** for Tauri updater plugin

## Troubleshooting

### Tag already exists

```bash
# Delete local tag
git tag -d vX.Y.Z

# Delete remote tag
git push origin :refs/tags/vX.Y.Z

# Create new tag
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

### Workflow fails

1. Check [Actions](https://github.com/rebuildup/pomodoroom/actions)
2. Review workflow logs
3. Common issues:
   - Missing secrets (TAURI_SIGNING_PRIVATE_KEY, etc.)
   - Build dependencies not installed
   - Version mismatch between files

### Release not appearing

- Workflow creates a **draft** release first
- After successful build, it's auto-published
- Check [Releases page](https://github.com/rebuildup/pomodoroom/releases)

## Post-Release

After a successful release:

1. Verify artifacts are uploaded correctly
2. Test the auto-updater (if applicable)
3. Announce the release (Discord, Twitter, etc.)
4. Update documentation if needed
