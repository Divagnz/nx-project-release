import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { ExecutorContext, logger } from '@nx/devkit';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as childProcess from 'child_process';
import releaseExecutor, {
  generateTagName,
  matchesProjectPattern,
  getReleaseNotes,
  collectAssets,
} from './index.js';

// Mock dependencies
jest.mock('@nx/devkit', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('child_process');

const mockExecSync = childProcess.execSync as jest.MockedFunction<
  typeof childProcess.execSync
>;

function makeContext(
  overrides: Partial<ExecutorContext> & { projectRoot?: string } = {}
): ExecutorContext {
  const { projectRoot = 'projects/test-project', ...rest } = overrides;
  return {
    root: '/workspace',
    projectName: 'test-project',
    projectsConfigurations: {
      version: 2,
      projects: {
        'test-project': { root: projectRoot },
      },
    },
    cwd: '/workspace',
    isVerbose: false,
    nxJsonConfiguration: {},
    projectGraph: { nodes: {}, dependencies: {} },
    ...rest,
  } as ExecutorContext;
}

// ─── generateTagName ──────────────────────────────────────────────────────────

describe('generateTagName', () => {
  it('Req 12.5 – independent → {projectName}@{version}', () => {
    const tag = generateTagName('my-lib', '1.2.3', {
      projectsRelationship: 'independent',
    });
    expect(tag).toBe('my-lib@1.2.3');
  });

  it('fixed without release group → v{version}', () => {
    const tag = generateTagName('my-lib', '1.2.3', {
      projectsRelationship: 'fixed',
    });
    expect(tag).toBe('v1.2.3');
  });

  it('tagPrefix overrides everything', () => {
    const tag = generateTagName('my-lib', '1.2.3', {
      tagPrefix: 'release-',
      projectsRelationship: 'independent',
    });
    expect(tag).toBe('release-1.2.3');
  });

  it('custom tagNaming.format is applied', () => {
    const tag = generateTagName('my-lib', '2.0.0', {
      projectsRelationship: 'independent',
      tagNaming: { format: '{projectName}-v{version}' },
    });
    expect(tag).toBe('my-lib-v2.0.0');
  });
});

// ─── matchesProjectPattern ────────────────────────────────────────────────────

describe('matchesProjectPattern', () => {
  it('Req 18.1 – my.lib pattern matches my.lib exactly', () => {
    expect(matchesProjectPattern('my.lib', ['my.lib'])).toBe(true);
  });

  it('Req 18.2 – my.lib pattern does NOT match myXlib', () => {
    expect(matchesProjectPattern('myXlib', ['my.lib'])).toBe(false);
  });

  it('Req 18.3 – @scope/* glob matches @scope/my-lib', () => {
    expect(matchesProjectPattern('@scope/my-lib', ['@scope/*'])).toBe(true);
  });

  it('exact string match works', () => {
    expect(matchesProjectPattern('my-lib', ['my-lib'])).toBe(true);
  });

  it('non-matching pattern returns false', () => {
    expect(matchesProjectPattern('other-lib', ['my-lib'])).toBe(false);
  });

  it('glob does not match across slashes when not present in pattern', () => {
    expect(matchesProjectPattern('@scope/my-lib', ['my-lib'])).toBe(false);
  });
});

// ─── getReleaseNotes ──────────────────────────────────────────────────────────

describe('getReleaseNotes', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-notes-test-'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('Req 12.6 – extracts matching CHANGELOG section', () => {
    const projectDir = path.join(tempDir, 'projects/my-lib');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'CHANGELOG.md'),
      `# Changelog\n\n## [1.2.3] - 2024-01-01\n\nSome release notes here.\n\n## [1.2.2] - 2023-12-01\n\nOlder notes.\n`
    );

    const notes = getReleaseNotes(
      tempDir,
      'projects/my-lib',
      'CHANGELOG.md',
      '1.2.3',
      false
    );

    expect(notes).toContain('Some release notes here.');
    expect(notes).not.toContain('Older notes.');
  });

  it('returns fallback when no CHANGELOG exists and generateNotes is false', () => {
    const notes = getReleaseNotes(
      tempDir,
      'projects/my-lib',
      'CHANGELOG.md',
      '1.0.0',
      false
    );
    expect(notes).toBe('Release 1.0.0');
  });
});

// ─── collectAssets ────────────────────────────────────────────────────────────

describe('collectAssets', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'collect-assets-test-'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('Req 12.7 – explicit paths + globs → deduplicated absolute paths', async () => {
    const projectDir = path.join(tempDir, 'projects/my-lib');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'artifact.zip'), 'zip content');
    fs.writeFileSync(path.join(projectDir, 'notes.txt'), 'notes');

    const result = await collectAssets(
      tempDir,
      'projects/my-lib',
      ['artifact.zip'],
      ['*.txt']
    );

    // Both files should be present
    expect(result.some((p) => p.endsWith('artifact.zip'))).toBe(true);
    expect(result.some((p) => p.endsWith('notes.txt'))).toBe(true);
    // No duplicates
    expect(result.length).toBe(new Set(result).size);
    // All paths are absolute
    result.forEach((p) => expect(path.isAbsolute(p)).toBe(true));
  });

  it('deduplicates when explicit path and glob both match the same file', async () => {
    const projectDir = path.join(tempDir, 'projects/my-lib');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'artifact.zip'), 'zip content');

    const result = await collectAssets(
      tempDir,
      'projects/my-lib',
      ['artifact.zip'],
      ['*.zip']
    );

    expect(result.length).toBe(1);
  });

  it('warns and skips missing explicit assets', async () => {
    const result = await collectAssets(
      tempDir,
      'projects/my-lib',
      ['nonexistent.zip'],
      []
    );
    expect(result).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('nonexistent.zip')
    );
  });
});

// ─── releaseExecutor ─────────────────────────────────────────────────────────

describe('releaseExecutor', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-executor-test-'));
    jest.clearAllMocks();
    // Default: git rev-parse (tag check) throws → tag doesn't exist
    mockExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.startsWith('git rev-parse')) {
        throw new Error('not a valid object name');
      }
      return '' as any;
    });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function makeRealContext(projectRoot = 'projects/test-project'): ExecutorContext {
    return {
      root: tempDir,
      projectName: 'test-project',
      projectsConfigurations: {
        version: 2,
        projects: {
          'test-project': { root: projectRoot },
        },
      },
      cwd: tempDir,
      isVerbose: false,
      nxJsonConfiguration: {},
      projectGraph: {
        nodes: {
          'test-project': {
            name: 'test-project',
            type: 'lib',
            data: { root: projectRoot },
          },
        },
        dependencies: {},
      },
    } as ExecutorContext;
  }

  describe('version from project.json', () => {
    it('Req 12.1 – reads version from project.json and uses it for tag name', async () => {
      const projectDir = path.join(tempDir, 'projects/test-project');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, 'project.json'),
        JSON.stringify({ version: '3.0.0' })
      );

      const context = makeRealContext();
      const result = await releaseExecutor({ dryRun: true }, context);

      expect(result.success).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('3.0.0')
      );
    });
  });

  describe('dryRun mode', () => {
    it('Req 12.2 – dryRun: true → no git or gh commands invoked', async () => {
      const projectDir = path.join(tempDir, 'projects/test-project');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, 'project.json'),
        JSON.stringify({ version: '1.0.0' })
      );

      const context = makeRealContext();
      const result = await releaseExecutor({ dryRun: true }, context);

      expect(result.success).toBe(true);
      // execSync should not have been called for git/gh operations
      const gitCalls = mockExecSync.mock.calls.filter(
        (args) =>
          typeof args[0] === 'string' &&
          (args[0].startsWith('git') || args[0].startsWith('gh'))
      );
      expect(gitCalls).toHaveLength(0);
    });
  });

  describe('gitPush', () => {
    it('Req 12.3 – gitPush: true → git push origin <tag> invoked', async () => {
      const projectDir = path.join(tempDir, 'projects/test-project');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, 'project.json'),
        JSON.stringify({ version: '1.0.0' })
      );

      const context = makeRealContext();
      const result = await releaseExecutor({ gitPush: true }, context);

      expect(result.success).toBe(true);
      const pushCall = mockExecSync.mock.calls.find(
        (args) =>
          typeof args[0] === 'string' && args[0].includes('git push origin')
      );
      expect(pushCall).toBeDefined();
      expect(pushCall![0]).toContain('test-project@1.0.0');
    });
  });

  describe('GitHub release', () => {
    it('Req 12.4 – createGitHubRelease: true with gh unavailable → { success: false }', async () => {
      const projectDir = path.join(tempDir, 'projects/test-project');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, 'project.json'),
        JSON.stringify({ version: '1.0.0' })
      );

      // Make gh --version throw (gh not available), but git commands succeed
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.startsWith('git rev-parse')) {
          throw new Error('not a valid object name');
        }
        if (typeof cmd === 'string' && cmd === 'gh --version') {
          throw new Error('gh: command not found');
        }
        return '' as any;
      });

      const context = makeRealContext();
      const result = await releaseExecutor(
        {
          createGitHubRelease: true,
          owner: 'my-org',
          repo: 'my-repo',
        },
        context
      );

      expect(result.success).toBe(false);
    });
  });
});
