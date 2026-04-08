import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Tree, readProjectConfiguration, addProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import configureChangelogGenerator from './generator.js';

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

describe('configureChangelogGenerator', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    jest.clearAllMocks();

    // Add a test project to the workspace
    addProjectConfiguration(tree, 'my-lib', {
      root: 'libs/my-lib',
      targets: {},
    });
  });

  // -------------------------------------------------------------------------
  // Req 15.3 — configure-changelog → changelog target added/updated in project.json
  // -------------------------------------------------------------------------
  it('should add the changelog target to project.json when it does not exist (Req 15.3)', async () => {
    await configureChangelogGenerator(tree, {
      projects: ['my-lib'],
      interactive: false,
    });

    const projectConfig = readProjectConfiguration(tree, 'my-lib');
    expect(projectConfig.targets?.['changelog']).toBeDefined();
    expect(projectConfig.targets?.['changelog'].executor).toBe('nx-project-release:changelog');
  });

  it('should update the changelog target when it already exists (Req 15.3)', async () => {
    // Pre-configure the project with an existing changelog target
    addProjectConfiguration(tree, 'existing-lib', {
      root: 'libs/existing-lib',
      targets: {
        changelog: {
          executor: 'nx-project-release:changelog',
          options: { preset: 'angular' },
        },
      },
    });

    await configureChangelogGenerator(tree, {
      projects: ['existing-lib'],
      interactive: false,
      preset: 'conventionalcommits',
    });

    const projectConfig = readProjectConfiguration(tree, 'existing-lib');
    expect(projectConfig.targets?.['changelog']).toBeDefined();
    expect(projectConfig.targets?.['changelog'].options.preset).toBe('conventionalcommits');
  });

  it('should set default changelogFile to CHANGELOG.md when not specified (Req 15.3)', async () => {
    await configureChangelogGenerator(tree, {
      projects: ['my-lib'],
      interactive: false,
    });

    const projectConfig = readProjectConfiguration(tree, 'my-lib');
    expect(projectConfig.targets?.['changelog'].options.changelogFile).toBe('CHANGELOG.md');
  });

  it('should set custom changelogFile when provided (Req 15.3)', async () => {
    await configureChangelogGenerator(tree, {
      projects: ['my-lib'],
      interactive: false,
      changelogFile: 'CHANGES.md',
    });

    const projectConfig = readProjectConfiguration(tree, 'my-lib');
    expect(projectConfig.targets?.['changelog'].options.changelogFile).toBe('CHANGES.md');
  });

  it('should set default preset to angular when not specified (Req 15.3)', async () => {
    await configureChangelogGenerator(tree, {
      projects: ['my-lib'],
      interactive: false,
    });

    const projectConfig = readProjectConfiguration(tree, 'my-lib');
    expect(projectConfig.targets?.['changelog'].options.preset).toBe('angular');
  });

  it('should set custom preset when provided (Req 15.3)', async () => {
    await configureChangelogGenerator(tree, {
      projects: ['my-lib'],
      interactive: false,
      preset: 'conventionalcommits',
    });

    const projectConfig = readProjectConfiguration(tree, 'my-lib');
    expect(projectConfig.targets?.['changelog'].options.preset).toBe('conventionalcommits');
  });

  it('should set releaseCount option when provided (Req 15.3)', async () => {
    await configureChangelogGenerator(tree, {
      projects: ['my-lib'],
      interactive: false,
      releaseCount: 5,
    });

    const projectConfig = readProjectConfiguration(tree, 'my-lib');
    expect(projectConfig.targets?.['changelog'].options.releaseCount).toBe(5);
  });

  it('should set skipUnstable option when provided (Req 15.3)', async () => {
    await configureChangelogGenerator(tree, {
      projects: ['my-lib'],
      interactive: false,
      skipUnstable: false,
    });

    const projectConfig = readProjectConfiguration(tree, 'my-lib');
    expect(projectConfig.targets?.['changelog'].options.skipUnstable).toBe(false);
  });

  it('should configure multiple projects at once (Req 15.3)', async () => {
    addProjectConfiguration(tree, 'lib-a', { root: 'libs/lib-a', targets: {} });
    addProjectConfiguration(tree, 'lib-b', { root: 'libs/lib-b', targets: {} });

    await configureChangelogGenerator(tree, {
      projects: ['lib-a', 'lib-b'],
      interactive: false,
    });

    const configA = readProjectConfiguration(tree, 'lib-a');
    const configB = readProjectConfiguration(tree, 'lib-b');
    expect(configA.targets?.['changelog']).toBeDefined();
    expect(configB.targets?.['changelog']).toBeDefined();
  });
});
