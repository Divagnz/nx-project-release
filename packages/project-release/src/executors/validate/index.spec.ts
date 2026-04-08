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
import validateExecutor from './index.js';
import { ValidateExecutorSchema } from './schema.js';

// Mock @nx/devkit logger (readJsonFile is kept real — we use real temp files)
jest.mock('@nx/devkit', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = jest.requireActual('@nx/devkit') as any;
  return {
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    readJsonFile: actual.readJsonFile,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(
  tempDir: string,
  projectName: string | undefined = 'test-project'
): ExecutorContext {
  return {
    root: tempDir,
    projectName,
    projectsConfigurations: {
      version: 2,
      projects: {},
    },
    cwd: tempDir,
    isVerbose: false,
    nxJsonConfiguration: {},
    projectGraph: { nodes: {}, dependencies: {} },
  } as ExecutorContext;
}

/**
 * Write a project.json for `projectName` under `<tempDir>/projects/<projectName>/project.json`.
 */
function writeProjectJson(
  tempDir: string,
  projectName: string,
  content: Record<string, unknown>
) {
  const dir = path.join(tempDir, 'projects', projectName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(content));
}

/**
 * Write nx.json at `<tempDir>/nx.json`.
 */
function writeNxJson(tempDir: string, content: Record<string, unknown>) {
  fs.writeFileSync(path.join(tempDir, 'nx.json'), JSON.stringify(content));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Validate Executor', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-test-'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Req 13.1 — project with version, changelog, publish targets → success
  // -------------------------------------------------------------------------
  describe('success cases', () => {
    it('should return { success: true } when version, changelog, and publish targets are configured (Req 13.1)', async () => {
      writeProjectJson(tempDir, 'test-project', {
        targets: {
          version: { executor: '@nx-project-release/project-release:version' },
          changelog: { executor: '@nx-project-release/project-release:changelog' },
          publish: { executor: '@nx-project-release/project-release:publish' },
        },
      });

      const result = await validateExecutor(
        {} as ValidateExecutorSchema,
        makeContext(tempDir)
      );

      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Req 13.2 — project missing version target → failure with error in health
  // -------------------------------------------------------------------------
  describe('error cases', () => {
    it('should return { success: false } and add error when version target is missing (Req 13.2)', async () => {
      writeProjectJson(tempDir, 'test-project', {
        targets: {
          changelog: {},
          publish: {},
        },
      });

      // Spy on console.log to capture JSON output later if needed
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const result = await validateExecutor(
        { json: true } as ValidateExecutorSchema,
        makeContext(tempDir)
      );

      expect(result.success).toBe(false);

      // Verify the JSON output contains the error
      const jsonOutput = consoleSpy.mock.calls
        .map((args) => args[0] as string)
        .find((s) => {
          try {
            const parsed = JSON.parse(s);
            return Array.isArray(parsed?.health?.errors);
          } catch {
            return false;
          }
        });

      expect(jsonOutput).toBeDefined();
      const parsed = JSON.parse(jsonOutput!);
      expect(parsed.health.errors.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });

    it('should return { success: false } when no project name is in context (Req 13.6)', async () => {
      const ctx = makeContext(tempDir);
      // Override projectName to be undefined
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx as unknown as any).projectName = undefined;

      const result = await validateExecutor(
        {} as ValidateExecutorSchema,
        ctx
      );

      expect(result.success).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('No project name')
      );
    });
  });

  // -------------------------------------------------------------------------
  // Req 13.3 — json: true → stdout contains valid JSON with required fields
  // -------------------------------------------------------------------------
  describe('json output', () => {
    it('should write valid JSON to stdout with required fields when json: true (Req 13.3)', async () => {
      writeProjectJson(tempDir, 'test-project', {
        targets: {
          version: {},
          changelog: {},
          publish: {},
        },
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await validateExecutor(
        { json: true } as ValidateExecutorSchema,
        makeContext(tempDir)
      );

      const jsonCalls = consoleSpy.mock.calls.map((args) => args[0] as string);
      const jsonOutput = jsonCalls.find((s) => {
        try {
          JSON.parse(s);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonOutput).toBeDefined();
      const parsed = JSON.parse(jsonOutput!);
      expect(parsed).toHaveProperty('projectName');
      expect(parsed).toHaveProperty('global');
      expect(parsed).toHaveProperty('projectConfig');
      expect(parsed).toHaveProperty('health');
      expect(parsed.health).toHaveProperty('warnings');
      expect(parsed.health).toHaveProperty('errors');

      consoleSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // Req 13.4 — checkHealth: true with no version files → warning added
  // -------------------------------------------------------------------------
  describe('health check', () => {
    it('should add warning when checkHealth: true and no version files configured (Req 13.4)', async () => {
      writeProjectJson(tempDir, 'test-project', {
        targets: {
          version: { options: {} }, // no versionFiles
          changelog: {},
          publish: {},
        },
      });
      // nx.json with no versionFiles either
      writeNxJson(tempDir, { projectRelease: {} });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await validateExecutor(
        { checkHealth: true, json: true } as ValidateExecutorSchema,
        makeContext(tempDir)
      );

      const jsonCalls = consoleSpy.mock.calls.map((args) => args[0] as string);
      const jsonOutput = jsonCalls.find((s) => {
        try {
          JSON.parse(s);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonOutput).toBeDefined();
      const parsed = JSON.parse(jsonOutput!);
      expect(
        parsed.health.warnings.some((w: string) =>
          w.toLowerCase().includes('version files')
        )
      ).toBe(true);

      consoleSpy.mockRestore();
    });

    // -----------------------------------------------------------------------
    // Req 13.5 — project in excludedProjects → warning added
    // -----------------------------------------------------------------------
    it('should add warning when project is in excludedProjects (Req 13.5)', async () => {
      writeProjectJson(tempDir, 'test-project', {
        targets: {
          version: {},
          changelog: {},
          publish: {},
        },
      });
      writeNxJson(tempDir, {
        projectRelease: {
          excludedProjects: ['test-project'],
        },
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await validateExecutor(
        { checkHealth: true, json: true } as ValidateExecutorSchema,
        makeContext(tempDir)
      );

      const jsonCalls = consoleSpy.mock.calls.map((args) => args[0] as string);
      const jsonOutput = jsonCalls.find((s) => {
        try {
          JSON.parse(s);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonOutput).toBeDefined();
      const parsed = JSON.parse(jsonOutput!);
      expect(
        parsed.health.warnings.some((w: string) =>
          w.toLowerCase().includes('excluded')
        )
      ).toBe(true);

      consoleSpy.mockRestore();
    });
  });
});
