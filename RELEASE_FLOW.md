# Release and Publish Flow

Complete guide for releasing and publishing with nx-project-release.

## Table of Contents

1. [Quick Release Flow](#quick-release-flow)
2. [Detailed Step-by-Step](#detailed-step-by-step)
3. [CI/CD Automated Flow](#cicd-automated-flow)
4. [Release Strategies](#release-strategies)
5. [Troubleshooting](#troubleshooting)

---

## Quick Release Flow

### Single Project Release

```bash
# 1. Make changes and commit
git add .
git commit -m "feat(my-project): add new feature"

# 2. Version the project
nx run my-project:version --releaseAs=minor --gitCommit --gitTag

# 3. Generate changelog
nx run my-project:changelog

# 4. Publish
nx run my-project:publish

# 5. Push to remote
git push origin main --tags
```

### Streamlined Release

```bash
# Run version, changelog, and publish sequentially
nx run my-project:version --releaseAs=minor --gitCommit --gitTag
nx run my-project:changelog
nx run my-project:publish

# Push to remote
git push origin main --tags
```

### Batch Release (Multiple Projects)

```bash
# Release all affected projects - run each step for all affected projects
nx affected -t version --base=main --releaseAs=patch --gitCommit --gitTag
nx affected -t changelog --base=main
nx affected -t publish --base=main

# Push to remote
git push origin main --tags
```

---

## Detailed Step-by-Step

### Phase 1: Development

```bash
# 1. Create feature branch
git checkout -b feature/new-feature

# 2. Make changes
# ... edit files ...

# 3. Commit with conventional commits
git commit -m "feat(my-app): add user authentication"
git commit -m "fix(my-lib): resolve memory leak"
```

**Important:** Use conventional commit format:
- `feat(scope):` - New feature (minor bump)
- `fix(scope):` - Bug fix (patch bump)
- `BREAKING CHANGE:` or `feat!:` - Breaking change (major bump)
- Scope should match project name for project-specific changelogs

### Phase 2: Preview Changes

```bash
# Preview what would change
nx run my-project:version --preview

# Output shows:
# - Current version
# - New version
# - Files to be modified
# - Git operations (commit, tag, push)
# - Recent commits analyzed
```

### Phase 3: Version Bump

**Option A: Automatic (from commits)**
```bash
# Analyzes conventional commits to determine bump type
nx run my-project:version --gitCommit --gitTag
```

**Option B: Manual bump type**
```bash
# Explicitly specify bump type
nx run my-project:version --releaseAs=minor --gitCommit --gitTag
nx run my-project:version --releaseAs=major --gitCommit --gitTag
nx run my-project:version --releaseAs=patch --gitCommit --gitTag
```

**Option C: Explicit version**
```bash
# Set exact version
nx run my-project:version --version=2.0.0 --gitCommit --gitTag
```

### Phase 4: Generate Changelog

```bash
# Generate CHANGELOG.md from commits since last release
nx run my-project:changelog

# For workspace-level changelog
nx run my-project:changelog --workspaceChangelog
```

**Changelog Features:**
- Groups commits by type (Features, Bug Fixes, Breaking Changes)
- Filters by scope for project-specific changelogs
- Uses conventional commits format
- Links to commits and PRs

### Phase 5: Publish

**To NPM:**
```bash
nx run my-project:publish

# With specific tag
nx run my-project:publish --distTag=beta

# Dry run
nx run my-project:publish --dryRun
```

**To Nexus:**
```bash
nx run my-project:publish --registryType=nexus --registryUrl=https://nexus.company.com
```

**To S3:**
```bash
nx run my-project:publish --registryType=s3 --s3Bucket=my-releases --s3Region=us-east-1
```

### Phase 6: Push to Remote

```bash
# Push commits and tags
git push origin main --tags

# Create GitHub release (if using GitHub)
gh release create v1.0.0 --generate-notes
```

---

## CI/CD Automated Flow

### GitHub Actions - Affected Projects (Recommended)

This is the **recommended workflow** using `nx affected` for multi-project releases:

```yaml
# .github/workflows/release-affected.yml
name: Release Affected Projects

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      releaseAs:
        description: 'Release type'
        required: false
        type: choice
        options:
          - patch
          - minor
          - major
      dryRun:
        description: 'Dry run'
        required: false
        type: boolean
        default: false

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci

      - name: Configure Git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      # Step 1: Version bump for affected projects
      - name: Version affected projects
        run: |
          npx nx affected -t version \
            --base=origin/main~1 \
            --releaseAs=${{ github.event.inputs.releaseAs || 'patch' }} \
            ${{ github.event.inputs.dryRun == 'true' && '--dryRun' || '' }}

      # Step 2: Generate changelogs
      - name: Generate changelogs for affected projects
        run: |
          npx nx affected -t changelog \
            --base=origin/main~1

      # Step 3: Create ONE commit for all changes
      - name: Commit version bumps and changelogs
        run: |
          git add .
          git diff --staged --quiet || git commit -m "chore(release): version bumps and changelogs"

      # Step 4: Build affected projects
      - name: Build affected projects
        run: |
          npx nx affected -t build \
            --base=origin/main~1

      # Step 5: Create artifacts
      - name: Create artifacts for affected projects
        run: |
          npx nx affected -t artifact \
            --base=origin/main~1

      # Step 6: Create tags (skips if exists)
      - name: Create tags for affected projects
        run: |
          npx nx affected -t release \
            --base=origin/main~1 \
            ${{ github.event.inputs.dryRun == 'true' && '--dryRun' || '' }}

      # Step 7: Publish to registry
      - name: Publish affected projects
        run: |
          npx nx affected -t publish \
            --base=origin/main~1 \
            ${{ github.event.inputs.dryRun == 'true' && '--dryRun' || '' }}
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      # Step 8: Push commit and tags
      - name: Push commit and tags
        if: ${{ github.event.inputs.dryRun != 'true' }}
        run: |
          git push
          git push --tags
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      # Step 9: Create GitHub releases (optional)
      - name: Create GitHub releases
        if: ${{ github.event.inputs.dryRun != 'true' }}
        run: |
          npx nx affected -t release \
            --base=origin/main~1 \
            --createGitHubRelease --gitPush=false
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Key Points:**
- ✅ ONE commit for all version bumps/changelogs
- ✅ Uses `nx affected` to run targets on affected projects only
- ✅ Creates tags for each project (skips if already exists)
- ✅ Tags don't fail workflow if they already exist
- ✅ Pushes all changes and tags together at the end

### GitHub Actions - Manual Release

```yaml
# .github/workflows/release-manual.yml
name: Manual Release

on:
  workflow_dispatch:
    inputs:
      project:
        description: 'Project name'
        required: true
        type: string
      releaseAs:
        description: 'Release type'
        required: true
        type: choice
        options:
          - patch
          - minor
          - major
      createRelease:
        description: 'Create GitHub release'
        type: boolean
        default: true

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci

      - name: Configure Git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Version and changelog
        run: |
          PROJECT="${{ github.event.inputs.project }}"
          RELEASE_AS="${{ github.event.inputs.releaseAs }}"

          npx nx run ${PROJECT}:version --releaseAs=${RELEASE_AS} --gitCommit --gitTag
          npx nx run ${PROJECT}:changelog
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Publish
        run: |
          PROJECT="${{ github.event.inputs.project }}"
          npx nx run ${PROJECT}:publish
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Create GitHub release
        if: github.event.inputs.createRelease == 'true'
        run: |
          PROJECT="${{ github.event.inputs.project }}"
          npx nx run ${PROJECT}:release --createGitHubRelease --gitPush
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Generate Workflows

```bash
# Generate all workflows automatically
nx g nx-project-release:setup-workflows --workflowType=all
```

---

## Release Strategies

### 1. Independent Versioning

Each project has its own version, released independently.

**Configuration (nx.json):**
```json
{
  "projectRelease": {
    "projectsRelationship": "independent",
    "versionFiles": ["project.json"],
    "tagNaming": {
      "format": "{projectName}@{version}"
    }
  }
}
```

**Release:**
```bash
# Each project gets its own version and tag
nx run lib-a:version --releaseAs=minor  # lib-a@1.2.0
nx run lib-b:version --releaseAs=major  # lib-b@2.0.0
```

**Tags created:**
- `lib-a@1.2.0`
- `lib-b@2.0.0`

### 2. Fixed Versioning (Monolithic)

All projects share the same version, released together.

**Configuration (nx.json):**
```json
{
  "projectRelease": {
    "projectsRelationship": "fixed",
    "versionFiles": ["package.json"],
    "tagNaming": {
      "format": "v{version}"
    }
  }
}
```

**Release:**
```bash
# All projects get the same version
nx affected --target=version --base=main --version=2.0.0
```

**Tags created:**
- `v2.0.0`

### 3. Release Groups (Hybrid)

Group related projects with shared versioning strategy.

**Configuration (nx.json):**
```json
{
  "projectRelease": {
    "releaseGroups": {
      "backend-services": {
        "versionStrategy": "fixed",
        "tagNaming": {
          "format": "backend-v{version}"
        },
        "projects": ["api-gateway", "auth-service", "user-service"]
      },
      "frontend-apps": {
        "versionStrategy": "independent",
        "tagNaming": {
          "format": "{projectName}-v{version}"
        },
        "projects": ["admin-ui", "customer-portal"]
      }
    }
  }
}
```

**Release:**
```bash
# Backend services get fixed version
nx run api-gateway:version --releaseAs=minor  # backend-v1.2.0

# Frontend apps get independent versions
nx run admin-ui:version --releaseAs=patch     # admin-ui-v1.0.1
nx run customer-portal:version --releaseAs=major  # customer-portal-v2.0.0
```

### 4. Branch-Based Release

Create release branches for review before merging to main.

**Configuration (project.json):**
```json
{
  "targets": {
    "version": {
      "executor": "nx-project-release:version",
      "options": {
        "createReleaseBranch": true,
        "releaseBranchName": "release/v{version}",
        "createPR": true,
        "prTitle": "chore(release): {projectName} v{version}"
      }
    }
  }
}
```

**Release:**
```bash
# Creates release branch and PR
nx run my-project:version --releaseAs=minor
```

**Flow:**
1. Creates `release/v1.2.0` branch
2. Commits version changes
3. Pushes branch
4. Creates PR to main
5. Team reviews PR
6. Merge PR to main
7. Auto-publish workflow triggers on merge

---

## Common Workflows

### First Release

```bash
# Step 1: Set up workspace
nx g nx-project-release:init

# Step 2: Create first release
nx run my-project:version --version=1.0.0 --firstRelease --gitCommit --gitTag

# Step 3: Generate changelog
nx run my-project:changelog

# Step 4: Publish
nx run my-project:publish

# Step 5: Push
git push origin main --tags
```

### Prerelease (Beta/RC)

```bash
# Create prerelease version
nx run my-project:version --releaseAs=prerelease --preid=beta --gitCommit --gitTag

# Publish with beta tag
nx run my-project:publish --distTag=beta

# Examples:
# 1.0.0 -> 1.0.1-beta.0
# 1.0.1-beta.0 -> 1.0.1-beta.1
```

### Hotfix Release

```bash
# On main branch with critical bug fix
git checkout main
git pull

# Apply fix
git commit -m "fix(my-app): resolve critical security issue"

# Patch release immediately
nx run my-app:version --releaseAs=patch --gitCommit --gitTag
nx run my-app:changelog
nx run my-app:publish

# Push
git push origin main --tags
```

### Monorepo Release (All Affected)

```bash
# Feature branch merged to main, release all affected
git checkout main
git pull

# Release all affected projects
nx affected -t version --base=main~1 --releaseAs=patch --gitCommit --gitTag
nx affected -t changelog --base=main~1
nx affected -t publish --base=main~1

# Push
git push origin main --tags
```

---

## Troubleshooting

### Issue: "No commits found"

**Cause:** Commits don't have scopes matching project names.

**Solution:**
```bash
# Set up commitlint
nx g nx-project-release:setup-commitlint

# Use proper scopes in commits
git commit -m "feat(my-project): add feature"
```

### Issue: "Version file not found"

**Cause:** No version field in package.json or project.json.

**Solution:**
```json
// project.json
{
  "version": "1.0.0",
  "targets": { ... }
}
```

Or configure versionFiles:
```json
// nx.json
{
  "projectRelease": {
    "versionFiles": ["package.json"]
  }
}
```

### Issue: E2E apps being versioned

**Cause:** E2E apps included in release process.

**Solution:**
```json
// nx.json
{
  "projectRelease": {
    "excludedProjects": ["my-app-e2e", "another-app-e2e"]
  }
}
```

### Issue: Git operations fail in CI

**Cause:** Git not configured in CI environment.

**Solution:**
```yaml
- name: Configure Git
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
```

### Issue: NPM publish fails with 403

**Cause:** Missing or invalid NPM_TOKEN.

**Solution:**
1. Generate token on npmjs.com
2. Add to repository secrets as `NPM_TOKEN`
3. Configure in workflow:
```yaml
env:
  NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## Best Practices

### 1. Use Conventional Commits

Always use conventional commit format:
```bash
✅ git commit -m "feat(my-app): add user login"
✅ git commit -m "fix(my-lib): resolve memory leak"
❌ git commit -m "fixed bug"
```

### 2. Scope Matches Project Names

```bash
✅ git commit -m "feat(analytics-platform): add dashboard"
❌ git commit -m "feat(analytics): add dashboard"  # Wrong scope
```

### 3. Preview Before Release

```bash
# Always preview first
nx run my-project:version --preview

# Then execute
nx run my-project:version --releaseAs=minor --gitCommit --gitTag
```

### 4. Test in CI Before Main

Use release branches:
```bash
nx run my-project:version --createReleaseBranch --createPR
```

### 5. Use Dry Run for Testing

```bash
nx run my-project:publish --dryRun
```

### 6. Tag Naming Consistency

Configure tag naming for your workflow:
```json
{
  "projectRelease": {
    "tagNaming": {
      "format": "{projectName}@{version}"
    }
  }
}
```

---

## Examples

### Example 1: npm Library Release

```bash
# 1. Make changes
git commit -m "feat(my-lib): add helper functions"

# 2. Preview
nx run my-lib:version --preview

# 3. Version and tag
nx run my-lib:version --releaseAs=minor --gitCommit --gitTag

# 4. Generate changelog
nx run my-lib:changelog

# 5. Publish
nx run my-lib:publish

# 6. Push
git push origin main --tags
```

### Example 2: Docker App Release

```json
// nx.json
{
  "projectRelease": {
    "releaseGroups": {
      "docker-apps": {
        "registryType": "docker",
        "versionFiles": ["project.json"],
        "projects": ["api", "web"]
      }
    }
  }
}
```

```bash
nx run api:version --releaseAs=minor --gitCommit --gitTag
```

### Example 3: Batch Monorepo Release

```bash
# All affected since last deployment
nx affected -t version \
  --base=origin/production \
  --head=HEAD \
  --releaseAs=patch \
  --gitCommit --gitTag

nx affected -t changelog \
  --base=origin/production \
  --head=HEAD

nx affected -t publish \
  --base=origin/production \
  --head=HEAD

git push origin main --tags
```

---

## Summary

**Quick Commands:**
```bash
# Preview
nx run PROJECT:version --preview

# Version only
nx run PROJECT:version --releaseAs=TYPE --gitCommit --gitTag

# Full release (all steps)
nx run PROJECT:version --releaseAs=TYPE --gitCommit --gitTag
nx run PROJECT:changelog
nx run PROJECT:publish

# Batch release
nx affected -t version --base=main --releaseAs=TYPE --gitCommit --gitTag
nx affected -t changelog --base=main
nx affected -t publish --base=main
```

**Setup Workflows:**
```bash
nx g nx-project-release:setup-workflows --workflowType=all
```

**Key Flags:**
- `--releaseAs` - patch/minor/major
- `--version` - explicit version
- `--gitCommit` - create commit
- `--gitTag` - create tag
- `--gitPush` - push to remote
- `--githubRelease` - create GitHub release
- `--dryRun` - test without changes
- `--preview` - detailed preview
