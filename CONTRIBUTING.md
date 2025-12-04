# Contributing to Project Release Plugin

Thank you for your interest in contributing to the Project Release Plugin! This guide will help you get started with development.

## Development Setup

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- Git

### Initial Setup

```bash
# Clone the repository
git clone <repository-url>
cd nx-project-release

# Install dependencies
npm install

# Build the plugin
npx nx build project-release

# Run tests
npx nx test project-release
```

## Development Workflow

### Project Structure

```
packages/project-release/
├── src/
│   ├── executors/
│   │   ├── version/             # Version executor
│   │   ├── changelog/           # Changelog executor
│   │   ├── publish/             # Publish executor
│   │   └── project-release/     # Main workflow executor
│   └── index.ts                 # Plugin entry point
├── executors.json               # Executor registration
├── package.json                 # Package configuration
└── project.json                 # Nx project configuration
```

### Development Commands

```bash
# Build the plugin
npx nx build project-release

# Watch mode for development
npx nx build project-release --watch

# Run unit tests
npx nx test project-release

# Run tests with coverage
npx nx test project-release --coverage

# Lint the code
npx nx lint project-release

# Clean build artifacts
npx nx reset
```

### Making Changes

1. **Create a feature branch**: `git checkout -b feature/your-feature-name`
2. **Make your changes** in the appropriate executor directory
3. **Update schemas** if adding new options:
   - Update `schema.json` with new properties
   - Update TypeScript interfaces if needed
4. **Build the plugin**: `npx nx build project-release`
5. **Test your changes**: `npx nx test project-release`
6. **Test locally** (see Local Testing section below)

### Adding New Options

When adding new configuration options:

1. **Update the schema** in `src/executors/{executor}/schema.json`:

   ```json
   {
     "properties": {
       "newOption": {
         "type": "boolean",
         "default": false,
         "description": "Description of the new option"
       }
     }
   }
   ```

2. **Update the TypeScript interface** in the executor's `index.ts`:

   ```typescript
   export interface ExecutorSchema {
     newOption?: boolean;
     // ... other options
   }
   ```

3. **Implement the logic** in the executor function
4. **Rebuild**: `npx nx build project-release`

### Local Testing

To test your changes in a real workspace:

```bash
# 1. Build the plugin
npx nx build project-release

# 2. Navigate to your test workspace
cd /path/to/test-workspace

# 3. Install the local plugin
npm install --save-dev /path/to/nx-project-release/dist/packages/project-release

# 4. Configure a project to use the plugin (project.json):
{
  "targets": {
    "project-release": {
      "executor": "@divagnz/project-release:project-release",
      "options": {
        "dryRun": true
      }
    }
  }
}

# 5. Test the executor
npx nx run my-project:project-release --dryRun --show
```

### Testing Strategy

#### Unit Tests

- Test individual functions and utilities
- Mock external dependencies (git, fs, etc.)
- Cover edge cases and error conditions

#### Integration Tests

- Test executor with real file system
- Test git operations with test repositories
- Test different project configurations

#### Manual Testing

- Test with different project types (Node.js, Python, etc.)
- Test workspace-level operations
- Test different registry types
- Test dry-run vs. actual execution

### Debugging

#### Adding Debug Output

```typescript
// Add console.log statements for debugging
console.log('Debug info:', { options, context });

// Use the show flag for detailed analysis
if (options.show) {
  console.log('Analysis results:', analysisData);
}
```

#### Common Debugging Steps

1. **Enable verbose output**: Use `--show` flag
2. **Check file paths**: Verify version files exist
3. **Test git operations**: Ensure git is configured
4. **Validate schemas**: Check option types and defaults

### Code Style

#### TypeScript Guidelines

- Use strict TypeScript settings
- Provide proper type annotations
- Use interfaces for options and return types
- Handle errors appropriately

#### Nx Plugin Best Practices

- Follow Nx executor patterns
- Use proper schema validation
- Provide helpful error messages
- Support dry-run mode for all operations

#### Git Commit Convention

We use conventional commits:

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes
- `refactor:` - Code refactoring
- `test:` - Test additions/changes
- `chore:` - Maintenance tasks

### Pull Request Process

1. **Fork the repository** and create your feature branch
2. **Make your changes** following the guidelines above
3. **Add or update tests** as appropriate
4. **Update documentation** if needed
5. **Ensure all tests pass**: `npx nx test project-release`
6. **Ensure build succeeds**: `npx nx build project-release`
7. **Submit a pull request** with:
   - Clear description of changes
   - Link to any related issues
   - Screenshots/examples if UI-related

### Release Process

#### Version Management

- Follow semantic versioning (semver)
- Update version in `package.json`
- Create git tags for releases
- Update changelog

#### Publishing Steps

```bash
# 1. Ensure clean working directory
git status

# 2. Run full test suite
npx nx test project-release
npx nx lint project-release

# 3. Build for production
npx nx build project-release

# 4. Update version and publish
cd dist/packages/project-release
npm publish
```

## Architecture Overview

### Executor Design

- **Modular approach**: Separate executors for version, changelog, publish, and workflow
- **Schema-driven**: All options defined in JSON schemas
- **Type-safe**: Full TypeScript support
- **Configurable**: Support for workspace and project-level configuration

### Key Components

- **Version Executor**: Handles semantic versioning and git tagging
- **Changelog Executor**: Generates changelogs from conventional commits
- **Publish Executor**: Publishes to various registry types
- **Project-Release Executor**: Orchestrates the complete workflow

### Configuration Hierarchy

1. Command-line options (highest priority)
2. Project-level configuration (project.json)
3. Workspace-level configuration (nx.json)
4. Default values (lowest priority)

## Getting Help

- **Issues**: Report bugs and request features on GitHub Issues
- **Discussions**: Ask questions in GitHub Discussions
- **Documentation**: Check the main README for usage examples
- **Code Review**: All contributions are reviewed for quality and consistency

## Code of Conduct

Please note that this project adheres to a code of conduct. By participating, you are expected to uphold this code:

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Maintain a positive environment

Thank you for contributing to making the Project Release Plugin better! 🚀
