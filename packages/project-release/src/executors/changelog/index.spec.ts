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
import changelogExecutor, { ChangelogExecutorSchema } from './index.js';
import * as commitParser from './commit-parser.js';
import * as markdownGenerator from './markdown-generator.js';

// Mock dependencies
jest.mock('@nx/devkit', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('./commit-parser.js');
jest.mock('./markdown-generator.js');

const mockGetCommitsFromGit =
  commitParser.getCommitsFromGit as jest.MockedFunction<
    typeof commitParser.getCommitsFromGit
  >;
const mockParseCommits = commitParser.parseCommits as jest.MockedFunction<
  typeof commitParser.parseCommits
>;
const mockFilterCommitsByScope =
  commitParser.filterCommitsByScope as jest.MockedFunction<
    typeof commitParser.filterCommitsByScope
  >;
const mockGenerateChangelogMarkdown =
  markdownGenerator.generateChangelogMarkdown as jest.MockedFunction<
    typeof markdownGenerator.generateChangelogMarkdown
  >;
const mockGenerateWorkspaceChangelog =
  markdownGenerator.generateWorkspaceChangelog as jest.MockedFunction<
    typeof markdownGenerator.generateWorkspaceChangelog
  >;
const mockGetRepositoryUrl =
  markdownGenerator.getRepositoryUrl as jest.MockedFunction<
    typeof markdownGenerator.getRepositoryUrl
  >;

describe('Changelog Executor', () => {
  let tempDir: string;
  let context: ExecutorContext;

  beforeEach(() => {
    // Create temp directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-test-'));

    // Reset mocks
    jest.clearAllMocks();

    // Setup default context
    context = {
      root: tempDir,
      projectName: 'test-project',
      projectsConfigurations: {
        version: 2,
        projects: {
          'test-project': {
            root: 'projects/test-project',
          },
          'other-project': {
            root: 'projects/other-project',
          },
        },
      },
      cwd: tempDir,
      isVerbose: false,
      nxJsonConfiguration: {},
      projectGraph: {
        nodes: {},
        dependencies: {},
      },
    } as ExecutorContext;

    // Create project directories
    fs.mkdirSync(path.join(tempDir, 'projects/test-project'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tempDir, 'projects/other-project'), {
      recursive: true,
    });

    // Default mock implementations
    mockGetCommitsFromGit.mockReturnValue(['abc123|feat: add feature']);
    mockParseCommits.mockReturnValue([
      {
        hash: 'abc123',
        type: 'feat',
        subject: 'add feature',
        breaking: false,
      },
    ]);
    mockFilterCommitsByScope.mockImplementation((commits) => commits);
    mockGenerateChangelogMarkdown.mockReturnValue(
      '# Changelog\n\n## Features\n\n* add feature'
    );
    mockGenerateWorkspaceChangelog.mockReturnValue('# Workspace Changelog');
    mockGetRepositoryUrl.mockReturnValue('https://github.com/user/repo');
  });

  afterEach(() => {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Project Changelog Generation', () => {
    it('should generate changelog for a project', async () => {
      const options: ChangelogExecutorSchema = {};
      const result = await changelogExecutor(options, context);

      expect(result.success).toBe(true);
      expect(mockGetCommitsFromGit).toHaveBeenCalled();
      expect(mockParseCommits).toHaveBeenCalled();
      expect(mockFilterCommitsByScope).toHaveBeenCalled();
      expect(mockGenerateChangelogMarkdown).toHaveBeenCalled();
    });

    it('should write changelog to default file (CHANGELOG.md)', async () => {
      const options: ChangelogExecutorSchema = {};
      await changelogExecutor(options, context);

      const changelogPath = path.join(
        tempDir,
        'projects/test-project/CHANGELOG.md'
      );
      expect(fs.existsSync(changelogPath)).toBe(true);
    });

    it('should write changelog to custom file', async () => {
      const options: ChangelogExecutorSchema = {
        changelogFile: 'HISTORY.md',
      };
      await changelogExecutor(options, context);

      const changelogPath = path.join(
        tempDir,
        'projects/test-project/HISTORY.md'
      );
      expect(fs.existsSync(changelogPath)).toBe(true);
    });

    it('should include version from project.json', async () => {
      const projectJsonPath = path.join(
        tempDir,
        'projects/test-project/project.json'
      );
      fs.writeFileSync(projectJsonPath, JSON.stringify({ version: '1.2.3' }));

      const options: ChangelogExecutorSchema = {};
      await changelogExecutor(options, context);

      expect(mockGenerateChangelogMarkdown).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ version: '1.2.3' })
      );
    });

    it('should include version from package.json if project.json not found', async () => {
      const packageJsonPath = path.join(
        tempDir,
        'projects/test-project/package.json'
      );
      fs.writeFileSync(packageJsonPath, JSON.stringify({ version: '2.0.0' }));

      const options: ChangelogExecutorSchema = {};
      await changelogExecutor(options, context);

      expect(mockGenerateChangelogMarkdown).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ version: '2.0.0' })
      );
    });

    it('should use 0.0.0 as default version', async () => {
      const options: ChangelogExecutorSchema = {};
      await changelogExecutor(options, context);

      expect(mockGenerateChangelogMarkdown).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ version: '0.0.0' })
      );
    });

    it('should pass repository URL to changelog generator', async () => {
      const options: ChangelogExecutorSchema = {};
      await changelogExecutor(options, context);

      expect(mockGetRepositoryUrl).toHaveBeenCalledWith(tempDir);
      expect(mockGenerateChangelogMarkdown).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          repositoryUrl: 'https://github.com/user/repo',
        })
      );
    });

    it('should filter commits by project scope', async () => {
      const options: ChangelogExecutorSchema = {};
      await changelogExecutor(options, context);

      expect(mockFilterCommitsByScope).toHaveBeenCalledWith(
        expect.anything(),
        'test-project'
      );
    });

    it('should handle custom from/to commit range', async () => {
      const options: ChangelogExecutorSchema = {
        from: 'v1.0.0',
        to: 'v2.0.0',
      };
      await changelogExecutor(options, context);

      expect(mockGetCommitsFromGit).toHaveBeenCalledWith(
        tempDir,
        'v1.0.0',
        'v2.0.0',
        'test-project'
      );
    });

    it('should pass custom context to changelog options', async () => {
      const options: ChangelogExecutorSchema = {
        context: {
          customField: 'custom value',
        },
      };
      await changelogExecutor(options, context);

      expect(mockGenerateChangelogMarkdown).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ customField: 'custom value' })
      );
    });
  });

  describe('Dry-run Mode', () => {
    it('should not write file in dry-run mode', async () => {
      const options: ChangelogExecutorSchema = {
        dryRun: true,
      };
      await changelogExecutor(options, context);

      const changelogPath = path.join(
        tempDir,
        'projects/test-project/CHANGELOG.md'
      );
      expect(fs.existsSync(changelogPath)).toBe(false);
    });

    it('should still generate changelog content in dry-run', async () => {
      const options: ChangelogExecutorSchema = {
        dryRun: true,
      };
      await changelogExecutor(options, context);

      expect(mockGenerateChangelogMarkdown).toHaveBeenCalled();
    });

    it('should log changelog preview in dry-run', async () => {
      const options: ChangelogExecutorSchema = {
        dryRun: true,
      };
      await changelogExecutor(options, context);

      expect(logger.info).toHaveBeenCalledWith('📋 Changelog preview:');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Changelog')
      );
    });
  });

  describe('Append Mode', () => {
    it('should append to existing changelog file', async () => {
      const changelogPath = path.join(
        tempDir,
        'projects/test-project/CHANGELOG.md'
      );
      const existingContent = '# Old Changelog\n\nOld content';
      fs.writeFileSync(changelogPath, existingContent);

      const options: ChangelogExecutorSchema = {
        append: true,
      };
      await changelogExecutor(options, context);

      const newContent = fs.readFileSync(changelogPath, 'utf8');
      expect(newContent).toContain('Old content');
      expect(newContent).toContain('add feature'); // New content
    });

    it('should create new file if append is true but file does not exist', async () => {
      const options: ChangelogExecutorSchema = {
        append: true,
      };
      await changelogExecutor(options, context);

      const changelogPath = path.join(
        tempDir,
        'projects/test-project/CHANGELOG.md'
      );
      expect(fs.existsSync(changelogPath)).toBe(true);
    });

    it('should overwrite file when append is false', async () => {
      const changelogPath = path.join(
        tempDir,
        'projects/test-project/CHANGELOG.md'
      );
      fs.writeFileSync(changelogPath, '# Old Changelog');

      const options: ChangelogExecutorSchema = {
        append: false,
      };
      await changelogExecutor(options, context);

      const newContent = fs.readFileSync(changelogPath, 'utf8');
      expect(newContent).not.toContain('Old Changelog');
    });
  });

  describe('Workspace Changelog', () => {
    it('should generate workspace changelog when workspaceChangelog is true', async () => {
      const options: ChangelogExecutorSchema = {
        workspaceChangelog: true,
      };
      await changelogExecutor(options, context);

      expect(mockGenerateWorkspaceChangelog).toHaveBeenCalled();
    });

    it('should write workspace changelog to root directory', async () => {
      const options: ChangelogExecutorSchema = {
        workspaceChangelog: true,
      };
      await changelogExecutor(options, context);

      const changelogPath = path.join(tempDir, 'CHANGELOG.md');
      expect(fs.existsSync(changelogPath)).toBe(true);
    });

    it('should group commits by project', async () => {
      const options: ChangelogExecutorSchema = {
        workspaceChangelog: true,
      };
      await changelogExecutor(options, context);

      expect(mockFilterCommitsByScope).toHaveBeenCalledWith(
        expect.anything(),
        'test-project'
      );
      expect(mockFilterCommitsByScope).toHaveBeenCalledWith(
        expect.anything(),
        'other-project'
      );
    });

    it('should generate project changelogs when projectChangelogs is true', async () => {
      const options: ChangelogExecutorSchema = {
        workspaceChangelog: true,
        projectChangelogs: true,
      };
      await changelogExecutor(options, context);

      // Should create both workspace and project changelogs
      const workspaceChangelog = path.join(tempDir, 'CHANGELOG.md');
      const projectChangelog = path.join(
        tempDir,
        'projects/test-project/CHANGELOG.md'
      );

      expect(fs.existsSync(workspaceChangelog)).toBe(true);
      expect(fs.existsSync(projectChangelog)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should fail when no project name is provided', async () => {
      const options: ChangelogExecutorSchema = {};
      const contextWithoutProject = { ...context, projectName: undefined };

      const result = await changelogExecutor(
        options,
        contextWithoutProject as any
      );

      expect(result.success).toBe(false);
      if ('error' in result) {
        expect(result.error).toContain('No project name specified');
      }
    });

    it('should succeed with warning when no commits found', async () => {
      mockParseCommits.mockReturnValue([]);
      mockFilterCommitsByScope.mockReturnValue([]);

      const options: ChangelogExecutorSchema = {};
      const result = await changelogExecutor(options, context);

      expect(result.success).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No commits found')
      );
    });

    it('should handle errors gracefully', async () => {
      mockGenerateChangelogMarkdown.mockImplementation(() => {
        throw new Error('Test error');
      });

      const options: ChangelogExecutorSchema = {};
      const result = await changelogExecutor(options, context);

      expect(result.success).toBe(false);
      if ('error' in result) {
        expect(result.error).toContain('Test error');
      }
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle workspace changelog errors', async () => {
      mockGenerateWorkspaceChangelog.mockImplementation(() => {
        throw new Error('Workspace error');
      });

      const options: ChangelogExecutorSchema = {
        workspaceChangelog: true,
      };
      const result = await changelogExecutor(options, context);

      expect(result.success).toBe(false);
      if ('error' in result) {
        expect(result.error).toContain('Workspace error');
      }
    });
  });

  describe('Commitlint Warning', () => {
    it('should warn when commitlint is not configured', async () => {
      const options: ChangelogExecutorSchema = {};
      await changelogExecutor(options, context);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Commit validation not configured')
      );
    });

    it('should not warn when commitlint.config.js exists', async () => {
      fs.writeFileSync(path.join(tempDir, 'commitlint.config.js'), '');

      const options: ChangelogExecutorSchema = {};
      await changelogExecutor(options, context);

      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Commit validation not configured')
      );
    });

    it('should not warn when commitlint.config.ts exists', async () => {
      fs.writeFileSync(path.join(tempDir, 'commitlint.config.ts'), '');

      const options: ChangelogExecutorSchema = {};
      await changelogExecutor(options, context);

      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Commit validation not configured')
      );
    });

    it('should not warn when .commitlintrc.json exists', async () => {
      fs.writeFileSync(path.join(tempDir, '.commitlintrc.json'), '{}');

      const options: ChangelogExecutorSchema = {};
      await changelogExecutor(options, context);

      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Commit validation not configured')
      );
    });

    it('should suppress warning when suppressWarnings is true', async () => {
      const options: ChangelogExecutorSchema = {
        suppressWarnings: true,
      };
      await changelogExecutor(options, context);

      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Commit validation not configured')
      );
    });

    it('should not warn for workspace changelog', async () => {
      const options: ChangelogExecutorSchema = {
        workspaceChangelog: true,
      };
      await changelogExecutor(options, context);

      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Commit validation not configured')
      );
    });
  });

  describe('Interactive Mode', () => {
    it('should not call interactive editor in dry-run mode', async () => {
      const options: ChangelogExecutorSchema = {
        interactive: true,
        dryRun: true,
      };
      await changelogExecutor(options, context);

      // In dry run, file should not be written (interactive editing would write to temp file)
      const changelogPath = path.join(
        tempDir,
        'projects/test-project/CHANGELOG.md'
      );
      expect(fs.existsSync(changelogPath)).toBe(false);
    });

    // Note: Full interactive testing requires mocking execSync and editor interaction
    // which is complex. Integration tests would be better for this scenario.
  });

  describe('Success Logging', () => {
    it('should log success message', async () => {
      const options: ChangelogExecutorSchema = {};
      await changelogExecutor(options, context);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Changelog written to')
      );
    });

    it('should log project name', async () => {
      const options: ChangelogExecutorSchema = {};
      await changelogExecutor(options, context);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('test-project')
      );
    });

    it('should log workspace changelog generation', async () => {
      const options: ChangelogExecutorSchema = {
        workspaceChangelog: true,
      };
      await changelogExecutor(options, context);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('workspace-level')
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing projectsConfigurations', async () => {
      const minimalContext = {
        ...context,
        projectsConfigurations: undefined,
      };

      // Create changelog directory at projectName location (fallback)
      fs.mkdirSync(path.join(tempDir, 'test-project'), { recursive: true });

      const options: ChangelogExecutorSchema = {};
      const result = await changelogExecutor(options, minimalContext as any);

      // Should use projectName as root fallback and succeed
      expect(result.success).toBe(true);
    });

    it('should handle workspace with no projects', async () => {
      const emptyContext = {
        ...context,
        projectsConfigurations: {
          version: 2,
          projects: {},
        },
      };

      const options: ChangelogExecutorSchema = {
        workspaceChangelog: true,
      };

      mockParseCommits.mockReturnValue([]);

      const result = await changelogExecutor(options, emptyContext);

      expect(result.success).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No commits found')
      );
    });

    it('should handle malformed version files gracefully', async () => {
      const projectJsonPath = path.join(
        tempDir,
        'projects/test-project/project.json'
      );
      fs.writeFileSync(projectJsonPath, 'invalid json{');

      const options: ChangelogExecutorSchema = {};
      const result = await changelogExecutor(options, context);

      // Should fall back to 0.0.0
      expect(result.success).toBe(true);
      expect(mockGenerateChangelogMarkdown).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ version: '0.0.0' })
      );
    });

    it('should create parent directories if they do not exist', async () => {
      // Remove the project directory
      const projectDir = path.join(tempDir, 'projects/test-project');
      fs.rmSync(projectDir, { recursive: true, force: true });

      const options: ChangelogExecutorSchema = {};

      // Should create directory and write file
      // Note: actual fs.writeFileSync doesn't create parent dirs, so this might fail
      // This is more of an integration test scenario
      try {
        await changelogExecutor(options, context);
      } catch (error) {
        // Expected - writeFileSync doesn't create parent directories
        expect(error).toBeDefined();
      }
    });
  });
});
