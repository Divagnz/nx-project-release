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

```bash
# Release affected projects in CI
nx run-many --target=release --projects=affected --onlyChanged --base=origin/main

# Release specific projects
nx run-many --target=release --projects=lib-a,lib-b --publish
```

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