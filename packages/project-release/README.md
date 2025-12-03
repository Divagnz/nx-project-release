# nx-project-release

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

[![npm version](https://badge.fury.io/js/nx-project-release.svg)](https://www.npmjs.com/package/nx-project-release)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A polyglot Nx plugin for automated semantic versioning, changelog generation, and publishing for any project type in your monorepo.

## 📖 Full Documentation

For complete documentation, examples, and configuration options:

**[👉 View Full Documentation](../../README.md)**

## Quick Start

```bash
# Install and run interactive setup
nx add nx-project-release

# Or install manually
npm install --save-dev nx-project-release
nx g nx-project-release:init
```

## Features

- **🚀 Polyglot Support** - Works with any project type (Node.js, Python, Go, Rust, Java, etc.)
- **📦 Multiple Registries** - NPM, Nexus (Sonatype), AWS S3, GitHub Packages
- **🔄 Batch Releases** - Release multiple projects in one PR with `nx affected`
- **📝 Auto Changelogs** - Generate from conventional commits
- **🔖 Semantic Versioning** - Automatic or manual version bumps
- **🔐 CI/CD Safety** - CI-only mode prevents accidental local releases
- **🌿 Release Branches** - Automatic PR creation for review workflow
- **🔗 Dependency Tracking** - Auto-version dependent projects
- **✅ Commit Validation** - Automatic setup of commitlint with Nx scopes
- **🏷️ Release Groups** - Organize projects by type/registry/deployment with pattern matching
- **🎯 Smart Tag Naming** - Customizable tag templates with full config hierarchy
- **⚙️ CI/CD Workflows** - Auto-generate GitHub Actions workflows
- **📋 Project Exclusion** - Track and exclude projects from versioning
- **📦 Artifact Creation** - Create distributable artifacts (zip, tar, tgz) from build output
- **🎯 Project-Specific Artifacts** - GitHub releases automatically attach only matching artifacts per project
- **🔄 Two-Step Workflows** - Optional workflow split: Step 1 (version/changelog/tag) → Step 2 (build/artifact/publish)
- **🔒 Security & Compatibility** - Updated dependencies for improved security and ESM compatibility

## Quick Usage

```bash
# First release
nx run my-project:version --version=1.0.0 --firstRelease
nx run my-project:changelog
nx run my-project:publish

# Subsequent releases (step-by-step - recommended)
# Automatic bump detection from conventional commits
nx run my-project:version --gitCommit --gitTag
nx run my-project:changelog
nx run my-project:publish

# Or manually specify bump type (override auto-detection)
nx run my-project:version --releaseAs=minor --gitCommit --gitTag

# Or use the release executor for orchestration (version + changelog + tag)
nx run my-project:release --gitPush

# Preview changes
nx run my-project:version --preview

# Validate configuration
nx run my-project:validate

# Batch release (all affected projects - auto-detect bump from commits)
nx affected -t version --base=main --gitCommit --gitTag
nx affected -t changelog --base=main
nx affected -t publish --base=main

# Or force specific bump type for all affected
nx affected -t version --base=main --releaseAs=patch --gitCommit --gitTag
```

> **Note**: The `version` executor only bumps version numbers in files. Git operations (commit, tag, push) are handled by the `release` executor or CI/CD workflows.

> **How Version Bump Detection Works**:
> - When using `nx affected -t version`, Nx determines which projects are affected based on file changes
> - The version executor then analyzes conventional commits since the last tag to determine bump type (major/minor/patch)
> - Projects in the `excludedProjects` list are automatically skipped
> - Use `--releaseAs` to override automatic detection and force a specific bump type

## Core Executors

- **version** - Bump project version based on conventional commits
- **changelog** - Generate CHANGELOG.md from commits
- **release** - Orchestrate version + changelog + tag creation (no publish)
- **artifact** - Create distributable artifacts (zip, tar, tgz) from build output
- **publish** - Publish to NPM, Nexus, S3, or custom registry
- **validate** - Validate and display configuration summary

### Recommended Workflow

For maximum control, use individual executors in sequence:
```bash
# Auto-detect bump from conventional commits (recommended)
nx run my-project:version --gitCommit --gitTag
nx run my-project:changelog
nx run my-project:publish

# Or override with specific bump type
nx run my-project:version --releaseAs=minor --gitCommit --gitTag
```

For orchestration, use the `release` executor (handles version + changelog + tag):
```bash
# Auto-detect bump from commits
nx run my-project:release --gitPush
# Then separately:
nx run my-project:publish

# Or force specific bump
nx run my-project:release --releaseAs=major --gitPush
```

### Validate Executor

The validate executor provides a comprehensive configuration summary and health check:

```bash
# Basic validation
nx run my-project:validate

# Verbose output with all details
nx run my-project:validate --verbose

# JSON output for CI/CD
nx run my-project:validate --json

# Skip health checks
nx run my-project:validate --checkHealth=false
```

**Output includes:**
- 🌍 **Global Configuration** - Workspace-wide settings from nx.json
- 📦 **Release Groups** - Which release group the project belongs to
- 🎯 **Project Configuration** - Project-specific executor settings
- 🏥 **Health Check** - Warnings and errors for common issues

**Example output:**
```
🔍 Configuration Validation
════════════════════════════════════════════════════════════

🌍 Global Configuration (nx.json)
────────────────────────────────────────────────────────────
  Versioning Strategy: independent
  Version Files: package.json
  Tag Naming:
    Format: {projectName}@{version}
    Include Project Name: true

📦 Release Groups (2)
────────────────────────────────────────────────────────────
  ✓ npm-packages (current project)
    Registry: npm
    Strategy: independent
    Projects: 5

🎯 Project Configuration (my-app)
────────────────────────────────────────────────────────────
  ✓ Version Executor Configured
    Version Files: package.json
  ✓ Changelog Executor Configured
    File: CHANGELOG.md
    Preset: angular
  ✓ Publish Executor Configured
    Registry Type: npm

🏥 Health Check
────────────────────────────────────────────────────────────
  ✓ No issues found

════════════════════════════════════════════════════════════
✅ Configuration is valid
```

**Use cases:**
- Verify configuration after running generators
- Debug release issues
- Document current setup
- CI/CD pre-flight checks

### Artifact Executor

Creates distributable artifacts (zip, tar, tgz) from build output for non-npm projects.

```bash
# Create tar.gz artifact from build output
nx run my-project:artifact

# Create zip artifact
nx run my-project:artifact --format=zip

# Custom naming with variables
nx run my-project:artifact --artifactName='{projectName}-{version}-{platform}-{arch}.tgz'
```

**Template variables:**
- `{projectName}` - Project name
- `{version}` - Current version from package.json or project.json
- `{hash}` - Git short hash (7 characters)
- `{timestamp}` - Unix timestamp
- `{date}` - Current date (YYYY-MM-DD)
- `{platform}` - OS platform (linux, darwin, win32)
- `{arch}` - CPU architecture (x64, arm64)
- `{extension}` - File extension based on format

**Configuration options:**

```json
{
  "targets": {
    "artifact": {
      "executor": "nx-project-release:artifact",
      "options": {
        "sourceDir": "dist/{projectName}",
        "outputDir": "dist/artifacts",
        "artifactName": "{projectName}-{version}.{extension}",
        "format": "tgz",
        "include": ["**/*"],
        "exclude": ["**/*.map", "**/*.test.js"],
        "compressionLevel": 6,
        "stripPrefix": "dist/",
        "metadata": {
          "buildDate": "2025-12-02",
          "commit": "abc123"
        }
      }
    }
  }
}
```

**Key options:**
- `sourceDir` - Directory to package (supports templates)
- `outputDir` - Where to save artifacts (default: `dist/artifacts`)
- `artifactName` - Output filename (supports templates)
- `format` - Archive format: `zip`, `tar`, `tgz`, `tar.gz` (default: `tgz`)
- `include` - Glob patterns for files to include (default: `['**/*']`)
- `exclude` - Glob patterns for files to exclude
- `compressionLevel` - Compression level 0-9 (default: 6)
- `stripPrefix` - Remove prefix from paths in archive
- `metadata` - Custom metadata to include in `.artifact-metadata.json`
- `preservePermissions` - Preserve file permissions in tar archives

**Use cases:**
- Package Go/Rust binaries for distribution
- Create deployment artifacts for Docker-less deployments
- Bundle compiled applications for release
- Generate platform-specific builds

## CI/CD Workflows

### Workflow Strategies

**Single-Step (Default):** Fast, simple releases in one workflow
```
Version → Changelog → Build → Artifact → Tag → Push → GitHub Release → Publish
```

**Two-Step (Production):** Separated versioning and publishing
```
Step 1: Version → Changelog → Tag → Push
Step 2: Build → Artifact → GitHub Release → Publish
```

Enable two-step workflow:
```bash
nx g nx-project-release:setup-workflows --twoStepRelease
```

### Artifact Handling

Artifacts are **never committed to git**:
1. Created locally with `nx affected -t artifact`
2. Stored in `dist/artifacts/` during workflow
3. Attached to GitHub releases using pattern: `dist/artifacts/**/{projectName}*`

**Benefits:**
- ✅ Repository stays clean (no binary bloat)
- ✅ Project-specific artifacts only
- ✅ No git lock file issues

**Example:**
```
dist/artifacts/
  ├── my-api-v1.2.3.tgz
  └── my-cli-v2.0.1.tgz

GitHub Releases:
  → my-api v1.2.3 gets my-api-v1.2.3.tgz
  → my-cli v2.0.1 gets my-cli-v2.0.1.tgz
```

For detailed workflow examples and comparison, see the [full documentation](../../README.md#-cicd-workflows).

## Generators

### Setup Generators

#### `init` - Initial Workspace Setup
Interactive wizard to configure your workspace:
- Project selection and release groups
- Git hooks (simple-git-hooks or Husky)
- Commit validation (commitizen + commitlint)
- GitHub Actions workflows

```bash
nx g nx-project-release:init
```

#### `setup-commitlint` - Commit Validation
Configure commitlint with Nx project scopes validation:

```bash
nx g nx-project-release:setup-commitlint
```

Features:
- Validates commit messages follow conventional commits format
- Ensures scopes match actual Nx project names
- Prevents "No commits found" in changelogs
- Supports both Husky and simple-git-hooks

#### `setup-workflows` - CI/CD Workflows
Configure GitHub Actions workflows for automated releases:

```bash
nx g nx-project-release:setup-workflows
```

Options:
- **Workflow Types:**
  - Affected projects (auto-release on push)
  - Manual release (workflow_dispatch)
  - Release on PR merge
  - All workflows
- **Configuration:**
  - Default branch (main/master/develop)
  - Manual triggers (workflow_dispatch)
  - GitHub releases creation
  - Auto-merge release PRs
  - Trigger paths filtering

Example workflows created:
```yaml
# .github/workflows/release-affected.yml
# Auto-release affected projects on push to main

# .github/workflows/release-manual.yml
# Manual release with workflow_dispatch inputs

# .github/workflows/release-on-merge.yml
# Auto-publish when release PR is merged
```

#### `configure-release` - Configure Individual Project
Add or update release configuration for a specific project:

```bash
# Interactive prompts
nx g nx-project-release:configure-release --project=my-app

# With options
nx g nx-project-release:configure-release \
  --project=my-app \
  --registryType=npm \
  --registryUrl=https://registry.npmjs.org \
  --versionFiles=package.json \
  --initialVersion=0.1.0
```

Features:
- Adds version, changelog, and publish targets to project.json
- Initializes version file if it doesn't exist
- Optionally adds project to a release group
- Supports all registry types (npm, docker, nexus, s3, github, custom, none)

**Use cases:**
- Configure a single project after skipping wizard
- Add release config to newly created projects
- Reconfigure existing projects with different registry
- Quickly onboard projects one at a time

### Configuration Generators

#### `configure-version` - Configure Version Settings
Configure version executor settings for one or multiple projects:

```bash
# Interactive mode (recommended)
nx g nx-project-release:configure-version

# Configure specific projects
nx g nx-project-release:configure-version \
  --projects=my-app,my-lib \
  --versionFiles=package.json \
  --tagNamingFormat="{projectName}@{version}" \
  --bumpDependents=true
```

**Features:**
- Multi-select projects to configure
- Set version files (package.json, project.json, etc.)
- Configure tag naming (format, prefix, suffix)
- Enable/disable bumping dependent projects
- Interactive prompts for all options

**Use cases:**
- Standardize version settings across multiple projects
- Configure tag naming for monorepo projects
- Enable dependency tracking for workspace libraries

#### `configure-changelog` - Configure Changelog Settings
Configure changelog executor settings for one or multiple projects:

```bash
# Interactive mode
nx g nx-project-release:configure-changelog

# Configure specific projects
nx g nx-project-release:configure-changelog \
  --projects=my-app,my-lib \
  --preset=angular \
  --changelogFile=CHANGELOG.md \
  --includeCommitBody=true
```

**Features:**
- Multi-select projects to configure
- Set changelog file name
- Choose conventional changelog preset (angular, conventionalcommits, etc.)
- Configure release count and unstable version handling
- Include/exclude commit bodies

**Use cases:**
- Standardize changelog format across projects
- Enable commit body inclusion for detailed changelogs
- Configure different presets per project type

#### `configure-global` - Configure Global Settings
Configure global nx-project-release settings in nx.json:

```bash
# Interactive mode (recommended)
nx g nx-project-release:configure-global

# Set specific options
nx g nx-project-release:configure-global \
  --projectsRelationship=independent \
  --versionFiles=package.json \
  --tagNamingFormat="v{version}" \
  --changelogPreset=angular
```

**Features:**
- Configure default versioning strategy (independent/fixed)
- Set default version files for all projects
- Configure global tag naming
- Set default changelog preset
- Configure default registry settings

**Use cases:**
- Set workspace-wide defaults
- Standardize configuration across all projects
- Quick setup for new workspaces

#### `configure-release-groups` - Manage Release Groups
Create or update release groups with pattern matching support:

```bash
# Interactive mode (recommended)
nx g nx-project-release:configure-release-groups

# Create with pattern matching
nx g nx-project-release:configure-release-groups \
  --groupName=npm-packages \
  --registryType=npm \
  --projectPatterns="*-lib,*-package" \
  --versionStrategy=independent

# List all release groups
nx g nx-project-release:configure-release-groups --action=list

# Update existing group
nx g nx-project-release:configure-release-groups \
  --action=update \
  --groupName=npm-packages \
  --projectPatterns="*-lib"

# Delete a group
nx g nx-project-release:configure-release-groups \
  --action=delete \
  --groupName=old-group
```

**Features:**
- Create, update, delete, or list release groups
- **Pattern matching** - Use glob patterns like `*-lib`, `app-*` to automatically include projects
- Automatically excludes projects in `excludedProjects` list
- Configure registry settings per group
- Set versioning strategy per group
- Custom tag naming per group

**Pattern Examples:**
- `*-lib` - All projects ending with `-lib`
- `app-*` - All projects starting with `app-`
- `backend-*` - All backend service projects
- `*-package` - All package projects

**Use cases:**
- Organize projects by type (libraries, apps, services)
- Group projects by deployment target
- Configure different registries per project type
- Bulk configure projects matching patterns

### Utility Generators

#### `exclude-projects` - Manage Project Exclusions
Interactive multi-select to manage which projects are excluded from versioning:

```bash
# Interactive mode (recommended)
nx g nx-project-release:exclude-projects

# Command-line with specific projects
nx g nx-project-release:exclude-projects --projects=my-app-e2e,another-e2e

# Add to existing exclusions
nx g nx-project-release:exclude-projects --projects=new-e2e --add

# Remove from exclusions
nx g nx-project-release:exclude-projects --projects=my-app-e2e --remove

# Pattern-based exclusion (all E2E projects)
nx g nx-project-release:exclude-projects --pattern="*-e2e"
```

**Interactive Actions:**
- **Set** - Replace entire excluded list (start fresh)
- **Add** - Add more projects to existing exclusions
- **Remove** - Stop excluding specific projects
- **View** - Show currently excluded projects
- **Clear** - Remove all exclusions

**Features:**
- Multi-select interface with space/enter controls
- Shows which projects are currently excluded
- Pattern-based bulk exclusion
- Updates `nx.json` projectRelease.excludedProjects array

#### `reset-config` - Remove Configuration
Clean removal of all nx-project-release configuration:

```bash
nx g nx-project-release:reset-config
```

## Release Groups

Organize projects into groups with shared configuration. Release groups support both explicit project lists and **pattern matching** for automatic project inclusion.

```json
// nx.json
{
  "projectRelease": {
    "releaseGroups": {
      "npm-packages": {
        "registryType": "npm",
        "registryUrl": "https://registry.npmjs.org",
        "versionStrategy": "independent",
        "versionFiles": ["package.json"],
        "pathStrategy": "semver",
        "projects": ["lib-a", "lib-b", "lib-c"],
        "projectPatterns": ["*-lib", "*-package"]
      },
      "docker-apps": {
        "registryType": "docker",
        "versionStrategy": "fixed",
        "versionFiles": ["project.json"],
        "tagNaming": {
          "format": "{releaseGroupName}-v{version}"
        },
        "projects": ["app-1", "app-2"]
      }
    },
    "excludedProjects": ["analytics-platform-e2e"]
  }
}
```

**Benefits:**
- Shared configuration across related projects
- Consistent versioning strategy per group
- Custom tag naming per group
- **Pattern matching** - Automatically include projects matching glob patterns
- Projects in `excludedProjects` are automatically skipped
- Easy project organization

**Pattern Matching:**
Use `projectPatterns` to automatically include projects:
- `["*-lib"]` - All projects ending with `-lib`
- `["app-*"]` - All projects starting with `app-`
- `["api-*", "service-*"]` - Multiple patterns

**Manage release groups:**
```bash
# Create/update release groups with patterns
nx g nx-project-release:configure-release-groups

# List all release groups
nx g nx-project-release:configure-release-groups --action=list
```

## Project Exclusion

Exclude specific projects from versioning (useful for E2E tests, tools, or internal projects).

### Configuration

Add to `nx.json` at the root level (not inside `targetDefaults`):

```json
{
  "projectRelease": {
    "excludedProjects": [
      "my-app-e2e",
      "another-app-e2e",
      "internal-tool",
      "example-app"
    ]
  }
}
```

### How to Exclude Projects

#### Option 1: Interactive Multi-Select (Recommended)
Use the dedicated generator with a visual multi-select interface:

```bash
nx g nx-project-release:exclude-projects
```

This provides interactive actions to set, add, remove, view, or clear exclusions.

#### Option 2: During Initial Setup
When running `nx g nx-project-release:init`, the wizard will:
1. Show all projects in your workspace
2. Let you select which to configure
3. Automatically add unselected projects to `excludedProjects`

```bash
nx g nx-project-release:init
# Interactive wizard will prompt for project selection
```

#### Option 3: Pattern-Based Exclusion
Exclude all projects matching a pattern (e.g., all E2E projects):

```bash
nx g nx-project-release:exclude-projects --pattern="*-e2e"
```

#### Option 4: Command-Line Arguments
Add specific projects via command line:

```bash
# Add to exclusions
nx g nx-project-release:exclude-projects --projects=my-app-e2e,another-e2e --add

# Remove from exclusions
nx g nx-project-release:exclude-projects --projects=my-app-e2e --remove
```

#### Option 5: Manually Edit nx.json
Add project names directly to the `excludedProjects` array:

```json
{
  "projectRelease": {
    "excludedProjects": ["my-app-e2e"]
  }
}
```

### When to Use

- **E2E test projects** - Don't version test apps that accompany your main apps
- **Build tools** - Internal utilities that don't need releases
- **Example/demo apps** - Sample projects not meant for distribution
- **Deprecated projects** - Projects being phased out
- **Documentation sites** - Docs that follow main app versions

### How It Works

1. **During `init`:** Excluded projects won't get version/changelog/publish targets added to their `project.json`
2. **During `nx affected`:** Excluded projects are automatically skipped even if they have changes
3. **Manual commands:** You can still manually run `nx run excluded-project:version` if needed

### Example

If you have `analytics-platform` and `analytics-platform-e2e`:

```json
{
  "projectRelease": {
    "excludedProjects": ["analytics-platform-e2e"],
    "releaseGroups": {
      "apps": {
        "projects": ["analytics-platform"]
      }
    }
  }
}
```

**Result:** Only `analytics-platform` will be versioned, `analytics-platform-e2e` is ignored.

## Tag Naming Configuration

Customize git tag format with full configuration hierarchy:

```json
// nx.json - Global config (lowest priority)
{
  "projectRelease": {
    "tagNaming": {
      "format": "v{version}",
      "prefix": "",
      "suffix": "",
      "includeProjectName": false
    }
  }
}

// nx.json - Project-specific config
{
  "projectRelease": {
    "projectConfigs": {
      "my-app": {
        "tagNaming": {
          "format": "{projectName}@{version}"
        }
      }
    }
  }
}

// project.json - Project file config
{
  "targets": {
    "version": {
      "executor": "nx-project-release:version",
      "options": {
        "tagNaming": {
          "prefix": "app-",
          "format": "{prefix}v{version}"
        }
      }
    }
  }
}
```

**Priority:** command line > project.json > release group > project config > global config

## Commit Validation

Automatic setup of commit validation ensures changelogs work correctly:

```bash
# Setup during init or standalone
nx g nx-project-release:setup-commitlint

# Creates commitlint.config.js
module.exports = {
  extends: ['@commitlint/config-conventional', '@commitlint/config-nx-scopes'],
  rules: {
    'scope-enum': [0], // Nx scopes validated automatically
  }
};

# Use commitizen for guided commits
npm run commit
```

**Why it matters:**
- Project changelogs filter commits by scope
- Scope must match project name for commits to appear
- Commitlint validates scopes against actual Nx projects
- Prevents "No commits found" warnings

## CI/CD Integration

### GitHub Actions Examples

**Affected Projects Workflow:**
```yaml
name: Release Affected
on:
  push:
    branches: [main]
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: |
          # Auto-detect version bump from conventional commits
          npx nx affected -t version \
            --base=origin/main~1 \
            --gitCommit --gitTag

          npx nx affected -t changelog \
            --base=origin/main~1

          npx nx affected -t publish \
            --base=origin/main~1
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
      - run: git push --follow-tags
```

**Manual Release Workflow:**
```yaml
name: Manual Release
on:
  workflow_dispatch:
    inputs:
      project:
        description: 'Project to release'
        required: true
      releaseAs:
        description: 'Release type'
        type: choice
        options: [patch, minor, major]
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - name: Version and Changelog
        run: |
          # Use manual input to override auto-detection
          npx nx run ${{ inputs.project }}:version \
            --releaseAs=${{ inputs.releaseAs }} \
            --gitCommit --gitTag
          npx nx run ${{ inputs.project }}:changelog
      - name: Push and Create Release
        run: |
          npx nx run ${{ inputs.project }}:release --gitPush --createGitHubRelease
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Publish
        run: |
          npx nx run ${{ inputs.project }}:publish
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Generate these automatically:
```bash
nx g nx-project-release:setup-workflows --workflowType=all
```

## Configuration Examples

### Independent Versioning
```json
// nx.json
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

### Fixed Versioning (Monolithic)
```json
// nx.json
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

### Mixed Strategy with Release Groups
```json
// nx.json
{
  "projectRelease": {
    "releaseGroups": {
      "backend-services": {
        "versionStrategy": "fixed",
        "projects": ["api-gateway", "auth-service", "user-service"]
      },
      "frontend-apps": {
        "versionStrategy": "independent",
        "projects": ["admin-ui", "customer-portal"]
      }
    }
  }
}
```

## Common Workflows

### First Release
```bash
# Set up workspace
nx g nx-project-release:init

# Create first release (version bump only)
nx run my-project:version --version=1.0.0 --firstRelease
nx run my-project:changelog
nx run my-project:publish
```

### Feature Release
```bash
# Automatic detection from conventional commits (recommended)
nx run my-project:version --gitCommit --gitTag
nx run my-project:changelog
nx run my-project:publish

# OR override with manual bump type
nx run my-project:version --releaseAs=minor --gitCommit --gitTag
nx run my-project:changelog
nx run my-project:publish
```

### Batch Release
```bash
# Release all affected projects - auto-detect from commits (recommended)
nx affected -t version --base=main --gitCommit --gitTag
nx affected -t changelog --base=main
nx affected -t publish --base=main

# Push changes
git push origin main --tags

# OR force specific bump type for all affected
nx affected -t version --base=main --releaseAs=patch --gitCommit --gitTag
```

### Preview Mode
```bash
# See what would change without making changes
nx run my-project:version --preview
nx run my-project:version --dryRun
```

## Troubleshooting

### "No commits found" in changelog
**Problem:** Changelog shows no commits even though commits exist.

**Solution:** Set up commit validation to ensure scopes match project names:
```bash
nx g nx-project-release:setup-commitlint
```

### Version file not found
**Problem:** Executor can't find version in package.json or project.json.

**Solution:** Configure versionFiles in nx.json or add version field:
```json
// project.json
{
  "version": "1.0.0",
  "targets": { ... }
}
```

### E2E apps being versioned
**Problem:** E2E test apps or other excluded projects get versioned when running `nx affected -t version`.

**Solution:** Ensure projects are in the `excludedProjects` list in nx.json:
```json
{
  "projectRelease": {
    "excludedProjects": ["my-app-e2e", "another-app-e2e"]
  }
}
```

**Note:** As of v0.0.30+, excluded projects are automatically skipped during `nx affected -t version`. The version executor checks the excludedProjects list at startup and returns early if the current project is excluded.

## License

MIT © [Divagnz](https://github.com/Divagnz)
