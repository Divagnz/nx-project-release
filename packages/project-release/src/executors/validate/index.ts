import {
  ExecutorContext,
  logger,
  readJsonFile,
  workspaceRoot
} from '@nx/devkit';
import { ValidateExecutorSchema } from './schema';
import * as chalk from 'chalk';
import { join } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';

export default async function validateExecutor(
  options: ValidateExecutorSchema,
  context: ExecutorContext
) {
  const projectName = context.projectName;

  if (!projectName) {
    logger.error('❌ No project name found in context');
    return { success: false };
  }

  logger.info('');
  logger.info('🔍 Configuration Validation');
  logger.info('═'.repeat(60));
  logger.info('');

  // Read nx.json
  const nxJsonPath = join(context.root, 'nx.json');
  const nxJson = existsSync(nxJsonPath) ? readJsonFile(nxJsonPath) : null;

  // Get all projects from workspace
  const allProjects = getAllProjects(context.root);
  const projectConfig = allProjects.get(projectName);

  if (!projectConfig) {
    logger.error(`❌ Project ${projectName} not found`);
    return { success: false };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nxJsonAny = nxJson as any;
  const projectRelease = nxJsonAny?.projectRelease || {};

  const summary: any = {
    projectName: projectName,
    global: {},
    projectConfig: {},
    releaseGroup: null,
    health: {
      warnings: [],
      errors: []
    }
  };

  // --- Global Configuration ---
  logger.info(chalk.bold('🌍 Global Configuration (nx.json)'));
  logger.info('─'.repeat(60));

  if (projectRelease.projectsRelationship) {
    logger.info(`  Versioning Strategy: ${chalk.cyan(projectRelease.projectsRelationship)}`);
    summary.global.versioningStrategy = projectRelease.projectsRelationship;
  } else {
    logger.info(`  Versioning Strategy: ${chalk.gray('not set (defaults to independent)')}`);
  }

  if (projectRelease.versionFiles && projectRelease.versionFiles.length > 0) {
    logger.info(`  Version Files: ${chalk.cyan(projectRelease.versionFiles.join(', '))}`);
    summary.global.versionFiles = projectRelease.versionFiles;
  } else {
    logger.info(`  Version Files: ${chalk.gray('not set')}`);
  }

  if (projectRelease.tagNaming) {
    logger.info(`  Tag Naming:`);
    if (projectRelease.tagNaming.format) {
      logger.info(`    Format: ${chalk.cyan(projectRelease.tagNaming.format)}`);
    }
    if (projectRelease.tagNaming.prefix) {
      logger.info(`    Prefix: ${chalk.cyan(projectRelease.tagNaming.prefix)}`);
    }
    if (projectRelease.tagNaming.includeProjectName !== undefined) {
      logger.info(`    Include Project Name: ${chalk.cyan(projectRelease.tagNaming.includeProjectName)}`);
    }
    summary.global.tagNaming = projectRelease.tagNaming;
  }

  if (projectRelease.registryType) {
    logger.info(`  Registry Type: ${chalk.cyan(projectRelease.registryType)}`);
    summary.global.registryType = projectRelease.registryType;
  }

  if (projectRelease.registryUrl) {
    logger.info(`  Registry URL: ${chalk.cyan(projectRelease.registryUrl)}`);
    summary.global.registryUrl = projectRelease.registryUrl;
  }

  if (projectRelease.excludedProjects && projectRelease.excludedProjects.length > 0) {
    logger.info(`  Excluded Projects: ${chalk.yellow(projectRelease.excludedProjects.length)} projects`);
    if (options.verbose) {
      projectRelease.excludedProjects.forEach((p: string) => {
        logger.info(`    - ${p}`);
      });
    }
    summary.global.excludedProjects = projectRelease.excludedProjects;
  }

  logger.info('');

  // --- Release Groups ---
  if (projectRelease.releaseGroups) {
    const releaseGroupNames = Object.keys(projectRelease.releaseGroups);
    logger.info(chalk.bold(`📦 Release Groups (${releaseGroupNames.length})`));
    logger.info('─'.repeat(60));

    let projectReleaseGroup = null;
    for (const [groupName, group] of Object.entries(projectRelease.releaseGroups)) {
      const groupProjects = (group as any).projects || [];
      if (groupProjects.includes(projectName)) {
        projectReleaseGroup = groupName;
        logger.info(`  ${chalk.green('✓')} ${chalk.bold(groupName)} ${chalk.gray('(current project)')}`);
        if (options.verbose) {
          logger.info(`    Registry: ${chalk.cyan((group as any).registryType || 'not set')}`);
          logger.info(`    Strategy: ${chalk.cyan((group as any).versionStrategy || 'independent')}`);
          logger.info(`    Projects: ${groupProjects.length}`);
        }
        summary.releaseGroup = { name: groupName, ...(group as any) };
      } else if (options.verbose) {
        logger.info(`  ${chalk.gray('○')} ${groupName} (${groupProjects.length} projects)`);
      }
    }

    if (!projectReleaseGroup) {
      logger.info(`  ${chalk.yellow('⚠')} Current project not in any release group`);
      summary.health.warnings.push('Project not assigned to any release group');
    }

    logger.info('');
  }

  // --- Project Configuration ---
  logger.info(chalk.bold(`🎯 Project Configuration (${projectName})`));
  logger.info('─'.repeat(60));

  const targets = projectConfig.targets || {};

  // Version target
  if (targets['version']) {
    const versionOptions = targets['version'].options || {};
    logger.info(`  ${chalk.green('✓')} Version Executor Configured`);
    if (versionOptions.versionFiles) {
      logger.info(`    Version Files: ${chalk.cyan(versionOptions.versionFiles.join(', '))}`);
      summary.projectConfig.versionFiles = versionOptions.versionFiles;
    }
    if (versionOptions.tagNaming) {
      logger.info(`    Tag Naming: ${chalk.cyan(JSON.stringify(versionOptions.tagNaming))}`);
      summary.projectConfig.tagNaming = versionOptions.tagNaming;
    }
    if (versionOptions.bumpDependents !== undefined) {
      logger.info(`    Bump Dependents: ${chalk.cyan(versionOptions.bumpDependents)}`);
      summary.projectConfig.bumpDependents = versionOptions.bumpDependents;
    }
  } else {
    logger.info(`  ${chalk.red('✗')} Version Executor Not Configured`);
    summary.health.errors.push('Version executor not configured');
  }

  // Changelog target
  if (targets['changelog']) {
    const changelogOptions = targets['changelog'].options || {};
    logger.info(`  ${chalk.green('✓')} Changelog Executor Configured`);
    if (changelogOptions.changelogFile) {
      logger.info(`    File: ${chalk.cyan(changelogOptions.changelogFile)}`);
      summary.projectConfig.changelogFile = changelogOptions.changelogFile;
    }
    if (changelogOptions.preset) {
      logger.info(`    Preset: ${chalk.cyan(changelogOptions.preset)}`);
      summary.projectConfig.changelogPreset = changelogOptions.preset;
    }
  } else {
    logger.info(`  ${chalk.yellow('⚠')} Changelog Executor Not Configured`);
    summary.health.warnings.push('Changelog executor not configured');
  }

  // Publish target
  if (targets['publish']) {
    const publishOptions = targets['publish'].options || {};
    logger.info(`  ${chalk.green('✓')} Publish Executor Configured`);
    if (publishOptions.registryType) {
      logger.info(`    Registry Type: ${chalk.cyan(publishOptions.registryType)}`);
      summary.projectConfig.registryType = publishOptions.registryType;
    }
    if (publishOptions.registry) {
      logger.info(`    Registry URL: ${chalk.cyan(publishOptions.registry)}`);
      summary.projectConfig.registryUrl = publishOptions.registry;
    }
  } else {
    logger.info(`  ${chalk.yellow('⚠')} Publish Executor Not Configured`);
    summary.health.warnings.push('Publish executor not configured');
  }

  logger.info('');

  // --- Health Check ---
  if (options.checkHealth) {
    logger.info(chalk.bold('🏥 Health Check'));
    logger.info('─'.repeat(60));

    // Check if project is excluded
    if (projectRelease.excludedProjects && projectRelease.excludedProjects.includes(projectName)) {
      logger.warn(`  ${chalk.yellow('⚠')} Project is in excludedProjects list`);
      summary.health.warnings.push('Project is excluded from releases');
    }

    // Check for version files
    const versionTargetOptions = targets['version']?.options || {};
    const versionFiles = versionTargetOptions.versionFiles || projectRelease.versionFiles || [];
    if (versionFiles.length === 0) {
      logger.warn(`  ${chalk.yellow('⚠')} No version files configured`);
      summary.health.warnings.push('No version files configured');
    }

    // Display summary
    if (summary.health.errors.length === 0 && summary.health.warnings.length === 0) {
      logger.info(`  ${chalk.green('✓')} No issues found`);
    } else {
      if (summary.health.errors.length > 0) {
        logger.info(`  ${chalk.red('Errors:')} ${summary.health.errors.length}`);
      }
      if (summary.health.warnings.length > 0) {
        logger.info(`  ${chalk.yellow('Warnings:')} ${summary.health.warnings.length}`);
      }
    }

    logger.info('');
  }

  // --- JSON Output ---
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  }

  // --- Summary ---
  logger.info('═'.repeat(60));
  if (summary.health.errors.length > 0) {
    logger.info(chalk.red(`❌ Validation completed with ${summary.health.errors.length} error(s)`));
    return { success: false };
  } else if (summary.health.warnings.length > 0) {
    logger.info(chalk.yellow(`⚠️  Validation completed with ${summary.health.warnings.length} warning(s)`));
  } else {
    logger.info(chalk.green('✅ Configuration is valid'));
  }
  logger.info('');

  return { success: true };
}

// Helper function to get all projects from workspace
function getAllProjects(workspaceRoot: string): Map<string, any> {
  const projects = new Map<string, any>();

  try {
    const projectsDir = join(workspaceRoot, 'projects');
    const packagesDir = join(workspaceRoot, 'packages');
    const appsDir = join(workspaceRoot, 'apps');
    const libsDir = join(workspaceRoot, 'libs');

    const dirsToCheck = [projectsDir, packagesDir, appsDir, libsDir];

    for (const dir of dirsToCheck) {
      if (existsSync(dir)) {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const entryPath = join(dir, entry);
          const projectJsonPath = join(entryPath, 'project.json');

          if (existsSync(projectJsonPath)) {
            try {
              const projectJson = readJsonFile(projectJsonPath);
              projects.set(entry, projectJson);
            } catch (e) {
              // Skip invalid project.json files
            }
          }
        }
      }
    }
  } catch (e) {
    // Fallback: try to get project from context
  }

  return projects;
}
