import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Tree, readProjectConfiguration, addProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import configureArtifactGenerator from './generator.js';

// Mock logger and formatFiles to suppress output during tests
jest.mock('@nx/devkit', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = jest.requireActual('@nx/devkit') as any;
  return {
    ...actual,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    formatFiles: jest.fn().mockImplementation(() => Promise.resolve()),
  };
});

// Mock Enquirer to prevent interactive prompts in tests
// The generator does `const { prompt } = Enquirer` at module level,
// so we need to mock the default export with a prompt property.
jest.mock('enquirer', () => {
  return {
    default: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prompt: jest.fn(async () => ({})),
    },
    __esModule: true,
  };
});

describe('configureArtifactGenerator', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    jest.clearAllMocks();

    // Add a test project to the workspace
    addProjectConfiguration(tree, 'my-app', {
      root: 'apps/my-app',
      targets: {},
    });
  });

  // -------------------------------------------------------------------------
  // Req 15.2 — configure-artifact → artifact target added/updated in project.json
  // -------------------------------------------------------------------------
  it('should add the artifact target to project.json when it does not exist (Req 15.2)', async () => {
    await configureArtifactGenerator(tree, {
      project: 'my-app',
      format: 'tgz',
      sourceDir: 'dist/apps/my-app',
      outputDir: 'dist/artifacts',
      compressionLevel: 6,
      preservePermissions: true,
    });

    const projectConfig = readProjectConfiguration(tree, 'my-app');
    expect(projectConfig.targets?.['artifact']).toBeDefined();
    expect(projectConfig.targets?.['artifact'].executor).toBe('nx-project-release:artifact');
  });

  it('should update the artifact target when it already exists (Req 15.2)', async () => {
    // Pre-configure the project with an existing artifact target
    addProjectConfiguration(tree, 'existing-app', {
      root: 'apps/existing-app',
      targets: {
        artifact: {
          executor: 'nx-project-release:artifact',
          options: { format: 'zip' },
        },
      },
    });

    await configureArtifactGenerator(tree, {
      project: 'existing-app',
      format: 'tgz',
      sourceDir: 'dist/apps/existing-app',
      outputDir: 'dist/artifacts',
      compressionLevel: 6,
      preservePermissions: true,
    });

    const projectConfig = readProjectConfiguration(tree, 'existing-app');
    expect(projectConfig.targets?.['artifact']).toBeDefined();
    expect(projectConfig.targets?.['artifact'].options.format).toBe('tgz');
  });

  it('should set the correct format in artifact target options (Req 15.2)', async () => {
    await configureArtifactGenerator(tree, {
      project: 'my-app',
      format: 'zip',
      sourceDir: 'dist/apps/my-app',
      outputDir: 'dist/artifacts',
      compressionLevel: 6,
      preservePermissions: true,
    });

    const projectConfig = readProjectConfiguration(tree, 'my-app');
    expect(projectConfig.targets?.['artifact'].options.format).toBe('zip');
  });

  it('should set the sourceDir in artifact target options (Req 15.2)', async () => {
    await configureArtifactGenerator(tree, {
      project: 'my-app',
      format: 'tgz',
      sourceDir: 'dist/apps/my-app',
      outputDir: 'dist/artifacts',
      compressionLevel: 6,
      preservePermissions: true,
    });

    const projectConfig = readProjectConfiguration(tree, 'my-app');
    expect(projectConfig.targets?.['artifact'].options.sourceDir).toBe('dist/apps/my-app');
  });

  it('should set the outputDir in artifact target options (Req 15.2)', async () => {
    await configureArtifactGenerator(tree, {
      project: 'my-app',
      format: 'tgz',
      sourceDir: 'dist/apps/my-app',
      outputDir: 'dist/custom-artifacts',
      compressionLevel: 6,
      preservePermissions: true,
    });

    const projectConfig = readProjectConfiguration(tree, 'my-app');
    expect(projectConfig.targets?.['artifact'].options.outputDir).toBe('dist/custom-artifacts');
  });

  it('should set dependsOn in the artifact target (Req 15.2)', async () => {
    await configureArtifactGenerator(tree, {
      project: 'my-app',
      format: 'tgz',
      sourceDir: 'dist/apps/my-app',
      outputDir: 'dist/artifacts',
      compressionLevel: 6,
      preservePermissions: true,
      dependsOn: ['build', 'test'],
    });

    const projectConfig = readProjectConfiguration(tree, 'my-app');
    expect(projectConfig.targets?.['artifact'].dependsOn).toEqual(['build', 'test']);
  });

  it('should configure multiple projects using the projects array (Req 15.2)', async () => {
    addProjectConfiguration(tree, 'app-a', { root: 'apps/app-a', targets: {} });
    addProjectConfiguration(tree, 'app-b', { root: 'apps/app-b', targets: {} });

    await configureArtifactGenerator(tree, {
      projects: ['app-a', 'app-b'],
      format: 'tgz',
      sourceDir: 'dist/{projectName}',
      outputDir: 'dist/artifacts',
      compressionLevel: 6,
      preservePermissions: true,
    });

    const configA = readProjectConfiguration(tree, 'app-a');
    const configB = readProjectConfiguration(tree, 'app-b');
    expect(configA.targets?.['artifact']).toBeDefined();
    expect(configB.targets?.['artifact']).toBeDefined();
  });

  it('should include optional exclude patterns when provided (Req 15.2)', async () => {
    await configureArtifactGenerator(tree, {
      project: 'my-app',
      format: 'tgz',
      sourceDir: 'dist/apps/my-app',
      outputDir: 'dist/artifacts',
      compressionLevel: 6,
      preservePermissions: true,
      exclude: ['**/*.map', '**/*.spec.ts'],
    });

    const projectConfig = readProjectConfiguration(tree, 'my-app');
    expect(projectConfig.targets?.['artifact'].options.exclude).toEqual([
      '**/*.map',
      '**/*.spec.ts',
    ]);
  });
});
