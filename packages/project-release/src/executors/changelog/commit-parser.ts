import { execSync } from 'child_process';

export interface ParsedCommit {
  hash: string;
  type: string;
  scope?: string;
  subject: string;
  body?: string;
  breaking: boolean;
  breakingMessage?: string;
  footer?: string;
}

export interface CommitGroup {
  title: string;
  commits: ParsedCommit[];
}

/**
 * Parse a conventional commit message
 * Format: type(scope): subject
 *         BREAKING CHANGE: description
 * Or: type(scope)!: subject
 */
export function parseConventionalCommit(commitMessage: string, hash: string): ParsedCommit | null {
  const lines = commitMessage.split('\n');
  const firstLine = lines[0].trim();

  if (!firstLine) return null;

  // Regex: type(scope)?!?: subject
  const conventionalPattern = /^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/;
  const match = firstLine.match(conventionalPattern);

  if (!match) return null;

  const [, type, scope, bangBreaking, subject] = match;

  // Parse body and check for BREAKING CHANGE
  const body = lines.slice(1).join('\n').trim();
  const breakingMatch = body.match(/BREAKING CHANGE:\s*(.+)/);
  const breaking = !!bangBreaking || !!breakingMatch;
  const breakingMessage = breakingMatch ? breakingMatch[1].trim() : undefined;

  // Extract footer (everything after last blank line)
  const footerMatch = body.match(/\n\n([^]+)$/);
  const footer = footerMatch ? footerMatch[1].trim() : undefined;

  return {
    hash,
    type: type.toLowerCase(),
    scope,
    subject: subject.trim(),
    body: body || undefined,
    breaking,
    breakingMessage,
    footer
  };
}

/**
 * Get commits from git log since last tag or all commits
 */
export function getCommitsFromGit(
  cwd: string,
  from?: string,
  to?: string,
  projectName?: string
): string[] {
  let gitCommand = 'git log --format="%H|%s%n%b%n===END===" --no-merges';

  if (from && to) {
    gitCommand += ` ${from}..${to}`;
  } else if (from) {
    gitCommand += ` ${from}..HEAD`;
  } else if (projectName) {
    // Try to find last tag for this project
    try {
      const lastTag = execSync(
        `git tag --list --sort=-version:refname | grep -E "^${projectName}-v|^v" | head -1`,
        {
          cwd,
          encoding: 'utf8',
          stdio: 'pipe'
        }
      ).trim();

      if (lastTag) {
        gitCommand += ` ${lastTag}..HEAD`;
      }
    } catch {
      // No previous tags, get all commits
    }
  }

  try {
    const output = execSync(gitCommand, {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();

    if (!output) return [];

    // Split by ===END=== marker
    const commitBlocks = output.split('===END===').filter(block => block.trim());

    return commitBlocks.map(block => block.trim()).filter(Boolean);
  } catch (error) {
    console.error('Failed to get git commits:', error);
    return [];
  }
}

/**
 * Parse all commits from git log output
 */
export function parseCommits(commitBlocks: string[]): ParsedCommit[] {
  const parsed: ParsedCommit[] = [];

  for (const block of commitBlocks) {
    const lines = block.split('\n');
    if (lines.length === 0) continue;

    // First line: hash|subject
    const firstLine = lines[0];
    const pipeIndex = firstLine.indexOf('|');
    if (pipeIndex === -1) continue;

    const hash = firstLine.substring(0, pipeIndex).trim();
    const message = firstLine.substring(pipeIndex + 1).trim() + '\n' + lines.slice(1).join('\n');

    const commit = parseConventionalCommit(message, hash);
    if (commit) {
      parsed.push(commit);
    }
  }

  return parsed;
}

/**
 * Filter commits by project scope
 * Supports: feat(project-name): ...
 * Or: feat(project-name,other): ...
 * Or: feat: ... (if no scope, include in all)
 */
export function filterCommitsByScope(commits: ParsedCommit[], projectName?: string): ParsedCommit[] {
  if (!projectName) return commits;

  return commits.filter(commit => {
    // No scope = applies to all projects
    if (!commit.scope) return true;

    // Check if scope includes this project
    const scopes = commit.scope.split(',').map(s => s.trim());
    return scopes.includes(projectName) || scopes.includes('*');
  });
}

/**
 * Group commits by type
 */
export function groupCommitsByType(commits: ParsedCommit[]): Map<string, ParsedCommit[]> {
  const groups = new Map<string, ParsedCommit[]>();

  for (const commit of commits) {
    const existing = groups.get(commit.type) || [];
    existing.push(commit);
    groups.set(commit.type, existing);
  }

  return groups;
}

/**
 * Get display title for commit type
 */
export function getCommitTypeTitle(type: string): string {
  const titles: Record<string, string> = {
    feat: 'Features',
    fix: 'Bug Fixes',
    docs: 'Documentation',
    style: 'Styles',
    refactor: 'Code Refactoring',
    perf: 'Performance Improvements',
    test: 'Tests',
    build: 'Build System',
    ci: 'Continuous Integration',
    chore: 'Chores',
    revert: 'Reverts'
  };

  return titles[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Order for commit types in changelog
 */
export const COMMIT_TYPE_ORDER = [
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
  'revert'
];
