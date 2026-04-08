import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Tree, readProjectConfiguration, addProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import configureReleaseGenerator from './generator.js';

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
jest.mock('enquirer', () => ({
  default: {
    prompt: jest.fn(),
  },
}));

describe('configureReleaseGenerator', () => {
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
  // Req 15.4 — configure-release → release target added/updated in project.json
  // -------------------------------------------------------------------------
  it('should add the release target to project.json when it does not exist (Req 15.4)', async () => {
    await configureReleaseGenerator(tree, {
      projects: ['my-app'],
      interactive: false,
      platform: 'github',
      releaseNotes: 'changelog',
      changelogFile: 'CHANGELOG.md',
    });

    const projectConfig = readProjectConfiguration(tree, 'my-app');
    expect(projectConfig.targets?.['release']).toBeDefined();
    expect(projectConfig.targets?.['release'].executor).toBe('nx-project-release:release');
  });

  it('should update the release target when it already exists (Req 15.4)', async () => {
    // Pre-configure the project with an existing release target
    addProjectConfiguration(tree, 'existing-app', {
      root: 'apps/existing-app',
      targets: {
        release: {
          executor: 'nx-project-release:release',
          options: { prerelease: false },
        },
      },
    });

    await configureReleaseGenerator(tree, {
      projects: ['existing-app'],
      interactive: false,
      platform: 'github',
      releaseNotes: 'changelog',
      changelogFile: 'CHANGELOG.md',
      prerelease: true,
    });

    const projectConfig = readProjectConfiguration(tree, 'existing-app');
    expect(projectConfig.targets?.['release']).toBeDefined();
    expect(projectConfig.targets?.['release'].options.prerelease).toBe(true);
  });

  it('should set prerelease option in release target when provided (Req 15.4)', async () => {
    await configureReleaseGenerator(tree, {
      projects: ['my-app'],
      interactive: false,
      platform: 'github',
      releaseNotes: 'changelog',
      changelogFile: 'CHANGELOG.md',
      prerelease: true,
    });

    const projectConfig = readProjectConfiguration(tree, 'my-app');
    expect(projectConfig.targets?.['release'].options.prerelease).toBe(true);
  });

  it('should set draft option in release target when provided (Req 15.4)', async () => {
    await configureReleaseGenerator(tree, {
      projects: ['my-app'],
      interactive: false,
      platform: 'github',
      releaseNotes: 'changelog',
      changelogFile: 'CHANGELOG.md',
      draft: true,
    });

    const projectConfig = readProjectConfiguration(tree, 'my-app');
    expect(projectConfig.targets?.['release'].options.draft).toBe(true);
  });

  it('should configure multiple projects at once (Req 15.4)', async () => {
    addProjectConfiguration(tree, 'app-a', { root: 'apps/app-a', targets: {} });
    addProjectConfiguration(tree, 'app-b', { root: 'apps/app-b', targets: {} });

    await configureReleaseGenerator(tree, {
      projects: ['app-a', 'app-b'],
      interactive: false,
      platform: 'github',
      releaseNotes: 'changelog',
      changelogFile: 'CHANGELOG.md',
    });

    const configA = readProjectConfiguration(tree, 'app-a');
    const configB = readProjectConfiguration(tree, 'app-b');
    expect(configA.targets?.['release']).toBeDefined();
    expect(configB.targets?.['release']).toBeDefined();
  });

  it('should configure release target using single project option (Req 15.4)', async () => {
    await configureReleaseGenerator(tree, {
      project: 'my-app',
      interactive: false,
      platform: 'github',
      releaseNotes: 'changelog',
      changelogFile: 'CHANGELOG.md',
    });

    const projectConfig = readProjectConfiguration(tree, 'my-app');
    expect(projectConfig.targets?.['release']).toBeDefined();
  });

  it('should attach asset patterns when project has artifact target and attachArtifacts is true (Req 15.4)', async () => {
    addProjectConfiguration(tree, 'app-with-artifact', {
      root: 'apps/app-with-artifact',
      targets: {
        artifact: {
          executor: 'nx-project-release:artifact',
          options: {
            outputDir: 'dist/artifacts',
            artifactName: '{projectName}-{version}.tgz',
          },
        },
      },
    });

    await configureReleaseGenerator(tree, {
      projects: ['app-with-artifact'],
      interactive: false,
      platform: 'github',
      releaseNotes: 'changelog',
      changelogFile: 'CHANGELOG.md',
      attachArtifacts: true,
    });

    const projectConfig = readProjectConfiguration(tree, 'app-with-artifact');
    expect(projectConfig.targets?.['release'].options.assetPatterns).toBeDefined();
    expect(projectConfig.targets?.['release'].options.assetPatterns.length).toBeGreaterThan(0);
  });
});
