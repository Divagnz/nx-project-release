# nx-project-release

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

[![npm version](https://badge.fury.io/js/nx-project-release.svg)](https://www.npmjs.com/package/nx-project-release)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

![Coverage Lines](./coverage/packages/project-release/badge-lines.svg)
![Coverage Statements](./coverage/packages/project-release/badge-statements.svg)
![Coverage Functions](./coverage/packages/project-release/badge-functions.svg)
![Coverage Branches](./coverage/packages/project-release/badge-branches.svg)

A polyglot Nx plugin for automated semantic versioning, changelog generation, and publishing for any project type in your monorepo.

## 🆕 Latest Updates (v0.0.37+)

- **🐛 Bug Fix** - `{version}` token now correctly substituted in git commit messages
- **🐛 Bug Fix** - `matchesProjectPattern` regex now safe against dots and special characters in project names
- **🐛 Bug Fix** - `generateTagName` logic aligned between version and release executors
- **⚠️ Deprecation Warnings** - `skipCommit` and `skipTag` options now log deprecation warnings pointing to `gitCommit: false` / `gitTag: false`
- **📝 Schema Docs** - `stripPrefix` in artifact executor now documents its zip-only limitation
- **🧪 Test Coverage** - Expanded from ~30% to ≥70% across all executors and generators
- **📦 Optimized Artifact Handling** - Artifacts no longer committed to git, keeping repositories clean
- **🎯 Project-Specific Artifacts** - GitHub releases automatically attach only matching artifacts per project
- **🔄 Two-Step Workflows** - Optional workflow split: Step 1 (version/changelog/tag) → Step 2 (build/artifact/publish)
- **🚫 Project Exclusion** - Automatic skipping of excluded projects in `nx affected` workflows
- **🔒 Security Updates** - Updated glob dependency to v13+ for improved security

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

- ✅ Git operations (commit, tag, CI-only mode)
- ✅ Changelog configuration (conventional commits preset)
- ✅ Publishing setup (npm access, dist tags, build target)
- ✅ Tag naming configuration
- ✅ Configuration location (nx.json, project.json, or both)
- ✅ Git hooks setup (pre-commit, pre-push)
- ✅ GitHub workflows setup (optional)
- ✅ Release groups creation (registry, version strategy, files)
- ✅ Project assignment (assign each project to a group or skip)

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
# Automatic version bump (analyzes conventional commits)
nx run my-project:version

# Specific version
nx run my-project:version --version=2.0.0

# Bump type
nx run my-project:version --releaseAs=minor

# Prerelease
nx run my-project:version --releaseAs=prerelease --preid=beta

# With git operations (handled by release executor or CI/CD)
nx run my-project:version --gitCommit --gitTag

# Preview changes
nx run my-project:version --preview
```

> **How Version Detection Works (v0.0.30+)**:
>
> - When using `nx affected -t version`, Nx determines affected projects based on file changes
> - Version executor analyzes conventional commits since last tag to determine bump type (major/minor/patch)
> - Projects in `excludedProjects` list are automatically skipped
> - Use `--releaseAs` to override automatic detection

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

### artifact

Creates distributable artifacts (zip, tar, tgz) from build output for non-npm projects.

```bash
# Create tar.gz artifact from build output
nx run my-project:artifact

# Create zip artifact
nx run my-project:artifact --format=zip

# Custom naming with variables
nx run my-project:artifact --artifactName='{projectName}-{version}-{platform}-{arch}.tgz'

# Exclude files
nx run my-project:artifact --exclude='**/*.map' --exclude='**/*.spec.ts'
```

**Template variables:**

- `{projectName}` - Project name
- `{version}` - Current version
- `{hash}` - Git short hash
- `{timestamp}` - Unix timestamp
- `{date}` - Current date (YYYY-MM-DD)
- `{platform}` - OS platform (linux, darwin, win32)
- `{arch}` - CPU architecture (x64, arm64)
- `{extension}` - File extension based on format

**Key options:**

- `--sourceDir` - Source directory to archive (required)
- `--outputDir` - Output directory (default: `dist/artifacts`)
- `--artifactName` - Filename template (default: `{projectName}-{version}.{extension}`)
- `--format` - Archive format: `zip | tar | tgz | tar.gz` (default: `tgz`)
- `--include` - Glob patterns to include (default: `**/*`)
- `--exclude` - Glob patterns to exclude
- `--compressionLevel` - 0-9, where 9 is maximum (default: 6)
- `--stripPrefix` - Remove prefix from archive paths (**zip format only**; ignored for tar/tgz/tar.gz)
- `--metadata` - Additional metadata for manifest
- `--dryRun` - Log what would be created without writing any files to disk

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

## 🔄 CI/CD Workflows

### Workflow Types

The `setup-workflows` generator creates GitHub Actions workflows optimized for different release strategies:

```bash
nx g nx-project-release:setup-workflows
```

#### Single-Step Workflow (Default)

Everything happens in one workflow run:

```
Version → Changelog → Build → Artifact → Tag → Push → GitHub Release → Publish
```

**Use when:** You want fast, simple releases in one step.

```yaml
# .github/workflows/release-affected.yml
on:
  push:
    branches: [main]

jobs:
  release:
    steps:
      - Version affected projects
      - Generate changelogs
      - Commit & push
      - Build projects
      - Create artifacts (kept in memory, not committed)
      - Create & push tags
      - Create GitHub releases with artifacts
      - Publish to npm
```

#### Two-Step Workflow (Recommended for Production)

Splits release into two workflows:

**Step 1: Release PR (on push to main)**

```
Version → Changelog → Tag → Push
```

**Step 2: Publish (triggered by release commit)**

```
Build → Artifact → GitHub Release → Publish
```

**Benefits:**

- ✅ Faster feedback on version changes (no build/artifact wait)
- ✅ Artifacts never committed to git (keeps repo clean)
- ✅ Clear separation: versioning vs distribution
- ✅ Can review version changes before build/publish
- ✅ Avoids git lock file issues from concurrent pushes

```yaml
# .github/workflows/release-pr.yml
on:
  push:
    branches: [main]

jobs:
  release-pr:
    steps:
      - Version affected projects
      - Generate changelogs
      - Create tags (locally)
      - Commit & push (versions + changelogs + tags)

# .github/workflows/publish-release.yml
on:
  push:
    branches: [main]

jobs:
  publish:
    if: contains(github.event.head_commit.message, 'chore(release):')
    steps:
      - Build projects
      - Create artifacts
      - Create GitHub releases with artifacts
      - Publish to npm
```

**Enable two-step workflow:**

```bash
nx g nx-project-release:setup-workflows --twoStepRelease
```

### Artifact Handling

**How it works:**

1. **Artifacts are created** locally with `nx affected -t artifact`
2. **Artifacts stay in `dist/artifacts/`** (never committed to git)
3. **Project-specific artifacts** are attached to GitHub releases using pattern:
   ```bash
   --assetPatterns='dist/artifacts/**/{projectName}*'
   ```

**Example:** If you have projects `my-api` and `my-cli`:

```
dist/artifacts/
  ├── my-api-v1.2.3.tgz
  ├── my-cli-v2.0.1.tgz
  └── my-cli-v2.0.1-linux-x64.tar.gz
```

**GitHub Releases:**

- `my-api v1.2.3` gets `my-api-v1.2.3.tgz`
- `my-cli v2.0.1` gets both `my-cli-v2.0.1.tgz` and `my-cli-v2.0.1-linux-x64.tar.gz`

### Example Flow: Monorepo with Multiple Projects

**Scenario:** You have a monorepo with 3 libraries and 2 applications.

**1. Make changes and commit:**

```bash
# Feature development
git checkout -b feature/user-auth
# ... make changes to lib-auth and app-web ...
git commit -m "feat(lib-auth): add JWT support"
git commit -m "feat(app-web): integrate JWT auth"
git push origin feature/user-auth
```

**2. Merge PR to main:**

```bash
gh pr merge feature/user-auth --squash
```

**3. Workflow automatically runs:**

**Single-Step:**

```
✅ nx affected -t version → lib-auth: 1.2.0→1.3.0, app-web: 1.0.0→1.1.0
✅ nx affected -t changelog → Updated CHANGELOG.md files
✅ git commit + push → chore(release): version bumps and changelogs
✅ nx affected -t build → Built lib-auth and app-web
✅ nx affected -t artifact → Created dist/artifacts/lib-auth-v1.3.0.tgz, app-web-v1.1.0.tgz
✅ nx affected -t release --gitTag → Created tags lib-auth-v1.3.0, app-web-v1.1.0
✅ git push --tags → Pushed tags
✅ nx affected -t release --createGitHubRelease → Created GitHub releases with artifacts
✅ nx affected -t publish → Published to npm
```

**Two-Step:**

```
Workflow 1 (Release PR):
✅ nx affected -t version → lib-auth: 1.2.0→1.3.0, app-web: 1.0.0→1.1.0
✅ nx affected -t changelog → Updated CHANGELOG.md files
✅ nx affected -t release --gitTag → Created tags
✅ git push + git push --tags → Pushed commit and tags
   └─→ Triggers Workflow 2 ↓

Workflow 2 (Publish):
✅ nx affected -t build → Built lib-auth and app-web
✅ nx affected -t artifact → Created artifacts
✅ nx affected -t release --createGitHubRelease → Created releases with artifacts
✅ nx affected -t publish → Published to npm
```

**Result:**

- ✅ 2 packages published to npm
- ✅ 2 Git tags created
- ✅ 2 GitHub releases created with artifacts
- ✅ Repository stays clean (no binary artifacts in history)
- ✅ Other projects unchanged

### Workflow Comparison

| Feature         | Single-Step                  | Two-Step                    |
| --------------- | ---------------------------- | --------------------------- |
| **Speed**       | ⚡ Fastest (one run)         | 🐢 Two separate runs        |
| **Repo Size**   | 🎯 Clean (no artifacts)      | 🎯 Clean (no artifacts)     |
| **Feedback**    | 🐌 Wait for full build       | ⚡ Fast version feedback    |
| **Complexity**  | ✅ Simple                    | ⚠️ Two workflows            |
| **Rollback**    | ⚠️ Hard (all-or-nothing)     | ✅ Easy (stop at version)   |
| **Lock Issues** | ✅ Manual push (no issues)   | ✅ Manual push (no issues)  |
| **Best For**    | Small teams, simple projects | Production, large monorepos |

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

Projects are automatically skipped (not failed) in batch mode when:

- No version configuration exists
- Project is in the `excludedProjects` list (nx.json)

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

## 📦 Release Groups

**Release groups** are configuration templates that organize projects by type, registry, or deployment target. They simplify setup by letting you define shared settings once and assign multiple projects to them.

### What Are Release Groups?

Release groups define:

- **Registry settings** - Where to publish (npm, Nexus, S3, or no publishing)
- **Version strategy** - How to determine current version (git tags, files, registry)
- **Version files** - Which files to update (package.json, project.json, version.txt)
- **Path strategy** - How to organize artifacts (for Nexus/S3)

### Release Groups vs syncVersions

These are two **different** concepts:

| Concept            | Purpose                        | Example                                                                                                  |
| ------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **Release Groups** | Configuration templates        | "backend-services" → Nexus registry<br>"npm-libraries" → npm registry<br>"frontend-apps" → no publishing |
| **syncVersions**   | Version number synchronization | `true`: All projects share one version (1.2.3)<br>`false`: Each project has independent versions         |

**Key distinction:**

- Release groups = **WHERE/HOW** to release (registry, files, strategy)
- syncVersions = **VERSION NUMBERS** stay in sync or not

### Example Setup

```bash
# During init, you create release groups:
? Release group name: backend-services
? Publish artifacts to a registry? Yes
? Registry type: Nexus Repository
? Version strategy: Git tags
? Version files: project.json

? Release group name: npm-libraries
? Publish artifacts to a registry? Yes
? Registry type: NPM Registry
? Version strategy: Git tags
? Version files: package.json

? Release group name: internal-tools
? Publish artifacts to a registry? No (version-only)
```

Then assign projects:

```
📋 Assign Projects to Release Groups

  1: backend-services (nexus)
  2: npm-libraries (npm)
  3: internal-tools (none)
  X: Skip (no release)

api-service (app): 1
shared-lib (lib): 2
user-service (app): 1
build-tool (lib): 3
```

Result:

- `api-service` + `user-service` → publish to Nexus, independent versions
- `shared-lib` → publish to npm, independent versions
- `build-tool` → version only (no publishing), independent versions

### How Release Groups Are Stored

**Release groups are persisted in nx.json** for easy management and visibility:

```json
{
  "projectRelease": {
    "groups": {
      "backend-services": {
        "registryType": "nexus",
        "registryUrl": "https://nexus.company.com/repository/raw-releases",
        "versionStrategy": "git-tag",
        "versionFiles": ["project.json"],
        "pathStrategy": "version",
        "projects": ["api-service", "user-service", "auth-service"]
      },
      "npm-libraries": {
        "registryType": "npm",
        "versionFiles": ["package.json"],
        "projects": ["shared-lib", "utils-lib"]
      },
      "internal-tools": {
        "registryType": "none",
        "versionStrategy": "git-tag",
        "versionFiles": ["project.json"],
        "projects": ["build-scripts", "dev-tools"]
      }
    }
  }
}
```

Each project references its group in `project.json`:

```json
{
  "targets": {
    "version": {
      "executor": "nx-project-release:version",
      "options": {
        "releaseGroup": "backend-services"
      }
    }
  }
}
```

**Managing Groups:**

1. **View structure** - All groups visible in nx.json
2. **Add projects** - Edit nx.json, add project name to group's `projects` array, then add `releaseGroup` to project.json
3. **Update settings** - Change group settings once in nx.json, affects all projects in that group
4. **Remove projects** - Delete from `projects` array and remove `releaseGroup` from project.json

**Example: Adding a new project to existing group**

```bash
# 1. Edit nx.json - add to projects array
"backend-services": {
  "projects": ["api-service", "user-service", "new-service"] // ← add here
}

# 2. Edit packages/new-service/project.json - add releaseGroup reference
{
  "targets": {
    "version": {
      "executor": "nx-project-release:version",
      "options": {
        "releaseGroup": "backend-services"  // ← add this
      }
    }
  }
}
```

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

| Option                | Type    | Description                                   | Default |
| --------------------- | ------- | --------------------------------------------- | ------- |
| `version`             | string  | Explicit version to release                   | -       |
| `releaseAs`           | string  | Version bump: major, minor, patch, prerelease | -       |
| `preid`               | string  | Prerelease identifier (alpha, beta, rc)       | -       |
| `firstRelease`        | boolean | First release mode                            | false   |
| `gitCommit`           | boolean | Create git commit                             | false   |
| `gitTag`              | boolean | Create git tag                                | false   |
| `skipCommit`          | boolean | **Deprecated** — use `gitCommit: false`       | -       |
| `skipTag`             | boolean | **Deprecated** — use `gitTag: false`          | -       |
| `ciOnly`              | boolean | Restrict git ops to CI only                   | true    |
| `createReleaseBranch` | boolean | Create release branch                         | false   |
| `createPR`            | boolean | Auto-create PR                                | false   |
| `mergeAfterRelease`   | boolean | Sync to other branches                        | false   |
| `mergeToBranches`     | array   | Target branches for sync                      | -       |
| `show`                | boolean | Display analysis without changes              | false   |
| `dryRun`              | boolean | Preview without execution                     | false   |
| `registryType`        | string  | npm, nexus, s3, github                        | npm     |
| `pathStrategy`        | string  | version, hash, flat                           | version |
| `trackDeps`           | boolean | Auto-version dependent projects               | false   |
| `syncVersions`        | boolean | Synchronize versions                          | false   |

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
