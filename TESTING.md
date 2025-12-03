# Testing Auto-Detection Locally

This guide shows how to test the automatic version bump detection from conventional commits.

## Quick Start

### Test Auto-Detection
```bash
./test-auto-detect.sh @nx-project-release
```

This will:
1. Show current version
2. Display recent commits
3. Preview what bump would be applied
4. Show test scenarios and examples

### Simulate GitHub Actions Workflow
```bash
# Dry run with auto-detection (recommended)
./test-workflow-simulation.sh --dryRun

# Dry run with specific project
./test-workflow-simulation.sh --project @nx-project-release --dryRun

# Dry run with manual override
./test-workflow-simulation.sh --project @nx-project-release --releaseAs minor --dryRun

# Real run (makes actual changes)
./test-workflow-simulation.sh --project @nx-project-release
```

## Understanding Auto-Detection

### How It Works

The version executor analyzes conventional commits since the last git tag to determine:

1. **Patch bump (0.0.1 → 0.0.2)** - Bug fixes and minor changes
   - `fix(scope): description`
   - `perf(scope): description`
   - `docs(scope): description`
   - `style(scope): description`
   - `refactor(scope): description`
   - `test(scope): description`
   - `chore(scope): description`

2. **Minor bump (0.0.1 → 0.1.0)** - New features
   - `feat(scope): description`

3. **Major bump (0.0.1 → 1.0.0)** - Breaking changes
   - `feat(scope)!: description`
   - `fix(scope)!: description`
   - `BREAKING CHANGE:` in commit body

### Testing Scenarios

#### Scenario 1: Auto-Detection (Default)
```bash
# Preview what would happen
nx run @nx-project-release:version --preview

# Auto-detect and apply (dry run)
nx run @nx-project-release:version --dryRun

# Auto-detect and apply (real)
nx run @nx-project-release:version --gitCommit --gitTag
```

**Behavior:** Analyzes commits to determine bump type automatically.

#### Scenario 2: Manual Override
```bash
# Force specific bump type
nx run @nx-project-release:version --releaseAs=major --dryRun
nx run @nx-project-release:version --releaseAs=minor --dryRun
nx run @nx-project-release:version --releaseAs=patch --dryRun
```

**Behavior:** Ignores commit analysis, forces specified bump type.

#### Scenario 3: Batch Affected Projects
```bash
# Auto-detect for all affected (dry run)
nx affected -t version --base=main --dryRun

# Manual override for all affected
nx affected -t version --base=main --releaseAs=patch --dryRun
```

## Creating Test Commits

To test different bump types, create test commits:

```bash
# Create a feature branch
git checkout -b test/auto-detect

# Test patch bump
git commit --allow-empty -m "fix(test): resolve memory leak"
./test-auto-detect.sh @nx-project-release

# Test minor bump
git commit --allow-empty -m "feat(test): add new API endpoint"
./test-auto-detect.sh @nx-project-release

# Test major bump
git commit --allow-empty -m "feat(test)!: redesign authentication system

BREAKING CHANGE: Authentication now requires OAuth2 instead of API keys"
./test-auto-detect.sh @nx-project-release

# Clean up test branch
git checkout -
git branch -D test/auto-detect
```

## Workflow Simulation

The `test-workflow-simulation.sh` script simulates what happens in GitHub Actions:

### Test Cases

#### 1. Single Project - Auto-Detection
```bash
./test-workflow-simulation.sh \
  --project @nx-project-release \
  --dryRun
```

**Expected:** Analyzes commits, determines bump type, shows preview.

#### 2. Single Project - Manual Override
```bash
./test-workflow-simulation.sh \
  --project @nx-project-release \
  --releaseAs minor \
  --dryRun
```

**Expected:** Forces minor bump regardless of commits.

#### 3. Affected Projects - Auto-Detection
```bash
./test-workflow-simulation.sh --dryRun
```

**Expected:** Runs on all affected projects, each analyzed independently.

#### 4. Affected Projects - Manual Override
```bash
./test-workflow-simulation.sh \
  --releaseAs patch \
  --dryRun
```

**Expected:** Forces patch bump for all affected projects.

## Debugging

### Check Current Version
```bash
node -p "require('./packages/project-release/package.json').version"
```

### View Recent Commits
```bash
git log --oneline -10
```

### Check Last Tag
```bash
git describe --tags --abbrev=0
```

### View Commits Since Last Tag
```bash
LAST_TAG=$(git describe --tags --abbrev=0)
git log ${LAST_TAG}..HEAD --oneline
```

### Check Affected Projects
```bash
nx affected:projects --base=main
```

## Common Issues

### Issue: No version bump detected
**Cause:** No conventional commits found since last tag.

**Solution:**
1. Check commits: `git log --oneline`
2. Ensure commits follow format: `type(scope): description`
3. Valid types: feat, fix, docs, style, refactor, perf, test, chore

### Issue: Wrong bump type detected
**Cause:** Commits don't match expected format.

**Solution:**
1. Review commit messages
2. Use `--preview` to see what's detected
3. Use `--releaseAs` to override if needed

### Issue: "No changes detected"
**Cause:** No files changed since last release.

**Solution:** This is expected if no work has been done.

## Best Practices

1. **Always use `--preview` first** to see what will happen
2. **Use `--dryRun`** to test without making changes
3. **Commit messages matter** - follow conventional commits strictly
4. **Override sparingly** - let auto-detection work
5. **Test on feature branch** before running on main

## Examples

### Full Release Workflow Test
```bash
# 1. Preview
./test-auto-detect.sh @nx-project-release

# 2. Test version bump (dry run)
./test-workflow-simulation.sh --project @nx-project-release --dryRun

# 3. If looks good, run for real
nx run @nx-project-release:version --gitCommit --gitTag
nx run @nx-project-release:changelog
nx run @nx-project-release:publish
```

### Batch Release Test
```bash
# 1. Check affected projects
nx affected:projects --base=main

# 2. Test affected version bumps
./test-workflow-simulation.sh --dryRun

# 3. If looks good, run for real
nx affected -t version --base=main --gitCommit --gitTag
nx affected -t changelog --base=main
nx affected -t publish --base=main
```

## See Also

- [RELEASE_FLOW.md](./RELEASE_FLOW.md) - Complete release documentation
- [Conventional Commits](https://www.conventionalcommits.org/) - Commit message format
- [Semantic Versioning](https://semver.org/) - Version numbering rules
