# Project Release Plugin

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

A polyglot Nx plugin for releasing any project type using project.json and conventional commits, supporting multiple registries and flexible configuration.

## Features

- ✅ **Polyglot Support** - Works with any project type (Node.js, Python, Go, Rust, Java, etc.)
- ✅ **Modular Executors** - Use version, changelog, publish, and workflow independently
- ✅ **Project.json Integration** - Works without package.json dependency
- ✅ **Multiple Registries** - npm, Nexus, custom registries for any package type
- ✅ **Selective Releases** - Only affected projects, include/exclude patterns
- ✅ **Custom Version Files** - project.json, package.json, version.txt, pyproject.toml, Cargo.toml, etc.
- ✅ **Flexible Tag Naming** - Custom prefixes, formats, project names
- ✅ **Semver Compliance** - Full semantic versioning support
- ✅ **Git Integration** - Conventional commits and tags
- ✅ **Changelog Generation** - Automated CHANGELOG.md from conventional commits
- ✅ **Dry-run Support** - Preview changes before execution
- ✅ **Dependency Tracking** - Automatically version dependent projects when dependencies change
- ✅ **Sync Versioning** - Synchronize versions across multiple projects in the workspace

## 🚀 Quick Start

### Installation

```bash
npm install --save-dev @divagnz/nx-project-release
```

### Basic Setup

1. **Add executor to your project** (`project.json`):

```json
{
  "targets": {
    "version": {
      "executor": "@divagnz/nx-project-release:version"
    },
    "changelog": {
      "executor": "@divagnz/nx-project-release:changelog"
    },
    "publish": {
      "executor": "@divagnz/nx-project-release:publish",
      "options": {
        "buildTarget": "build"
      }
    },
    "project-release": {
      "executor": "@divagnz/nx-project-release:project-release",
      "options": {
        "buildTarget": "build"
      }
    }
  }
}
```

2. **Configure workspace defaults** (optional, in `nx.json`):

```json
{
  "projectRelease": {
    "defaultRegistry": {
      "type": "npm",
      "url": "https://registry.npmjs.org",
      "access": "public",
      "distTag": "latest"
    },
    "versionFiles": ["package.json", "project.json"],
    "versionPath": "version"
  }
}
```

3. **Release your project**:

```bash
# Preview what would change
npx nx run my-project:project-release --show

# Create a release with git operations
npx nx run my-project:project-release --gitCommit --gitTag

# Full release with publish to npm
npx nx run my-project:project-release --gitCommit --gitTag --publish
```

### First Release

For your first release, specify an initial version:

```bash
npx nx run my-project:version --version=1.0.0 --gitCommit --gitTag
npx nx run my-project:changelog
npx nx run my-project:publish
```

Or use the complete workflow:

```bash
npx nx run my-project:project-release --version=1.0.0 --gitCommit --gitTag --publish
```

## Usage

### Workspace Release (All Projects)

```bash
# Release all projects in workspace
npx nx run project-release

# Release all with git operations
npx nx run project-release --gitCommit --gitTag --publish
npx nx run project-release --releaseAs=minor --dryRun
```

### Modular Executors (Individual Projects)

```bash
# Individual operations on specific projects
npx nx run my-project:version --releaseAs=minor --gitCommit --gitTag
npx nx run my-project:changelog --preset=angular
npx nx run my-project:publish --registryType=npm

# Complete workflow for single project
npx nx run my-project:project-release --gitCommit --gitTag --publish
```

### Single Project Release

```bash
# Automatic patch version bump (no git operations by default)
npx nx run my-project:project-release

# With git commit and tag
npx nx run my-project:project-release --gitCommit --gitTag

# Specific version with git operations
npx nx run my-project:project-release --version=2.1.0 --gitCommit --gitTag

# Version type bump with automatic push
npx nx run my-project:project-release --releaseAs=minor --gitCommit --gitTag --gitPush

# Show detailed analysis of what would change
npx nx run my-project:project-release --show

# Dry run to preview changes
npx nx run my-project:project-release --dryRun
```

### Analysis and Preview

```bash
# Show detailed analysis for version step
npx nx run my-project:version --show

# Show complete workflow analysis
npx nx run my-project:project-release --show

# Show workspace release analysis
npx nx run project-release --show
```

### Git Integration

Git operations are **opt-in** (disabled by default) for maximum control in CI/CD pipelines.

```bash
# Create commit only
npx nx run my-project:project-release --gitCommit

# Create tag only
npx nx run my-project:project-release --gitTag

# Commit and tag
npx nx run my-project:project-release --gitCommit --gitTag

# Commit, tag, and push
npx nx run my-project:project-release --gitCommit --gitTag --gitPush

# Custom commit message with placeholders
npx nx run my-project:project-release --gitCommit \
  --gitCommitMessage="release: {projectName} v{version}"

# Custom tag message
npx nx run my-project:project-release --gitTag \
  --gitTagMessage="Release {projectName} version {version}"

# Push to specific remote
npx nx run my-project:project-release --gitCommit --gitTag \
  --gitPush --gitRemote=upstream

# Stage changes without committing
npx nx run my-project:project-release --stageChanges

# Pass additional git arguments
npx nx run my-project:project-release --gitCommit \
  --gitCommitArgs="--no-verify"
```

**Available Placeholders:**
- `{version}` - The new version number
- `{projectName}` - Name of the project
- `{releaseGroupName}` - Name of the release group (if applicable)
- `{tag}` - The git tag name (tag message only)

### Advanced Features

#### Prerelease Versions

```bash
# Create alpha prerelease (e.g., 1.0.0 -> 1.0.1-alpha.0)
npx nx run my-project:project-release --releaseAs=prerelease --preid=alpha

# Create beta prerelease (e.g., 1.0.0 -> 1.0.1-beta.0)
npx nx run my-project:project-release --releaseAs=prerelease --preid=beta

# Create release candidate (e.g., 1.0.0 -> 1.0.1-rc.0)
npx nx run my-project:project-release --releaseAs=prerelease --preid=rc

# Increment existing prerelease (e.g., 1.0.1-alpha.0 -> 1.0.1-alpha.1)
npx nx run my-project:project-release --releaseAs=prerelease --preid=alpha
```

#### First Release Mode

```bash
# First release with fallback to git tags or registry
npx nx run my-project:project-release --firstRelease

# First release with explicit version
npx nx run my-project:project-release --firstRelease --version=1.0.0
```

#### Dependency Tracking

```bash
# Automatically version dependent projects when dependencies change
npx nx run my-project:project-release --trackDeps
```

#### Sync Versioning

```bash
# Synchronize versions across multiple projects
npx nx run my-project:project-release --syncVersions --syncProjects=lib-a,lib-b

# Use highest existing version strategy
npx nx run my-project:project-release --syncVersions --syncStrategy=highest
```

#### Release Groups

Release groups allow you to organize projects with different versioning strategies and configurations.

```bash
# Release a specific group
npx nx run my-project:project-release --releaseGroup=backend

# Use independent versioning for a group
npx nx run my-project:project-release --releaseGroup=frontend --projectsRelationship=independent
```

**Configure in `nx.json`:**

```json
{
  "projectRelease": {
    "releaseGroups": {
      "backend": {
        "projects": ["api", "server", "workers"],
        "projectsRelationship": "fixed",
        "version": "1.0.0",
        "tagNaming": {
          "format": "backend-v{version}"
        }
      },
      "frontend": {
        "projects": ["web-*", "mobile-*"],
        "projectsRelationship": "independent",
        "tagNaming": {
          "format": "{projectName}@{version}"
        }
      },
      "libs": {
        "projects": ["libs/*"],
        "projectsRelationship": "fixed",
        "releaseTagPattern": "libs-{version}",
        "versionFiles": ["project.json", "package.json"]
      }
    }
  }
}
```

**Key Features:**
- **Fixed versioning**: All projects in the group share the same version (default)
- **Independent versioning**: Each project has its own version
- **Project patterns**: Use glob patterns to match multiple projects
- **Group-specific configuration**: Each group can have its own tag naming, version files, etc.
- **Automatic detection**: Projects are automatically assigned to groups based on patterns

### Changelog Generation

Generate changelogs automatically from conventional commits.

```bash
# Project changelog
npx nx run my-project:changelog

# Workspace changelog (consolidated from all projects)
npx nx run my-project:changelog --workspaceChangelog

# Workspace + individual project changelogs
npx nx run my-project:changelog --workspaceChangelog --projectChangelogs

# Interactive editing - edit in your $EDITOR before saving
npx nx run my-project:changelog --interactive

# Interactive for workspace only
npx nx run my-project:changelog --workspaceChangelog --interactive=workspace

# Interactive for projects only
npx nx run my-project:changelog --interactive=projects

# Interactive for all
npx nx run my-project:changelog --workspaceChangelog --projectChangelogs --interactive=all

# Custom preset
npx nx run my-project:changelog --preset=conventionalcommits

# Preview without writing
npx nx run my-project:changelog --dryRun
```

**Interactive Mode:**
- Opens changelog in your configured editor (`$EDITOR` or `$VISUAL` env var)
- Edit, save, and close to apply changes
- Falls back to `nano` if no editor is configured
- Supports: `true` (all), `'workspace'`, `'projects'`, or `'all'`

### Publishing

```bash
# Release and publish to npm
npx nx run my-project:project-release --gitCommit --gitTag --publish --registry=https://registry.npmjs.org

# Publish to Nexus
npx nx run my-project:project-release --publish --registryType=nexus --registry=https://nexus.company.com

# Custom registry
npx nx run my-project:project-release --publish --registryType=custom --registry=https://custom-registry.com
```

### Selective Releases

```bash
# Only affected projects
npx nx run my-project:project-release --onlyChanged

# Include specific patterns
npx nx run my-project:project-release --includeProjects=libs/*,apps/web-*

# Exclude patterns
npx nx run my-project:project-release --excludeProjects=*test*,*demo*
```

### Custom Version Files

```bash
# Use package.json
npx nx run my-project:project-release --versionFile=package.json

# Use custom file with nested path
npx nx run my-project:project-release --versionFile=app.json --versionPath=metadata.version

# Use plain text file
npx nx run my-project:project-release --versionFile=VERSION
```

### Tag Naming

```bash
# Custom tag prefix
npx nx run my-project:project-release --tagNaming.prefix="release-"

# Custom format
npx nx run my-project:project-release --tagNaming.format="{projectName}-{version}"

# Without project name
npx nx run my-project:project-release --tagNaming.includeProjectName=false
```

### Lock File Management

Lock files (package-lock.json, yarn.lock, pnpm-lock.yaml) are automatically updated after version changes to ensure dependencies remain in sync.

```bash
# Default behavior - automatically updates lock files
npx nx run my-project:project-release --releaseAs=minor

# Skip lock file updates
npx nx run my-project:project-release --skipLockFileUpdate

# Explicitly disable lock file updates
npx nx run my-project:project-release --updateLockFile=false

# In monorepos with multiple package managers
# The plugin automatically detects which lock file exists and uses the appropriate command:
# - package-lock.json → npm install --package-lock-only
# - yarn.lock → yarn install --mode update-lockfile
# - pnpm-lock.yaml → pnpm install --lockfile-only
```

**Note:** Lock file updates are included in git commits automatically when using `--gitCommit`.

## Configuration

### Project Configuration

Add to your project's `project.json`:

```json
{
  "targets": {
    "project-release": {
      "executor": "@divagnz/project-release:project-release",
      "options": {
        "dryRun": false,
        "publish": true,
        "registryType": "npm",
        "buildTarget": "build"
      }
    }
  }
}
```

### Workspace Configuration

Add to `nx.json` for workspace-wide settings:

```json
{
  "projectRelease": {
    "defaultRegistry": {
      "type": "npm",
      "url": "https://registry.npmjs.org",
      "access": "public",
      "distTag": "latest"
    },
    "versionFiles": ["project.json", "package.json", "version.txt"],
    "versionPath": "version",
    "projects": {
      "include": ["libs/*", "apps/*"],
      "exclude": ["*-e2e"],
      "skip": ["tools", "docs"]
    },
    "projectConfigs": {
      "my-lib": {
        "registry": {
          "type": "npm",
          "url": "https://registry.npmjs.org",
          "access": "public"
        },
        "buildTarget": "build"
      },
      "internal-tool": {
        "skip": true
      }
    }
  }
}
```

## Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `version` | string | Explicit version to release | - |
| `releaseAs` | string | Version bump type: major, minor, patch, prerelease | - |
| `preid` | string | Prerelease identifier (alpha, beta, rc) for prerelease bumps | - |
| `firstRelease` | boolean | First release mode - uses git tags/registry as fallback | false |
| `dryRun` | boolean | Preview changes without execution | false |
| `show` | boolean | Show detailed analysis of what would change | false |
| `gitCommit` | boolean | Create git commit | false |
| `gitCommitMessage` | string | Custom commit message (supports placeholders) | - |
| `gitCommitArgs` | string | Additional git commit arguments | - |
| `gitTag` | boolean | Create git tag | false |
| `gitTagMessage` | string | Custom tag message (supports placeholders) | - |
| `gitTagArgs` | string | Additional git tag arguments | - |
| `gitPush` | boolean | Push to remote repository | false |
| `gitPushArgs` | string | Additional git push arguments | - |
| `gitRemote` | string | Git remote name | origin |
| `stageChanges` | boolean | Stage changes without committing | - |
| `publish` | boolean | Publish to registry after release | false |
| `registryType` | string | Registry type: npm, nexus, custom | npm |
| `registry` | string | Registry URL | - |
| `distTag` | string | Distribution tag for npm | latest |
| `access` | string | Package access: public, restricted | public |
| `buildTarget` | string | Build target to run before publishing | - |
| `versionFile` | string | File containing version | project.json |
| `versionPath` | string | JSON path to version field | version |
| `preset` | string | Changelog preset (angular, conventionalcommits, etc.) | angular |
| `workspaceChangelog` | boolean | Generate workspace-level changelog | false |
| `projectChangelogs` | boolean | Generate project-level changelogs | false |
| `interactive` | boolean/string | Interactive changelog editing (true, 'workspace', 'projects', 'all') | false |
| `onlyChanged` | boolean | Only release affected projects | false |
| `includeProjects` | array | Project patterns to include | - |
| `excludeProjects` | array | Project patterns to exclude | - |
| `tagNaming` | object | Tag naming configuration | - |
| `trackDeps` | boolean | Track workspace dependencies | false |
| `syncVersions` | boolean | Synchronize versions across projects | false |
| `syncProjects` | array | Specific projects to sync versions with | - |
| `syncStrategy` | string | Sync strategy: highest, bump | bump |
| `releaseGroup` | string | Release group name for this project | - |
| `projectsRelationship` | string | Versioning strategy: independent, fixed | fixed |
| `skipLockFileUpdate` | boolean | Skip updating lock files after version changes | false |
| `updateLockFile` | boolean | Explicitly control lock file updates | true |

## Examples

### Multi-Registry Setup

```json
{
  "projectRelease": {
    "projectConfigs": {
      "public-lib": {
        "registryType": "npm",
        "registry": "https://registry.npmjs.org",
        "access": "public"
      },
      "private-lib": {
        "registryType": "nexus",
        "registry": "https://nexus.internal.com"
      },
      "demo-app": {
        "skip": true
      }
    }
  }
}
```

### Version File Configurations

```bash
# Standard project.json
npx nx run my-lib:project-release

# Package.json compatibility
npx nx run my-lib:project-release --versionFile=package.json

# Nested JSON path
npx nx run my-lib:project-release --versionFile=manifest.json --versionPath=app.version

# Plain text file
npx nx run my-lib:project-release --versionFile=VERSION.txt
```

## CI/CD Integration

### GitHub Actions

#### Automated Release on Push to Main

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    branches: [main]
    paths-ignore:
      - '**.md'
      - 'docs/**'

permissions:
  contents: write
  packages: write

jobs:
  release:
    runs-on: ubuntu-latest
    # Skip if commit message contains [skip ci] or is a release commit
    if: "!contains(github.event.head_commit.message, '[skip ci]') && !contains(github.event.head_commit.message, 'chore(release)')"

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: npm ci

      - name: Configure Git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Build
        run: npx nx build my-project

      - name: Version and Tag
        run: |
          npx nx run my-project:version \
            --gitCommit \
            --gitTag \
            --gitCommitMessage="chore(release): my-project version {version} [skip ci]" \
            --gitTagMessage="Release v{version}"

      - name: Generate Changelog
        run: npx nx run my-project:changelog

      - name: Push changes
        run: git push origin main --follow-tags

      - name: Get version
        id: version
        run: |
          VERSION=$(node -p "require('./packages/my-project/package.json').version")
          echo "version=$VERSION" >> $GITHUB_OUTPUT

      - name: Create GitHub Release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release create "v${{ steps.version.outputs.version }}" \
            --title "Release v${{ steps.version.outputs.version }}" \
            --notes-file CHANGELOG.md \
            --target main

      - name: Publish to npm
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: npx nx run my-project:publish
```

#### Manual Release Workflow

Create `.github/workflows/manual-release.yml` for on-demand releases:

```yaml
name: Manual Release

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version (e.g., 1.2.0) or leave empty for auto-detect'
        required: false
      releaseAs:
        description: 'Release type'
        required: false
        type: choice
        options:
          - ''
          - major
          - minor
          - patch
          - prerelease
      dryRun:
        description: 'Dry run (preview only)'
        type: boolean
        default: false

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - run: npm ci

      - name: Configure Git
        if: ${{ !inputs.dryRun }}
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Release
        run: |
          CMD="npx nx run my-project:project-release"
          ${{ inputs.version && format('CMD="$CMD --version={0}"', inputs.version) || '' }}
          ${{ inputs.releaseAs && format('CMD="$CMD --releaseAs={0}"', inputs.releaseAs) || '' }}
          ${{ inputs.dryRun && 'CMD="$CMD --dryRun"' || 'CMD="$CMD --gitCommit --gitTag --publish"' }}
          eval $CMD
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Push changes
        if: ${{ !inputs.dryRun }}
        run: git push origin main --follow-tags
```

#### Release Affected Projects Only

```yaml
name: Release Affected

on:
  push:
    branches: [main]

jobs:
  release-affected:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - run: npm ci

      - name: Configure Git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Release affected projects
        run: |
          npx nx run-many \
            --target=project-release \
            --projects=affected \
            --base=origin/main~1 \
            --gitCommit \
            --gitTag \
            --publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Required Secrets

Add these secrets to your GitHub repository (`Settings` → `Secrets and variables` → `Actions`):

- **`NPM_TOKEN`**: npm authentication token for publishing
  - Get from https://www.npmjs.com/settings/YOUR_USERNAME/tokens
  - Use "Automation" type token
  - Granular access token recommended for better security

### GitLab CI/CD

Create `.gitlab-ci.yml`:

```yaml
stages:
  - build
  - release

release:
  stage: release
  image: node:22
  only:
    - main
  except:
    variables:
      - $CI_COMMIT_MESSAGE =~ /\[skip ci\]/
  script:
    - npm ci
    - git config user.name "${GITLAB_USER_NAME}"
    - git config user.email "${GITLAB_USER_EMAIL}"
    - npx nx run my-project:project-release --gitCommit --gitTag --publish
    - git push origin main --follow-tags
  variables:
    NODE_AUTH_TOKEN: $NPM_TOKEN
```

### CircleCI

Create `.circleci/config.yml`:

```yaml
version: 2.1

jobs:
  release:
    docker:
      - image: cimg/node:22.0
    steps:
      - checkout
      - restore_cache:
          keys:
            - v1-deps-{{ checksum "package-lock.json" }}
      - run: npm ci
      - save_cache:
          paths:
            - node_modules
          key: v1-deps-{{ checksum "package-lock.json" }}
      - run:
          name: Configure Git
          command: |
            git config user.name "CircleCI"
            git config user.email "ci@circleci.com"
      - run:
          name: Release
          command: npx nx run my-project:project-release --gitCommit --gitTag --publish
      - run:
          name: Push changes
          command: git push origin main --follow-tags

workflows:
  release:
    jobs:
      - release:
          filters:
            branches:
              only: main
```

### Tips for CI/CD

1. **Always use `fetch-depth: 0`** for accurate conventional commits analysis
2. **Configure git user** before running version/changelog executors
3. **Use `[skip ci]`** in commit messages to prevent release loops
4. **Store npm tokens** as encrypted secrets
5. **Test with `--dryRun`** first to validate your workflow
6. **Use `--show`** locally to preview changes before pushing

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, guidelines, and contribution process.

## License

MIT