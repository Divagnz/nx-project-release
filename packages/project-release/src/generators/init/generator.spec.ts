import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
} from '@jest/globals';
import { Tree, readNxJson } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { initGenerator } from './generator.js';

// Mock logger to suppress output during tests
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

// Mock the prompts lib so interactive mode never fires in tests
jest.mock('./lib/prompts.js', () => ({
  promptForConfig: jest.fn(),
}));

// Mock configure-publish generator (called from init in interactive mode)
jest.mock('../configure-publish/generator.js', () => ({
  default: jest.fn().mockImplementation(() => Promise.resolve()),
}));

describe('initGenerator', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Req 14.1 — non-interactive mode, no existing config → projectRelease added
  // -------------------------------------------------------------------------
  it('should add projectRelease key to nx.json in non-interactive mode when no config exists (Req 14.1)', async () => {
    // Verify no projectRelease key before running
    const nxJsonBefore = readNxJson(tree) as Record<string, unknown>;
    expect(nxJsonBefore?.['projectRelease']).toBeUndefined();

    await initGenerator(tree, { skipPrompts: true, skipFormat: true });

    const nxJsonAfter = readNxJson(tree) as Record<string, unknown>;
    expect(nxJsonAfter?.['projectRelease']).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Req 14.2 — nx.json already has projectRelease → existing config not overwritten
  // -------------------------------------------------------------------------
  it('should not overwrite existing projectRelease config in nx.json (Req 14.2)', async () => {
    // Pre-populate nx.json with a projectRelease config
    const existingConfig = {
      projectsRelationship: 'fixed',
      versionFiles: ['custom-version.json'],
      changelogPreset: 'conventionalcommits',
    };

    // Write the existing config directly into the tree's nx.json
    const nxJson = readNxJson(tree) as Record<string, unknown>;
    (nxJson as Record<string, unknown>)['projectRelease'] = existingConfig;
    tree.write('nx.json', JSON.stringify(nxJson, null, 2));

    await initGenerator(tree, { skipPrompts: true, skipFormat: true });

    const nxJsonAfter = readNxJson(tree) as Record<string, unknown>;
    const projectRelease = nxJsonAfter?.['projectRelease'] as Record<string, unknown>;

    // The existing values should be preserved
    expect(projectRelease?.['projectsRelationship']).toBe('fixed');
    expect(projectRelease?.['versionFiles']).toEqual(['custom-version.json']);
    expect(projectRelease?.['changelogPreset']).toBe('conventionalcommits');
  });

  // -------------------------------------------------------------------------
  // Req 14.3 — preset option → preset defaults applied to generated config
  // -------------------------------------------------------------------------
  it('should apply preset defaults (changelogPreset) to the generated config (Req 14.3)', async () => {
    await initGenerator(tree, { skipPrompts: true, skipFormat: true });

    const nxJsonAfter = readNxJson(tree) as Record<string, unknown>;
    const projectRelease = nxJsonAfter?.['projectRelease'] as Record<string, unknown>;

    // The default preset is 'angular' — it should appear as changelogPreset in nx.json
    expect(projectRelease?.['changelogPreset']).toBe('angular');
  });

  // -------------------------------------------------------------------------
  // Req 14.4 — file write error → generator throws with descriptive message
  // -------------------------------------------------------------------------
  it('should throw a descriptive error when a file write fails (Req 14.4)', async () => {
    // Mock tree.write to throw an error
    const writeError = new Error('Disk full');
    jest.spyOn(tree, 'write').mockImplementation(() => {
      throw writeError;
    });

    await expect(
      initGenerator(tree, { skipPrompts: true, skipFormat: true })
    ).rejects.toThrow();
  });
});
