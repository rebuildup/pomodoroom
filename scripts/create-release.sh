#!/bin/bash
# Script to create release v1.2.2
# Run this script after merging the PR to main branch

set -e

VERSION="1.2.2"
TAG="v${VERSION}"

echo "🚀 Creating Release ${TAG}"
echo "================================"

# Ensure we're on main branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "⚠️  Warning: You're on branch '${CURRENT_BRANCH}', not 'main'"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin main

# Check if tag already exists
if git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "⚠️  Tag $TAG already exists"
    read -p "Delete and recreate? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git tag -d "$TAG"
        git push origin ":refs/tags/$TAG" 2>/dev/null || true
    else
        exit 1
    fi
fi

# Create annotated tag
echo "🏷️  Creating tag ${TAG}..."
git tag -a "$TAG" -m "Release ${TAG} - Bug fixes and improvements

What's Changed:
- Fixed database migration errors preventing app startup
- Fixed test failures in recurring task editor
- Corrected version mismatch in tauri.conf.json
- Improved migration logic with better error handling
- Enhanced backwards compatibility for database schema
- Added explicit column existence checks using SQLite pragmas"

# Push tag
echo "📤 Pushing tag to GitHub..."
git push origin "$TAG"

echo "✅ Tag pushed successfully!"
echo ""
echo "📦 GitHub Actions will now build the release."
echo "    Monitor at: https://github.com/rebuildup/pomodoroom/actions"
echo ""
echo "🔗 Release will be available at:"
echo "    https://github.com/rebuildup/pomodoroom/releases/tag/${TAG}"
