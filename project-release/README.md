# Project Release Plugin

An Nx plugin for releasing projects using project.json and conventional commits, supporting multiple registries and flexible configuration.

## Features

- ✅ **Project.json Integration** - Works without package.json dependency
- ✅ **Multiple Registries** - npm, Nexus, custom registries
- ✅ **Selective Releases** - Only affected projects, include/exclude patterns
- ✅ **Custom Version Files** - project.json, package.json, version.txt, etc.
- ✅ **Flexible Tag Naming** - Custom prefixes, formats, project names
- ✅ **Semver Compliance** - Full semantic versioning support
- ✅ **Git Integration** - Conventional commits and tags
- ✅ **Dry-run Support** - Preview changes before execution

## Installation

### In an existing Nx workspace:

```bash
npm install --save-dev @your-org/project-release
```

### From source:

```bash
# Clone and build
git clone <repository-url>
cd project-release
npm install
nx build project-release

# Install in your workspace
npm install --save-dev /path/to/project-release/dist/project-release
```

## Usage

### Basic Release

```bash
# Automatic patch version bump
nx run my-project:release

# Specific version
nx run my-project:release --version=2.1.0

# Version type bump
nx run my-project:release --releaseAs=minor

# Dry run to preview changes
nx run my-project:release --dryRun
```

### Publishing

```bash
# Release and publish to npm
nx run my-project:release --publish --registry=https://registry.npmjs.org

# Publish to Nexus
nx run my-project:release --publish --registryType=nexus --registry=https://nexus.company.com

# Custom registry
nx run my-project:release --publish --registryType=custom --registry=https://custom-registry.com
```

### Selective Releases

```bash
# Only affected projects
nx run my-project:release --onlyChanged

# Include specific patterns
nx run my-project:release --includeProjects=libs/*,apps/web-*

# Exclude patterns
nx run my-project:release --excludeProjects=*test*,*demo*
```

### Custom Version Files

```bash
# Use package.json
nx run my-project:release --versionFile=package.json

# Use custom file with nested path
nx run my-project:release --versionFile=app.json --versionPath=metadata.version

# Use plain text file
nx run my-project:release --versionFile=VERSION
```

### Tag Naming

```bash
# Custom tag prefix
nx run my-project:release --tagNaming.prefix="release-"

# Custom format
nx run my-project:release --tagNaming.format="{projectName}-{version}"

# Without project name
nx run my-project:release --tagNaming.includeProjectName=false
```

## Configuration

### Project Configuration

Add to your project's `project.json`:

```json
{
  "targets": {
    "release": {
      "executor": "@your-org/project-release:release",
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
  "release": {
    "tagPrefix": "v",
    "tagNaming": {
      "format": "{projectName}-v{version}"
    },
    "publish": {
      "registryType": "nexus",
      "registry": "https://nexus.internal.com",
      "buildTarget": "build"
    },
    "projects": {
      "my-lib": {
        "registryType": "npm",
        "access": "public"
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
| `dryRun` | boolean | Preview changes without execution | false |
| `publish` | boolean | Publish to registry after release | false |
| `registryType` | string | Registry type: npm, nexus, custom | npm |
| `registry` | string | Registry URL | - |
| `distTag` | string | Distribution tag for npm | latest |
| `access` | string | Package access: public, restricted | public |
| `buildTarget` | string | Build target to run before publishing | - |
| `versionFile` | string | File containing version | project.json |
| `versionPath` | string | JSON path to version field | version |
| `onlyChanged` | boolean | Only release affected projects | false |
| `includeProjects` | array | Project patterns to include | - |
| `excludeProjects` | array | Project patterns to exclude | - |
| `skipCommit` | boolean | Skip git commit | false |
| `skipTag` | boolean | Skip git tag | false |
| `tagNaming` | object | Tag naming configuration | - |

## Examples

### Multi-Registry Setup

```json
{
  "release": {
    "projects": {
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
nx run my-lib:release

# Package.json compatibility
nx run my-lib:release --versionFile=package.json

# Nested JSON path
nx run my-lib:release --versionFile=manifest.json --versionPath=app.version

# Plain text file
nx run my-lib:release --versionFile=VERSION.txt
```

### CI/CD Integration

#### Basic Nx Commands

```bash
# Release affected projects in CI
nx run-many --target=release --projects=affected --onlyChanged --base=origin/main

# Release specific projects
nx run-many --target=release --projects=lib-a,lib-b --publish
```

#### GitHub Actions Examples

##### Automated Release on Main Branch

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install project-release plugin
        run: npm install --save-dev @your-org/project-release

      - name: Configure Git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Release affected projects
        run: |
          npx nx run-many --target=release --projects=affected \
            --onlyChanged --base=origin/main~1 \
            --publish --registryType=npm
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

##### Manual Release Workflow

```yaml
# .github/workflows/manual-release.yml
name: Manual Release

on:
  workflow_dispatch:
    inputs:
      projects:
        description: 'Projects to release (comma-separated)'
        required: true
        default: 'all'
      version-type:
        description: 'Version bump type'
        required: true
        default: 'patch'
        type: choice
        options:
          - patch
          - minor
          - major
          - prerelease
      dry-run:
        description: 'Dry run (preview only)'
        required: false
        default: false
        type: boolean

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Configure Git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Release projects
        run: |
          if [ "${{ github.event.inputs.projects }}" == "all" ]; then
            npx nx run-many --target=release --all \
              --releaseAs=${{ github.event.inputs.version-type }} \
              ${{ github.event.inputs.dry-run == 'true' && '--dryRun' || '--publish' }}
          else
            npx nx run-many --target=release \
              --projects="${{ github.event.inputs.projects }}" \
              --releaseAs=${{ github.event.inputs.version-type }} \
              ${{ github.event.inputs.dry-run == 'true' && '--dryRun' || '--publish' }}
          fi
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

##### Multi-Registry Release

```yaml
# .github/workflows/multi-registry-release.yml
name: Multi-Registry Release

on:
  push:
    tags: ['v*']

jobs:
  release-npm:
    runs-on: ubuntu-latest
    if: contains(github.ref, 'public-')
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'

      - name: Install and release to npm
        run: |
          npm ci
          npx nx run-many --target=release \
            --projects=public-* --publish \
            --registryType=npm --access=public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

  release-nexus:
    runs-on: ubuntu-latest
    if: contains(github.ref, 'private-')
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install and release to Nexus
        run: |
          npm ci
          npx nx run-many --target=release \
            --projects=private-* --publish \
            --registryType=nexus \
            --registry=${{ secrets.NEXUS_REGISTRY }}
        env:
          NPM_TOKEN: ${{ secrets.NEXUS_TOKEN }}
```

##### Environment-specific Configuration

```yaml
# .github/workflows/release-environments.yml
name: Environment Release

on:
  push:
    branches:
      - main
      - develop
      - 'release/*'

jobs:
  release:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        environment:
          - name: production
            condition: ${{ github.ref == 'refs/heads/main' }}
            registry: npm
            access: public
          - name: staging
            condition: ${{ github.ref == 'refs/heads/develop' }}
            registry: nexus
            access: restricted

    if: matrix.environment.condition
    environment: ${{ matrix.environment.name }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Release to ${{ matrix.environment.name }}
        run: |
          npx nx run-many --target=release --projects=affected \
            --onlyChanged --base=origin/main \
            --publish --registryType=${{ matrix.environment.registry }} \
            --access=${{ matrix.environment.access }}
```

#### Required Secrets

For GitHub Actions, configure these secrets in your repository:

- `NPM_TOKEN` - npm registry authentication token
- `NEXUS_TOKEN` - Nexus repository token (if using Nexus)
- `NEXUS_REGISTRY` - Nexus registry URL (if using Nexus)

## Development

### Building

```bash
nx build project-release
```

### Testing

```bash
nx test project-release
```

### Local Testing

```bash
# Build and test in a workspace
nx build project-release
cd /path/to/test-workspace
npm install /path/to/project-release/dist/project-release
nx run my-project:release --dryRun
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Build and test: `nx build project-release && nx test project-release`
6. Submit a pull request

## License

MIT