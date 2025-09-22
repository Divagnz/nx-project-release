# Project Release Plugin

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

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

## Quick Start

```bash
# Install dependencies
npm install

# Build the plugin
npx nx build project-release

# Test the plugin
npx nx test project-release

# Local installation in another workspace
npm install --save-dev /path/to/project-release/dist/project-release
```

## Development

### Project Structure

```
project-release/
├── project-release/          # Main plugin project
│   ├── src/                  # Plugin entry point
│   ├── release/              # Release executor implementation
│   │   ├── release.ts        # Main executor logic
│   │   ├── schema.json       # Configuration schema
│   │   └── schema.d.ts       # TypeScript definitions
│   ├── executors.json        # Executor registration
│   └── project.json          # Project configuration
├── project-release-e2e/      # End-to-end tests
└── dist/                     # Built output
```

### Development Workflow

1. **Make Changes**: Edit files in `project-release/`
2. **Build**: `npx nx build project-release`
3. **Test**: `npx nx test project-release`
4. **E2E Test**: `npx nx e2e project-release-e2e`

### Building the Plugin

```bash
# Clean build
npx nx reset
npx nx build project-release

# Watch mode for development
npx nx build project-release --watch
```

### Testing

```bash
# Unit tests
npx nx test project-release

# E2E tests
npx nx e2e project-release-e2e

# Test with coverage
npx nx test project-release --coverage
```

### Local Development & Testing

To test the plugin in another workspace:

```bash
# 1. Build the plugin
npx nx build project-release

# 2. Navigate to your test workspace
cd /path/to/test-workspace

# 3. Install the local plugin
npm install --save-dev /path/to/project-release/dist/project-release

# 4. Configure a project to use the plugin
# Add to project.json:
{
  "targets": {
    "release": {
      "executor": "project-release:release",
      "options": {
        "dryRun": true
      }
    }
  }
}

# 5. Test the executor
npx nx run my-project:release --dryRun
```

### Contributing

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Make** your changes
4. **Test** your changes: `npx nx test project-release`
5. **Build** successfully: `npx nx build project-release`
6. **Commit** your changes: `git commit -m 'Add amazing feature'`
7. **Push** to the branch: `git push origin feature/amazing-feature`
8. **Open** a Pull Request

### Plugin Development Tips

#### Adding New Options

1. Update `release/schema.json` with new property
2. Update `release/schema.d.ts` interface
3. Implement logic in `release/release.ts`
4. Rebuild: `npx nx build project-release`

#### Debugging

```bash
# Add console.log statements in release.ts
console.log('Debug info:', { options, context });

# Rebuild and test
npx nx build project-release
npx nx run test-project:release --dryRun
```

#### Testing with Different Nx Versions

```bash
# Test compatibility
npm install nx@latest
npx nx build project-release
npx nx test project-release
```

## Architecture

### Executor Implementation

- **Entry Point**: `release/release.ts`
- **Schema**: `release/schema.json` defines all configuration options
- **Type Safety**: `release/schema.d.ts` provides TypeScript definitions

### Key Functions

- `runExecutor()` - Main executor entry point
- `readVersionFromFile()` - Handles custom version files
- `writeVersionToFile()` - Updates version in files
- `publishPackage()` - Multi-registry publishing
- `generateTagName()` - Flexible tag naming
- `isProjectAffected()` - Affected project detection

## Scripts

```bash
# Development
npm run build         # Build the plugin
npm run test          # Run tests
npm run lint          # Lint code
npm run e2e           # E2E tests

# Nx commands
npx nx graph          # View project dependencies
npx nx build project-release
npx nx test project-release
npx nx e2e project-release-e2e
```

## Publishing

```bash
# Build for distribution
npx nx build project-release

# Publish to npm (when ready)
cd dist/project-release
npm publish
```

## Documentation

- **Plugin Documentation**: See `project-release/README.md` for usage instructions
- **API Reference**: Generated from schema.json and TypeScript definitions
- **Examples**: Multiple usage examples in the plugin README

## Links

- [Nx Plugin Development Guide](https://nx.dev/extending-nx/intro/getting-started)
- [Nx Executor Documentation](https://nx.dev/extending-nx/recipes/local-executors)
- [Nx Schema Documentation](https://nx.dev/extending-nx/recipes/local-executors#executor-schema)

---

Built with ❤️ using [Nx](https://nx.dev)