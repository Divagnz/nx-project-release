import { PromiseExecutor, logger, ExecutorContext } from '@nx/devkit';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { ConventionalChangelog } from 'conventional-changelog';

export interface ChangelogExecutorSchema {
  dryRun?: boolean;
  preset?: 'angular' | 'atom' | 'codemirror' | 'conventionalcommits' | 'ember' | 'eslint' | 'express' | 'jquery' | 'jshint';
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

const runExecutor: PromiseExecutor<ChangelogExecutorSchema> = async (options, context: ExecutorContext) => {
  // Handle workspace changelog
  if (options.workspaceChangelog) {
    return await generateWorkspaceChangelog(options, context);
  }

  // Handle project changelog
  if (!context.projectName) {
    return { success: false, error: 'No project name specified' };
  }

  const projectRoot = context.projectsConfigurations?.projects[context.projectName]?.root || context.projectName;
  const changelogFile = options.changelogFile || 'CHANGELOG.md';
  const changelogPath = path.join(context.root, projectRoot, changelogFile);

  logger.info(`🔖 Generating changelog for ${context.projectName}`);

  const changelogOptions = {
    preset: options.preset || 'angular',
    releaseCount: options.releaseCount || 1,
    skipUnstable: options.skipUnstable !== false,
    context: options.context || {
      version: await getCurrentVersion(context, projectRoot),
      ...options.context
    }
  };

  try {
    let changelog = await generateChangelog(changelogOptions);

    // Interactive editing if requested
    const shouldEdit = shouldShowInteractiveEditor(options.interactive, 'projects');
    if (shouldEdit && !options.dryRun) {
      changelog = await editChangelogInteractively(changelog, context.projectName);
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

async function generateWorkspaceChangelog(
  options: ChangelogExecutorSchema,
  context: ExecutorContext
): Promise<{ success: boolean; error?: string }> {
  logger.info(`🔖 Generating workspace-level changelog`);

  const changelogFile = options.changelogFile || 'CHANGELOG.md';
  const changelogPath = path.join(context.root, changelogFile);

  try {
    // Get all projects
    const projects = Object.keys(context.projectsConfigurations?.projects || {});

    // Collect changes from all projects
    const workspaceContext = {
      ...options.context,
      workspace: true,
      projects: projects
    };

    const changelogOptions = {
      preset: options.preset || 'angular',
      releaseCount: options.releaseCount || 1,
      skipUnstable: options.skipUnstable !== false,
      context: workspaceContext
    };

    let changelog = await generateWorkspaceChangelogContent(changelogOptions);

    // Interactive editing if requested
    const shouldEdit = shouldShowInteractiveEditor(options.interactive, 'workspace');
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
          await runExecutor({ ...options, workspaceChangelog: false }, projectContext);
        } catch (error) {
          logger.warn(`⚠️ Failed to generate changelog for ${projectName}: ${error}`);
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

  const tempFile = path.join('/tmp', `changelog-${identifier}-${Date.now()}.md`);

  try {
    // Write current changelog to temp file
    fs.writeFileSync(tempFile, changelog);

    // Determine editor
    const editor = process.env.EDITOR || process.env.VISUAL || 'nano';

    logger.info(`💡 Using editor: ${editor}`);
    logger.info(`💡 Edit the changelog, save, and close the editor to continue...`);

    // Open editor (this will block until user closes it)
    execSync(`${editor} ${tempFile}`, {
      stdio: 'inherit',
      cwd: process.cwd()
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

async function generateWorkspaceChangelogContent(
  options: {
    preset: string;
    skipUnstable: boolean;
    context: Record<string, unknown>;
  }
): Promise<string> {
  const generator = new ConventionalChangelog()
    .loadPreset(options.preset)
    .context(options.context);

  let changelogContent = '';
  for await (const chunk of generator.write()) {
    changelogContent += chunk;
  }

  return changelogContent;
}

async function generateChangelog(
  options: {
    preset: string;
    skipUnstable: boolean;
  }
): Promise<string> {
  const generator = new ConventionalChangelog()
    .loadPreset(options.preset);

  let changelogContent = '';
  for await (const chunk of generator.write()) {
    changelogContent += chunk;
  }

  return changelogContent;
}

async function getCurrentVersion(context: ExecutorContext, projectRoot: string): Promise<string> {
  try {
    const projectJsonPath = path.join(context.root, projectRoot, 'project.json');
    if (fs.existsSync(projectJsonPath)) {
      const projectJson = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
      return projectJson.version || '0.0.0';
    }

    const packageJsonPath = path.join(context.root, projectRoot, 'package.json');
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