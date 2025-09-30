import { PromiseExecutor, logger, ExecutorContext } from '@nx/devkit';
import versionExecutor from '../version/index';
import changelogExecutor from '../changelog/index';
import publishExecutor from '../publish/index';

interface ExecutorResult {
  success: boolean;
  error?: string;
}

export interface ProjectReleaseExecutorSchema {
  version?: string;
  releaseAs?: 'major' | 'minor' | 'patch' | 'prerelease';
  preid?: string;
  firstRelease?: boolean;
  dryRun?: boolean;
  show?: boolean;
  // Git options
  gitCommit?: boolean;
  gitCommitMessage?: string;
  gitCommitArgs?: string;
  gitTag?: boolean;
  gitTagMessage?: string;
  gitTagArgs?: string;
  gitPush?: boolean;
  gitPushArgs?: string;
  gitRemote?: string;
  ciOnly?: boolean;
  githubRelease?: boolean;
  githubReleaseNotes?: string;
  githubReleaseDraft?: boolean;
  githubReleasePrerelease?: boolean;
  stageChanges?: boolean;
  // Deprecated
  skipCommit?: boolean;
  skipTag?: boolean;
  skipChangelog?: boolean;
  skipPublish?: boolean;
  publish?: boolean;
  versionFile?: string;
  versionFiles?: string[];
  versionPath?: string;
  preset?: 'angular' | 'atom' | 'codemirror' | 'conventionalcommits' | 'ember' | 'eslint' | 'express' | 'jquery' | 'jshint';
  changelogFile?: string;
  workspaceChangelog?: boolean;
  projectChangelogs?: boolean;
  interactive?: boolean | 'all' | 'workspace' | 'projects';
  registry?: string;
  registryType?: 'npm' | 'nexus' | 'custom';
  distTag?: string;
  access?: 'public' | 'restricted';
  buildTarget?: string;
  publishDir?: string;
  tagNaming?: {
    prefix?: string;
    suffix?: string;
    format?: string;
    includeProjectName?: boolean;
  };
  releaseAll?: boolean;
  includeProjects?: string[];
  excludeProjects?: string[];
  onlyChanged?: boolean;
  trackDeps?: boolean;
  syncVersions?: boolean;
  syncProjects?: string[];
  syncStrategy?: 'highest' | 'bump';
  releaseGroup?: string;
  projectsRelationship?: 'independent' | 'fixed';
  skipLockFileUpdate?: boolean;
  updateLockFile?: boolean;
}

const runExecutor: PromiseExecutor<ProjectReleaseExecutorSchema> = async (options, context: ExecutorContext) => {
  if (shouldReleaseAllProjects(options, context)) {
    return releaseAllProjects(options, context);
  } else {
    return releaseSingleProject(options, context);
  }
};

function shouldReleaseAllProjects(options: ProjectReleaseExecutorSchema, context: ExecutorContext): boolean {
  return options.releaseAll === true || !context.projectName;
}

async function releaseAllProjects(options: ProjectReleaseExecutorSchema, context: ExecutorContext): Promise<ExecutorResult> {
  logger.info('🚀 Releasing all projects in the workspace');

  const projectNames = Object.keys(context.projectsConfigurations.projects);
  const results: Array<{ project: string; success: boolean; error?: string; skipped?: boolean }> = [];

  logger.info(`Found ${projectNames.length} projects in workspace`);

  for (const projectName of projectNames) {
    try {
      const projectContext = {
        ...context,
        projectName,
        projectsConfigurations: context.projectsConfigurations
      };

      // Check if project should be skipped
      if (await shouldSkipProject(projectName, options)) {
        logger.info(`⏭️ Skipping ${projectName}`);
        results.push({ project: projectName, success: true, skipped: true });
        continue;
      }

      logger.info(`📦 Processing ${projectName}...`);
      const result = await releaseSingleProject({...options, releaseAll: false}, projectContext);

      if (result.success) {
        logger.info(`✅ ${projectName} released successfully`);
        results.push({ project: projectName, success: true });
      } else {
        logger.error(`❌ ${projectName} failed: ${result.error}`);
        results.push({ project: projectName, success: false, error: result.error });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`❌ ${projectName} failed: ${errorMessage}`);
      results.push({ project: projectName, success: false, error: errorMessage });
    }
  }

  const successful = results.filter(r => r.success && !r.skipped).length;
  const skipped = results.filter(r => r.skipped).length;
  const failed = results.filter(r => !r.success).length;

  logger.info(`
📊 Release Summary:
✅ Successfully released: ${successful} projects
⏭️ Skipped: ${skipped} projects
❌ Failed: ${failed} projects`);

  return { success: failed === 0 };
}

async function releaseSingleProject(options: ProjectReleaseExecutorSchema, context: ExecutorContext): Promise<ExecutorResult> {
  if (!context.projectName) {
    return { success: false, error: 'No project name specified' };
  }

  // Show detailed workflow analysis if requested
  if (options.show) {
    return await showWorkflowChanges(options, context);
  }

  logger.info(`🔄 Running complete release workflow for ${context.projectName}`);

  try {
    // Step 1: Version
    logger.info('1️⃣ Running version step...');
    const versionResult = await versionExecutor({
      version: options.version,
      releaseAs: options.releaseAs,
      preid: options.preid,
      firstRelease: options.firstRelease,
      dryRun: options.dryRun,
      show: false, // Don't show individual step details in workflow
      gitCommit: options.gitCommit,
      gitCommitMessage: options.gitCommitMessage,
      gitCommitArgs: options.gitCommitArgs,
      gitTag: options.gitTag,
      gitTagMessage: options.gitTagMessage,
      gitTagArgs: options.gitTagArgs,
      gitPush: options.gitPush,
      gitPushArgs: options.gitPushArgs,
      gitRemote: options.gitRemote,
      ciOnly: options.ciOnly,
      githubRelease: options.githubRelease,
      githubReleaseNotes: options.githubReleaseNotes,
      githubReleaseDraft: options.githubReleaseDraft,
      githubReleasePrerelease: options.githubReleasePrerelease,
      stageChanges: options.stageChanges,
      skipCommit: options.skipCommit,
      skipTag: options.skipTag,
      versionFile: options.versionFile,
      versionFiles: options.versionFiles,
      versionPath: options.versionPath,
      tagNaming: options.tagNaming,
      trackDeps: options.trackDeps,
      syncVersions: options.syncVersions,
      syncProjects: options.syncProjects,
      syncStrategy: options.syncStrategy,
      releaseGroup: options.releaseGroup,
      projectsRelationship: options.projectsRelationship,
      skipLockFileUpdate: options.skipLockFileUpdate,
      updateLockFile: options.updateLockFile
    }, context) as ExecutorResult;

    if (!versionResult.success) {
      return { success: false, error: `Version step failed: ${versionResult.error || 'Unknown error'}` };
    }

    // Step 2: Changelog (if not skipped)
    if (!options.skipChangelog) {
      logger.info('2️⃣ Running changelog step...');
      const changelogResult = await changelogExecutor({
        dryRun: options.dryRun,
        preset: options.preset,
        changelogFile: options.changelogFile,
        workspaceChangelog: options.workspaceChangelog,
        projectChangelogs: options.projectChangelogs,
        interactive: options.interactive
      }, context) as ExecutorResult;

      if (!changelogResult.success) {
        logger.warn(`⚠️ Changelog step failed: ${changelogResult.error || 'Unknown error'}`);
        // Continue with release even if changelog fails
      }
    } else {
      logger.info('2️⃣ Skipping changelog step');
    }

    // Step 3: Publish (if requested and not skipped)
    if ((options.publish || options.skipPublish === false) && !options.skipPublish) {
      logger.info('3️⃣ Running publish step...');
      const publishResult = await publishExecutor({
        dryRun: options.dryRun,
        registry: options.registry,
        registryType: options.registryType,
        distTag: options.distTag,
        access: options.access,
        buildTarget: options.buildTarget,
        publishDir: options.publishDir
      }, context) as ExecutorResult;

      if (!publishResult.success) {
        return { success: false, error: `Publish step failed: ${publishResult.error || 'Unknown error'}` };
      }
    } else {
      logger.info('3️⃣ Skipping publish step');
    }

    logger.info(`✅ Complete release workflow completed for ${context.projectName}`);
    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

async function shouldSkipProject(projectName: string, options: ProjectReleaseExecutorSchema): Promise<boolean> {
  // Check include/exclude patterns
  if (options.includeProjects && options.includeProjects.length > 0) {
    const isIncluded = options.includeProjects.some(pattern =>
      projectName.match(new RegExp(pattern.replace('*', '.*')))
    );
    if (!isIncluded) return true;
  }

  if (options.excludeProjects && options.excludeProjects.length > 0) {
    const isExcluded = options.excludeProjects.some(pattern =>
      projectName.match(new RegExp(pattern.replace('*', '.*')))
    );
    if (isExcluded) return true;
  }

  return false;
}

async function showWorkflowChanges(options: ProjectReleaseExecutorSchema, context: ExecutorContext): Promise<ExecutorResult> {
  if (!context.projectName) {
    return { success: false, error: 'No project name specified' };
  }

  logger.info('');
  logger.info('🔄 Release Workflow Analysis:');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Project information
  logger.info(`📦 Project: ${context.projectName}`);
  const projectRoot = context.projectsConfigurations?.projects[context.projectName]?.root || context.projectName;
  logger.info(`📂 Root: ${projectRoot}`);
  logger.info('');

  // Workflow steps overview
  logger.info('📋 Workflow Steps:');
  logger.info('  1️⃣ Version - Update project version');
  logger.info(`  2️⃣ Changelog - ${options.skipChangelog ? 'Skipped' : 'Generate CHANGELOG.md'}`);
  logger.info(`  3️⃣ Publish - ${options.skipPublish && !options.publish ? 'Skipped' : 'Publish to registry'}`);
  logger.info('');

  // Step 1: Version Analysis
  logger.info('🔢 Step 1: Version Analysis');
  try {
    // Use version executor with show flag to get detailed analysis
    await versionExecutor({
      version: options.version,
      releaseAs: options.releaseAs,
      show: true, // Show detailed version analysis
      skipCommit: options.skipCommit,
      skipTag: options.skipTag,
      versionFile: options.versionFile,
      versionFiles: options.versionFiles,
      versionPath: options.versionPath,
      tagNaming: options.tagNaming
    }, context);
  } catch (error: unknown) {
    logger.error(`❌ Version analysis failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Step 2: Changelog Analysis
  if (!options.skipChangelog) {
    logger.info('📝 Step 2: Changelog Analysis');
    logger.info(`  File: ${options.changelogFile || 'CHANGELOG.md'}`);
    logger.info(`  Preset: ${options.preset || 'angular'}`);

    const changelogPath = `${projectRoot}/${options.changelogFile || 'CHANGELOG.md'}`;
    const fs = require('fs');
    const path = require('path');
    const fullChangelogPath = path.join(context.root, changelogPath);

    if (fs.existsSync(fullChangelogPath)) {
      logger.info(`  Status: ✓ Exists - will be updated`);
    } else {
      logger.info(`  Status: ⊕ Will be created`);
    }
    logger.info('');
  }

  // Step 3: Publish Analysis
  if ((options.publish || !options.skipPublish) && !options.skipPublish) {
    logger.info('📦 Step 3: Publish Analysis');
    logger.info(`  Registry Type: ${options.registryType || 'npm'}`);
    logger.info(`  Registry URL: ${options.registry || 'default'}`);
    logger.info(`  Distribution Tag: ${options.distTag || 'latest'}`);
    logger.info(`  Access: ${options.access || 'public'}`);

    if (options.buildTarget) {
      logger.info(`  Build Target: ${options.buildTarget}`);
    }

    const publishDir = options.publishDir || `dist/${context.projectName}`;
    logger.info(`  Publish Directory: ${publishDir}`);

    const fs = require('fs');
    const path = require('path');
    const fullPublishDir = path.join(context.root, publishDir);

    if (fs.existsSync(fullPublishDir)) {
      logger.info(`  Status: ✓ Directory exists`);
    } else if (options.buildTarget) {
      logger.info(`  Status: ⚠ Directory will be created by build`);
    } else {
      logger.info(`  Status: ❌ Directory missing (no build target specified)`);
    }
    logger.info('');
  }

  // Configuration summary
  logger.info('⚙️ Configuration Summary:');
  logger.info(`  Dry Run: ${options.dryRun ? 'Yes' : 'No'}`);
  logger.info(`  Skip Commit: ${options.skipCommit ? 'Yes' : 'No'}`);
  logger.info(`  Skip Tag: ${options.skipTag ? 'Yes' : 'No'}`);
  logger.info(`  Skip Changelog: ${options.skipChangelog ? 'Yes' : 'No'}`);
  logger.info(`  Skip Publish: ${options.skipPublish ? 'Yes' : 'No'}`);
  logger.info('');

  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('💡 Use --dryRun to execute workflow without making changes');
  logger.info('💡 Use individual executors (version, changelog, publish) for granular control');
  logger.info('');

  return { success: true };
}

export default runExecutor;