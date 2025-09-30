# Project Release Plugin

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

A polyglot Nx plugin for releasing any project type using project.json and conventional commits, supporting multiple registries and flexible configuration.

## 📖 Documentation

For complete documentation, usage examples, and configuration options, please see the main README:

**[👉 View Full Documentation](../../README.md)**

## Quick Installation

```bash
npm install --save-dev @divagnz/project-release
```

## Quick Usage

```bash
# Release a single project
npx nx run my-project:project-release

# Release all projects in workspace
npx nx run project-release

# Show what would change
npx nx run my-project:project-release --show --dryRun
```

## Features

- ✅ **Polyglot Support** - Works with any project type
- ✅ **Modular Executors** - version, changelog, publish, workflow
- ✅ **Multiple Registries** - npm, Nexus, custom registries
- ✅ **Dependency Tracking** - Auto-version dependent projects
- ✅ **Sync Versioning** - Synchronize versions across projects
- ✅ **Flexible Configuration** - Workspace and project-level settings

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development setup and guidelines.

## License

MIT