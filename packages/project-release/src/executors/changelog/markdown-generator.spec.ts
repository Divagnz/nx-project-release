import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import {
  generateChangelogMarkdown,
  generateCompactChangelog,
  generateWorkspaceChangelog,
  getRepositoryUrl,
  getCompareUrl,
  ChangelogOptions,
} from './markdown-generator.js';
import { ParsedCommit } from './commit-parser.js';
import * as childProcess from 'child_process';

// Mock child_process
jest.mock('child_process');
const mockExecSync = childProcess.execSync as jest.MockedFunction<
  typeof childProcess.execSync
>;

describe('Markdown Generator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateChangelogMarkdown()', () => {
    const sampleCommits: ParsedCommit[] = [
      {
        hash: 'abc123',
        type: 'feat',
        scope: 'core',
        subject: 'add new feature',
        breaking: false,
      },
      {
        hash: 'def456',
        type: 'fix',
        scope: 'api',
        subject: 'fix bug',
        breaking: false,
      },
      {
        hash: 'ghi789',
        type: 'docs',
        subject: 'update documentation',
        breaking: false,
      },
    ];

    it('should generate basic changelog markdown', () => {
      const markdown = generateChangelogMarkdown(sampleCommits);
      expect(markdown).toBeDefined();
      expect(markdown).toContain('Features');
      expect(markdown).toContain('Bug Fixes');
      expect(markdown).toContain('Documentation');
    });

    it('should include commit subjects', () => {
      const markdown = generateChangelogMarkdown(sampleCommits);
      expect(markdown).toContain('add new feature');
      expect(markdown).toContain('fix bug');
      expect(markdown).toContain('update documentation');
    });

    it('should include scopes when present', () => {
      const markdown = generateChangelogMarkdown(sampleCommits);
      expect(markdown).toContain('**core:**');
      expect(markdown).toContain('**api:**');
    });

    it('should include commit hashes as short hashes', () => {
      const markdown = generateChangelogMarkdown(sampleCommits);
      expect(markdown).toContain('abc123');
      expect(markdown).toContain('def456');
      expect(markdown).toContain('ghi789');
    });

    it('should format commit hashes as links when repository URL provided', () => {
      const options: ChangelogOptions = {
        repositoryUrl: 'https://github.com/user/repo',
      };
      const markdown = generateChangelogMarkdown(sampleCommits, options);
      expect(markdown).toContain(
        '[abc123](https://github.com/user/repo/commit/abc123)'
      );
      expect(markdown).toContain(
        '[def456](https://github.com/user/repo/commit/def456)'
      );
    });

    it('should add version header when version provided', () => {
      const options: ChangelogOptions = {
        version: '1.2.3',
        date: '2024-01-15',
      };
      const markdown = generateChangelogMarkdown(sampleCommits, options);
      expect(markdown).toContain('## [1.2.3]');
      expect(markdown).toContain('(2024-01-15)');
    });

    it('should use current date if date not provided', () => {
      const options: ChangelogOptions = {
        version: '1.2.3',
      };
      const markdown = generateChangelogMarkdown(sampleCommits, options);
      const currentDate = new Date().toISOString().split('T')[0];
      expect(markdown).toContain(currentDate);
    });

    it('should handle empty commits array', () => {
      const markdown = generateChangelogMarkdown([]);
      expect(markdown).toBe('### No changes\n');
    });

    describe('Breaking changes', () => {
      const commitsWithBreaking: ParsedCommit[] = [
        {
          hash: 'abc123',
          type: 'feat',
          scope: 'api',
          subject: 'new feature',
          breaking: true,
          breakingMessage: 'API changed significantly',
        },
        {
          hash: 'def456',
          type: 'fix',
          subject: 'regular fix',
          breaking: false,
        },
      ];

      it('should create breaking changes section', () => {
        const markdown = generateChangelogMarkdown(commitsWithBreaking);
        expect(markdown).toContain('### ⚠ BREAKING CHANGES');
      });

      it('should list breaking changes first', () => {
        const markdown = generateChangelogMarkdown(commitsWithBreaking);
        const breakingIndex = markdown.indexOf('BREAKING CHANGES');
        const bugFixesIndex = markdown.indexOf('Bug Fixes');
        // Breaking changes should appear before any regular commit sections
        expect(breakingIndex).toBeGreaterThan(-1);
        if (bugFixesIndex > -1) {
          expect(breakingIndex).toBeLessThan(bugFixesIndex);
        }
      });

      it('should use breaking message when available', () => {
        const markdown = generateChangelogMarkdown(commitsWithBreaking);
        expect(markdown).toContain('API changed significantly');
      });

      it('should fall back to subject when no breaking message', () => {
        const commits: ParsedCommit[] = [
          {
            hash: 'abc123',
            type: 'feat',
            subject: 'breaking change without message',
            breaking: true,
          },
        ];
        const markdown = generateChangelogMarkdown(commits);
        expect(markdown).toContain('breaking change without message');
      });
    });

    describe('Commit type ordering', () => {
      const mixedCommits: ParsedCommit[] = [
        { hash: '1', type: 'chore', subject: 'chore task', breaking: false },
        { hash: '2', type: 'feat', subject: 'new feature', breaking: false },
        { hash: '3', type: 'fix', subject: 'bug fix', breaking: false },
        { hash: '4', type: 'docs', subject: 'documentation', breaking: false },
      ];

      it('should order commit types correctly', () => {
        const markdown = generateChangelogMarkdown(mixedCommits);
        const featIndex = markdown.indexOf('### Features');
        const fixIndex = markdown.indexOf('### Bug Fixes');
        const docsIndex = markdown.indexOf('### Documentation');
        const choreIndex = markdown.indexOf('### Chores');

        expect(featIndex).toBeLessThan(fixIndex);
        expect(fixIndex).toBeLessThan(docsIndex);
        expect(docsIndex).toBeLessThan(choreIndex);
      });
    });

    describe('Custom commit types', () => {
      it('should handle unknown commit types', () => {
        const commits: ParsedCommit[] = [
          {
            hash: 'abc123',
            type: 'custom',
            subject: 'custom change',
            breaking: false,
          },
        ];
        const markdown = generateChangelogMarkdown(commits);
        expect(markdown).toContain('### Custom'); // Capitalized
      });
    });

    describe('Edge cases', () => {
      it('should handle commits without scope', () => {
        const commits: ParsedCommit[] = [
          {
            hash: 'abc123',
            type: 'feat',
            subject: 'feature without scope',
            breaking: false,
          },
        ];
        const markdown = generateChangelogMarkdown(commits);
        expect(markdown).not.toContain('**:**');
        expect(markdown).toContain('feature without scope');
      });

      it('should handle repository URL ending with .git', () => {
        const commits: ParsedCommit[] = [
          {
            hash: 'abc123',
            type: 'feat',
            subject: 'test',
            breaking: false,
          },
        ];
        const options: ChangelogOptions = {
          repositoryUrl: 'https://github.com/user/repo.git',
        };
        const markdown = generateChangelogMarkdown(commits, options);
        expect(markdown).toContain(
          'https://github.com/user/repo/commit/abc123'
        );
        expect(markdown).not.toContain('.git/commit');
      });
    });
  });

  describe('generateCompactChangelog()', () => {
    it('should generate compact summary', () => {
      const commits: ParsedCommit[] = [
        { hash: '1', type: 'feat', subject: 'feature 1', breaking: false },
        { hash: '2', type: 'feat', subject: 'feature 2', breaking: false },
        { hash: '3', type: 'fix', subject: 'fix 1', breaking: false },
      ];
      const compact = generateCompactChangelog(commits);
      expect(compact).toBe('2 features, 1 fixes');
    });

    it('should include breaking changes count', () => {
      const commits: ParsedCommit[] = [
        { hash: '1', type: 'feat', subject: 'feature', breaking: true },
        { hash: '2', type: 'fix', subject: 'fix', breaking: false },
      ];
      const compact = generateCompactChangelog(commits);
      expect(compact).toContain('1 breaking');
    });

    it('should count other commit types', () => {
      const commits: ParsedCommit[] = [
        { hash: '1', type: 'feat', subject: 'feature', breaking: false },
        { hash: '2', type: 'docs', subject: 'docs', breaking: false },
        { hash: '3', type: 'chore', subject: 'chore', breaking: false },
      ];
      const compact = generateCompactChangelog(commits);
      expect(compact).toContain('1 features');
      expect(compact).toContain('2 other');
    });

    it('should handle empty commits', () => {
      const compact = generateCompactChangelog([]);
      expect(compact).toBe('No changes');
    });

    it('should handle only features', () => {
      const commits: ParsedCommit[] = [
        { hash: '1', type: 'feat', subject: 'feature 1', breaking: false },
      ];
      const compact = generateCompactChangelog(commits);
      expect(compact).toBe('1 features');
    });

    it('should handle only fixes', () => {
      const commits: ParsedCommit[] = [
        { hash: '1', type: 'fix', subject: 'fix 1', breaking: false },
      ];
      const compact = generateCompactChangelog(commits);
      expect(compact).toBe('1 fixes');
    });
  });

  describe('generateWorkspaceChangelog()', () => {
    const project1Commits: ParsedCommit[] = [
      {
        hash: '1',
        type: 'feat',
        scope: 'project-a',
        subject: 'feature A',
        breaking: false,
      },
      {
        hash: '2',
        type: 'fix',
        scope: 'project-a',
        subject: 'fix A',
        breaking: false,
      },
    ];

    const project2Commits: ParsedCommit[] = [
      {
        hash: '3',
        type: 'feat',
        scope: 'project-b',
        subject: 'feature B',
        breaking: false,
      },
    ];

    const commitsByProject = new Map<string, ParsedCommit[]>([
      ['project-a', project1Commits],
      ['project-b', project2Commits],
    ]);

    it('should generate workspace changelog with project sections', () => {
      const markdown = generateWorkspaceChangelog(commitsByProject);
      expect(markdown).toContain('## project-a');
      expect(markdown).toContain('## project-b');
    });

    it('should include project commits', () => {
      const markdown = generateWorkspaceChangelog(commitsByProject);
      expect(markdown).toContain('feature A');
      expect(markdown).toContain('fix A');
      expect(markdown).toContain('feature B');
    });

    it('should add version header when provided', () => {
      const options: ChangelogOptions = {
        version: '1.0.0',
        date: '2024-01-15',
      };
      const markdown = generateWorkspaceChangelog(commitsByProject, options);
      expect(markdown).toContain('# 1.0.0 (2024-01-15)');
    });

    it('should sort projects alphabetically', () => {
      const unsorted = new Map<string, ParsedCommit[]>([
        ['z-project', project1Commits],
        ['a-project', project2Commits],
      ]);
      const markdown = generateWorkspaceChangelog(unsorted);
      const aIndex = markdown.indexOf('## a-project');
      const zIndex = markdown.indexOf('## z-project');
      expect(aIndex).toBeLessThan(zIndex);
    });

    it('should handle empty commits map', () => {
      const markdown = generateWorkspaceChangelog(new Map());
      expect(markdown).toContain('### No changes');
    });

    it('should handle global changes with wildcard scope', () => {
      const globalCommits: ParsedCommit[] = [
        {
          hash: '1',
          type: 'feat',
          scope: '*',
          subject: 'global feature',
          breaking: false,
        },
      ];
      const withGlobal = new Map<string, ParsedCommit[]>([
        ['project-a', project1Commits],
        ['global', globalCommits],
      ]);
      const markdown = generateWorkspaceChangelog(withGlobal);
      expect(markdown).toContain('Global Changes');
    });
  });

  describe('getRepositoryUrl()', () => {
    beforeEach(() => {
      mockExecSync.mockReset();
    });

    it('should get repository URL from git remote', () => {
      mockExecSync.mockReturnValue('https://github.com/user/repo.git\n' as any);
      const url = getRepositoryUrl('/fake/path');
      expect(url).toBe('https://github.com/user/repo');
      expect(mockExecSync).toHaveBeenCalledWith(
        'git config --get remote.origin.url',
        expect.objectContaining({ cwd: '/fake/path' })
      );
    });

    it('should convert SSH URL to HTTPS', () => {
      mockExecSync.mockReturnValue('git@github.com:user/repo.git\n' as any);
      const url = getRepositoryUrl('/fake/path');
      expect(url).toBe('https://github.com/user/repo');
    });

    it('should remove .git suffix from HTTPS URL', () => {
      mockExecSync.mockReturnValue('https://github.com/user/repo.git\n' as any);
      const url = getRepositoryUrl('/fake/path');
      expect(url).toBe('https://github.com/user/repo');
    });

    it('should handle URL without .git suffix', () => {
      mockExecSync.mockReturnValue('https://github.com/user/repo\n' as any);
      const url = getRepositoryUrl('/fake/path');
      expect(url).toBe('https://github.com/user/repo');
    });

    it('should handle GitLab SSH URLs', () => {
      mockExecSync.mockReturnValue('git@gitlab.com:group/project.git\n' as any);
      const url = getRepositoryUrl('/fake/path');
      expect(url).toBe('https://gitlab.com/group/project');
    });

    it('should return undefined when git command fails', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Not a git repository');
      });
      const url = getRepositoryUrl('/fake/path');
      expect(url).toBeUndefined();
    });

    it('should trim whitespace from URL', () => {
      mockExecSync.mockReturnValue(
        '  https://github.com/user/repo.git  \n' as any
      );
      const url = getRepositoryUrl('/fake/path');
      expect(url).toBe('https://github.com/user/repo');
    });
  });

  describe('getCompareUrl()', () => {
    beforeEach(() => {
      mockExecSync.mockReset();
    });

    it('should generate compare URL', () => {
      mockExecSync.mockReturnValue('https://github.com/user/repo.git\n' as any);
      const url = getCompareUrl('/fake/path', 'v1.0.0', 'v1.1.0');
      expect(url).toBe('https://github.com/user/repo/compare/v1.0.0...v1.1.0');
    });

    it('should return undefined when repository URL cannot be determined', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Not a git repository');
      });
      const url = getCompareUrl('/fake/path', 'v1.0.0', 'v1.1.0');
      expect(url).toBeUndefined();
    });

    it('should handle tag names with slashes', () => {
      mockExecSync.mockReturnValue('https://github.com/user/repo\n' as any);
      const url = getCompareUrl(
        '/fake/path',
        'release/v1.0.0',
        'release/v1.1.0'
      );
      expect(url).toBe(
        'https://github.com/user/repo/compare/release/v1.0.0...release/v1.1.0'
      );
    });
  });
});
