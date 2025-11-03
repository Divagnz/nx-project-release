import { ParsedCommit, getCommitTypeTitle, COMMIT_TYPE_ORDER } from './commit-parser.js';

export interface ChangelogOptions {
  version?: string;
  date?: string;
  projectName?: string;
  repositoryUrl?: string;
  compareUrl?: string;
}

/**
 * Generate changelog markdown from parsed commits
 */
export function generateChangelogMarkdown(
  commits: ParsedCommit[],
  options: ChangelogOptions = {}
): string {
  if (commits.length === 0) {
    return '### No changes\n';
  }

  let markdown = '';

  // Add version header if provided
  if (options.version) {
    const date = options.date || new Date().toISOString().split('T')[0];
    markdown += `## [${options.version}](${options.compareUrl || options.version}) (${date})\n\n`;
  }

  // Separate breaking changes
  const breakingChanges = commits.filter(c => c.breaking);
  const regularCommits = commits.filter(c => !c.breaking);

  // Add breaking changes section first
  if (breakingChanges.length > 0) {
    markdown += '### ⚠ BREAKING CHANGES\n\n';
    for (const commit of breakingChanges) {
      const scopeText = commit.scope ? `**${commit.scope}:**` : '';
      const message = commit.breakingMessage || commit.subject;
      const commitLink = formatCommitLink(commit.hash, options.repositoryUrl);
      markdown += `* ${scopeText} ${message} (${commitLink})\n`;
    }
    markdown += '\n';
  }

  // Group regular commits by type
  const grouped = groupByType(regularCommits);

  // Sort types by predefined order
  const sortedTypes = COMMIT_TYPE_ORDER.filter(type => grouped.has(type));

  // Add any types not in the predefined order
  for (const type of grouped.keys()) {
    if (!COMMIT_TYPE_ORDER.includes(type)) {
      sortedTypes.push(type);
    }
  }

  // Generate sections for each type
  for (const type of sortedTypes) {
    const typeCommits = grouped.get(type);
    if (!typeCommits || typeCommits.length === 0) continue;

    markdown += `### ${getCommitTypeTitle(type)}\n\n`;

    for (const commit of typeCommits) {
      const scopeText = commit.scope ? `**${commit.scope}:**` : '';
      const commitLink = formatCommitLink(commit.hash, options.repositoryUrl);
      markdown += `* ${scopeText} ${commit.subject} (${commitLink})\n`;
    }

    markdown += '\n';
  }

  return markdown;
}

/**
 * Generate a compact single-line changelog
 */
export function generateCompactChangelog(commits: ParsedCommit[]): string {
  if (commits.length === 0) {
    return 'No changes';
  }

  const breaking = commits.filter(c => c.breaking).length;
  const features = commits.filter(c => c.type === 'feat').length;
  const fixes = commits.filter(c => c.type === 'fix').length;
  const other = commits.length - breaking - features - fixes;

  const parts: string[] = [];
  if (breaking > 0) parts.push(`${breaking} breaking`);
  if (features > 0) parts.push(`${features} features`);
  if (fixes > 0) parts.push(`${fixes} fixes`);
  if (other > 0) parts.push(`${other} other`);

  return parts.join(', ');
}

/**
 * Group commits by type
 */
function groupByType(commits: ParsedCommit[]): Map<string, ParsedCommit[]> {
  const grouped = new Map<string, ParsedCommit[]>();

  for (const commit of commits) {
    const existing = grouped.get(commit.type) || [];
    existing.push(commit);
    grouped.set(commit.type, existing);
  }

  return grouped;
}

/**
 * Format commit hash as a link or short hash
 */
function formatCommitLink(hash: string, repositoryUrl?: string): string {
  const shortHash = hash.substring(0, 7);

  if (repositoryUrl) {
    const cleanUrl = repositoryUrl.replace(/\.git$/, '');
    return `[${shortHash}](${cleanUrl}/commit/${hash})`;
  }

  return shortHash;
}

/**
 * Generate workspace changelog with project sections
 */
export function generateWorkspaceChangelog(
  commitsByProject: Map<string, ParsedCommit[]>,
  options: ChangelogOptions = {}
): string {
  let markdown = '';

  if (options.version) {
    const date = options.date || new Date().toISOString().split('T')[0];
    markdown += `# ${options.version} (${date})\n\n`;
  }

  if (commitsByProject.size === 0) {
    return markdown + '### No changes\n';
  }

  // Sort projects alphabetically
  const sortedProjects = Array.from(commitsByProject.keys()).sort();

  for (const projectName of sortedProjects) {
    const commits = commitsByProject.get(projectName);
    if (!commits || commits.length === 0) continue;

    markdown += `## ${projectName}\n\n`;
    markdown += generateChangelogMarkdown(commits, { ...options, projectName });
  }

  // Add commits without specific scope (global changes)
  const globalCommits = Array.from(commitsByProject.values())
    .flat()
    .filter(c => !c.scope || c.scope === '*');

  if (globalCommits.length > 0) {
    markdown += `## Global Changes\n\n`;
    markdown += generateChangelogMarkdown(globalCommits, options);
  }

  return markdown;
}

/**
 * Parse repository URL from git remote
 */
export function getRepositoryUrl(cwd: string): string | undefined {
  try {
    const { execSync } = require('child_process');
    const remoteUrl = execSync('git config --get remote.origin.url', {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();

    // Convert SSH URL to HTTPS
    if (remoteUrl.startsWith('git@')) {
      return remoteUrl
        .replace('git@', 'https://')
        .replace('.com:', '.com/')
        .replace('.git', '');
    }

    return remoteUrl.replace('.git', '');
  } catch {
    return undefined;
  }
}

/**
 * Get compare URL for version range
 */
export function getCompareUrl(cwd: string, fromTag: string, toTag: string): string | undefined {
  const repoUrl = getRepositoryUrl(cwd);
  if (!repoUrl) return undefined;

  return `${repoUrl}/compare/${fromTag}...${toTag}`;
}
