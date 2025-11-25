# nx-project-release

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

[![npm version](https://badge.fury.io/js/nx-project-release.svg)](https://www.npmjs.com/package/nx-project-release)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

![Coverage Lines](./coverage/packages/project-release/badge-lines.svg)
![Coverage Statements](./coverage/packages/project-release/badge-statements.svg)
![Coverage Functions](./coverage/packages/project-release/badge-functions.svg)
![Coverage Branches](./coverage/packages/project-release/badge-branches.svg)

A polyglot Nx plugin for automated semantic versioning, changelog generation, and publishing for any project type in your monorepo.

## ✨ Features

- **🚀 Polyglot Support** - Works with any project type (Node.js, Python, Go, Rust, Java, etc.)
- **📦 Multiple Registries** - NPM, Nexus (Sonatype), AWS S3, GitHub Packages
- **🔄 Batch Releases** - Release multiple projects in one PR with `nx affected`
- **📝 Auto Changelogs** - Generate from conventional commits
- **🔖 Semantic Versioning** - Automatic or manual version bumps (major/minor/patch/prerelease)
- **🎯 Smart Detection** - Only releases affected projects
- **🔐 CI/CD Safety** - CI-only mode prevents accidental local releases
- **🌿 Release Branches** - Automatic PR creation for review workflow
- **🔗 Dependency Tracking** - Auto-version dependent projects
- **🎨 Flexible Config** - Project.json, package.json, or custom files

## 🚀 Quick Start

### Installation

```bash
# Install and run interactive setup
nx add nx-project-release

# Or install manually
npm install --save-dev nx-project-release
nx g nx-project-release:init
```

The init generator will guide you through:
- ✅ Executor setup (individual or all-in-one)
- ✅ Version detection strategy (git tags, files, or registry)
- ✅ Git operations (commit, tag, CI-only mode)
- ✅ Changelog configuration
- ✅ Publishing setup (registry type, dist tags)
- ✅ Git hooks and GitHub workflows

### First Release

```bash
# Preview what would happen
nx run my-project:version --preview

# Create first release
nx run my-project:version --version=1.0.0 --gitCommit --gitTag --firstRelease
nx run my-project:changelog
nx run my-project:publish
```

### Subsequent Releases

```bash
# Automatic version bump from conventional commits
nx run my-project:version --gitCommit --gitTag

# Or specify bump type
nx run my-project:version --releaseAs=minor --gitCommit --gitTag

# Complete workflow (version + changelog + publish)
nx run my-project:project-release --gitCommit --gitTag
```

## 📋 Core Executors

### version
Bumps project version based on conventional commits or explicit input.

```bash
# Automatic version bump
nx run my-project:version

# Specific version
nx run my-project:version --version=2.0.0

# Bump type
nx run my-project:version --releaseAs=minor

# Prerelease
nx run my-project:version --releaseAs=prerelease --preid=beta

# With git operations
nx run my-project:version --gitCommit --gitTag

# Preview changes
nx run my-project:version --preview
```

**Key options:**
- `--version` - Explicit version (e.g., `1.2.3`)
- `--releaseAs` - Bump type: `major | minor | patch | prerelease`
- `--preid` - Prerelease identifier: `alpha | beta | rc`
- `--firstRelease` - First release mode (fallback to git/registry)
- `--gitCommit` - Create git commit
- `--gitTag` - Create git tag
- `--ciOnly` - Only allow git operations in CI (default: `true`)
- `--preview` - Display detailed analysis without making changes
- `--dryRun` - Preview changes without execution

### changelog
Generates changelog from conventional commits.

```bash
# Project changelog
nx run my-project:changelog

# Interactive editing
nx run my-project:changelog --interactive

# Custom preset
nx run my-project:changelog --preset=conventionalcommits
```

### publish
Publishes built artifacts to configured registry.

```bash
# Publish to npm
nx run my-project:publish --registryType=npm

# Publish to Nexus
nx run my-project:publish --registryType=nexus

# Publish to S3
nx run my-project:publish --registryType=s3
```

### project-release
All-in-one executor that runs version + changelog + publish.

```bash
# Complete release workflow
nx run my-project:project-release --gitCommit --gitTag
```

## 🔐 CI/CD Safety

By default, git operations (commit/tag/push/GitHub releases) are restricted to CI environments to prevent accidental local releases.

```bash
# Default behavior (CI-only)
nx run my-project:version --gitCommit --gitTag
# ❌ Fails locally (unless in CI)

# Allow local testing
nx run my-project:version --gitCommit --gitTag --ciOnly=false
```

The `ciOnly` flag checks for CI environment variables:
- `CI=true`
- `GITHUB_ACTIONS=true`
- `GITLAB_CI=true`
- `CIRCLECI=true`
- etc.

**Configure in init:**
```
? Enforce CI-only releases (prevent accidental local releases)? (Y/n)
```

## 📦 Multi-Registry Publishing

### NPM Registry

```bash
nx run my-project:publish --registryType=npm --access=public
```

**Environment variables:**
- `NPM_TOKEN` - Authentication token

### Nexus Repository (Sonatype)

Upload artifacts to Nexus raw repositories:

```bash
nx run my-project:publish --registryType=nexus --pathStrategy=version
```

**Environment variables:**
- `NEXUS_URL` - Server URL (e.g., `https://nexus.example.com`)
- `NEXUS_REPOSITORY` - Repository name (e.g., `raw-releases`)
- `NEXUS_USERNAME` - Basic auth username
- `NEXUS_PASSWORD` - Basic auth password

**Path strategies:**
- `version` - `{url}/repository/{repo}/1.2.3/artifact.tgz` (recommended)
- `hash` - `{url}/repository/{repo}/{sha1}/artifact.tgz`

### AWS S3

Upload artifacts to S3 buckets with IAM/OIDC or credentials:

```bash
nx run my-project:publish --registryType=s3 --pathStrategy=version
```

**Environment variables:**
- `AWS_REGION` - AWS region (e.g., `us-east-1`)
- `S3_BUCKET` - Bucket name
- `S3_PREFIX` - Optional key prefix
- `AWS_ACCESS_KEY_ID` - Access key (optional with IAM/OIDC)
- `AWS_SECRET_ACCESS_KEY` - Secret key (optional with IAM/OIDC)

**Path strategies:**
- `version` - `s3://{bucket}/{prefix}/1.2.3/artifact.tgz`
- `hash` - `s3://{bucket}/{prefix}/{sha1}/artifact.tgz`
- `flat` - `s3://{bucket}/{prefix}/artifact.tgz`

## 🔄 Batch Release Workflow

Release multiple projects in one PR using `nx affected`:

### How It Works

1. **One release branch** for all affected projects
2. Smart detection with `nx affected --target=version`
3. All version bumps in **one commit/PR**
4. After merge: multiple tags + GitHub releases + publish

### Setup

```bash
nx g nx-project-release:init
# Select: Workflow type → Batch
```

Creates three GitHub Actions workflows:
- `batch-release-pr.yml` - Create release branch + PR
- `batch-publish.yml` - Publish after merge
- `pr-validation.yml` - Dry-run preview in PR comments

### Manual Trigger

```bash
# Create release branch
git checkout -b release/batch-$(date +%Y-%m-%d)

# Version all affected projects
nx affected --target=version --base=main --releaseAs=minor --gitCommit

# Push and create PR
git push origin HEAD
gh pr create --title "chore(release): batch $(date +%Y-%m-%d)"
```

### Skipped Projects

Projects without version configuration are automatically skipped (not failed) in batch mode:

```
⚠️  Skipping project 'unconfigured-lib': No version found
💡 To version this project, use --firstRelease flag or configure version in project files
✅ project-a: 1.2.3
✅ project-b: 2.0.1

📊 Workspace Versioning Summary:
✅ Successfully versioned: 2 projects
⏭️  Skipped: 1 projects
❌ Failed: 0 projects
```

## 🌿 Release Branch & Auto PR

Create release branches with automatic PR creation:

```bash
nx run my-project:version \
  --gitCommit \
  --createReleaseBranch \
  --createPR \
  --prTitle="chore(release): {projectName} v{version}" \
  --prLabels="release,automated"
```

**Options:**
- `--createReleaseBranch` - Create branch like `release/v1.2.3`
- `--releaseBranchName` - Custom name format (supports `{version}`, `{projectName}`, `{tag}`)
- `--createPR` - Auto-create PR using GitHub CLI (`gh` required)
- `--prTitle` - PR title (supports placeholders)
- `--prBody` - PR body (supports `{changelog}` placeholder)
- `--prBaseBranch` - Target branch (default: auto-detected main branch)
- `--prDraft` - Create as draft PR
- `--prLabels` - Comma-separated labels

## 🔀 Branch Sync After Release

Sync version bumps and changelog to other branches after release (e.g., main → develop):

```bash
nx run my-project:version \
  --gitCommit \
  --gitTag \
  --mergeAfterRelease \
  --mergeToBranches=develop,staging \
  --mergeStrategy=merge
```

**Why?** Keeps version numbers synchronized across branches without merging feature code.

**Options:**
- `--mergeAfterRelease` - Enable branch sync
- `--mergeToBranches` - Target branches (array)
- `--mergeStrategy` - `merge | squash | rebase` (default: `merge`)

## ⚙️ Configuration

### Workspace Defaults (nx.json)

```json
{
  "targetDefaults": {
    "nx-project-release:version": {
      "cache": false,
      "options": {
        "versionFiles": ["package.json"],
        "gitCommit": true,
        "gitTag": true,
        "ciOnly": true
      }
    }
  }
}
```

### Project Config (project.json)

```json
{
  "targets": {
    "version": {
      "executor": "nx-project-release:version"
    },
    "changelog": {
      "executor": "nx-project-release:changelog"
    },
    "publish": {
      "executor": "nx-project-release:publish",
      "dependsOn": ["build"],
      "options": {
        "registryType": "npm",
        "access": "public"
      }
    }
  }
}
```

### Tag Naming

Configure custom git tag formats:

```json
{
  "targets": {
    "version": {
      "options": {
        "tagNaming": {
          "prefix": "v",
          "format": "{projectName}@{version}",
          "includeProjectName": true
        }
      }
    }
  }
}
```

## 🔧 Generators

### init
Interactive setup for workspace configuration.

```bash
# Interactive mode
nx g nx-project-release:init

# Non-interactive with defaults
nx g nx-project-release:init --skipPrompts
```

### reset-config
Remove all nx-project-release configuration.

```bash
# Remove all config
nx g nx-project-release:reset-config

# Preview what would be removed
nx g nx-project-release:reset-config --dryRun
```

## 🔍 Common Options Reference

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `version` | string | Explicit version to release | - |
| `releaseAs` | string | Version bump: major, minor, patch, prerelease | - |
| `preid` | string | Prerelease identifier (alpha, beta, rc) | - |
| `firstRelease` | boolean | First release mode | false |
| `gitCommit` | boolean | Create git commit | false |
| `gitTag` | boolean | Create git tag | false |
| `ciOnly` | boolean | Restrict git ops to CI only | true |
| `createReleaseBranch` | boolean | Create release branch | false |
| `createPR` | boolean | Auto-create PR | false |
| `mergeAfterRelease` | boolean | Sync to other branches | false |
| `mergeToBranches` | array | Target branches for sync | - |
| `show` | boolean | Display analysis without changes | false |
| `dryRun` | boolean | Preview without execution | false |
| `registryType` | string | npm, nexus, s3, github | npm |
| `pathStrategy` | string | version, hash, flat | version |
| `trackDeps` | boolean | Auto-version dependent projects | false |
| `syncVersions` | boolean | Synchronize versions | false |

## 📖 Examples

### Monorepo with Multiple Projects

```bash
# Release all affected projects
nx affected --target=version --base=main --releaseAs=minor --gitCommit --gitTag

# Release specific projects
nx run-many --target=version --projects=lib-a,lib-b --releaseAs=patch
```

### Prerelease Workflow

```bash
# Create alpha release
nx run my-project:version --releaseAs=prerelease --preid=alpha --gitCommit --gitTag

# Increment alpha (1.0.1-alpha.0 → 1.0.1-alpha.1)
nx run my-project:version --releaseAs=prerelease --preid=alpha

# Graduate to stable
nx run my-project:version --releaseAs=patch --gitCommit --gitTag
```

### Custom Version Files

```bash
# Use custom file
nx run my-project:version --versionFile=VERSION.txt

# Nested JSON path
nx run my-project:version --versionFile=metadata.json --versionPath=app.version
```

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## 📄 License

MIT © [Divagnz](https://github.com/Divagnz)
