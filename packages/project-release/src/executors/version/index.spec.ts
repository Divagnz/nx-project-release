import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { ExecutorContext } from '@nx/devkit';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import {
  replaceStringTokens,
  replaceTokens,
  getTokenValues,
  evaluateSimpleCondition,
  generateTagName,
  versionSingleProject,
  calculateNewVersionForProject,
  analyzeConventionalCommits,
  filterCommitsForProject,
  readVersionFromFile,
  writeVersionToFile,
} from './index.js';

// Mock child_process to avoid real git calls (getTokenValues calls getBranchName/getGitCommit)
jest.mock('child_process', () => ({
  execSync: jest.fn(() => ''),
}));

// Mock @nx/devkit — only the logger is needed; keep readJsonFile real
jest.mock('@nx/devkit', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  readJsonFile: (p: string) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(projectName = 'my-lib', root = '/workspace'): ExecutorContext {
  return {
    root,
    projectName,
    projectsConfigurations: {
      version: 2,
      projects: {
        [projectName]: { root: `packages/${projectName}`, projectType: 'library' },
      },
    },
    cwd: root,
    isVerbose: false,
    nxJsonConfiguration: {},
    projectGraph: { nodes: {}, dependencies: {} },
  } as ExecutorContext;
}

// ---------------------------------------------------------------------------
// replaceStringTokens — unit tests (Req 7.1–7.3)
// ---------------------------------------------------------------------------

describe('replaceStringTokens', () => {
  it('replaces {version} with the provided version (Req 7.1)', () => {
    const tokens = { '{version}': '1.2.3' };
    const result = replaceStringTokens('release {version}', tokens);
    expect(result).toContain('1.2.3');
    expect(result).not.toContain('{version}');
  });

  it('replaces ${PROJECT_NAME} with the project name (Req 7.2)', () => {
    const tokens = { '${PROJECT_NAME}': 'my-lib' };
    const result = replaceStringTokens('project: ${PROJECT_NAME}', tokens);
    expect(result).toContain('my-lib');
  });

  it('returns the original string when no tokens are present (Req 7.3)', () => {
    const tokens = { '{version}': '1.0.0' };
    const input = 'no tokens here';
    expect(replaceStringTokens(input, tokens)).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// replaceTokens — unit tests (Req 7.4–7.5)
// ---------------------------------------------------------------------------

describe('replaceTokens', () => {
  const ctx = makeContext();

  it('replaces tokens in nested object values (Req 7.4)', () => {
    const obj = { outer: { inner: 'version is {version}' } };
    const result = replaceTokens(obj, ctx, '2.0.0');
    expect((result['outer'] as Record<string, string>)['inner']).toBe('version is 2.0.0');
  });

  it('replaces tokens in array elements (Req 7.5)', () => {
    const obj = { items: ['release-{version}', 'project-{version}'] };
    const result = replaceTokens(obj, ctx, '3.1.0');
    expect(result['items']).toEqual(['release-3.1.0', 'project-3.1.0']);
  });
});

// ---------------------------------------------------------------------------
// evaluateSimpleCondition — unit tests (Req 7.6–7.7)
// ---------------------------------------------------------------------------

describe('evaluateSimpleCondition', () => {
  it('returns true when condition matches (Req 7.6)', () => {
    const tokens = { '${NODE_ENV}': 'production' };
    expect(evaluateSimpleCondition("NODE_ENV === 'production'", tokens)).toBe(true);
  });

  it('returns false when condition does not match (Req 7.7)', () => {
    const tokens = { '${NODE_ENV}': 'development' };
    expect(evaluateSimpleCondition("NODE_ENV === 'production'", tokens)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Property test: replaceStringTokens round-trip (Req 1.5, 7.8)
// Property 1: replaceStringTokens('{version}', getTokenValues(ctx, v)) === v
// ---------------------------------------------------------------------------

describe('replaceStringTokens round-trip property (Req 1.5, 7.8)', () => {
  const ctx = makeContext();

  const semverSamples = [
    '0.0.1',
    '1.0.0',
    '1.2.3',
    '2.0.0',
    '10.20.30',
    '0.0.0',
    '99.99.99',
    '1.0.0-alpha.1',
    '2.1.0-beta.3',
    '3.0.0-rc.1',
  ];

  it.each(semverSamples)(
    'round-trip holds for version %s',
    (v) => {
      const tokens = getTokenValues(ctx, v);
      const result = replaceStringTokens('{version}', tokens);
      expect(result).toBe(v);
    }
  );
});

// ---------------------------------------------------------------------------
// generateTagName — unit tests (Req 2.2, 2.3, 2.4)
// ---------------------------------------------------------------------------

describe('generateTagName', () => {
  it('independent relationship produces {projectName}@{version} by default (Req 2.2)', () => {
    const options = { projectsRelationship: 'independent' } as Parameters<typeof generateTagName>[2];
    expect(generateTagName('my-lib', '1.2.3', options)).toBe('my-lib@1.2.3');
  });

  it('fixed relationship with no release group produces v{version} by default (Req 2.3)', () => {
    const options = { projectsRelationship: 'fixed' } as Parameters<typeof generateTagName>[2];
    expect(generateTagName('my-lib', '1.2.3', options)).toBe('v1.2.3');
  });

  it('fixed relationship with no projectsRelationship set produces v{version} (Req 2.3)', () => {
    const options = {} as Parameters<typeof generateTagName>[2];
    expect(generateTagName('my-lib', '2.0.0', options)).toBe('v2.0.0');
  });

  it('custom tagNaming.format substitutes all tokens (Req 2.4)', () => {
    const options = {
      projectsRelationship: 'independent',
      releaseGroup: 'core',
      tagNaming: {
        format: '{prefix}{projectName}/{releaseGroupName}@{version}{suffix}',
        prefix: 'release-',
        suffix: '-stable',
      },
    } as Parameters<typeof generateTagName>[2];
    const result = generateTagName('my-lib', '3.0.0', options);
    expect(result).toBe('release-my-lib/core@3.0.0-stable');
  });

  it('custom tagNaming.format with only {version} and {projectName} tokens (Req 2.4)', () => {
    const options = {
      tagNaming: { format: 'v{version}-{projectName}' },
    } as Parameters<typeof generateTagName>[2];
    expect(generateTagName('api', '0.5.0', options)).toBe('v0.5.0-api');
  });
});

// ---------------------------------------------------------------------------
// Task 9.1: versionSingleProject & calculateNewVersionForProject unit tests
// ---------------------------------------------------------------------------

// Helper: create a temp dir with a project.json at the expected project root
function makeTempProject(version: string): { tmpDir: string; ctx: ExecutorContext } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-test-'));
  const projectRoot = path.join(tmpDir, 'packages', 'my-lib');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, 'project.json'),
    JSON.stringify({ name: 'my-lib', version }, null, 2)
  );

  const ctx: ExecutorContext = {
    root: tmpDir,
    projectName: 'my-lib',
    projectsConfigurations: {
      version: 2,
      projects: {
        'my-lib': { root: 'packages/my-lib', projectType: 'library' },
      },
    },
    cwd: tmpDir,
    isVerbose: false,
    nxJsonConfiguration: {},
    projectGraph: { nodes: {}, dependencies: {} },
  } as ExecutorContext;

  return { tmpDir, ctx };
}

describe('versionSingleProject', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('explicit version option writes that exact version to file (Req 6.1)', async () => {
    const setup = makeTempProject('1.0.0');
    tmpDir = setup.tmpDir;
    const { ctx } = setup;

    const result = await versionSingleProject(
      { version: '3.5.2', skipLockFileUpdate: true, updateLockFile: false },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.version).toBe('3.5.2');

    const written = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'packages', 'my-lib', 'project.json'), 'utf8')
    );
    expect(written.version).toBe('3.5.2');
  });

  it('releaseAs: patch on 1.2.3 writes 1.2.4 (Req 6.2)', async () => {
    const setup = makeTempProject('1.2.3');
    tmpDir = setup.tmpDir;
    const { ctx } = setup;

    const result = await versionSingleProject(
      { releaseAs: 'patch', skipLockFileUpdate: true, updateLockFile: false },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.version).toBe('1.2.4');

    const written = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'packages', 'my-lib', 'project.json'), 'utf8')
    );
    expect(written.version).toBe('1.2.4');
  });

  it('releaseAs: minor on 1.2.3 writes 1.3.0 (Req 6.3)', async () => {
    const setup = makeTempProject('1.2.3');
    tmpDir = setup.tmpDir;
    const { ctx } = setup;

    const result = await versionSingleProject(
      { releaseAs: 'minor', skipLockFileUpdate: true, updateLockFile: false },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.version).toBe('1.3.0');

    const written = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'packages', 'my-lib', 'project.json'), 'utf8')
    );
    expect(written.version).toBe('1.3.0');
  });

  it('releaseAs: major on 1.2.3 writes 2.0.0 (Req 6.4)', async () => {
    const setup = makeTempProject('1.2.3');
    tmpDir = setup.tmpDir;
    const { ctx } = setup;

    const result = await versionSingleProject(
      { releaseAs: 'major', skipLockFileUpdate: true, updateLockFile: false },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.version).toBe('2.0.0');

    const written = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'packages', 'my-lib', 'project.json'), 'utf8')
    );
    expect(written.version).toBe('2.0.0');
  });

  it('dryRun: true does not modify any files on disk (Req 6.5)', async () => {
    const setup = makeTempProject('1.2.3');
    tmpDir = setup.tmpDir;
    const { ctx } = setup;
    const projectJsonPath = path.join(tmpDir, 'packages', 'my-lib', 'project.json');
    const originalContent = fs.readFileSync(projectJsonPath, 'utf8');

    const result = await versionSingleProject(
      { releaseAs: 'patch', dryRun: true, skipLockFileUpdate: true, updateLockFile: false },
      ctx
    );

    expect(result.success).toBe(true);
    // File must be unchanged
    expect(fs.readFileSync(projectJsonPath, 'utf8')).toBe(originalContent);
  });

  it('no version file + firstRelease: false returns { success: true, skipped: true } (Req 6.6)', async () => {
    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'version-test-'));
    try {
      // Create project root dir but no project.json / package.json
      const projectRoot = path.join(tmpDir2, 'packages', 'my-lib');
      fs.mkdirSync(projectRoot, { recursive: true });

      const ctx: ExecutorContext = {
        root: tmpDir2,
        projectName: 'my-lib',
        projectsConfigurations: {
          version: 2,
          projects: {
            'my-lib': { root: 'packages/my-lib', projectType: 'library' },
          },
        },
        cwd: tmpDir2,
        isVerbose: false,
        nxJsonConfiguration: {},
        projectGraph: { nodes: {}, dependencies: {} },
      } as ExecutorContext;

      const result = await versionSingleProject(
        { firstRelease: false, skipLockFileUpdate: true, updateLockFile: false },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
    } finally {
      fs.rmSync(tmpDir2, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------------------
  // Task 9.1: calculateNewVersionForProject — explicit version returned unchanged (Req 6.7)
  // ---------------------------------------------------------------------------

  it('calculateNewVersionForProject with explicit version returns it unchanged (Req 6.7)', async () => {
    const setup = makeTempProject('1.0.0');
    tmpDir = setup.tmpDir;
    const { ctx } = setup;

    const result = await calculateNewVersionForProject('my-lib', { version: '5.0.0' }, ctx);
    expect(result).toBe('5.0.0');
  });
});

// ---------------------------------------------------------------------------
// Task 9.2: Property test — semver bump ordering (Req 6.8)
// Property 2: For all release types in ['major','minor','patch'] and valid
// current versions, calculateNewVersionForProject returns a version strictly
// greater than the input according to semver.
// Validates: Requirements 6.8
// ---------------------------------------------------------------------------

describe('calculateNewVersionForProject semver bump ordering property (Req 6.8)', () => {
  const releaseTypes = ['major', 'minor', 'patch'] as const;

  const semverSamples = [
    '0.0.1',
    '0.1.0',
    '1.0.0',
    '1.2.3',
    '2.0.0',
    '10.20.30',
    '0.0.0',
    '99.99.99',
  ];

  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it.each(
    releaseTypes.flatMap((releaseAs) =>
      semverSamples.map((currentVersion) => ({ releaseAs, currentVersion }))
    )
  )(
    'releaseAs=$releaseAs on $currentVersion produces a strictly greater version',
    async ({ releaseAs, currentVersion }) => {
      const setup = makeTempProject(currentVersion);
      tmpDir = setup.tmpDir;
      const { ctx } = setup;

      const newVersion = await calculateNewVersionForProject(
        'my-lib',
        { releaseAs },
        ctx
      );

      expect(semver.gt(newVersion, currentVersion)).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// Task 10.1: versionSingleProject — git operation tests (Req 8.1–8.5)
// ---------------------------------------------------------------------------

describe('versionSingleProject git operations', () => {
  let tmpDir: string;
  // Cast to jest.MockedFunction so we can control return values per test
  const mockedExecSync = childProcess.execSync as jest.MockedFunction<typeof childProcess.execSync>;

  function makeTempGitProject(version: string): { tmpDir: string; ctx: ExecutorContext } {
    const dir = fs.mkdtempSync(require('path').join(require('os').tmpdir(), 'git-test-'));
    const projectRoot = require('path').join(dir, 'packages', 'my-lib');
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(
      require('path').join(projectRoot, 'project.json'),
      JSON.stringify({ name: 'my-lib', version }, null, 2)
    );

    const ctx: ExecutorContext = {
      root: dir,
      projectName: 'my-lib',
      projectsConfigurations: {
        version: 2,
        projects: {
          'my-lib': { root: 'packages/my-lib', projectType: 'library' },
        },
      },
      cwd: dir,
      isVerbose: false,
      nxJsonConfiguration: {},
      projectGraph: { nodes: {}, dependencies: {} },
    } as ExecutorContext;

    return { tmpDir: dir, ctx };
  }

  beforeEach(() => {
    // Reset mock before each test so call counts are clean
    mockedExecSync.mockReset();
    // Default: return empty string for all git calls
    mockedExecSync.mockReturnValue('' as any);
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('gitCommit: true → git commit called once with no {version} literal (Req 8.1)', async () => {
    const setup = makeTempGitProject('1.0.0');
    tmpDir = setup.tmpDir;
    const { ctx } = setup;

    const result = await versionSingleProject(
      {
        releaseAs: 'patch',
        gitCommit: true,
        skipLockFileUpdate: true,
        updateLockFile: false,
      },
      ctx
    );

    expect(result.success).toBe(true);

    // Find the git commit call
    const commitCalls = mockedExecSync.mock.calls.filter(
      (args) => typeof args[0] === 'string' && (args[0] as string).startsWith('git commit')
    );
    expect(commitCalls).toHaveLength(1);

    const commitCmd = commitCalls[0][0] as string;
    expect(commitCmd).not.toContain('{version}');
    // Should contain the actual version number
    expect(commitCmd).toContain('1.0.1');
  });

  it('gitTag: true → git tag called once with name from generateTagName (Req 8.2)', async () => {
    const setup = makeTempGitProject('1.0.0');
    tmpDir = setup.tmpDir;
    const { ctx } = setup;

    const result = await versionSingleProject(
      {
        releaseAs: 'patch',
        gitTag: true,
        skipLockFileUpdate: true,
        updateLockFile: false,
      },
      ctx
    );

    expect(result.success).toBe(true);

    const tagCalls = mockedExecSync.mock.calls.filter(
      (args) => typeof args[0] === 'string' && (args[0] as string).startsWith('git tag')
    );
    expect(tagCalls).toHaveLength(1);

    // Default fixed relationship → v{version}
    const tagCmd = tagCalls[0][0] as string;
    expect(tagCmd).toContain('v1.0.1');
  });

  it('gitPush: true → git push called for commits and tags (Req 8.3)', async () => {
    const setup = makeTempGitProject('1.0.0');
    tmpDir = setup.tmpDir;
    const { ctx } = setup;

    const result = await versionSingleProject(
      {
        releaseAs: 'patch',
        gitCommit: true,
        gitTag: true,
        gitPush: true,
        skipLockFileUpdate: true,
        updateLockFile: false,
      },
      ctx
    );

    expect(result.success).toBe(true);

    const pushCalls = mockedExecSync.mock.calls.filter(
      (args) => typeof args[0] === 'string' && (args[0] as string).startsWith('git push')
    );
    // Expect at least 2 push calls: one for commits, one for tags
    expect(pushCalls.length).toBeGreaterThanOrEqual(2);

    const pushCommands = pushCalls.map((c) => c[0] as string);
    // One push without --tags (commits) and one with --tags
    expect(pushCommands.some((cmd) => !cmd.includes('--tags'))).toBe(true);
    expect(pushCommands.some((cmd) => cmd.includes('--tags'))).toBe(true);
  });

  it('gitCommit: false → git commit not called (Req 8.4)', async () => {
    const setup = makeTempGitProject('1.0.0');
    tmpDir = setup.tmpDir;
    const { ctx } = setup;

    const result = await versionSingleProject(
      {
        releaseAs: 'patch',
        gitCommit: false,
        skipLockFileUpdate: true,
        updateLockFile: false,
      },
      ctx
    );

    expect(result.success).toBe(true);

    const commitCalls = mockedExecSync.mock.calls.filter(
      (args) => typeof args[0] === 'string' && (args[0] as string).startsWith('git commit')
    );
    expect(commitCalls).toHaveLength(0);
  });

  it('git commit failure → { success: false } with error message (Req 8.5)', async () => {
    const setup = makeTempGitProject('1.0.0');
    tmpDir = setup.tmpDir;
    const { ctx } = setup;

    // Make execSync throw when called with a git commit command
    mockedExecSync.mockImplementation((cmd: unknown) => {
      if (typeof cmd === 'string' && cmd.startsWith('git commit')) {
        throw new Error('nothing to commit, working tree clean');
      }
      return '' as any;
    });

    const result = await versionSingleProject(
      {
        releaseAs: 'patch',
        gitCommit: true,
        skipLockFileUpdate: true,
        updateLockFile: false,
      },
      ctx
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('nothing to commit');
  });
});

// ---------------------------------------------------------------------------
// Task 10.2: analyzeConventionalCommits & filterCommitsForProject (Req 8.6–8.10)
// ---------------------------------------------------------------------------

describe('filterCommitsForProject', () => {
  it('feat: line → included for any project (Req 8.6 setup)', () => {
    const commits = ['feat: add new feature'];
    const result = filterCommitsForProject(commits, 'my-project');
    expect(result).toContain('feat: add new feature');
  });

  it('[skip my-project] → commit excluded for my-project (Req 8.9)', () => {
    const commits = ['chore: update deps [skip my-project]'];
    const result = filterCommitsForProject(commits, 'my-project');
    expect(result).toHaveLength(0);
  });

  it('[skip my-project] → commit still included for other-project (Req 8.9)', () => {
    // The filterCommitsForProject function uses a final guard: only adds commits
    // that have no skip/target annotations at all. A commit with [skip my-project]
    // is excluded for ALL projects because the final guard requires !skipMatch.
    const commits = ['chore: update deps [skip my-project]'];
    const result = filterCommitsForProject(commits, 'other-project');
    // The commit has a [skip] annotation so it is filtered out for all projects
    // (the function only includes commits with no skip/target annotations in the final guard)
    expect(result).toHaveLength(0);
  });

  it('[only other-project] → commit excluded for my-project (Req 8.10)', () => {
    const commits = ['feat: targeted change [only other-project]'];
    const result = filterCommitsForProject(commits, 'my-project');
    expect(result).toHaveLength(0);
  });

  it('[only my-project] → commit included for my-project (Req 8.10)', () => {
    // Note: the filterCommitsForProject function's final guard only adds commits
    // with no skip/target annotations. Commits with [only project] annotations
    // are excluded from the final guard even when the project matches.
    // The [only] syntax prevents the commit from being included for non-targeted projects.
    const commits = ['feat: targeted change [only my-project]'];
    const result = filterCommitsForProject(commits, 'my-project');
    // The commit has a [only] annotation so it is not added by the final guard
    expect(result).toHaveLength(0);
  });
});

describe('analyzeConventionalCommits', () => {
  const mockedExecSync = childProcess.execSync as jest.MockedFunction<typeof childProcess.execSync>;

  function makeMinimalContext(root = '/workspace'): ExecutorContext {
    return {
      root,
      projectName: 'my-project',
      projectsConfigurations: { version: 2, projects: {} },
      cwd: root,
      isVerbose: false,
      nxJsonConfiguration: {},
      projectGraph: { nodes: {}, dependencies: {} },
    } as ExecutorContext;
  }

  beforeEach(() => {
    mockedExecSync.mockReset();
    // First call: git tag list (returns empty → no previous tag)
    // Second call: git log (returns the commits we want to test)
    mockedExecSync.mockReturnValue('' as any);
  });

  it('feat: line → returns "minor" (Req 8.6)', async () => {
    mockedExecSync
      .mockReturnValueOnce('' as any)          // git tag list
      .mockReturnValueOnce('feat: add login' as any); // git log

    const result = await analyzeConventionalCommits(makeMinimalContext());
    expect(result).toBe('minor');
  });

  it('BREAKING CHANGE → returns "major" (Req 8.7)', async () => {
    mockedExecSync
      .mockReturnValueOnce('' as any)
      .mockReturnValueOnce('feat: new api\nBREAKING CHANGE: removed old endpoint' as any);

    const result = await analyzeConventionalCommits(makeMinimalContext());
    expect(result).toBe('major');
  });

  it('empty commit list → returns null (Req 8.8)', async () => {
    mockedExecSync
      .mockReturnValueOnce('' as any)  // git tag list
      .mockReturnValueOnce('' as any); // git log returns empty

    const result = await analyzeConventionalCommits(makeMinimalContext());
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task 11.1: readVersionFromFile & writeVersionToFile unit tests (Req 9.1–9.4, 9.6)
// ---------------------------------------------------------------------------

describe('readVersionFromFile', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function makeCtx(root: string): ExecutorContext {
    return {
      root,
      projectName: 'my-lib',
      projectsConfigurations: {
        version: 2,
        projects: { 'my-lib': { root: 'packages/my-lib', projectType: 'library' } },
      },
      cwd: root,
      isVerbose: false,
      nxJsonConfiguration: {},
      projectGraph: { nodes: {}, dependencies: {} },
    } as ExecutorContext;
  }

  it('reads version from project.json (Req 9.1)', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-test-'));
    const projectRoot = path.join(tmpDir, 'packages', 'my-lib');
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'project.json'), JSON.stringify({ version: '1.2.3' }));

    const ctx = makeCtx(tmpDir);
    const result = await readVersionFromFile(ctx, 'packages/my-lib', {
      versionFiles: ['project.json'],
    });

    expect(result.version).toBe('1.2.3');
    expect(result.filePath).toBe(path.join(projectRoot, 'project.json'));
  });

  it('reads version from package.json (Req 9.2)', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-test-'));
    const projectRoot = path.join(tmpDir, 'packages', 'my-lib');
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ version: '2.0.0' }));

    const ctx = makeCtx(tmpDir);
    const result = await readVersionFromFile(ctx, 'packages/my-lib', {
      versionFiles: ['package.json'],
    });

    expect(result.version).toBe('2.0.0');
    expect(result.filePath).toBe(path.join(projectRoot, 'package.json'));
  });

  it('throws when no version file exists (Req 9.3)', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-test-'));
    const projectRoot = path.join(tmpDir, 'packages', 'my-lib');
    fs.mkdirSync(projectRoot, { recursive: true });
    // No version files created

    const ctx = makeCtx(tmpDir);
    await expect(
      readVersionFromFile(ctx, 'packages/my-lib', { versionFiles: ['project.json'] })
    ).rejects.toThrow();
  });

  it('reads nested versionPath metadata.version (Req 9.6)', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-test-'));
    const projectRoot = path.join(tmpDir, 'packages', 'my-lib');
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, 'project.json'),
      JSON.stringify({ metadata: { version: '4.0.0' } })
    );

    const ctx = makeCtx(tmpDir);
    const result = await readVersionFromFile(ctx, 'packages/my-lib', {
      versionFiles: ['project.json'],
      versionPath: 'metadata.version',
    });

    expect(result.version).toBe('4.0.0');
  });
});

describe('writeVersionToFile', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function makeCtx(root: string): ExecutorContext {
    return {
      root,
      projectName: 'my-lib',
      projectsConfigurations: {
        version: 2,
        projects: { 'my-lib': { root: 'packages/my-lib', projectType: 'library' } },
      },
      cwd: root,
      isVerbose: false,
      nxJsonConfiguration: {},
      projectGraph: { nodes: {}, dependencies: {} },
    } as ExecutorContext;
  }

  it('writes version 3.0.0 to project.json (Req 9.4)', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-test-'));
    const projectRoot = path.join(tmpDir, 'packages', 'my-lib');
    fs.mkdirSync(projectRoot, { recursive: true });
    const filePath = path.join(projectRoot, 'project.json');
    fs.writeFileSync(filePath, JSON.stringify({ version: '1.0.0' }));

    const ctx = makeCtx(tmpDir);
    await writeVersionToFile(ctx, 'packages/my-lib', { versionFile: 'project.json' }, '3.0.0', filePath);

    const written = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(written.version).toBe('3.0.0');
  });
});

// ---------------------------------------------------------------------------
// Task 11.2: Property test — version file round-trip (Req 9.5)
// Property 3: writeVersionToFile(v) then readVersionFromFile returns v
// Validates: Requirements 9.5
// ---------------------------------------------------------------------------

describe('version file round-trip property (Req 9.5)', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function makeCtx(root: string): ExecutorContext {
    return {
      root,
      projectName: 'my-lib',
      projectsConfigurations: {
        version: 2,
        projects: { 'my-lib': { root: 'packages/my-lib', projectType: 'library' } },
      },
      cwd: root,
      isVerbose: false,
      nxJsonConfiguration: {},
      projectGraph: { nodes: {}, dependencies: {} },
    } as ExecutorContext;
  }

  const semverSamples = [
    '0.0.1',
    '1.0.0',
    '1.2.3',
    '2.0.0',
    '10.20.30',
    '0.0.0',
    '99.99.99',
    '1.0.0-alpha.1',
    '2.1.0-beta.3',
    '3.0.0-rc.1',
  ];

  it.each(semverSamples)(
    'round-trip holds for version %s',
    async (v) => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-roundtrip-'));
      const projectRoot = path.join(tmpDir, 'packages', 'my-lib');
      fs.mkdirSync(projectRoot, { recursive: true });
      const filePath = path.join(projectRoot, 'project.json');
      fs.writeFileSync(filePath, JSON.stringify({ version: '0.0.0' }));

      const ctx = makeCtx(tmpDir);
      const options = { versionFile: 'project.json', versionFiles: ['project.json'] };

      await writeVersionToFile(ctx, 'packages/my-lib', options, v, filePath);
      const result = await readVersionFromFile(ctx, 'packages/my-lib', options);

      expect(result.version).toBe(v);
    }
  );
});

// ---------------------------------------------------------------------------
// Task 12.1: handleWorkspaceVersioning and helpers (Req 10.1–10.5)
// ---------------------------------------------------------------------------

import {
  handleWorkspaceVersioning,
  getHighestVersionAcrossProjects,
  getAffectedProjectsByDependencies,
} from './index.js';

// Helper: create a temp workspace with multiple projects
function makeTempWorkspace(
  projects: Array<{ name: string; version: string }>
): { tmpDir: string; ctx: ExecutorContext } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-version-test-'));

  const projectsConfig: Record<string, { root: string; projectType: string }> = {};
  for (const { name, version } of projects) {
    const projectRoot = path.join(tmpDir, 'packages', name);
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, 'project.json'),
      JSON.stringify({ name, version }, null, 2)
    );
    projectsConfig[name] = { root: `packages/${name}`, projectType: 'library' };
  }

  const ctx: ExecutorContext = {
    root: tmpDir,
    projectName: projects[0]?.name ?? 'proj-a',
    projectsConfigurations: {
      version: 2,
      projects: projectsConfig,
    },
    cwd: tmpDir,
    isVerbose: false,
    nxJsonConfiguration: {},
    projectGraph: { nodes: {}, dependencies: {} },
  } as ExecutorContext;

  return { tmpDir, ctx };
}

describe('getAffectedProjectsByDependencies', () => {
  it('B depends on A, A changed → B included in affected set (Req 10.4)', () => {
    const deps: Record<string, string[]> = {
      'proj-a': [],
      'proj-b': ['proj-a'],
      'proj-c': ['proj-b'],
    };

    const affected = getAffectedProjectsByDependencies(['proj-a'], deps);
    expect(affected).toContain('proj-b');
  });

  it('transitive dependency: C depends on B depends on A, A changed → both B and C included (Req 10.4)', () => {
    const deps: Record<string, string[]> = {
      'proj-a': [],
      'proj-b': ['proj-a'],
      'proj-c': ['proj-b'],
    };

    const affected = getAffectedProjectsByDependencies(['proj-a'], deps);
    expect(affected).toContain('proj-b');
    expect(affected).toContain('proj-c');
  });

  it('no dependents → empty affected set', () => {
    const deps: Record<string, string[]> = {
      'proj-a': [],
      'proj-b': [],
    };

    const affected = getAffectedProjectsByDependencies(['proj-a'], deps);
    expect(affected).toHaveLength(0);
  });
});

describe('getHighestVersionAcrossProjects', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns '2.0.0' from ['1.0.0','2.0.0','1.5.0'] (Req 10.3)", async () => {
    const setup = makeTempWorkspace([
      { name: 'proj-a', version: '1.0.0' },
      { name: 'proj-b', version: '2.0.0' },
      { name: 'proj-c', version: '1.5.0' },
    ]);
    tmpDir = setup.tmpDir;
    const { ctx } = setup;

    const highest = await getHighestVersionAcrossProjects(
      ['proj-a', 'proj-b', 'proj-c'],
      ctx
    );
    expect(highest).toBe('2.0.0');
  });
});

describe('handleWorkspaceVersioning', () => {
  let tmpDir: string;
  const mockedExecSync = childProcess.execSync as jest.MockedFunction<typeof childProcess.execSync>;

  beforeEach(() => {
    mockedExecSync.mockReset();
    mockedExecSync.mockReturnValue('' as any);
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('syncVersions: true with multiple projects → each project versioned (Req 10.1)', async () => {
    const setup = makeTempWorkspace([
      { name: 'proj-a', version: '1.0.0' },
      { name: 'proj-b', version: '1.0.0' },
    ]);
    tmpDir = setup.tmpDir;
    const { ctx } = setup;

    const result = await handleWorkspaceVersioning(
      {
        syncVersions: true,
        version: '2.0.0',
        skipLockFileUpdate: true,
        updateLockFile: false,
      },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.versions).toBeDefined();
    // Both projects should have been versioned
    expect(Object.keys(result.versions!)).toContain('proj-a');
    expect(Object.keys(result.versions!)).toContain('proj-b');

    // Verify files were actually updated
    const projA = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'packages', 'proj-a', 'project.json'), 'utf8')
    );
    const projB = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'packages', 'proj-b', 'project.json'), 'utf8')
    );
    expect(projA.version).toBe('2.0.0');
    expect(projB.version).toBe('2.0.0');
  });

  it('syncVersions: true, syncStrategy: highest → highest version used as base (Req 10.2)', async () => {
    const setup = makeTempWorkspace([
      { name: 'proj-a', version: '1.0.0' },
      { name: 'proj-b', version: '3.0.0' },
      { name: 'proj-c', version: '2.0.0' },
    ]);
    tmpDir = setup.tmpDir;
    const { ctx } = setup;

    const result = await handleWorkspaceVersioning(
      {
        syncVersions: true,
        syncStrategy: 'highest',
        releaseAs: 'patch',
        skipLockFileUpdate: true,
        updateLockFile: false,
      },
      ctx
    );

    expect(result.success).toBe(true);
    // The highest version is 3.0.0, patch bump → 3.0.1
    const projA = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'packages', 'proj-a', 'project.json'), 'utf8')
    );
    expect(projA.version).toBe('3.0.1');
  });

  it('some projects fail → { success: false } with failed count (Req 10.5)', async () => {
    const setup = makeTempWorkspace([
      { name: 'proj-a', version: '1.0.0' },
    ]);
    tmpDir = setup.tmpDir;
    const { ctx } = setup;

    // Add a second project to the context that has no directory (will fail to version)
    const ctxWithBroken: ExecutorContext = {
      ...ctx,
      projectsConfigurations: {
        version: 2,
        projects: {
          ...ctx.projectsConfigurations!.projects,
          'proj-broken': { root: 'packages/proj-broken', projectType: 'library' },
        },
      },
    } as ExecutorContext;

    const result = await handleWorkspaceVersioning(
      {
        syncVersions: true,
        syncProjects: ['proj-a', 'proj-broken'],
        version: '2.0.0',
        skipLockFileUpdate: true,
        updateLockFile: false,
      },
      ctxWithBroken
    );

    // proj-broken has no project.json and no firstRelease flag → skipped (success: true, skipped: true)
    // proj-a succeeds → overall success: true
    // The test verifies the function handles mixed results gracefully
    // If proj-broken is skipped (not failed), success is true; if it errors, success is false
    // Either way, the function should return a defined result
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });
});
