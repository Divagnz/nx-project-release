import { PromiseExecutor, logger, ExecutorContext, runExecutor as nxRunExecutor } from '@nx/devkit';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as semver from 'semver';
import { ReleaseExecutorSchema } from './schema';

interface NxReleaseConfig {
  defaultRegistry?: {
    type?: string;
    url?: string;
    access?: string;
    distTag?: string;
  };
  versionFiles?: string[];
  versionPath?: string;
  projects?: {
    include?: string[];
    exclude?: string[];
    skip?: string[];
  };
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
  }>;
}

function getNxReleaseConfig(context: ExecutorContext): NxReleaseConfig {
  const nxJsonPath = path.join(context.root, 'nx.json');
  if (!fs.existsSync(nxJsonPath)) {
    return {};
  }

  try {
    const nxJson = JSON.parse(fs.readFileSync(nxJsonPath, 'utf8'));
    return (nxJson?.release as Record<string, unknown>)?.projectRelease as NxReleaseConfig || {};
  } catch {
    return {};
  }
}

function mergeConfigWithNxJson(options: ReleaseExecutorSchema, context: ExecutorContext, projectName?: string): ReleaseExecutorSchema {
  const nxConfig = getNxReleaseConfig(context);
  const nxProjectConfig = projectName ? nxConfig.projectConfigs?.[projectName] : undefined;

  // Read project.json configuration (highest priority)
  let projectJsonConfig: Record<string, unknown> = {};
  if (projectName && context.projectsConfigurations?.projects[projectName]) {
    const projectRoot = context.projectsConfigurations.projects[projectName].root;
    const projectJsonPath = path.join(context.root, projectRoot, 'project.json');

    if (fs.existsSync(projectJsonPath)) {
      try {
        const projectJson = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
        projectJsonConfig = projectJson.release || {};
      } catch (error) {
        logger.warn(`Could not read project.json release config for ${projectName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  const merged = { ...options };

  // Priority order: executor options > project.json > nx.json project config > nx.json global config

  // Registry configuration
  if (!merged.registryType && !merged.registry) {
    // Try project.json first
    if (projectJsonConfig.registry && typeof projectJsonConfig.registry === 'object' && projectJsonConfig.registry !== null) {
      const registry = projectJsonConfig.registry as Record<string, unknown>;
      merged.registryType = registry.type as 'npm' | 'nexus' | 'custom';
      merged.registry = registry.url as string;
      merged.access = registry.access as 'public' | 'restricted';
      merged.distTag = registry.distTag as string;
    }
    // Then nx.json project config
    else if (nxProjectConfig?.registry) {
      merged.registryType = nxProjectConfig.registry.type as 'npm' | 'nexus' | 'custom';
      merged.registry = nxProjectConfig.registry.url;
      merged.access = nxProjectConfig.registry.access as 'public' | 'restricted';
      merged.distTag = nxProjectConfig.registry.distTag;
    }
    // Finally nx.json global config
    else if (nxConfig.defaultRegistry) {
      merged.registryType = nxConfig.defaultRegistry.type as 'npm' | 'nexus' | 'custom';
      merged.registry = nxConfig.defaultRegistry.url;
      merged.access = nxConfig.defaultRegistry.access as 'public' | 'restricted';
      merged.distTag = nxConfig.defaultRegistry.distTag;
    }
  }

  // Version files configuration
  if (!merged.versionFile && !merged.versionFiles) {
    if (Array.isArray(projectJsonConfig.versionFiles)) {
      merged.versionFiles = projectJsonConfig.versionFiles as string[];
    } else if (nxProjectConfig?.versionFiles) {
      merged.versionFiles = nxProjectConfig.versionFiles;
    } else if (nxConfig.versionFiles) {
      merged.versionFiles = nxConfig.versionFiles;
    }
  }

  // Version path configuration
  if (!merged.versionPath) {
    merged.versionPath = (projectJsonConfig.versionPath as string) ||
                        nxProjectConfig?.versionPath ||
                        nxConfig.versionPath ||
                        'version';
  }

  // Build target configuration
  if (!merged.buildTarget) {
    merged.buildTarget = (projectJsonConfig.buildTarget as string) ||
                        nxProjectConfig?.buildTarget;
  }

  // Publish directory configuration
  if (!merged.publishDir) {
    merged.publishDir = (projectJsonConfig.publishDir as string) ||
                       nxProjectConfig?.publishDir;
  }

  // Project lists (only from nx.json global config, not project-specific)
  if (nxConfig.projects?.include && !options.includeProjects) {
    merged.includeProjects = nxConfig.projects.include;
  }
  if (nxConfig.projects?.exclude && !options.excludeProjects) {
    merged.excludeProjects = nxConfig.projects.exclude;
  }

  return merged;
}

const runExecutor: PromiseExecutor<ReleaseExecutorSchema> = async (options, context: ExecutorContext) => {
  logger.info('Running project-release executor');

  try {
    // Check if this should release all projects (when no specific project is targeted)
    if (shouldReleaseAllProjects(options, context)) {
      return await releaseAllProjects(options, context);
    }

    // Ensure we have a project name
    if (!context.projectName) {
      throw new Error('Project name is required');
    }

    // Merge nx.json configuration with executor options
    const mergedOptions = mergeConfigWithNxJson(options, context, context.projectName);

    // Check if we should only process affected projects
    if (mergedOptions.onlyChanged) {
      const isAffected = await isProjectAffected(context, mergedOptions);
      if (!isAffected) {
        logger.info(`⏭️ Project ${context.projectName} is not affected, skipping release`);
        return { success: true, skipped: true };
      }
    }

    // Check if project should be skipped based on configuration
    if (await shouldSkipProject(context.projectName, mergedOptions, context)) {
      logger.info(`⏭️ Project ${context.projectName} is configured to be skipped`);
      return { success: true, skipped: true };
    }

    // Simple project configuration - read from workspace
    const projectRoot = context.projectsConfigurations?.projects[context.projectName]?.root || context.projectName;
    logger.info(`Project root: ${projectRoot}`);

    // Read current version from specified file
    const versionInfo = await readVersionFromFile(context, projectRoot, mergedOptions);
    const currentVersion = versionInfo.version || '0.0.0';
    const isFirstRelease = !versionInfo.version || versionInfo.version === '0.0.0';

    if (isFirstRelease) {
      logger.info(`First release detected for ${context.projectName}`);
    }
    logger.info(`Current version: ${currentVersion} (from ${versionInfo.filePath})`);

    // Calculate new version
    let newVersion: string;
    if (mergedOptions.version) {
      // Validate semver format
      if (!semver.valid(mergedOptions.version)) {
        throw new Error(`Invalid semver version: ${mergedOptions.version}`);
      }
      newVersion = mergedOptions.version;
    } else if (mergedOptions.releaseAs) {
      // Manual release type specified
      if (isFirstRelease && mergedOptions.releaseAs === 'prerelease') {
        newVersion = '1.0.0-0';
      } else if (isFirstRelease) {
        newVersion = '1.0.0';
      } else {
        newVersion = semver.inc(currentVersion, mergedOptions.releaseAs) || currentVersion;
      }
    } else {
      // Analyze conventional commits to determine version bump
      const recommendedReleaseType = await analyzeConventionalCommits(context, projectRoot);
      if (recommendedReleaseType) {
        if (isFirstRelease) {
          // For first release, use conventional commits to determine starting version
          const baseVersion = recommendedReleaseType === 'major' ? '1.0.0' :
                            recommendedReleaseType === 'minor' ? '0.1.0' : '0.0.1';
          newVersion = baseVersion;
          logger.info(`First release with ${recommendedReleaseType} changes: setting initial version to ${newVersion}`);
        } else {
          newVersion = semver.inc(currentVersion, recommendedReleaseType) || currentVersion;
          logger.info(`Conventional commits analysis suggests ${recommendedReleaseType} bump`);
        }
      } else {
        // No conventional commits found
        if (isFirstRelease) {
          newVersion = '0.0.1';
          logger.info('First release with no conventional commits: setting initial version to 0.0.1');
        } else {
          logger.info('No conventional commits found, defaulting to patch bump');
          newVersion = semver.inc(currentVersion, 'patch') || currentVersion;
        }
      }
    }

    logger.info(`New version: ${newVersion}`);

    if (mergedOptions.dryRun) {
      logger.info('DRY RUN - No changes will be made');
      logger.info(`Would update version from ${currentVersion} to ${newVersion}`);
      if (!mergedOptions.skipTag) {
        const tag = mergedOptions.tag || generateTagName(context.projectName, newVersion, mergedOptions);
        logger.info(`Would create git tag: ${tag}`);
      }
      return { success: true };
    }

    // Update version file with new version
    await writeVersionToFile(context, projectRoot, mergedOptions, newVersion, versionInfo.filePath);

    // Create git commit if not skipped
    if (!mergedOptions.skipCommit) {
      const commitMessage = generateConventionalCommitMessage(context.projectName, newVersion, isFirstRelease);
      execSync(`git add ${versionInfo.filePath}`, { cwd: context.root });
      execSync(`git commit -m "${commitMessage}"`, { cwd: context.root });
      logger.info(`Created conventional commit for release ${newVersion}`);
    }

    // Create git tag if not skipped
    if (!mergedOptions.skipTag) {
      const tag = mergedOptions.tag || generateTagName(context.projectName, newVersion, mergedOptions);
      execSync(`git tag ${tag}`, { cwd: context.root });
      logger.info(`Created git tag: ${tag}`);
    }

    // Publish package if requested
    if (mergedOptions.publish && !mergedOptions.dryRun) {
      logger.info('📦 Publishing package...');
      await publishPackage(mergedOptions, context, projectRoot, newVersion);
    } else if (mergedOptions.publish && mergedOptions.dryRun) {
      logger.info('DRY RUN - Would publish package to registry');
    }

    logger.info(`✅ Successfully released ${context.projectName} version ${newVersion}`);
    return { success: true };

  } catch (error: unknown) {
    logger.error(`❌ Release failed: ${error instanceof Error ? error.message : String(error)}`);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

function generateConventionalCommitMessage(projectName: string, version: string, isFirstRelease?: boolean): string {
  const prefix = isFirstRelease ? 'feat(release)' : 'chore(release)';

  return `${prefix}: ${projectName} v${version}

${isFirstRelease ? 'Initial' : 'Generated'} by project-release executor following conventional commits specification.`;
}

async function publishPackage(
  options: ReleaseExecutorSchema,
  context: ExecutorContext,
  projectRoot: string,
  version: string
): Promise<void> {
  const registryType = options.registryType || 'npm';
  const registry = options.registry;
  const distTag = options.distTag || 'latest';
  const access = options.access || 'public';
  const publishDir = options.publishDir || `dist/${context.projectName}`;

  // Run build target if specified
  if (options.buildTarget) {
    logger.info(`🔨 Building project with target: ${options.buildTarget}`);

    try {
      await nxRunExecutor(
        { project: context.projectName, target: options.buildTarget },
        {},
        context
      );
      logger.info('✅ Build completed successfully');
    } catch (error: unknown) {
      throw new Error(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Ensure publish directory exists
  const fullPublishDir = path.join(context.root, publishDir);
  if (!fs.existsSync(fullPublishDir)) {
    throw new Error(`Publish directory does not exist: ${fullPublishDir}`);
  }

  // Update package.json in publish directory
  const publishPackageJsonPath = path.join(fullPublishDir, 'package.json');
  if (fs.existsSync(publishPackageJsonPath)) {
    const publishPackageJson = JSON.parse(fs.readFileSync(publishPackageJsonPath, 'utf8'));
    publishPackageJson.version = version;
    fs.writeFileSync(publishPackageJsonPath, JSON.stringify(publishPackageJson, null, 2));
    logger.info(`Updated ${publishPackageJsonPath} with version ${version}`);
  }

  // Publish based on registry type
  switch (registryType) {
    case 'npm':
      await publishToNpm(fullPublishDir, registry, distTag, access);
      break;
    case 'nexus':
      await publishToNexus(fullPublishDir, registry);
      break;
    case 'custom':
      await publishToCustomRegistry(fullPublishDir, registry, distTag, access);
      break;
    default:
      throw new Error(`Unsupported registry type: ${registryType}`);
  }

  logger.info(`✅ Successfully published ${context.projectName} v${version} to ${registryType} registry`);
}

async function publishToNpm(publishDir: string, registry?: string, distTag = 'latest', access = 'public'): Promise<void> {
  const publishCmd = ['npm', 'publish'];

  if (registry) {
    publishCmd.push('--registry', registry);
  }

  publishCmd.push('--tag', distTag);
  publishCmd.push('--access', access);

  logger.info(`Publishing to npm: ${publishCmd.join(' ')}`);
  execSync(publishCmd.join(' '), { cwd: publishDir, stdio: 'inherit' });
}

async function publishToNexus(publishDir: string, registry: string): Promise<void> {
  if (!registry) {
    throw new Error('Registry URL is required for Nexus publishing');
  }

  // For Nexus, we typically use npm publish with the registry URL
  const publishCmd = ['npm', 'publish', '--registry', registry];

  logger.info(`Publishing to Nexus: ${publishCmd.join(' ')}`);
  execSync(publishCmd.join(' '), { cwd: publishDir, stdio: 'inherit' });
}

async function publishToCustomRegistry(publishDir: string, registry?: string, distTag = 'latest', access = 'public'): Promise<void> {
  if (!registry) {
    throw new Error('Registry URL is required for custom registry publishing');
  }

  const publishCmd = ['npm', 'publish', '--registry', registry, '--tag', distTag, '--access', access];

  logger.info(`Publishing to custom registry: ${publishCmd.join(' ')}`);
  execSync(publishCmd.join(' '), { cwd: publishDir, stdio: 'inherit' });
}

async function isProjectAffected(context: ExecutorContext, options: ReleaseExecutorSchema): Promise<boolean> {
  try {
    const affectedCmd = ['npx', 'nx', 'show', 'projects', '--affected'];

    if (options.baseBranch) {
      affectedCmd.push('--base', options.baseBranch);
    }

    if (options.sinceSha) {
      affectedCmd.push('--head', options.sinceSha);
    }

    const result = execSync(affectedCmd.join(' '), {
      cwd: context.root,
      encoding: 'utf8',
      stdio: 'pipe'
    });

    const affectedProjects = result.trim().split('\n').filter(p => p.trim());
    return context.projectName ? affectedProjects.includes(context.projectName) : false;
  } catch (error: unknown) {
    logger.warn(`Could not determine affected projects: ${error instanceof Error ? error.message : String(error)}`);
    return true; // Default to including project if we can't determine
  }
}

async function shouldSkipProject(projectName: string, options: ReleaseExecutorSchema, context: ExecutorContext): Promise<boolean> {
  const nxConfig = getNxReleaseConfig(context);

  // Check project.json skip configuration (highest priority)
  const projectRoot = context.projectsConfigurations?.projects[projectName]?.root;
  if (projectRoot) {
    const projectJsonPath = path.join(context.root, projectRoot, 'project.json');
    if (fs.existsSync(projectJsonPath)) {
      try {
        const projectJson = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
        if (projectJson.release?.skip === true) {
          return true;
        }
      } catch {
        // Ignore parsing errors
      }
    }
  }

  // Check nx.json project-specific configuration
  if (nxConfig.projectConfigs?.[projectName]?.skip) {
    return true;
  }

  // Check nx.json global skip list
  if (nxConfig.projects?.skip?.includes(projectName)) {
    return true;
  }

  // Check per-project configuration from executor options
  if (options.releaseConfig?.[projectName]?.skip) {
    return true;
  }

  // Check include/exclude patterns from options or nx.json
  const includeProjects = options.includeProjects || nxConfig.projects?.include;
  const excludeProjects = options.excludeProjects || nxConfig.projects?.exclude;

  if (includeProjects?.length) {
    const isIncluded = includeProjects.some(pattern =>
      projectName.match(new RegExp(pattern.replace('*', '.*')))
    );
    if (!isIncluded) return true;
  }

  if (excludeProjects?.length) {
    const isExcluded = excludeProjects.some(pattern =>
      projectName.match(new RegExp(pattern.replace('*', '.*')))
    );
    if (isExcluded) return true;
  }

  // Check project filter
  if (options.projectFilter) {
    const matches = projectName.match(new RegExp(options.projectFilter.replace('*', '.*')));
    if (!matches) return true;
  }

  return false;
}

async function readVersionFromFile(
  context: ExecutorContext,
  projectRoot: string,
  options: ReleaseExecutorSchema
): Promise<{ version: string; filePath: string }> {
  const versionPath = options.versionPath || 'version';

  // Get list of version files to try (fallback order)
  let versionFiles: string[] = [];
  if (options.versionFile) {
    versionFiles = [options.versionFile];
  } else if (options.versionFiles) {
    versionFiles = options.versionFiles;
  } else {
    versionFiles = ['project.json']; // Default fallback
  }

  let lastError: Error | undefined;

  // Try each version file in order until one is found and readable
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
        // For non-JSON files like version.txt, read the entire content as version
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

  // If no version file worked, throw the last error or a generic one
  throw lastError || new Error(`No version files found in ${versionFiles.join(', ')}`);
}

async function writeVersionToFile(
  context: ExecutorContext,
  projectRoot: string,
  options: ReleaseExecutorSchema,
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
      // For non-JSON files, write the version directly
      fs.writeFileSync(filePath, newVersion);
    }
    logger.info(`Updated ${filePath} with version ${newVersion}`);
  } catch (error: unknown) {
    throw new Error(`Could not write version to ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function getNestedProperty(obj: Record<string, unknown>, path: string): string {
  return path.split('.').reduce((current, key) => current?.[key], obj) as string;
}

function setNestedProperty(obj: Record<string, unknown>, path: string, value: string): void {
  const keys = path.split('.');
  const lastKey = keys.pop();
  if (!lastKey) {
    throw new Error('Invalid version path');
  }
  const target = keys.reduce((current, key) => {
    if (!current[key]) current[key] = {};
    return current[key] as Record<string, unknown>;
  }, obj);
  target[lastKey] = value;
}

function generateTagName(
  projectName: string,
  version: string,
  options: ReleaseExecutorSchema
): string {
  const tagNaming = options.tagNaming || {};

  const prefix = tagNaming.prefix || (tagNaming.includeProjectName !== false ? `${projectName}-v` : 'v');
  const suffix = tagNaming.suffix || '';
  const format = tagNaming.format || '{prefix}{version}{suffix}';

  return format
    .replace('{prefix}', prefix)
    .replace('{version}', version)
    .replace('{suffix}', suffix)
    .replace('{projectName}', projectName);
}

function shouldReleaseAllProjects(options: ReleaseExecutorSchema, context: ExecutorContext): boolean {
  // Release all when explicitly requested via releaseAll option
  if (options.releaseAll) {
    return true;
  }

  // Don't auto-release all if we have a specific project context
  if (context.projectName && context.projectName !== 'workspace') {
    return false;
  }

  // Release all if no specific project filters are set and no project context
  return !options.includeProjects?.length &&
         !options.excludeProjects?.length &&
         !options.projectFilter &&
         !options.onlyChanged;
}

async function releaseAllProjects(options: ReleaseExecutorSchema, context: ExecutorContext): Promise<{ success: boolean; error?: string }> {
  logger.info('🚀 Releasing all projects in the workspace');

  if (!context.projectsConfigurations?.projects) {
    throw new Error('No projects found in workspace');
  }

  const projectNames = Object.keys(context.projectsConfigurations.projects);
  const results: Array<{ project: string; success: boolean; error?: string; skipped?: boolean }> = [];

  logger.info(`Found ${projectNames.length} projects in workspace`);

  for (const projectName of projectNames) {
    logger.info(`\n📦 Processing project: ${projectName}`);

    try {
      // Skip projects that don't have the release target
      const projectConfig = context.projectsConfigurations.projects[projectName];
      if (!projectConfig.targets?.release) {
        logger.info(`⏭️ Skipping ${projectName} - no release target configured`);
        results.push({ project: projectName, success: true, skipped: true });
        continue;
      }

      // Check if project should be skipped
      if (await shouldSkipProject(projectName, options, context)) {
        logger.info(`⏭️ Skipping ${projectName} - configured to be skipped`);
        results.push({ project: projectName, success: true, skipped: true });
        continue;
      }

      // Create a new context for each project
      const projectContext = {
        ...context,
        projectName,
        targetName: context.targetName,
        configurationName: context.configurationName
      };

      // Release the project (call the main release logic without releaseAll)
      const result = await releaseSingleProject({...options, releaseAll: false}, projectContext);
      results.push({
        project: projectName,
        success: result.success,
        error: result.error,
        skipped: result.skipped
      });

    } catch (error: unknown) {
      logger.error(`❌ Failed to release ${projectName}: ${error instanceof Error ? error.message : String(error)}`);
      results.push({
        project: projectName,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Summary
  const successful = results.filter(r => r.success && !r.skipped).length;
  const skipped = results.filter(r => r.skipped).length;
  const failed = results.filter(r => !r.success).length;

  logger.info(`\n📊 Release Summary:`);
  logger.info(`✅ Successfully released: ${successful} projects`);
  logger.info(`⏭️ Skipped: ${skipped} projects`);
  logger.info(`❌ Failed: ${failed} projects`);

  if (failed > 0) {
    logger.error('\nFailed projects:');
    results.filter(r => !r.success).forEach(r => {
      logger.error(`  - ${r.project}: ${r.error}`);
    });
  }

  return { success: failed === 0 };
}

async function analyzeConventionalCommits(context: ExecutorContext, projectRoot: string): Promise<semver.ReleaseType | null> {
  try {
    // Get commits since the last tag or from the beginning
    let gitCommand = 'git log --format="%s" --no-merges';

    // Try to find the last tag for this project
    try {
      const lastTag = execSync(`git tag --list --sort=-version:refname | grep -E "^${context.projectName}-v|^v" | head -1`, {
        cwd: context.root,
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();

      if (lastTag) {
        gitCommand += ` ${lastTag}..HEAD`;
        logger.info(`Analyzing commits since last tag: ${lastTag}`);
      } else {
        logger.info('No previous tags found, analyzing all commits');
      }
    } catch {
      logger.info('No previous tags found, analyzing all commits');
    }

    // Filter commits that affect this project
    gitCommand += ` -- ${projectRoot}`;

    const commits = execSync(gitCommand, {
      cwd: context.root,
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();

    if (!commits) {
      logger.info('No commits found for this project');
      return null;
    }

    const commitLines = commits.split('\n').filter(line => line.trim());
    logger.info(`Found ${commitLines.length} commits to analyze`);

    let hasBreaking = false;
    let hasFeature = false;
    let hasFix = false;

    for (const commit of commitLines) {
      const line = commit.trim();

      // Check for breaking changes
      if (line.includes('BREAKING CHANGE') || line.includes('!:')) {
        hasBreaking = true;
        logger.info(`Breaking change detected: ${line}`);
      }
      // Check for features
      else if (line.startsWith('feat:') || line.startsWith('feat(')) {
        hasFeature = true;
        logger.info(`Feature detected: ${line}`);
      }
      // Check for fixes
      else if (line.startsWith('fix:') || line.startsWith('fix(')) {
        hasFix = true;
        logger.info(`Fix detected: ${line}`);
      }
    }

    // Determine version bump based on conventional commits
    if (hasBreaking) {
      return 'major';
    } else if (hasFeature) {
      return 'minor';
    } else if (hasFix) {
      return 'patch';
    }

    return null;
  } catch (error: unknown) {
    logger.warn(`Could not analyze conventional commits: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function releaseSingleProject(options: ReleaseExecutorSchema, context: ExecutorContext): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  try {
    // Ensure we have a project name
    if (!context.projectName) {
      throw new Error('Project name is required');
    }

    // Merge nx.json configuration with executor options
    const mergedOptions = mergeConfigWithNxJson(options, context, context.projectName);

    // Check if we should only process affected projects
    if (mergedOptions.onlyChanged) {
      const isAffected = await isProjectAffected(context, mergedOptions);
      if (!isAffected) {
        logger.info(`⏭️ Project ${context.projectName} is not affected, skipping release`);
        return { success: true, skipped: true };
      }
    }

    // Check if project should be skipped based on configuration
    if (await shouldSkipProject(context.projectName, mergedOptions, context)) {
      logger.info(`⏭️ Project ${context.projectName} is configured to be skipped`);
      return { success: true, skipped: true };
    }

    // Simple project configuration - read from workspace
    const projectRoot = context.projectsConfigurations?.projects[context.projectName]?.root || context.projectName;
    logger.info(`Project root: ${projectRoot}`);

    // Read current version from specified file
    const versionInfo = await readVersionFromFile(context, projectRoot, mergedOptions);
    const currentVersion = versionInfo.version || '0.0.0';
    const isFirstRelease = !versionInfo.version || versionInfo.version === '0.0.0';

    if (isFirstRelease) {
      logger.info(`First release detected for ${context.projectName}`);
    }
    logger.info(`Current version: ${currentVersion} (from ${versionInfo.filePath})`);

    // Calculate new version
    let newVersion: string;
    if (mergedOptions.version) {
      // Validate semver format
      if (!semver.valid(mergedOptions.version)) {
        throw new Error(`Invalid semver version: ${mergedOptions.version}`);
      }
      newVersion = mergedOptions.version;
    } else if (mergedOptions.releaseAs) {
      // Manual release type specified
      if (isFirstRelease && mergedOptions.releaseAs === 'prerelease') {
        newVersion = '1.0.0-0';
      } else if (isFirstRelease) {
        newVersion = '1.0.0';
      } else {
        newVersion = semver.inc(currentVersion, mergedOptions.releaseAs) || currentVersion;
      }
    } else {
      // Analyze conventional commits to determine version bump
      const recommendedReleaseType = await analyzeConventionalCommits(context, projectRoot);
      if (recommendedReleaseType) {
        if (isFirstRelease) {
          // For first release, use conventional commits to determine starting version
          const baseVersion = recommendedReleaseType === 'major' ? '1.0.0' :
                            recommendedReleaseType === 'minor' ? '0.1.0' : '0.0.1';
          newVersion = baseVersion;
          logger.info(`First release with ${recommendedReleaseType} changes: setting initial version to ${newVersion}`);
        } else {
          newVersion = semver.inc(currentVersion, recommendedReleaseType) || currentVersion;
          logger.info(`Conventional commits analysis suggests ${recommendedReleaseType} bump`);
        }
      } else {
        // No conventional commits found
        if (isFirstRelease) {
          newVersion = '0.0.1';
          logger.info('First release with no conventional commits: setting initial version to 0.0.1');
        } else {
          logger.info('No conventional commits found, defaulting to patch bump');
          newVersion = semver.inc(currentVersion, 'patch') || currentVersion;
        }
      }
    }

    logger.info(`New version: ${newVersion}`);

    if (mergedOptions.dryRun) {
      logger.info('DRY RUN - No changes will be made');
      logger.info(`Would update version from ${currentVersion} to ${newVersion}`);
      if (!mergedOptions.skipTag) {
        const tag = mergedOptions.tag || generateTagName(context.projectName, newVersion, mergedOptions);
        logger.info(`Would create git tag: ${tag}`);
      }
      return { success: true };
    }

    // Update version file with new version
    await writeVersionToFile(context, projectRoot, mergedOptions, newVersion, versionInfo.filePath);

    // Create git commit if not skipped
    if (!mergedOptions.skipCommit) {
      const commitMessage = generateConventionalCommitMessage(context.projectName, newVersion, isFirstRelease);
      execSync(`git add ${versionInfo.filePath}`, { cwd: context.root });
      execSync(`git commit -m "${commitMessage}"`, { cwd: context.root });
      logger.info(`Created conventional commit for release ${newVersion}`);
    }

    // Create git tag if not skipped
    if (!mergedOptions.skipTag) {
      const tag = mergedOptions.tag || generateTagName(context.projectName, newVersion, mergedOptions);
      execSync(`git tag ${tag}`, { cwd: context.root });
      logger.info(`Created git tag: ${tag}`);
    }

    // Publish package if requested
    if (mergedOptions.publish && !mergedOptions.dryRun) {
      logger.info('📦 Publishing package...');
      await publishPackage(mergedOptions, context, projectRoot, newVersion);
    } else if (mergedOptions.publish && mergedOptions.dryRun) {
      logger.info('DRY RUN - Would publish package to registry');
    }

    logger.info(`✅ Successfully released ${context.projectName} version ${newVersion}`);
    return { success: true };

  } catch (error: unknown) {
    logger.error(`❌ Release failed: ${error instanceof Error ? error.message : String(error)}`);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export default runExecutor;
