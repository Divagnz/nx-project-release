import { PromiseExecutor, logger, ExecutorContext } from '@nx/devkit';
import * as fs from 'fs';
import { existsSync } from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  getCommitsFromGit,
  parseCommits,
  filterCommitsByScope,
} from './commit-parser.js';
import {
  generateChangelogMarkdown,
  generateWorkspaceChangelog,
  getRepositoryUrl,
  ChangelogOptions,
} from './markdown-generator.js';

export interface ChangelogExecutorSchema {
  dryRun?: boolean;
  suppressWarnings?: boolean;
  preset?:
    | 'angular'
    | 'atom'
    | 'codemirror'
    | 'conventionalcommits'
    | 'ember'
    | 'eslint'
    | 'express'
    | 'jquery'
    | 'jshint';
  changelogFile?: string;
  from?: string;
  to?: string;
  releaseCount?: number;
  skipUnstable?: boolean;
  append?: boolean;
  context?: Record<string, unknown>;
  // New features
  workspaceChangelog?: boolean;
  projectChangelogs?: boolean;
  interactive?: boolean | 'all' | 'workspace' | 'projects';
}

/**
 * Check if commitlint is configured
 */
function hasCommitlint(root: string): boolean {
  const configs = [
    'commitlint.config.js',
    'commitlint.config.ts',
    '.commitlintrc.json',
    '.commitlintrc.js',
    '.commitlintrc',
  ];
  return configs.some((c) => existsSync(path.join(root, c)));
}

/**
 * Show warning if commitlint not configured
 */
function warnIfNoCommitlint(
  context: ExecutorContext,
  options: ChangelogExecutorSchema
): void {
  // Skip if warnings suppressed
  if (options.suppressWarnings) {
    return;
  }

  // Skip for workspace changelog
  if (options.workspaceChangelog) {
    return;
  }

  // Check if configured
  if (!hasCommitlint(context.root)) {
    logger.warn('');
    logger.warn('⚠️  Commit validation not configured');
    logger.warn(
      '   Project changelogs require conventional commits with scopes matching project names.'
    );
    logger.warn('   Without validation, commits may not appear in changelogs.');
    logger.warn('');
    logger.warn('💡 Quick fix:');
    logger.warn('   npx nx g nx-project-release:setup-commitlint');
    logger.warn('');
    logger.warn('💡 Suppress this warning:');
    logger.warn(
      '   Add "suppressWarnings": true to executor options in nx.json'
    );
    logger.warn('');
  }
}

const runExecutor: PromiseExecutor<ChangelogExecutorSchema> = async (
  options,
  context: ExecutorContext
) => {
  // Warn if commitlint not configured
  warnIfNoCommitlint(context, options);

  // Handle workspace changelog
  if (options.workspaceChangelog) {
    return await generateWorkspaceChangelogExecutor(options, context);
  }

  // Handle project changelog
  if (!context.projectName) {
    return { success: false, error: 'No project name specified' };
  }

  const projectRoot =
    context.projectsConfigurations?.projects[context.projectName]?.root ||
    context.projectName;
  const changelogFile = options.changelogFile || 'CHANGELOG.md';
  const changelogPath = path.join(context.root, projectRoot, changelogFile);

  logger.info(`🔖 Generating changelog for ${context.projectName}`);

  try {
    const version = await getCurrentVersion(context, projectRoot);
    const repositoryUrl = getRepositoryUrl(context.root);

    // Get and parse commits
    const commitBlocks = getCommitsFromGit(
      context.root,
      options.from,
      options.to,
      context.projectName
    );
    const allCommits = parseCommits(commitBlocks);
    const projectCommits = filterCommitsByScope(
      allCommits,
      context.projectName
    );

    if (projectCommits.length === 0) {
      logger.warn(`⚠️ No commits found for ${context.projectName}`);
      return { success: true };
    }

    // Generate changelog markdown
    const changelogOptions: ChangelogOptions = {
      version,
      date: new Date().toISOString().split('T')[0],
      projectName: context.projectName,
      repositoryUrl,
      ...(options.context as ChangelogOptions),
    };

    let changelog = generateChangelogMarkdown(projectCommits, changelogOptions);

    // Interactive editing if requested
    const shouldEdit = shouldShowInteractiveEditor(
      options.interactive,
      'projects'
    );
    if (shouldEdit && !options.dryRun) {
      changelog = await editChangelogInteractively(
        changelog,
        context.projectName
      );
    }

    if (options.dryRun) {
      logger.info('📋 Changelog preview:');
      logger.info(changelog);
      return { success: true };
    }

    if (options.append && fs.existsSync(changelogPath)) {
      const existingChangelog = fs.readFileSync(changelogPath, 'utf8');
      const newChangelog = changelog + '\n\n' + existingChangelog;
      fs.writeFileSync(changelogPath, newChangelog);
    } else {
      fs.writeFileSync(changelogPath, changelog);
    }

    logger.info(`✅ Changelog written to ${changelogFile}`);
    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Changelog generation failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
};

async function generateWorkspaceChangelogExecutor(
  options: ChangelogExecutorSchema,
  context: ExecutorContext
): Promise<{ success: boolean; error?: string }> {
  logger.info(`🔖 Generating workspace-level changelog`);

  const changelogFile = options.changelogFile || 'CHANGELOG.md';
  const changelogPath = path.join(context.root, changelogFile);

  try {
    // Get all projects
    const projects = Object.keys(
      context.projectsConfigurations?.projects || {}
    );
    const repositoryUrl = getRepositoryUrl(context.root);

    // Get all commits
    const commitBlocks = getCommitsFromGit(
      context.root,
      options.from,
      options.to
    );
    const allCommits = parseCommits(commitBlocks);

    // Group commits by project
    const commitsByProject = new Map<string, typeof allCommits>();

    for (const project of projects) {
      const projectCommits = filterCommitsByScope(allCommits, project);
      if (projectCommits.length > 0) {
        commitsByProject.set(project, projectCommits);
      }
    }

    if (commitsByProject.size === 0 && allCommits.length === 0) {
      logger.warn(`⚠️ No commits found`);
      return { success: true };
    }

    // Generate workspace changelog
    const changelogOptions: ChangelogOptions = {
      version: options.context?.version as string,
      date: new Date().toISOString().split('T')[0],
      repositoryUrl,
      ...(options.context as ChangelogOptions),
    };

    let changelog = generateWorkspaceChangelog(
      commitsByProject,
      changelogOptions
    );

    // Interactive editing if requested
    const shouldEdit = shouldShowInteractiveEditor(
      options.interactive,
      'workspace'
    );
    if (shouldEdit && !options.dryRun) {
      changelog = await editChangelogInteractively(changelog, 'workspace');
    }

    if (options.dryRun) {
      logger.info('📋 Workspace changelog preview:');
      logger.info(changelog);
      return { success: true };
    }

    if (options.append && fs.existsSync(changelogPath)) {
      const existingChangelog = fs.readFileSync(changelogPath, 'utf8');
      const newChangelog = changelog + '\n\n' + existingChangelog;
      fs.writeFileSync(changelogPath, newChangelog);
    } else {
      fs.writeFileSync(changelogPath, changelog);
    }

    logger.info(`✅ Workspace changelog written to ${changelogFile}`);

    // Optionally generate project-level changelogs
    if (options.projectChangelogs) {
      logger.info('🔖 Generating project-level changelogs...');
      for (const projectName of projects) {
        try {
          const projectContext = { ...context, projectName };
          await runExecutor(
            { ...options, workspaceChangelog: false },
            projectContext
          );
        } catch (error) {
          logger.warn(
            `⚠️ Failed to generate changelog for ${projectName}: ${error}`
          );
        }
      }
    }

    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Workspace changelog generation failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

function shouldShowInteractiveEditor(
  interactive: boolean | 'all' | 'workspace' | 'projects' | undefined,
  level: 'workspace' | 'projects'
): boolean {
  if (interactive === true || interactive === 'all') {
    return true;
  }
  if (interactive === level) {
    return true;
  }
  return false;
}

async function editChangelogInteractively(
  changelog: string,
  identifier: string
): Promise<string> {
  logger.info(`📝 Opening editor for ${identifier} changelog...`);

  const tempFile = path.join(
    '/tmp',
    `changelog-${identifier}-${Date.now()}.md`
  );

  try {
    // Write current changelog to temp file
    fs.writeFileSync(tempFile, changelog);

    // Determine editor
    const editor = process.env.EDITOR || process.env.VISUAL || 'nano';

    logger.info(`💡 Using editor: ${editor}`);
    logger.info(
      `💡 Edit the changelog, save, and close the editor to continue...`
    );

    // Open editor (this will block until user closes it)
    execSync(`${editor} ${tempFile}`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    // Read the edited content
    const editedChangelog = fs.readFileSync(tempFile, 'utf8');

    logger.info(`✅ Changelog edited successfully`);

    return editedChangelog;
  } catch (error) {
    logger.error(`❌ Interactive editing failed: ${error}`);
    logger.info(`Using original changelog content...`);
    return changelog;
  } finally {
    // Clean up temp file
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function getCurrentVersion(
  context: ExecutorContext,
  projectRoot: string
): Promise<string> {
  try {
    const projectJsonPath = path.join(
      context.root,
      projectRoot,
      'project.json'
    );
    if (fs.existsSync(projectJsonPath)) {
      const projectJson = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
      return projectJson.version || '0.0.0';
    }

    const packageJsonPath = path.join(
      context.root,
      projectRoot,
      'package.json'
    );
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      return packageJson.version || '0.0.0';
    }

    return '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export default runExecutor;
