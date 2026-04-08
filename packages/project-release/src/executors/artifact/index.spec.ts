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
import artifactExecutor from './index.js';
import { ArtifactExecutorSchema } from './schema.js';

// Mock @nx/devkit logger; keep everything else real
jest.mock('@nx/devkit', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(tempDir: string, projectName = 'test-project'): ExecutorContext {
  return {
    root: tempDir,
    projectName,
    projectsConfigurations: {
      version: 2,
      projects: {
        [projectName]: { root: `projects/${projectName}` },
      },
    },
    cwd: tempDir,
    isVerbose: false,
    nxJsonConfiguration: {},
    projectGraph: {
      nodes: {
        [projectName]: {
          name: projectName,
          type: 'lib',
          data: { root: `projects/${projectName}` },
        },
      },
      dependencies: {},
    },
  } as ExecutorContext;
}

/** Create a source directory with a set of files and return its path. */
function createSourceDir(
  tempDir: string,
  files: Record<string, string> = { 'index.js': 'console.log("hi");' }
): string {
  const srcDir = path.join(tempDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(srcDir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return srcDir;
}

/** List all entry paths inside a zip archive using yauzl. */
async function listZipEntries(zipPath: string): Promise<string[]> {
  const yauzl = await import('yauzl');
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error('no zipfile'));
      const entries: string[] = [];
      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        // Skip directory entries
        if (!/\/$/.test(entry.fileName)) {
          entries.push(entry.fileName);
        }
        zipfile.readEntry();
      });
      zipfile.on('end', () => resolve(entries));
      zipfile.on('error', reject);
    });
  });
}

/** List all entry paths inside a tar/tgz archive using the `tar` package. */
async function listTarEntries(tarPath: string): Promise<string[]> {
  const tar = await import('tar');
  const entries: string[] = [];
  await tar.list({
    file: tarPath,
    onentry: (entry) => {
      if (entry.type !== 'Directory') {
        entries.push(entry.path);
      }
    },
  });
  return entries;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('artifactExecutor', () => {
  let tempDir: string;
  let outputDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-test-'));
    outputDir = path.join(tempDir, 'dist');
    fs.mkdirSync(outputDir, { recursive: true });
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Req 11.1 — zip format creates .zip file
  // -------------------------------------------------------------------------
  it('Req 11.1 – format: zip → .zip file created at resolved output path', async () => {
    const srcDir = createSourceDir(tempDir);
    const options: ArtifactExecutorSchema = {
      sourceDir: 'src',
      outputDir: 'dist',
      format: 'zip',
      artifactName: 'output.zip',
    };

    const result = await artifactExecutor(options, makeContext(tempDir));

    expect(result.success).toBe(true);
    expect(result.artifactPath).toBeDefined();
    expect(result.artifactPath!.endsWith('.zip')).toBe(true);
    expect(fs.existsSync(result.artifactPath!)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Req 11.2 — tgz format creates .tgz file
  // -------------------------------------------------------------------------
  it('Req 11.2 – format: tgz → .tgz file created', async () => {
    createSourceDir(tempDir);
    const options: ArtifactExecutorSchema = {
      sourceDir: 'src',
      outputDir: 'dist',
      format: 'tgz',
      artifactName: 'output.tgz',
    };

    const result = await artifactExecutor(options, makeContext(tempDir));

    expect(result.success).toBe(true);
    expect(result.artifactPath!.endsWith('.tgz')).toBe(true);
    expect(fs.existsSync(result.artifactPath!)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Req 11.3 — tar.gz format creates .tar.gz file
  // -------------------------------------------------------------------------
  it('Req 11.3 – format: tar.gz → .tar.gz file created', async () => {
    createSourceDir(tempDir);
    const options: ArtifactExecutorSchema = {
      sourceDir: 'src',
      outputDir: 'dist',
      format: 'tar.gz',
      artifactName: 'output.tar.gz',
    };

    const result = await artifactExecutor(options, makeContext(tempDir));

    expect(result.success).toBe(true);
    expect(result.artifactPath!.endsWith('.tar.gz')).toBe(true);
    expect(fs.existsSync(result.artifactPath!)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Req 11.4 — artifactName template tokens resolved
  // -------------------------------------------------------------------------
  it('Req 11.4 – artifactName template with {projectName}, {version}, {hash} → all tokens resolved', async () => {
    // Write a package.json so the executor can read a version
    const projectDir = path.join(tempDir, 'projects', 'test-project');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ version: '2.5.0' })
    );

    createSourceDir(tempDir);
    const options: ArtifactExecutorSchema = {
      sourceDir: 'src',
      outputDir: 'dist',
      format: 'zip',
      artifactName: '{projectName}-{version}-{hash}.zip',
    };

    const result = await artifactExecutor(options, makeContext(tempDir));

    expect(result.success).toBe(true);
    const basename = path.basename(result.artifactPath!);
    // Should not contain unresolved tokens
    expect(basename).not.toContain('{projectName}');
    expect(basename).not.toContain('{version}');
    expect(basename).not.toContain('{hash}');
    // Should contain the resolved project name and version
    expect(basename).toContain('test-project');
    expect(basename).toContain('2.5.0');
  });

  // -------------------------------------------------------------------------
  // Req 11.5 — include: ['**/*.js'] → only .js files in archive
  // -------------------------------------------------------------------------
  it('Req 11.5 – include: [**/*.js] with mixed source → only .js files in archive', async () => {
    createSourceDir(tempDir, {
      'index.js': 'console.log("hi");',
      'types.ts': 'export type Foo = string;',
      'utils.js': 'export const x = 1;',
    });

    const options: ArtifactExecutorSchema = {
      sourceDir: 'src',
      outputDir: 'dist',
      format: 'zip',
      artifactName: 'output.zip',
      include: ['**/*.js'],
    };

    const result = await artifactExecutor(options, makeContext(tempDir));

    expect(result.success).toBe(true);
    const entries = await listZipEntries(result.artifactPath!);
    expect(entries.every((e) => e.endsWith('.js'))).toBe(true);
    expect(entries.some((e) => e.endsWith('.ts'))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Req 11.6 — exclude: ['**/*.map'] → no .map files in archive
  // -------------------------------------------------------------------------
  it('Req 11.6 – exclude: [**/*.map] → no .map files in archive', async () => {
    createSourceDir(tempDir, {
      'index.js': 'console.log("hi");',
      'index.js.map': '{"version":3}',
    });

    const options: ArtifactExecutorSchema = {
      sourceDir: 'src',
      outputDir: 'dist',
      format: 'zip',
      artifactName: 'output.zip',
      exclude: ['**/*.map'],
    };

    const result = await artifactExecutor(options, makeContext(tempDir));

    expect(result.success).toBe(true);
    const entries = await listZipEntries(result.artifactPath!);
    expect(entries.some((e) => e.endsWith('.map'))).toBe(false);
    expect(entries.some((e) => e.endsWith('.js'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Req 11.7 — metadata object → .artifact-metadata.json in archive
  // -------------------------------------------------------------------------
  it('Req 11.7 – metadata object → .artifact-metadata.json included in archive', async () => {
    createSourceDir(tempDir);
    const metadata = { buildId: 'abc123', env: 'production' };
    const options: ArtifactExecutorSchema = {
      sourceDir: 'src',
      outputDir: 'dist',
      format: 'zip',
      artifactName: 'output.zip',
      metadata,
    };

    const result = await artifactExecutor(options, makeContext(tempDir));

    expect(result.success).toBe(true);
    const entries = await listZipEntries(result.artifactPath!);
    expect(entries).toContain('.artifact-metadata.json');
  });

  // -------------------------------------------------------------------------
  // Req 11.8 — source directory does not exist → { success: false }
  // -------------------------------------------------------------------------
  it('Req 11.8 – source directory does not exist → { success: false }, no output file', async () => {
    const options: ArtifactExecutorSchema = {
      sourceDir: 'nonexistent-dir',
      outputDir: 'dist',
      format: 'zip',
      artifactName: 'output.zip',
    };

    const result = await artifactExecutor(options, makeContext(tempDir));

    expect(result.success).toBe(false);
    expect(result.artifactPath).toBeUndefined();
    expect(fs.existsSync(path.join(outputDir, 'output.zip'))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Req 11.9 — no files match include patterns → { success: false } + warning
  // -------------------------------------------------------------------------
  it('Req 11.9 – no files match include patterns → { success: false } with warning', async () => {
    createSourceDir(tempDir, { 'index.js': 'console.log("hi");' });
    const options: ArtifactExecutorSchema = {
      sourceDir: 'src',
      outputDir: 'dist',
      format: 'zip',
      artifactName: 'output.zip',
      include: ['**/*.nonexistent'],
    };

    const result = await artifactExecutor(options, makeContext(tempDir));

    expect(result.success).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('No files found')
    );
  });

  // -------------------------------------------------------------------------
  // Req 11.10 — dryRun: true → no archive file created on disk
  // -------------------------------------------------------------------------
  it('Req 11.10 – dryRun: true → no archive file created on disk', async () => {
    createSourceDir(tempDir);
    const options: ArtifactExecutorSchema = {
      sourceDir: 'src',
      outputDir: 'dist',
      format: 'zip',
      artifactName: 'output.zip',
      dryRun: true,
    };

    const result = await artifactExecutor(options, makeContext(tempDir));

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'output.zip'))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Req 11.11 — Property 4: archive round-trip (it.each over all formats)
  // -------------------------------------------------------------------------
  describe('archive round-trip (Property 4)', () => {
    it.each([
      ['zip', 'output.zip'],
      ['tgz', 'output.tgz'],
      ['tar.gz', 'output.tar.gz'],
    ] as const)(
      'Validates: Requirements 11.11 – format %s: extracted file paths equal matched source file paths',
      async (format, artifactName) => {
        const sourceFiles = {
          'index.js': 'console.log("hi");',
          'utils.js': 'export const x = 1;',
          'sub/helper.js': 'export const y = 2;',
        };
        createSourceDir(tempDir, sourceFiles);

        const options: ArtifactExecutorSchema = {
          sourceDir: 'src',
          outputDir: 'dist',
          format,
          artifactName,
        };

        const result = await artifactExecutor(options, makeContext(tempDir));
        expect(result.success).toBe(true);

        // Extract file list from archive
        let archiveEntries: string[];
        if (format === 'zip') {
          archiveEntries = await listZipEntries(result.artifactPath!);
        } else {
          archiveEntries = await listTarEntries(result.artifactPath!);
        }

        // Expected: the same relative paths that were in the source dir
        const expectedPaths = Object.keys(sourceFiles).sort();
        const actualPaths = archiveEntries
          .filter((e) => !e.endsWith('.artifact-metadata.json'))
          .map((e) => e.replace(/\\/g, '/'))
          .sort();

        expect(actualPaths).toEqual(expectedPaths);
      }
    );
  });
});
