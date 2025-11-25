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

## Quick Usage

```bash
# First release
nx run my-project:version --version=1.0.0 --gitCommit --gitTag --firstRelease
nx run my-project:changelog
nx run my-project:publish

# Subsequent releases
nx run my-project:version --releaseAs=minor --gitCommit --gitTag

# Complete workflow (version + changelog + publish)
nx run my-project:project-release --gitCommit --gitTag

# Preview changes
nx run my-project:version --show

# Batch release (all affected projects)
nx affected --target=version --base=main --releaseAs=minor --gitCommit
```

## Core Executors

- **version** - Bump project version based on conventional commits
- **changelog** - Generate CHANGELOG.md from commits
- **publish** - Publish to NPM, Nexus, S3, or custom registry
- **project-release** - All-in-one executor (version + changelog + publish)

## License

MIT © [Divagnz](https://github.com/Divagnz)
