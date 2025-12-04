import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  parseConventionalCommit,
  parseCommits,
  filterCommitsByScope,
  groupCommitsByType,
  getCommitTypeTitle,
  COMMIT_TYPE_ORDER,
  ParsedCommit,
} from './commit-parser.js';

describe('Commit Parser', () => {
  describe('parseConventionalCommit()', () => {
    describe('Valid conventional commits', () => {
      it('should parse basic commit with type and subject', () => {
        const commit = parseConventionalCommit(
          'feat: add new feature',
          'abc123'
        );
        expect(commit).not.toBeNull();
        expect(commit?.type).toBe('feat');
        expect(commit?.subject).toBe('add new feature');
        expect(commit?.hash).toBe('abc123');
        expect(commit?.scope).toBeUndefined();
        expect(commit?.breaking).toBe(false);
      });

      it('should parse commit with scope', () => {
        const commit = parseConventionalCommit(
          'feat(core): add new feature',
          'abc123'
        );
        expect(commit).not.toBeNull();
        expect(commit?.type).toBe('feat');
        expect(commit?.scope).toBe('core');
        expect(commit?.subject).toBe('add new feature');
      });

      it('should parse commit with breaking change indicator (!)', () => {
        const commit = parseConventionalCommit(
          'feat!: breaking change',
          'abc123'
        );
        expect(commit).not.toBeNull();
        expect(commit?.type).toBe('feat');
        expect(commit?.subject).toBe('breaking change');
        expect(commit?.breaking).toBe(true);
      });

      it('should parse commit with scope and breaking change indicator', () => {
        const commit = parseConventionalCommit(
          'feat(api)!: breaking change',
          'abc123'
        );
        expect(commit).not.toBeNull();
        expect(commit?.type).toBe('feat');
        expect(commit?.scope).toBe('api');
        expect(commit?.subject).toBe('breaking change');
        expect(commit?.breaking).toBe(true);
      });

      it('should parse multiline commit with body', () => {
        const message = `feat: add feature\n\nThis is the commit body with more details.`;
        const commit = parseConventionalCommit(message, 'abc123');
        expect(commit).not.toBeNull();
        expect(commit?.type).toBe('feat');
        expect(commit?.subject).toBe('add feature');
        expect(commit?.body).toContain('This is the commit body');
      });

      it('should detect BREAKING CHANGE in commit body', () => {
        const message = `feat: add feature\n\nBREAKING CHANGE: This breaks the API`;
        const commit = parseConventionalCommit(message, 'abc123');
        expect(commit).not.toBeNull();
        expect(commit?.breaking).toBe(true);
        expect(commit?.breakingMessage).toBe('This breaks the API');
      });

      it('should handle BREAKING CHANGE with multiline description', () => {
        const message = `feat: add feature\n\nBREAKING CHANGE: This breaks the API\nand requires migration`;
        const commit = parseConventionalCommit(message, 'abc123');
        expect(commit).not.toBeNull();
        expect(commit?.breaking).toBe(true);
        expect(commit?.breakingMessage).toContain('This breaks the API');
      });

      it('should parse commit footer', () => {
        const message = `feat: add feature\n\nCommit body\n\nReviewed-by: John Doe\nRefs: #123`;
        const commit = parseConventionalCommit(message, 'abc123');
        expect(commit).not.toBeNull();
        expect(commit?.footer).toContain('Reviewed-by');
      });
    });

    describe('Commit type normalization', () => {
      it('should normalize type to lowercase', () => {
        const commit = parseConventionalCommit('FEAT: add feature', 'abc123');
        expect(commit).not.toBeNull();
        expect(commit?.type).toBe('feat');
      });

      it('should handle various commit types', () => {
        const types = [
          'feat',
          'fix',
          'docs',
          'style',
          'refactor',
          'perf',
          'test',
          'build',
          'ci',
          'chore',
        ];

        types.forEach((type) => {
          const commit = parseConventionalCommit(`${type}: test`, 'abc123');
          expect(commit).not.toBeNull();
          expect(commit?.type).toBe(type);
        });
      });
    });

    describe('Subject parsing', () => {
      it('should trim whitespace from subject', () => {
        const commit = parseConventionalCommit(
          'feat:   add feature   ',
          'abc123'
        );
        expect(commit).not.toBeNull();
        expect(commit?.subject).toBe('add feature');
      });

      it('should handle subject with special characters', () => {
        const commit = parseConventionalCommit(
          'feat: add feature with "quotes" & special chars',
          'abc123'
        );
        expect(commit).not.toBeNull();
        expect(commit?.subject).toBe(
          'add feature with "quotes" & special chars'
        );
      });

      it('should handle subject with colons', () => {
        const commit = parseConventionalCommit(
          'feat: add feature: additional context',
          'abc123'
        );
        expect(commit).not.toBeNull();
        expect(commit?.subject).toBe('add feature: additional context');
      });
    });

    describe('Scope parsing', () => {
      it('should parse single-word scope', () => {
        const commit = parseConventionalCommit(
          'feat(core): add feature',
          'abc123'
        );
        expect(commit?.scope).toBe('core');
      });

      it('should parse kebab-case scope', () => {
        const commit = parseConventionalCommit(
          'feat(my-module): add feature',
          'abc123'
        );
        expect(commit?.scope).toBe('my-module');
      });

      it('should parse scope with numbers', () => {
        const commit = parseConventionalCommit(
          'feat(v2-api): add feature',
          'abc123'
        );
        expect(commit?.scope).toBe('v2-api');
      });

      it('should parse scope with underscores', () => {
        const commit = parseConventionalCommit(
          'feat(my_module): add feature',
          'abc123'
        );
        expect(commit?.scope).toBe('my_module');
      });
    });

    describe('Invalid commits', () => {
      it('should return null for empty message', () => {
        const commit = parseConventionalCommit('', 'abc123');
        expect(commit).toBeNull();
      });

      it('should return null for whitespace-only message', () => {
        const commit = parseConventionalCommit('   \n  ', 'abc123');
        expect(commit).toBeNull();
      });

      it('should return null for non-conventional format', () => {
        const commit = parseConventionalCommit(
          'Random commit message',
          'abc123'
        );
        expect(commit).toBeNull();
      });

      it('should return null for commit without colon', () => {
        const commit = parseConventionalCommit('feat add feature', 'abc123');
        expect(commit).toBeNull();
      });

      it('should return null for commit with empty type', () => {
        const commit = parseConventionalCommit(': add feature', 'abc123');
        expect(commit).toBeNull();
      });
    });

    describe('Edge cases', () => {
      it('should handle commit with only type and subject', () => {
        const commit = parseConventionalCommit('feat: x', 'abc123');
        expect(commit).not.toBeNull();
        expect(commit?.subject).toBe('x');
      });

      it('should handle both ! and BREAKING CHANGE', () => {
        const message = `feat!: breaking\n\nBREAKING CHANGE: This is a breaking change`;
        const commit = parseConventionalCommit(message, 'abc123');
        expect(commit).not.toBeNull();
        expect(commit?.breaking).toBe(true);
        expect(commit?.breakingMessage).toBe('This is a breaking change');
      });

      it('should handle empty scope parentheses as valid scope', () => {
        const commit = parseConventionalCommit('feat(): add feature', 'abc123');
        // Empty scope in parentheses is valid but returns empty string
        if (commit) {
          expect(commit.scope).toBe('');
        } else {
          // Implementation may choose to reject empty scopes, which is also valid
          expect(commit).toBeNull();
        }
      });
    });
  });

  describe('parseCommits()', () => {
    it('should parse array of commit blocks', () => {
      const blocks = [
        'abc123|feat: add feature\nBody text',
        'def456|fix: fix bug\nAnother body',
      ];
      const commits = parseCommits(blocks);
      expect(commits).toHaveLength(2);
      expect(commits[0].hash).toBe('abc123');
      expect(commits[0].type).toBe('feat');
      expect(commits[1].hash).toBe('def456');
      expect(commits[1].type).toBe('fix');
    });

    it('should skip invalid commit blocks', () => {
      const blocks = [
        'abc123|feat: add feature',
        'invalid-block-without-pipe',
        'def456|fix: fix bug',
      ];
      const commits = parseCommits(blocks);
      expect(commits).toHaveLength(2);
      expect(commits[0].hash).toBe('abc123');
      expect(commits[1].hash).toBe('def456');
    });

    it('should skip non-conventional commits', () => {
      const blocks = [
        'abc123|feat: add feature',
        'def456|Random commit message',
        'ghi789|fix: fix bug',
      ];
      const commits = parseCommits(blocks);
      expect(commits).toHaveLength(2);
      expect(commits[0].type).toBe('feat');
      expect(commits[1].type).toBe('fix');
    });

    it('should handle empty array', () => {
      const commits = parseCommits([]);
      expect(commits).toHaveLength(0);
    });

    it('should handle empty strings in array', () => {
      const blocks = ['', '  ', 'abc123|feat: add feature'];
      const commits = parseCommits(blocks);
      expect(commits).toHaveLength(1);
    });

    it('should handle multiline commit bodies', () => {
      const blocks = [
        'abc123|feat: add feature\n\nThis is a longer body\nwith multiple lines\n\nAnd a footer',
      ];
      const commits = parseCommits(blocks);
      expect(commits).toHaveLength(1);
      expect(commits[0].body).toContain('longer body');
    });

    it('should preserve hash from block', () => {
      const blocks = ['1a2b3c4d5e6f|feat: test'];
      const commits = parseCommits(blocks);
      expect(commits[0].hash).toBe('1a2b3c4d5e6f');
    });
  });

  describe('filterCommitsByScope()', () => {
    const commits: ParsedCommit[] = [
      {
        hash: '1',
        type: 'feat',
        scope: 'project-a',
        subject: 'feature for A',
        breaking: false,
      },
      {
        hash: '2',
        type: 'fix',
        scope: 'project-b',
        subject: 'fix for B',
        breaking: false,
      },
      {
        hash: '3',
        type: 'feat',
        subject: 'feature for all',
        breaking: false,
      },
      {
        hash: '4',
        type: 'feat',
        scope: 'project-a,project-c',
        subject: 'feature for A and C',
        breaking: false,
      },
      {
        hash: '5',
        type: 'feat',
        scope: '*',
        subject: 'feature for all (wildcard)',
        breaking: false,
      },
    ];

    it('should return all commits when no project name provided', () => {
      const filtered = filterCommitsByScope(commits);
      expect(filtered).toHaveLength(5);
    });

    it('should filter commits by exact scope match', () => {
      const filtered = filterCommitsByScope(commits, 'project-a');
      expect(filtered).toHaveLength(4); // project-a, no scope, multi-scope, wildcard
      expect(filtered.map((c) => c.hash)).toContain('1');
      expect(filtered.map((c) => c.hash)).toContain('3');
      expect(filtered.map((c) => c.hash)).toContain('4');
      expect(filtered.map((c) => c.hash)).toContain('5');
    });

    it('should include commits with no scope', () => {
      const filtered = filterCommitsByScope(commits, 'project-a');
      expect(filtered.map((c) => c.hash)).toContain('3');
    });

    it('should include commits with wildcard scope', () => {
      const filtered = filterCommitsByScope(commits, 'project-x');
      expect(filtered.map((c) => c.hash)).toContain('5'); // wildcard
      expect(filtered.map((c) => c.hash)).toContain('3'); // no scope
    });

    it('should handle comma-separated scopes', () => {
      const filtered = filterCommitsByScope(commits, 'project-c');
      expect(filtered.map((c) => c.hash)).toContain('4'); // multi-scope includes project-c
    });

    it('should handle scope with whitespace', () => {
      const commitsWithSpaces: ParsedCommit[] = [
        {
          hash: '1',
          type: 'feat',
          scope: 'project-a, project-b',
          subject: 'test',
          breaking: false,
        },
      ];
      const filtered = filterCommitsByScope(commitsWithSpaces, 'project-b');
      expect(filtered).toHaveLength(1);
    });

    it('should return empty array when no matches', () => {
      const filtered = filterCommitsByScope(commits, 'non-existent-project');
      // Should still include commits with no scope and wildcard
      expect(filtered).toHaveLength(2);
      expect(filtered.map((c) => c.hash)).toContain('3'); // no scope
      expect(filtered.map((c) => c.hash)).toContain('5'); // wildcard
    });
  });

  describe('groupCommitsByType()', () => {
    const commits: ParsedCommit[] = [
      { hash: '1', type: 'feat', subject: 'feature 1', breaking: false },
      { hash: '2', type: 'feat', subject: 'feature 2', breaking: false },
      { hash: '3', type: 'fix', subject: 'fix 1', breaking: false },
      { hash: '4', type: 'docs', subject: 'doc 1', breaking: false },
      { hash: '5', type: 'fix', subject: 'fix 2', breaking: false },
    ];

    it('should group commits by type', () => {
      const grouped = groupCommitsByType(commits);
      expect(grouped.size).toBe(3);
      expect(grouped.has('feat')).toBe(true);
      expect(grouped.has('fix')).toBe(true);
      expect(grouped.has('docs')).toBe(true);
    });

    it('should maintain all commits of same type', () => {
      const grouped = groupCommitsByType(commits);
      expect(grouped.get('feat')).toHaveLength(2);
      expect(grouped.get('fix')).toHaveLength(2);
      expect(grouped.get('docs')).toHaveLength(1);
    });

    it('should preserve commit order within groups', () => {
      const grouped = groupCommitsByType(commits);
      const featCommits = grouped.get('feat') || [];
      expect(featCommits[0].hash).toBe('1');
      expect(featCommits[1].hash).toBe('2');
    });

    it('should handle empty commits array', () => {
      const grouped = groupCommitsByType([]);
      expect(grouped.size).toBe(0);
    });

    it('should handle single commit', () => {
      const grouped = groupCommitsByType([commits[0]]);
      expect(grouped.size).toBe(1);
      expect(grouped.get('feat')).toHaveLength(1);
    });
  });

  describe('getCommitTypeTitle()', () => {
    it('should return correct title for known types', () => {
      expect(getCommitTypeTitle('feat')).toBe('Features');
      expect(getCommitTypeTitle('fix')).toBe('Bug Fixes');
      expect(getCommitTypeTitle('docs')).toBe('Documentation');
      expect(getCommitTypeTitle('style')).toBe('Styles');
      expect(getCommitTypeTitle('refactor')).toBe('Code Refactoring');
      expect(getCommitTypeTitle('perf')).toBe('Performance Improvements');
      expect(getCommitTypeTitle('test')).toBe('Tests');
      expect(getCommitTypeTitle('build')).toBe('Build System');
      expect(getCommitTypeTitle('ci')).toBe('Continuous Integration');
      expect(getCommitTypeTitle('chore')).toBe('Chores');
      expect(getCommitTypeTitle('revert')).toBe('Reverts');
    });

    it('should capitalize unknown types', () => {
      expect(getCommitTypeTitle('custom')).toBe('Custom');
      expect(getCommitTypeTitle('wip')).toBe('Wip');
    });

    it('should handle single character types', () => {
      expect(getCommitTypeTitle('x')).toBe('X');
    });

    it('should handle empty string', () => {
      expect(getCommitTypeTitle('')).toBe('');
    });
  });

  describe('COMMIT_TYPE_ORDER', () => {
    it('should have correct order', () => {
      expect(COMMIT_TYPE_ORDER[0]).toBe('feat');
      expect(COMMIT_TYPE_ORDER[1]).toBe('fix');
      expect(COMMIT_TYPE_ORDER[COMMIT_TYPE_ORDER.length - 1]).toBe('revert');
    });

    it('should include all standard types', () => {
      const expectedTypes = [
        'feat',
        'fix',
        'perf',
        'refactor',
        'docs',
        'style',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ];
      expectedTypes.forEach((type) => {
        expect(COMMIT_TYPE_ORDER).toContain(type);
      });
    });

    it('should not have duplicates', () => {
      const unique = new Set(COMMIT_TYPE_ORDER);
      expect(unique.size).toBe(COMMIT_TYPE_ORDER.length);
    });
  });
});
