import { PromiseExecutor, logger, ExecutorContext, createProjectGraphAsync } from '@nx/devkit';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as semver from 'semver';
import { from, of, forkJoin } from 'rxjs';
import { catchError, tap, map, finalize } from 'rxjs/operators';
import { isCI, getCIPlatform } from '../utils/ci-detection';

export interface VersionExecutorSchema {
  version?: string;
  releaseAs?: 'major' | 'minor' | 'patch' | 'prerelease';
  preid?: string;
  firstRelease?: boolean;
  dryRun?: boolean;
  show?: boolean;
  preview?: boolean;
  // Git options (opt-in, disabled by default)
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
  // Branch release options
  createReleaseBranch?: boolean;
  releaseBranchName?: string;
  createPR?: boolean;
  prTitle?: string;
  prBody?: string;
  prBaseBranch?: string;
  prDraft?: boolean;
  prLabels?: string;
  // Merge after release
  mergeAfterRelease?: boolean;
  mergeToBranches?: string[];
  mergeStrategy?: 'merge' | 'squash' | 'rebase';
  stageChanges?: boolean;
  // Deprecated (kept for backward compatibility)
  skipCommit?: boolean;
  skipTag?: boolean;
  versionFile?: string;
  versionFiles?: string[];
  versionPath?: string;
  tagNaming?: {
    prefix?: string;
    suffix?: string;
    format?: string;
    includeProjectName?: boolean;
  };
  // New features
  trackDeps?: boolean;
  syncVersions?: boolean;
  syncProjects?: string[];
  syncStrategy?: 'highest' | 'bump';
  // Post-target execution
  postTargets?: string[];
  postTargetOptions?: Record<string, unknown>;
  // Release groups
  releaseGroup?: string;
  projectsRelationship?: 'independent' | 'fixed';
  // Lock file management
  skipLockFileUpdate?: boolean;
  updateLockFile?: boolean;
}

interface ReleaseGroup {
  projects: string[];
  projectsRelationship?: 'independent' | 'fixed';
  version?: string;
  releaseAs?: 'major' | 'minor' | 'patch' | 'prerelease';
  preid?: string;
  versionFiles?: string[];
  versionPath?: string;
  tagNaming?: {
    prefix?: string;
    suffix?: string;
    format?: string;
    includeProjectName?: boolean;
  };
  releaseTagPattern?: string;
}

interface NxReleaseConfig {
  defaultRegistry?: {
    type?: string;
    url?: string;
    access?: string;
    distTag?: string;
  };
  versionFiles?: string[];
  versionPath?: string;
  projectsRelationship?: 'independent' | 'fixed';
  projects?: {
    include?: string[];
    exclude?: string[];
    skip?: string[];
  };
  releaseGroups?: Record<string, ReleaseGroup>;
  projectConfigs?: Record<string, {
    registry?: {
      type?: string;
      url?: string;
      access?: string;
      distTag?: string;
    };
    versionFiles?: string[];
    versionPath?: string;
    buildTarget?: string;
    publishDir?: string;
    skip?: boolean;
    releaseGroup?: string;
  }>;
}

function getNxReleaseConfig(context: ExecutorContext): NxReleaseConfig {
  const nxJsonPath = path.join(context.root, 'nx.json');
  if (!fs.existsSync(nxJsonPath)) {
    return {};
  }

  try {
    const nxJson = JSON.parse(fs.readFileSync(nxJsonPath, 'utf8'));
    return (nxJson?.projectRelease as NxReleaseConfig) || {};
  } catch {
    return {};
  }
}

function mergeConfigWithNxJson(options: VersionExecutorSchema, context: ExecutorContext, projectName?: string): VersionExecutorSchema {
  const nxConfig = getNxReleaseConfig(context);
  const nxProjectConfig = projectName ? nxConfig.projectConfigs?.[projectName] : undefined;

  // Determine release group for this project
  let releaseGroup: ReleaseGroup | undefined;
  let releaseGroupName: string | undefined;

  if (options.releaseGroup) {
    releaseGroupName = options.releaseGroup;
    releaseGroup = nxConfig.releaseGroups?.[options.releaseGroup];
  } else if (nxProjectConfig?.releaseGroup) {
    releaseGroupName = nxProjectConfig.releaseGroup;
    releaseGroup = nxConfig.releaseGroups?.[nxProjectConfig.releaseGroup];
  } else if (projectName && nxConfig.releaseGroups) {
    // Auto-detect release group based on project patterns
    for (const [groupName, group] of Object.entries(nxConfig.releaseGroups)) {
      if (matchesProjectPattern(projectName, group.projects)) {
        releaseGroupName = groupName;
        releaseGroup = group;
        break;
      }
    }
  }

  let projectJsonConfig: Record<string, unknown> = {};
  if (projectName && context.projectsConfigurations?.projects[projectName]) {
    const projectRoot = context.projectsConfigurations.projects[projectName].root;
    const projectJsonPath = path.join(context.root, projectRoot, 'project.json');

    try {
      if (fs.existsSync(projectJsonPath)) {
        const projectJson = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
        projectJsonConfig = projectJson.targets?.['project-release']?.options || {};
      }
    } catch {
      // Ignore project.json read errors
    }
  }

  const merged = { ...options };

  // Store release group info for later use
  if (releaseGroupName) {
    merged.releaseGroup = releaseGroupName;
  }

  // Projects relationship (priority: options > release group > nx global config > default 'fixed')
  if (!merged.projectsRelationship) {
    merged.projectsRelationship = releaseGroup?.projectsRelationship ||
                                  nxConfig.projectsRelationship ||
                                  'fixed';
  }

  // Version files - release group should override targetDefaults
  if (releaseGroup?.versionFiles) {
    merged.versionFiles = releaseGroup.versionFiles;
  } else if (!merged.versionFiles) {
    merged.versionFiles = (projectJsonConfig.versionFiles as string[]) ||
                         nxProjectConfig?.versionFiles ||
                         nxConfig.versionFiles ||
                         ['project.json', 'package.json'];
  }

  // Version path
  if (!merged.versionPath) {
    merged.versionPath = (projectJsonConfig.versionPath as string) ||
                        releaseGroup?.versionPath ||
                        nxProjectConfig?.versionPath ||
                        nxConfig.versionPath ||
                        'version';
  }

  // Tag naming
  if (!merged.tagNaming && releaseGroup?.tagNaming) {
    merged.tagNaming = releaseGroup.tagNaming;
  }

  // Version and releaseAs from release group
  if (!merged.version && releaseGroup?.version) {
    merged.version = releaseGroup.version;
  }
  if (!merged.releaseAs && releaseGroup?.releaseAs) {
    merged.releaseAs = releaseGroup.releaseAs;
  }
  if (!merged.preid && releaseGroup?.preid) {
    merged.preid = releaseGroup.preid;
  }

  return merged;
}

function matchesProjectPattern(projectName: string, patterns: string[]): boolean {
  return patterns.some(pattern => {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(projectName);
  });
}

const runExecutor: PromiseExecutor<VersionExecutorSchema> = async (options, context: ExecutorContext) => {
  const mergedOptions = mergeConfigWithNxJson(options, context, context.projectName);

  // Handle sync versioning and dependency tracking
  if (mergedOptions.syncVersions || mergedOptions.trackDeps) {
    return await handleWorkspaceVersioning(mergedOptions, context);
  }

  // Single project versioning
  return await versionSingleProject(mergedOptions, context);
};

// New workspace versioning functions
async function handleWorkspaceVersioning(options: VersionExecutorSchema, context: ExecutorContext): Promise<{ success: boolean; error?: string; versions?: Record<string, string> }> {
  logger.info('🔗 Running workspace versioning with dependency tracking and sync versioning');

  try {
    const projectsToVersion = new Set<string>();
    const projectDependencies = await getWorkspaceDependencies(context);
    const versions: Record<string, string> = {};

    // Start with the current project
    if (context.projectName) {
      projectsToVersion.add(context.projectName);
    }

    // Add sync projects if specified
    if (options.syncProjects && options.syncProjects.length > 0) {
      options.syncProjects.forEach(project => projectsToVersion.add(project));
    }

    // Add all projects if syncVersions is true and no specific projects are specified
    if (options.syncVersions && (!options.syncProjects || options.syncProjects.length === 0)) {
      Object.keys(context.projectsConfigurations?.projects || {}).forEach(project => {
        projectsToVersion.add(project);
      });
    }

    // Track dependencies if enabled
    if (options.trackDeps) {
      const affectedProjects = getAffectedProjectsByDependencies(Array.from(projectsToVersion), projectDependencies);
      affectedProjects.forEach(project => projectsToVersion.add(project));
    }

    logger.info(`📦 Projects to version: ${Array.from(projectsToVersion).join(', ')}`);

    // Determine version strategy
    let targetVersion: string | undefined;

    if (options.syncVersions) {
      if (options.version) {
        targetVersion = options.version;
      } else if (options.syncStrategy === 'highest') {
        targetVersion = await getHighestVersionAcrossProjects(Array.from(projectsToVersion), context);
        if (options.releaseAs) {
          targetVersion = semver.inc(targetVersion, options.releaseAs) || targetVersion;
        }
      } else {
        // Default sync strategy: calculate version for the main project and use it for all
        const mainProject = context.projectName || Array.from(projectsToVersion)[0];
        const mainProjectVersion = await calculateNewVersionForProject(mainProject, options, context);
        targetVersion = mainProjectVersion;
      }
      logger.info(`🎯 Sync version target: ${targetVersion}`);
    }

    // Version each project
    const results: Array<{ project: string; success: boolean; version?: string; error?: string; skipped?: boolean; reason?: string }> = [];

    for (const projectName of Array.from(projectsToVersion)) {
      try {
        const projectOptions = { ...options };

        if (options.syncVersions && targetVersion) {
          projectOptions.version = targetVersion;
        }

        const result = await versionSingleProject(projectOptions, {
          ...context,
          projectName,
          projectsConfigurations: context.projectsConfigurations
        });

        if (result.success) {
          if (result.skipped) {
            // Project was skipped (e.g., no version found)
            results.push({ project: projectName, success: true, skipped: true, reason: result.reason });
            logger.warn(`⏭️  ${projectName}: Skipped (${result.reason || 'unknown reason'})`);
          } else {
            const version = (result as { success: boolean; version?: string }).version || targetVersion || 'unknown';
            versions[projectName] = version;
            results.push({ project: projectName, success: true, version });
            logger.info(`✅ ${projectName}: ${version}`);
          }
        } else {
          results.push({ project: projectName, success: false, error: result.error });
          logger.error(`❌ ${projectName}: ${result.error}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.push({ project: projectName, success: false, error: errorMsg });
        logger.error(`❌ ${projectName}: ${errorMsg}`);
      }
    }

    const successful = results.filter(r => r.success && !(r as any).skipped).length;
    const skipped = results.filter(r => r.success && (r as any).skipped).length;
    const failed = results.filter(r => !r.success).length;

    logger.info(`\n📊 Workspace Versioning Summary:`);
    logger.info(`✅ Successfully versioned: ${successful} projects`);
    if (skipped > 0) {
      logger.info(`⏭️  Skipped: ${skipped} projects`);
    }
    logger.info(`❌ Failed: ${failed} projects`);

    if (skipped > 0) {
      logger.info(`\nSkipped projects:`);
      results.filter(r => r.success && (r as any).skipped).forEach(r => {
        logger.info(`  - ${r.project}: ${(r as any).reason || 'unknown reason'}`);
      });
    }

    if (failed > 0) {
      logger.info(`\nFailed projects:`);
      results.filter(r => !r.success).forEach(r => {
        logger.info(`  - ${r.project}: ${r.error}`);
      });
    }

    return {
      success: failed === 0,
      error: failed > 0 ? `${failed} projects failed to version` : undefined,
      versions
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Workspace versioning failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

async function versionSingleProject(options: VersionExecutorSchema, context: ExecutorContext): Promise<{ success: boolean; error?: string; version?: string; skipped?: boolean; reason?: string }> {
  if (!context.projectName) {
    return { success: false, error: 'No project name specified' };
  }

  logger.info(`🔖 Versioning ${context.projectName}`);

  try {
    const projectRoot = context.projectsConfigurations?.projects[context.projectName]?.root || context.projectName;

    let versionInfo: { version?: string; filePath?: string };

    // Try to read version, but allow missing for firstRelease
    try {
      versionInfo = await readVersionFromFile(context, projectRoot, options);
    } catch (error) {
      if (options.firstRelease) {
        versionInfo = { version: undefined, filePath: undefined };
      } else {
        throw error;
      }
    }

    // Handle first release mode
    let currentVersion = versionInfo.version || '0.0.0';
    let isFirstRelease = !versionInfo.version || versionInfo.version === '0.0.0';

    // If no version found, handle based on mode
    if (!versionInfo.version && !options.firstRelease) {
      if (options.preview) {
        // Preview mode: provide detailed guidance
        logger.warn(`⚠️  No version found for project '${context.projectName}'`);
        logger.info('');
        logger.info('This project has no version information available.');
        logger.info('Options:');
        logger.info('  1. Set an initial version using --version flag (e.g., --version=1.0.0)');
        logger.info('  2. Use --firstRelease flag to start from 0.0.0');
        logger.info('  3. Configure version in package.json or project.json');
        logger.info('');
        return { success: false, error: `No version found for project ${context.projectName}. Use --version, --firstRelease, or configure version in project files.` };
      } else {
        // Regular mode (CI/CD, affected, etc.): Skip with warning instead of failing
        logger.warn(`⚠️  Skipping project '${context.projectName}': No version found`);
        logger.info('💡 To version this project, use --firstRelease flag or configure version in project files');
        return { success: true, skipped: true, reason: 'No version found' };
      }
    }

    // If firstRelease option is set, use fallback logic
    if (options.firstRelease) {
      if (!versionInfo.version) {
        // No version found, try to get from git tags
        const gitTag = getLatestGitTag(context, context.projectName);
        if (gitTag) {
          currentVersion = gitTag.replace(/^[^0-9]*/, ''); // Strip non-numeric prefix
          isFirstRelease = false;
        } else {
          // Use 0.0.0 as starting point
          currentVersion = '0.0.0';
          isFirstRelease = true;
        }
        logger.info(`First release mode: using version ${currentVersion} as starting point`);
      }
    }

    logger.info(`Current version: ${currentVersion}`);

    let newVersion: string;

    if (options.version) {
      // Validate semver format
      if (!semver.valid(options.version)) {
        throw new Error(`Invalid semver version: ${options.version}`);
      }
      newVersion = options.version;
    } else if (options.releaseAs) {
      // Handle prerelease with preid
      if (options.releaseAs === 'prerelease' && options.preid) {
        newVersion = semver.inc(currentVersion, 'prerelease', options.preid) || currentVersion;
      } else {
        newVersion = semver.inc(currentVersion, options.releaseAs) || currentVersion;
      }
    } else {
      // Automatic mode - analyze commits to determine version bump
      const recommendedReleaseType = await analyzeConventionalCommits(context);

      if (recommendedReleaseType && recommendedReleaseType !== 'none' && recommendedReleaseType !== 'not-affected') {
        // Found conventional commits (feat/fix/breaking)
        if (isFirstRelease) {
          const baseVersion = recommendedReleaseType === 'major' ? '1.0.0' :
                            recommendedReleaseType === 'minor' ? '0.1.0' : '0.0.1';
          newVersion = baseVersion;
        } else {
          // Handle prerelease with preid in automatic mode
          if (recommendedReleaseType === 'prerelease' && options.preid) {
            newVersion = semver.inc(currentVersion, 'prerelease', options.preid) || currentVersion;
          } else {
            newVersion = semver.inc(currentVersion, recommendedReleaseType) || currentVersion;
          }
        }
      } else if (recommendedReleaseType === 'none') {
        // Has commits affecting this project, but no conventional feat/fix/breaking commits
        logger.warn('⚠️  No conventional commits (feat/fix/breaking) found since last release');
        logger.info('💡 Defaulting to patch bump (use --releaseAs to specify different bump type)');
        newVersion = semver.inc(currentVersion, 'patch') || currentVersion;
      } else if (recommendedReleaseType === 'not-affected') {
        // Has commits, but none affect this project (monorepo)
        // Just return current version (no bump, no release)
        logger.info(`ℹ️  Project '${context.projectName}' not affected by recent changes`);
        logger.info('💡 Skipping version bump (use --releaseAs to force a bump)');
        return { success: true, skipped: true, reason: 'Project not affected by recent changes', version: currentVersion };
      } else {
        // No commits at all - don't bump, require explicit intent
        throw new Error(
          'No commits found since last release.\n' +
          'To create a release anyway, use:\n' +
          '  --releaseAs=patch/minor/major  (specify bump type)\n' +
          '  --version=x.y.z  (set explicit version)'
        );
      }
    }

    logger.info(`New version: ${newVersion}`);

    // Determine target file path if not set
    const targetFilePath = versionInfo.filePath || path.join(context.root, projectRoot, options.versionFiles?.[0] || options.versionFile || 'project.json');

    // Preview detailed information if requested
    if (options.preview) {
      await showVersionChanges(context, projectRoot, options, currentVersion, newVersion, { version: versionInfo.version, filePath: targetFilePath });
      return { success: true, version: newVersion };
    }

    // Backward compatibility: map old skipCommit/skipTag to new gitCommit/gitTag
    const shouldCommit = options.gitCommit ?? (options.skipCommit === false ? true : false);
    const shouldTag = options.gitTag ?? (options.skipTag === false ? true : false);
    const shouldStage = options.stageChanges ?? shouldCommit;
    const shouldPush = options.gitPush ?? false;

    if (options.dryRun) {
      logger.info(`Would update version from ${currentVersion} to ${newVersion}`);

      // Check if lock file would be updated
      if (!options.skipLockFileUpdate && options.updateLockFile !== false) {
        const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
        const existingLockFile = lockFiles.find(file => fs.existsSync(path.join(context.root, file)));
        if (existingLockFile) {
          logger.info(`Would update lock file: ${existingLockFile}`);
        }
      }

      if (shouldStage) {
        logger.info(`Would stage changes: ${targetFilePath}`);
      }
      if (shouldCommit) {
        const commitMsg = options.gitCommitMessage || generateConventionalCommitMessage(context.projectName, newVersion, isFirstRelease);
        logger.info(`Would create git commit: "${commitMsg}"`);
      }
      if (shouldTag) {
        const tag = generateTagName(context.projectName, newVersion, options);
        const tagMsg = options.gitTagMessage || tag;
        logger.info(`Would create git tag: ${tag} with message "${tagMsg}"`);
      }
      if (shouldPush) {
        const remote = options.gitRemote || 'origin';
        logger.info(`Would push to remote: ${remote}`);
      }
      return { success: true, version: newVersion };
    }

    // Update version in file
    await writeVersionToFile(context, projectRoot, options, newVersion, targetFilePath);

    // Update lock files if needed (unless explicitly skipped)
    const lockFileUpdated = await updateLockFiles(context, options);

    // Check ciOnly restriction before any git operations
    const hasGitOperations = shouldCommit || shouldTag || shouldPush || options.githubRelease || options.createReleaseBranch;
    if (options.ciOnly && hasGitOperations && !process.env.CI) {
      logger.error('❌ Git operations are restricted to CI/CD environments only (ciOnly: true)');
      logger.info('💡 Set CI environment variable or disable ciOnly to run locally');
      return { success: false };
    }

    // Create release branch if requested
    let releaseBranchName = '';
    if (options.createReleaseBranch) {
      try {
        // Get current branch
        const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: context.root,
          encoding: 'utf-8'
        }).trim();

        // Generate release branch name (default: semver only)
        releaseBranchName = options.releaseBranchName || `release/v${newVersion}`;
        releaseBranchName = releaseBranchName
          .replace(/{version}/g, newVersion)
          .replace(/{projectName}/g, context.projectName)
          .replace(/{tag}/g, generateTagName(context.projectName, newVersion, options));

        // Create and checkout release branch
        execSync(`git checkout -b ${releaseBranchName}`, { cwd: context.root });
        logger.info(`✅ Created release branch: ${releaseBranchName} (from ${currentBranch})`);
      } catch (error) {
        logger.error(`❌ Failed to create release branch: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }

    // Stage changes if requested
    if (shouldStage) {
      try {
        const filesToStage = [targetFilePath];
        if (lockFileUpdated) {
          filesToStage.push(lockFileUpdated);
        }
        execSync(`git add ${filesToStage.join(' ')}`, { cwd: context.root });
        logger.info(`📝 Staged changes: ${filesToStage.join(', ')}`);
      } catch (error) {
        logger.warn(`⚠️ Failed to stage changes: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Create git commit if requested
    if (shouldCommit) {
      try {
        const commitMessage = options.gitCommitMessage ||
                            generateConventionalCommitMessage(context.projectName, newVersion, isFirstRelease);

        // Interpolate {version}, {projectName}, {releaseGroupName}
        const interpolatedMessage = commitMessage
          .replace(/{version}/g, newVersion)
          .replace(/{projectName}/g, context.projectName)
          .replace(/{releaseGroupName}/g, options.releaseGroup || '');

        // Stage if not already staged
        if (!shouldStage) {
          const filesToStage = [targetFilePath];
          if (lockFileUpdated) {
            filesToStage.push(lockFileUpdated);
          }
          execSync(`git add ${filesToStage.join(' ')}`, { cwd: context.root });
        }

        // Build commit command
        let commitCmd = `git commit -m "${interpolatedMessage}"`;
        if (options.gitCommitArgs) {
          commitCmd += ` ${options.gitCommitArgs}`;
        }

        execSync(commitCmd, { cwd: context.root });
        logger.info(`✅ Created git commit: "${interpolatedMessage}"`);
      } catch (error) {
        logger.error(`❌ Failed to create commit: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }

    // Create git tag if requested
    if (shouldTag) {
      try {
        const tag = generateTagName(context.projectName, newVersion, options);
        const tagMessage = options.gitTagMessage || tag;

        // Interpolate tokens in tag message
        const interpolatedTagMessage = tagMessage
          .replace(/{version}/g, newVersion)
          .replace(/{projectName}/g, context.projectName)
          .replace(/{releaseGroupName}/g, options.releaseGroup || '')
          .replace(/{tag}/g, tag);

        // Build tag command
        let tagCmd = `git tag -a ${tag} -m "${interpolatedTagMessage}"`;
        if (options.gitTagArgs) {
          tagCmd += ` ${options.gitTagArgs}`;
        }

        execSync(tagCmd, { cwd: context.root });
        logger.info(`✅ Created git tag: ${tag}`);
      } catch (error) {
        logger.error(`❌ Failed to create tag: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }

    // Push to remote if requested
    if (shouldPush) {
      // Add warning about push operation
      const ciPlatform = getCIPlatform();
      if (ciPlatform) {
        logger.warn(`⚠️  About to push to remote (running in ${ciPlatform})`);
      } else if (!options.ciOnly) {
        logger.warn(`⚠️  About to push to remote from local environment`);
        logger.warn(`💡 Consider setting ciOnly: true to prevent accidental local pushes`);
      }

      try {
        const remote = options.gitRemote || 'origin';
        let pushCmd = `git push ${remote}`;

        // Push release branch or commits and/or tags
        if (options.createReleaseBranch && releaseBranchName) {
          // Push the release branch with upstream tracking
          pushCmd += ` ${releaseBranchName} -u`;
          logger.info(`Pushing release branch: ${releaseBranchName}`);
        } else {
          // Original behavior: push commits and/or tags
          if (shouldCommit) {
            pushCmd += ` HEAD`;
          }
          if (shouldTag) {
            const tag = generateTagName(context.projectName, newVersion, options);
            pushCmd += ` ${tag}`;
          }
        }

        if (options.gitPushArgs) {
          pushCmd += ` ${options.gitPushArgs}`;
        }

        execSync(pushCmd, { cwd: context.root });
        logger.info(`✅ Pushed to remote: ${remote}`);
      } catch (error) {
        logger.error(`❌ Failed to push: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }

    // Create pull request if requested
    if (options.createPR && options.createReleaseBranch && releaseBranchName) {
      try {
        await createPullRequest(context, releaseBranchName, newVersion, options);
      } catch (error) {
        logger.error(`❌ Failed to create PR: ${error instanceof Error ? error.message : String(error)}`);
        // Don't fail the entire release if PR creation fails
      }
    }

    // Create GitHub release if requested
    if (options.githubRelease && shouldTag) {
      try {
        const tag = generateTagName(context.projectName, newVersion, options);
        await createGitHubRelease(context, tag, newVersion, options);
      } catch (error) {
        logger.error(`❌ Failed to create GitHub release: ${error instanceof Error ? error.message : String(error)}`);
        // Don't fail the entire release if GitHub release creation fails
      }
    }

    // Execute post-targets if specified
    if (options.postTargets && options.postTargets.length > 0) {
      await executePostTargets(options.postTargets, options.postTargetOptions || {}, context, newVersion);
    }

    logger.info(`✅ Successfully versioned to ${newVersion}`);
    return { success: true, version: newVersion };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Version failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

// Enhanced dependency tracking with Nx project graph integration
async function getWorkspaceDependencies(context: ExecutorContext): Promise<Record<string, string[]>> {
  try {
    // Use Nx project graph for more accurate dependency detection
    const projectGraph = await createProjectGraphAsync();
    const dependencies: Record<string, string[]> = {};

    // Initialize all projects
    Object.keys(projectGraph.nodes).forEach(projectName => {
      dependencies[projectName] = [];
    });

    // Use project graph dependencies
    Object.entries(projectGraph.dependencies).forEach(([projectName, deps]) => {
      dependencies[projectName] = deps
        .filter(dep => dep.type !== 'npm') // Filter out npm dependencies, keep workspace deps
        .map(dep => dep.target);
    });

    // Fallback to package.json analysis for additional dependencies
    const projects = context.projectsConfigurations?.projects || {};
    Object.entries(projects).forEach(([projectName, projectConfig]) => {
      if (!dependencies[projectName]) {
        dependencies[projectName] = [];
      }

      const projectRoot = projectConfig.root;
      const projectPath = path.join(context.root, projectRoot);

      try {
        const packageJsonPath = path.join(projectPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

          Object.keys(deps).forEach(depName => {
            const dependentProject = Object.keys(projects).find(p => {
              const depProjectConfig = projects[p];
              const depPackageJsonPath = path.join(context.root, depProjectConfig.root, 'package.json');
              if (fs.existsSync(depPackageJsonPath)) {
                try {
                  const depPackageJson = JSON.parse(fs.readFileSync(depPackageJsonPath, 'utf8'));
                  return depPackageJson.name === depName;
                } catch {
                  return false;
                }
              }
              return false;
            });

            if (dependentProject && dependentProject !== projectName && !dependencies[projectName].includes(dependentProject)) {
              dependencies[projectName].push(dependentProject);
            }
          });
        }
      } catch {
        // Ignore errors reading project dependencies
      }
    });

    return dependencies;
  } catch (error) {
    logger.warn(`Failed to load project graph, falling back to basic dependency detection: ${error}`);
    return getFallbackDependencies(context);
  }
}

function getFallbackDependencies(context: ExecutorContext): Record<string, string[]> {
  const dependencies: Record<string, string[]> = {};
  const projects = context.projectsConfigurations?.projects || {};

  Object.entries(projects).forEach(([projectName, projectConfig]) => {
    dependencies[projectName] = [];

    const projectRoot = projectConfig.root;
    const projectPath = path.join(context.root, projectRoot);

    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        Object.keys(deps).forEach(depName => {
          const dependentProject = Object.keys(projects).find(p => {
            const depProjectConfig = projects[p];
            const depPackageJsonPath = path.join(context.root, depProjectConfig.root, 'package.json');
            if (fs.existsSync(depPackageJsonPath)) {
              try {
                const depPackageJson = JSON.parse(fs.readFileSync(depPackageJsonPath, 'utf8'));
                return depPackageJson.name === depName;
              } catch {
                return false;
              }
            }
            return false;
          });

          if (dependentProject && dependentProject !== projectName) {
            dependencies[projectName].push(dependentProject);
          }
        });
      }
    } catch {
      // Ignore errors reading project dependencies
    }
  });

  return dependencies;
}

function getAffectedProjectsByDependencies(changedProjects: string[], projectDependencies: Record<string, string[]>): string[] {
  const affected = new Set<string>();
  const queue = [...changedProjects];

  // Add all projects that depend on the changed projects
  while (queue.length > 0) {
    const currentProject = queue.shift();
    if (!currentProject) break;

    Object.entries(projectDependencies).forEach(([project, deps]) => {
      if (deps.includes(currentProject) && !affected.has(project)) {
        affected.add(project);
        queue.push(project);
      }
    });
  }

  return Array.from(affected);
}

async function getHighestVersionAcrossProjects(projects: string[], context: ExecutorContext): Promise<string> {
  let highestVersion = '0.0.0';

  for (const projectName of projects) {
    try {
      const projectRoot = context.projectsConfigurations?.projects[projectName]?.root || projectName;
      const versionInfo = await readVersionFromFile(context, projectRoot, {});
      const version = versionInfo.version || '0.0.0';

      if (semver.gt(version, highestVersion)) {
        highestVersion = version;
      }
    } catch {
      // Ignore errors reading version, use 0.0.0
    }
  }

  return highestVersion;
}

async function calculateNewVersionForProject(projectName: string, options: VersionExecutorSchema, context: ExecutorContext): Promise<string> {
  const projectRoot = context.projectsConfigurations?.projects[projectName]?.root || projectName;
  const versionInfo = await readVersionFromFile(context, projectRoot, options);
  const currentVersion = versionInfo.version || '0.0.0';
  const isFirstRelease = !versionInfo.version || versionInfo.version === '0.0.0';

  if (options.version) {
    return options.version;
  } else if (options.releaseAs) {
    return semver.inc(currentVersion, options.releaseAs) || currentVersion;
  } else {
    const recommendedReleaseType = await analyzeConventionalCommits(context);

    if (recommendedReleaseType && recommendedReleaseType !== 'none' && recommendedReleaseType !== 'not-affected') {
      // Found conventional commits (feat/fix/breaking)
      if (isFirstRelease) {
        return recommendedReleaseType === 'major' ? '1.0.0' :
               recommendedReleaseType === 'minor' ? '0.1.0' : '0.0.1';
      } else {
        return semver.inc(currentVersion, recommendedReleaseType) || currentVersion;
      }
    } else if (recommendedReleaseType === 'none') {
      // Has commits affecting this project, but no conventional feat/fix/breaking commits
      // User made changes (chore/test/docs/etc), so bump is reasonable
      logger.warn('⚠️  No conventional commits (feat/fix/breaking) found since last release');
      logger.info('💡 Defaulting to patch bump (use --releaseAs to specify different bump type)');
      return semver.inc(currentVersion, 'patch') || currentVersion;
    } else if (recommendedReleaseType === 'not-affected') {
      // Has commits, but none affect this project (monorepo)
      // Just return current version (no bump, no release)
      logger.info(`ℹ️  Project '${projectName}' not affected by recent changes`);
      logger.info('💡 Skipping version bump (use --releaseAs to force a bump)');
      return currentVersion; // Return without bumping
    } else {
      // No commits at all - don't bump, require explicit intent
      throw new Error(
        'No commits found since last release.\n' +
        'To create a release anyway, use:\n' +
        '  --releaseAs=patch/minor/major  (specify bump type)\n' +
        '  --version=x.y.z  (set explicit version)'
      );
    }
  }
}

// Update lock files after version change
async function updateLockFiles(
  context: ExecutorContext,
  options: VersionExecutorSchema
): Promise<string | null> {
  // Skip if explicitly disabled
  if (options.skipLockFileUpdate) {
    logger.info('⏭️ Skipping lock file update (skipLockFileUpdate=true)');
    return null;
  }

  // Default to updating lock files unless explicitly skipped
  const shouldUpdate = options.updateLockFile !== false;
  if (!shouldUpdate) {
    logger.info('⏭️ Skipping lock file update (updateLockFile=false)');
    return null;
  }

  const lockFiles = [
    { file: 'package-lock.json', cmd: 'npm install --package-lock-only', type: 'npm' },
    { file: 'yarn.lock', cmd: 'yarn install --mode update-lockfile', type: 'yarn' },
    { file: 'pnpm-lock.yaml', cmd: 'pnpm install --lockfile-only', type: 'pnpm' }
  ];

  for (const { file, cmd, type } of lockFiles) {
    const lockFilePath = path.join(context.root, file);
    if (fs.existsSync(lockFilePath)) {
      try {
        logger.info(`🔄 Updating ${file}...`);
        execSync(cmd, { cwd: context.root, stdio: 'ignore' });
        logger.info(`✅ Updated ${file}`);
        return file;
      } catch (error) {
        logger.warn(`⚠️ Failed to update ${file}: ${error instanceof Error ? error.message : String(error)}`);
        logger.warn(`💡 You may need to update ${file} manually or ensure ${type} is installed`);
        // Return the file path even if update failed, so it can be staged if needed
        return file;
      }
    }
  }

  // No lock file found
  logger.info('ℹ️ No lock file detected (package-lock.json, yarn.lock, or pnpm-lock.yaml)');
  return null;
}

// Helper functions (extracted from original code)
async function readVersionFromFile(
  context: ExecutorContext,
  projectRoot: string,
  options: VersionExecutorSchema
): Promise<{ version?: string; filePath: string }> {
  const versionPath = options.versionPath || 'version';

  let versionFiles: string[] = [];
  if (options.versionFiles && options.versionFiles.length > 0) {
    versionFiles = options.versionFiles;
  } else {
    versionFiles = ['project.json', 'package.json'];
  }

  let lastError: Error | null = null;

  for (const versionFile of versionFiles) {
    const filePath = path.join(context.root, projectRoot, versionFile);

    if (!fs.existsSync(filePath)) {
      lastError = new Error(`Version file not found: ${filePath}`);
      continue;
    }

    try {
      if (versionFile.endsWith('.json')) {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const version = getNestedProperty(content, versionPath);
        if (version) {
          logger.info(`Found version ${version} in ${filePath}`);
          return { version, filePath };
        } else {
          lastError = new Error(`Version field '${versionPath}' not found in ${filePath}`);
          continue;
        }
      } else {
        const version = fs.readFileSync(filePath, 'utf8').trim();
        if (version) {
          logger.info(`Found version ${version} in ${filePath}`);
          return { version, filePath };
        } else {
          lastError = new Error(`Version file is empty: ${filePath}`);
          continue;
        }
      }
    } catch (error: unknown) {
      lastError = new Error(`Could not read version from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
  }

  throw lastError || new Error(`No version files found in ${versionFiles.join(', ')}`);
}

async function writeVersionToFile(
  context: ExecutorContext,
  projectRoot: string,
  options: VersionExecutorSchema,
  newVersion: string,
  filePath: string
): Promise<void> {
  const versionFile = options.versionFile || 'project.json';
  const versionPath = options.versionPath || 'version';

  try {
    if (versionFile.endsWith('.json')) {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      setNestedProperty(content, versionPath, newVersion);
      fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
    } else {
      fs.writeFileSync(filePath, newVersion);
    }
    logger.info(`Updated version in ${filePath}`);
  } catch (error: unknown) {
    throw new Error(`Failed to write version to ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function getNestedProperty(obj: Record<string, unknown>, path: string): string {
  return path.split('.').reduce((current, key) => {
    return current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined;
  }, obj) as string;
}

function setNestedProperty(obj: Record<string, unknown>, path: string, value: string): void {
  const keys = path.split('.');
  const lastKey = keys.pop();
  if (!lastKey) return;

  const target = keys.reduce((current, key) => {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    return current[key] as Record<string, unknown>;
  }, obj);

  target[lastKey] = value;
}

function generateTagName(
  projectName: string,
  version: string,
  options: VersionExecutorSchema
): string {
  const tagNaming = options.tagNaming || {};
  const releaseGroupName = options.releaseGroup;

  // Determine tag pattern based on projectsRelationship
  let defaultFormat: string;
  if (options.projectsRelationship === 'independent') {
    // Independent: default to {projectName}@{version}
    defaultFormat = '{projectName}@{version}';
  } else if (releaseGroupName) {
    // Fixed with release group: {releaseGroupName}-v{version}
    defaultFormat = '{releaseGroupName}-v{version}';
  } else {
    // Fixed without release group: v{version}
    defaultFormat = 'v{version}';
  }

  const prefix = tagNaming.prefix || (tagNaming.includeProjectName !== false && !releaseGroupName ? `${projectName}-v` : '');
  const suffix = tagNaming.suffix || '';
  const format = tagNaming.format || defaultFormat;

  return format
    .replace('{prefix}', prefix)
    .replace('{version}', version)
    .replace('{suffix}', suffix)
    .replace('{projectName}', projectName)
    .replace('{releaseGroupName}', releaseGroupName || '');
}

function generateConventionalCommitMessage(projectName: string, version: string, isFirstRelease?: boolean): string {
  const prefix = isFirstRelease ? 'feat(release)' : 'chore(release)';
  return `${prefix}: ${projectName} version ${version}`;
}

// Enhanced commit analysis with skip/target syntax support
// Returns:
//   - ReleaseType (major/minor/patch) - Found conventional commits
//   - 'none' - Has relevant commits but no conventional ones
//   - 'not-affected' - Has commits but none affect this project
//   - null - No commits at all
async function analyzeConventionalCommits(context: ExecutorContext): Promise<semver.ReleaseType | null | 'none' | 'not-affected'> {
  try {
    let gitCommand = 'git log --format="%s" --no-merges';

    try {
      const lastTag = execSync(`git tag --list --sort=-version:refname | grep -E "^${context.projectName}-v|^v" | head -1`, {
        cwd: context.root,
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();

      if (lastTag) {
        gitCommand += ` ${lastTag}..HEAD`;
      }
    } catch {
      // No previous tags found, analyze all commits
    }

    const commits = execSync(gitCommand, {
      cwd: context.root,
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();

    // No commits at all since last tag
    if (!commits) return null;

    const commitLines = commits.split('\n').filter(line => line.trim());
    const projectName = context.projectName || '';

    // Check if project is actually affected using nx affected
    // This is more accurate than git diff as it understands Nx dependencies
    let isProjectAffected = false;
    try {
      // Determine base commit (last tag or HEAD)
      let baseRef = 'HEAD';
      try {
        const lastTag = execSync(`git tag --list --sort=-version:refname | grep -E "^${projectName}-v|^v" | head -1`, {
          cwd: context.root,
          encoding: 'utf8',
          stdio: 'pipe'
        }).trim();

        if (lastTag) {
          baseRef = lastTag;
        }
      } catch {
        // No previous tags found
      }

      // Use nx show projects --affected to check if this project is affected
      const affectedOutput = execSync(
        `npx nx show projects --affected --base=${baseRef} --head=HEAD`,
        {
          cwd: context.root,
          encoding: 'utf8',
          stdio: 'pipe'
        }
      ).trim();

      const affectedProjects = affectedOutput.split('\n').filter(p => p.trim());
      isProjectAffected = affectedProjects.includes(projectName);
    } catch {
      // If nx affected fails, assume project is affected (safer)
      isProjectAffected = true;
    }

    // Has commits, but this project is not affected (monorepo scenario)
    if (!isProjectAffected) return 'not-affected';

    // Filter commits using enhanced syntax (for commit message analysis)
    const relevantCommits = filterCommitsForProject(commitLines, projectName);

    let hasBreaking = false;
    let hasFeature = false;
    let hasFix = false;

    for (const commit of relevantCommits) {
      const line = commit.trim();
      if (line.includes('BREAKING CHANGE') || line.includes('!:')) {
        hasBreaking = true;
      } else if (line.startsWith('feat')) {
        hasFeature = true;
      } else if (line.startsWith('fix')) {
        hasFix = true;
      }
    }

    if (hasBreaking) return 'major';
    if (hasFeature) return 'minor';
    if (hasFix) return 'patch';

    // Has commits, but no conventional feat/fix/breaking commits
    return 'none';
  } catch {
    return null;
  }
}

// Post-target execution with RxJS
async function executePostTargets(
  postTargets: string[],
  postTargetOptions: Record<string, unknown>,
  context: ExecutorContext,
  newVersion: string
): Promise<void> {
  if (!postTargets || postTargets.length === 0) {
    return;
  }

  logger.info(`🎯 Executing post-targets after versioning...`);

  try {
    // Create observables for each target execution
    const targetExecutions$ = postTargets.map(targetName => {
      return from(executeTarget(targetName, postTargetOptions, context, newVersion)).pipe(
        tap(result => {
          if (result.success) {
            logger.info(`✅ Post-target '${targetName}' completed successfully`);
          } else {
            logger.error(`❌ Post-target '${targetName}' failed: ${result.error}`);
          }
        }),
        map(result => ({ targetName, ...result })),
        catchError(error => {
          const errorMsg = error instanceof Error ? error.message : String(error);
          logger.error(`❌ Post-target '${targetName}' failed with error: ${errorMsg}`);
          return of({ targetName, success: false, error: errorMsg });
        })
      );
    });

    // Execute all targets concurrently using forkJoin
    const results = await forkJoin(targetExecutions$).pipe(
      tap(allResults => {
        const successful = allResults.filter(r => r.success).length;
        const failed = allResults.filter(r => !r.success).length;

        logger.info(`\n📊 Post-targets Summary:`);
        logger.info(`✅ Successful: ${successful}/${allResults.length}`);

        if (failed > 0) {
          logger.info(`❌ Failed: ${failed}/${allResults.length}`);
          logger.info(`Failed targets:`);
          allResults.filter(r => !r.success).forEach(r => {
            logger.info(`  - ${r.targetName}: ${r.error}`);
          });
        }
      }),
      finalize(() => {
        logger.info(`🏁 Post-targets execution completed`);
      })
    ).toPromise();

    // Check if any targets failed and potentially throw
    const failed = results?.filter(r => !r.success) || [];
    if (failed.length > 0) {
      throw new Error(`${failed.length} post-targets failed: ${failed.map(f => f.targetName).join(', ')}`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Post-targets execution failed: ${errorMessage}`);
    throw error;
  }
}

async function executeTarget(
  targetName: string,
  options: Record<string, unknown>,
  context: ExecutorContext,
  newVersion: string
): Promise<{ success: boolean; error?: string }> {
  try {
    logger.info(`🎯 Executing post-target: ${targetName}`);

    // Get current version for token replacement
    const currentVersion = context.projectName ? await getCurrentVersionForProject(context.projectName, context) : undefined;

    // Replace all tokens in options using enhanced token replacement
    const processedOptions = replaceTokens(options, context, newVersion, currentVersion);

    if (!context.projectName) {
      throw new Error('No project name available for target execution');
    }

    // Check if target exists in current project
    const project = context.projectsConfigurations?.projects[context.projectName];
    if (!project?.targets?.[targetName]) {
      throw new Error(`Target '${targetName}' not found in project '${context.projectName}'`);
    }

    const target = project.targets[targetName];
    const executor = target.executor;

    if (!executor) {
      throw new Error(`No executor specified for target '${targetName}'`);
    }

    logger.info(`  Executor: ${executor}`);
    logger.info(`  Options: ${JSON.stringify(processedOptions, null, 2)}`);

    // Execute using execSync for now - in a real implementation, you'd want to use the Nx devkit
    const command = `npx nx run ${context.projectName}:${targetName}`;

    execSync(command, {
      cwd: context.root,
      stdio: 'inherit'
    });

    return { success: true };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

async function getCurrentVersionForProject(projectName: string, context: ExecutorContext): Promise<string | undefined> {
  try {
    const projectRoot = context.projectsConfigurations?.projects[projectName]?.root || projectName;
    const versionInfo = await readVersionFromFile(context, projectRoot, {});
    return versionInfo.version;
  } catch {
    return undefined;
  }
}

async function showVersionChanges(
  context: ExecutorContext,
  projectRoot: string,
  options: VersionExecutorSchema,
  currentVersion: string,
  newVersion: string,
  versionInfo: { version?: string; filePath: string }
): Promise<void> {
  logger.info('');
  logger.info('📋 Version Change Analysis:');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Project information
  logger.info(`📦 Project: ${context.projectName}`);
  logger.info(`📂 Root: ${projectRoot}`);
  logger.info('');

  // Version analysis
  logger.info('🔢 Version Analysis:');
  logger.info(`  Current: ${currentVersion}`);
  logger.info(`  New: ${newVersion}`);
  logger.info(`  Change: ${currentVersion} → ${newVersion}`);

  if (options.version) {
    logger.info(`  Method: Explicit version specified`);
  } else if (options.releaseAs) {
    logger.info(`  Method: Manual release type (${options.releaseAs})`);
  } else {
    const releaseType = await analyzeConventionalCommits(context);
    logger.info(`  Method: Conventional commits analysis`);
    logger.info(`  Detected: ${releaseType || 'patch (fallback)'}`);
  }
  logger.info('');

  // Files that would be affected
  logger.info('📁 Files to be modified:');
  logger.info(`  ✓ ${versionInfo.filePath}`);

  // Check for other potential version files
  const versionFiles = options.versionFiles || ['project.json', 'package.json'];
  for (const file of versionFiles) {
    const filePath = path.join(context.root, projectRoot, file);
    if (fs.existsSync(filePath) && filePath !== versionInfo.filePath) {
      logger.info(`  ⚠ ${filePath} (exists but not selected)`);
    }
  }
  logger.info('');

  // Git operations
  logger.info('🗂 Git Operations:');
  const shouldCommit = options.gitCommit ?? (options.skipCommit === false ? true : false);
  const shouldTag = options.gitTag ?? (options.skipTag === false ? true : false);
  const shouldPush = options.gitPush ?? false;

  if (shouldCommit) {
    const commitMessage = options.gitCommitMessage || generateConventionalCommitMessage(context.projectName, newVersion, !versionInfo.version || versionInfo.version === '0.0.0');
    logger.info(`  ✓ Commit: "${commitMessage}"`);
  } else {
    logger.info(`  ⊘ Commit: Skipped`);
  }

  if (shouldTag) {
    const tag = generateTagName(context.projectName, newVersion, options);
    const tagMsg = options.gitTagMessage || tag;
    logger.info(`  ✓ Tag: ${tag}`);
    if (options.gitTagMessage) {
      logger.info(`    Message: "${tagMsg}"`);
    }
  } else {
    logger.info(`  ⊘ Tag: Skipped`);
  }

  if (shouldPush) {
    const remote = options.gitRemote || 'origin';
    logger.info(`  ✓ Push: ${remote}`);
  } else {
    logger.info(`  ⊘ Push: Skipped`);
  }

  // Release branch
  if (options.createReleaseBranch) {
    const branchName = options.releaseBranchName || `release/v${newVersion}`;
    logger.info(`  ✓ Release branch: ${branchName}`);
    if (options.createPR) {
      const prTitle = options.prTitle || `chore(release): ${context.projectName} v${newVersion}`;
      logger.info(`    → Create PR: "${prTitle}"`);
    }
  }

  // Merge after release
  if (options.mergeAfterRelease && options.mergeToBranches && options.mergeToBranches.length > 0) {
    logger.info(`  ✓ Merge to: ${options.mergeToBranches.join(', ')}`);
    logger.info(`    Strategy: ${options.mergeStrategy || 'merge'}`);
  }

  logger.info('');

  // Configuration source
  logger.info('⚙️ Configuration:');
  const nxConfig = getNxReleaseConfig(context);
  const hasNxConfig = Object.keys(nxConfig).length > 0;
  const hasProjectConfig = context.projectsConfigurations?.projects[context.projectName];

  logger.info(`  nx.json: ${hasNxConfig ? '✓ Found' : '⊘ Not found'}`);
  logger.info(`  project.json: ${hasProjectConfig ? '✓ Found' : '⊘ Not found'}`);
  logger.info(`  Version path: ${options.versionPath || 'version'}`);
  logger.info('');

  // Recent commits (if analyzing conventional commits)
  if (!options.version && !options.releaseAs) {
    try {
      let gitCommand = 'git log --format="%s" --no-merges -10';
      try {
        const lastTag = execSync(`git tag --list --sort=-version:refname | grep -E "^${context.projectName}-v|^v" | head -1`, {
          cwd: context.root,
          encoding: 'utf8',
          stdio: 'pipe'
        }).trim();

        if (lastTag) {
          gitCommand += ` ${lastTag}..HEAD`;
          logger.info(`📝 Recent commits (since ${lastTag}):`);
        } else {
          logger.info(`📝 Recent commits (last 10):`);
        }
      } catch {
        logger.info(`📝 Recent commits (last 10):`);
      }

      const commits = execSync(gitCommand, {
        cwd: context.root,
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();

      if (commits) {
        const commitLines = commits.split('\n').filter(line => line.trim()).slice(0, 5);
        commitLines.forEach(commit => {
          const type = commit.includes('BREAKING CHANGE') || commit.includes('!:') ? 'BREAKING' :
                      commit.startsWith('feat') ? 'FEATURE' :
                      commit.startsWith('fix') ? 'FIX' : 'OTHER';
          const icon = type === 'BREAKING' ? '💥' : type === 'FEATURE' ? '✨' : type === 'FIX' ? '🐛' : '📝';
          logger.info(`    ${icon} ${commit.trim()}`);
        });
      } else {
        logger.info(`    No commits found`);
      }
    } catch {
      logger.info(`    Unable to analyze commits`);
    }
    logger.info('');
  }

  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('💡 Use --dryRun to preview without showing this detailed analysis');
  logger.info('');
}

async function createPullRequest(
  context: ExecutorContext,
  branchName: string,
  version: string,
  options: VersionExecutorSchema
): Promise<void> {
  logger.info(`📝 Creating pull request for ${branchName}...`);

  try {
    // Check if gh CLI is installed
    try {
      execSync('gh --version', { stdio: 'pipe' });
    } catch {
      throw new Error('GitHub CLI (gh) is not installed. Install it from https://cli.github.com/');
    }

    // Detect base branch (main or master)
    let baseBranch = options.prBaseBranch;
    if (!baseBranch) {
      try {
        const mainExists = execSync('git rev-parse --verify main', {
          cwd: context.root,
          stdio: 'pipe'
        });
        baseBranch = 'main';
      } catch {
        baseBranch = 'master'; // Fallback to master
      }
    }

    // Build PR title
    const prTitle = options.prTitle || `chore(release): {projectName} v{version}`;
    const interpolatedTitle = prTitle
      .replace(/{version}/g, version)
      .replace(/{projectName}/g, context.projectName || '')
      .replace(/{tag}/g, generateTagName(context.projectName || '', version, options));

    // Build PR body
    let prBody = options.prBody || '';
    if (!prBody) {
      // Generate default PR body
      prBody = `## Release ${version}\n\nThis PR contains version bump changes for ${context.projectName} v${version}.\n\n### Changes\n- Updated version to ${version}\n- Updated lock files\n\n---\n*This PR was created automatically by nx-project-release*`;
    }

    // Try to read changelog for PR body
    if (prBody.includes('{changelog}')) {
      const projectRoot = context.projectsConfigurations?.projects[context.projectName]?.root || context.projectName;
      const changelogPath = path.join(context.root, projectRoot, 'CHANGELOG.md');

      let changelog = '';
      if (fs.existsSync(changelogPath)) {
        const changelogContent = fs.readFileSync(changelogPath, 'utf8');
        // Extract the latest release section
        const sections = changelogContent.split(/^#+ /m);
        if (sections.length > 1) {
          changelog = sections[1].trim();
        }
      }
      prBody = prBody.replace(/{changelog}/g, changelog);
    }

    // Interpolate placeholders
    prBody = prBody
      .replace(/{version}/g, version)
      .replace(/{projectName}/g, context.projectName || '')
      .replace(/{tag}/g, generateTagName(context.projectName || '', version, options));

    // Write PR body to temp file to avoid shell escaping issues
    const tempFile = path.join(context.root, '.gh-pr-body.tmp');
    fs.writeFileSync(tempFile, prBody);

    // Build gh pr create command
    let prCmd = `gh pr create --title "${interpolatedTitle}" --body-file "${tempFile}" --base ${baseBranch}`;

    if (options.prDraft) {
      prCmd += ` --draft`;
    }

    if (options.prLabels) {
      const labels = options.prLabels.split(',').map(l => l.trim()).join(',');
      prCmd += ` --label "${labels}"`;
    }

    const prUrl = execSync(prCmd, {
      cwd: context.root,
      encoding: 'utf-8',
      stdio: 'pipe'
    }).trim();

    // Clean up temp file
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }

    logger.info(`✅ Created pull request: ${prUrl}`);
  } catch (error) {
    throw new Error(`Failed to create PR: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function createGitHubRelease(
  context: ExecutorContext,
  tag: string,
  version: string,
  options: VersionExecutorSchema
): Promise<void> {
  logger.info(`🚀 Creating GitHub release for ${tag}...`);

  try {
    // Check if gh CLI is installed
    try {
      execSync('gh --version', { stdio: 'pipe' });
    } catch {
      throw new Error('GitHub CLI (gh) is not installed. Install it from https://cli.github.com/');
    }

    // Determine release notes
    let releaseNotes = options.githubReleaseNotes || '';

    if (!releaseNotes) {
      // Try to read from CHANGELOG.md
      const projectRoot = context.projectsConfigurations?.projects[context.projectName]?.root || context.projectName;
      const changelogPath = path.join(context.root, projectRoot, 'CHANGELOG.md');

      if (fs.existsSync(changelogPath)) {
        const changelog = fs.readFileSync(changelogPath, 'utf8');
        // Extract the latest release section
        const sections = changelog.split(/^#+ /m);
        if (sections.length > 1) {
          releaseNotes = sections[1].trim();
        }
      }
    }

    // Interpolate placeholders
    releaseNotes = releaseNotes
      .replace(/{version}/g, version)
      .replace(/{projectName}/g, context.projectName || '')
      .replace(/{tag}/g, tag);

    // Build gh release create command
    let releaseCmd = `gh release create "${tag}"`;

    if (releaseNotes) {
      // Write notes to temp file to avoid shell escaping issues
      const tempFile = path.join(context.root, '.gh-release-notes.tmp');
      fs.writeFileSync(tempFile, releaseNotes);
      releaseCmd += ` --notes-file "${tempFile}"`;
    } else {
      releaseCmd += ` --generate-notes`;
    }

    if (options.githubReleaseDraft) {
      releaseCmd += ` --draft`;
    }

    if (options.githubReleasePrerelease) {
      releaseCmd += ` --prerelease`;
    }

    releaseCmd += ` --title "${context.projectName} ${version}"`;

    execSync(releaseCmd, { cwd: context.root, stdio: 'inherit' });

    // Clean up temp file
    const tempFile = path.join(context.root, '.gh-release-notes.tmp');
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }

    logger.info(`✅ Created GitHub release: ${tag}`);
  } catch (error) {
    throw new Error(`Failed to create GitHub release: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Enhanced token replacement system
function replaceTokens(
  obj: Record<string, unknown>,
  context: ExecutorContext,
  newVersion?: string,
  currentVersion?: string
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  const tokens = getTokenValues(context, newVersion, currentVersion);

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = replaceStringTokens(value, tokens);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item =>
        typeof item === 'string' ? replaceStringTokens(item, tokens) : item
      );
    } else if (value && typeof value === 'object') {
      result[key] = replaceTokens(value as Record<string, unknown>, context, newVersion, currentVersion);
    } else {
      result[key] = value;
    }
  }

  return result;
}

function getTokenValues(context: ExecutorContext, newVersion?: string, currentVersion?: string): Record<string, string> {
  const projectName = context.projectName || '';
  const projectConfig = context.projectsConfigurations?.projects[projectName];
  const projectRoot = projectConfig?.root || projectName;
  const projectType = projectConfig?.projectType || 'library';
  const workspaceRoot = context.root;

  // Extract workspace name from root path
  const workspaceName = path.basename(workspaceRoot);

  // Environment variables
  const nodeEnv = process.env.NODE_ENV || 'development';
  const ci = process.env.CI || 'false';
  const branchName = getBranchName(context);

  return {
    // Project tokens
    '${PROJECT_NAME}': projectName,
    '${PROJECT_ROOT}': projectRoot,
    '${PROJECT_TYPE}': projectType,

    // Workspace tokens
    '${WORKSPACE_ROOT}': workspaceRoot,
    '${WORKSPACE_NAME}': workspaceName,

    // Version tokens
    '{version}': newVersion || '',
    '${VERSION}': newVersion || '',
    '{currentVersion}': currentVersion || '',
    '${CURRENT_VERSION}': currentVersion || '',

    // Environment tokens
    '${NODE_ENV}': nodeEnv,
    '${CI}': ci,
    '${BRANCH_NAME}': branchName,

    // Git tokens
    '${GIT_BRANCH}': branchName,
    '${GIT_COMMIT}': getGitCommit(context),
    '${GIT_TAG}': getLatestGitTag(context, projectName),
  };
}

function replaceStringTokens(str: string, tokens: Record<string, string>): string {
  let result = str;

  // Replace all tokens
  Object.entries(tokens).forEach(([token, value]) => {
    result = result.replace(new RegExp(escapeRegExp(token), 'g'), value);
  });

  // Handle conditional expressions like ${NODE_ENV === 'production' ? 'prod' : 'dev'}
  result = result.replace(/\$\{([^}]+)\}/g, (match, expression) => {
    try {
      // Simple conditional expression evaluation
      if (expression.includes('?') && expression.includes(':')) {
        const [condition, options] = expression.split('?');
        const [trueValue, falseValue] = options.split(':');

        // Extract variables and evaluate simple conditions
        const conditionResult = evaluateSimpleCondition(condition.trim(), tokens);
        return conditionResult ? trueValue.trim().replace(/'/g, '') : falseValue.trim().replace(/'/g, '');
      }

      // Direct token replacement
      const tokenKey = `\${${expression}}`;
      return tokens[tokenKey] || match;
    } catch {
      return match; // Return original if evaluation fails
    }
  });

  return result;
}

function evaluateSimpleCondition(condition: string, tokens: Record<string, string>): boolean {
  // Handle simple equality conditions like "NODE_ENV === 'production'"
  if (condition.includes('===')) {
    const [left, right] = condition.split('===').map(s => s.trim());
    const leftValue = tokens[`\${${left}}`] || left;
    const rightValue = right.replace(/'/g, '').replace(/"/g, '');
    return leftValue === rightValue;
  }

  // Handle simple inequality conditions
  if (condition.includes('!==')) {
    const [left, right] = condition.split('!==').map(s => s.trim());
    const leftValue = tokens[`\${${left}}`] || left;
    const rightValue = right.replace(/'/g, '').replace(/"/g, '');
    return leftValue !== rightValue;
  }

  // Default to false for complex conditions
  return false;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getBranchName(context: ExecutorContext): string {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: context.root,
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();
    return branch;
  } catch {
    return 'main';
  }
}

function getGitCommit(context: ExecutorContext): string {
  try {
    const commit = execSync('git rev-parse --short HEAD', {
      cwd: context.root,
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();
    return commit;
  } catch {
    return '';
  }
}

function getLatestGitTag(context: ExecutorContext, projectName: string): string {
  try {
    const tag = execSync(`git tag --list --sort=-version:refname | grep -E "^${projectName}-v|^v" | head -1`, {
      cwd: context.root,
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();
    return tag;
  } catch {
    return '';
  }
}

// Enhanced commit filtering with skip/target syntax
function filterCommitsForProject(commits: string[], projectName: string): string[] {
  const relevantCommits: string[] = [];

  for (const commit of commits) {
    const line = commit.trim();

    // Check for skip syntax: [skip project-name] or [skip all]
    const skipMatch = line.match(/\[skip\s+([^\]]+)\]/i);
    if (skipMatch) {
      const skipTargets = skipMatch[1].split(',').map(s => s.trim());

      // Skip if this project is explicitly skipped or "all" is skipped
      if (skipTargets.includes(projectName) || skipTargets.includes('all')) {
        continue;
      }
    }

    // Check for target syntax: [target project-name] or [only project-name]
    const targetMatch = line.match(/\[(target|only)\s+([^\]]+)\]/i);
    if (targetMatch) {
      const targetProjects = targetMatch[2].split(',').map(s => s.trim());

      // Only include if this project is explicitly targeted
      if (!targetProjects.includes(projectName)) {
        continue;
      }
    }

    // Check for project-specific scope in conventional commits
    const scopeMatch = line.match(/^(\w+)(\(.+?\))?:/);
    if (scopeMatch && scopeMatch[2]) {
      const scope = scopeMatch[2].slice(1, -1); // Remove parentheses

      // If scope matches project name or contains project name, it's relevant
      if (scope === projectName || scope.includes(projectName)) {
        relevantCommits.push(line);
        continue;
      }

      // If scope is specified but doesn't match, skip (unless no other filtering applies)
      if (!skipMatch && !targetMatch) {
        continue;
      }
    }

    // Include commit if no filtering rules apply or if it passes the filters
    if (!skipMatch && !targetMatch) {
      relevantCommits.push(line);
    }
  }

  return relevantCommits;
}

export default runExecutor;