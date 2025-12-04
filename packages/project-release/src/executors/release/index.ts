import { ExecutorContext, logger } from '@nx/devkit';
import { ReleaseExecutorSchema } from './schema';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { glob } from 'glob';

// Types for nx.json release configuration
interface ReleaseGroup {
  projects: string[];
  versionStrategy?: 'independent' | 'fixed';
  projectsRelationship?: 'independent' | 'fixed';
  versionFiles?: string[];
  tagNaming?: {
    format?: string;
    prefix?: string;
    suffix?: string;
    includeProjectName?: boolean;
  };
}

interface NxReleaseConfig {
  projectsRelationship?: 'independent' | 'fixed';
  releaseGroups?: Record<string, ReleaseGroup>;
}

export default async function releaseExecutor(
  options: ReleaseExecutorSchema,
  context: ExecutorContext
): Promise<{ success: boolean }> {
  const projectName = context.projectName || '';
  let projectRoot = '.';

  try {
    const project = context.projectGraph?.nodes?.[projectName];
    if (project) {
      projectRoot = project.data.root;
    }
  } catch {
    // Fallback to current directory
  }

  logger.info('');
  logger.info('═══════════════════════════════════════════════════════');
  logger.info(`   Release: ${projectName}`);
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('');

  try {
    // Get version
    const version =
      options.version || getProjectVersion(context, projectName, projectRoot);
    if (!version) {
      logger.error('❌ No version found');
      logger.info(
        '   Ensure project has a version in package.json or project.json'
      );
      return { success: false };
    }

    // Get release group configuration for proper tag formatting
    const { group, groupName } = getReleaseGroupForProject(projectName, context);
    const nxConfig = getNxReleaseConfig(context);

    // Generate tag using proper logic
    const tag = generateTagName(projectName, version, {
      tagPrefix: options.tagPrefix,
      tagNaming: group?.tagNaming,
      projectsRelationship: group?.projectsRelationship || nxConfig.projectsRelationship || 'independent',
      releaseGroup: groupName,
    });

    logger.info(`📦 Version: ${version}`);
    logger.info(`🏷️  Tag: ${tag}`);
    logger.info('');

    if (options.dryRun) {
      logger.info('🔍 DRY RUN - Would create tag and optionally push');
      return { success: true };
    }

    // Create git tag (skips if exists)
    await createTag(
      context.root,
      tag,
      `${projectName} ${version}`,
      `Release ${projectName} ${version}`,
      projectRoot,
      (group as any)?.useSubtreeSplit || false,
      projectName,
      context
    );

    // Git Push (if enabled)
    if (options.gitPush) {
      await pushTag(context.root, tag);
    }

    // Create GitHub Release (if enabled)
    if (options.createGitHubRelease) {
      const { owner, repo } = getRepositoryInfo(
        context.root,
        options.owner,
        options.repo
      );
      if (owner && repo) {
        const releaseNotes = getReleaseNotes(
          context.root,
          projectRoot,
          options.changelogFile || 'CHANGELOG.md',
          version,
          options.generateNotes !== false
        );
        const assets = await collectAssets(
          context.root,
          projectRoot,
          options.assets,
          options.assetPatterns
        );

        await createGitHubRelease(
          owner,
          repo,
          tag,
          options.releaseName || `${projectName} ${version}`,
          releaseNotes,
          assets,
          options,
          context.root
        );
      }
    }

    logger.info('');
    logger.info('✅ Release complete!');
    logger.info('');

    return { success: true };
  } catch (error) {
    logger.error(`❌ Release failed: ${error.message}`);
    return { success: false };
  }
}

async function pushTag(workspaceRoot: string, tag: string): Promise<void> {
  logger.info('⬆️  Pushing tag to remote...');

  try {
    execSync(`git push origin ${tag}`, {
      cwd: workspaceRoot,
      stdio: 'inherit',
    });
    logger.info('✅ Tag pushed to remote');
  } catch (error) {
    throw new Error(`Failed to push tag: ${error.message}`);
  }
}

function getNxReleaseConfig(context: ExecutorContext): NxReleaseConfig {
  const nxJsonPath = join(context.root, 'nx.json');
  if (!existsSync(nxJsonPath)) {
    return {};
  }

  try {
    const nxJson = JSON.parse(readFileSync(nxJsonPath, 'utf-8'));
    return (nxJson?.projectRelease as NxReleaseConfig) || {};
  } catch {
    return {};
  }
}

function matchesProjectPattern(
  projectName: string,
  patterns: string[]
): boolean {
  return patterns.some((pattern) => {
    // Convert glob pattern to regex
    const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(projectName);
  });
}

function getReleaseGroupForProject(
  projectName: string,
  context: ExecutorContext
): { group?: ReleaseGroup; groupName?: string } {
  const nxConfig = getNxReleaseConfig(context);

  if (!nxConfig.releaseGroups) {
    return {};
  }

  // Auto-detect release group based on project patterns
  for (const [groupName, group] of Object.entries(nxConfig.releaseGroups)) {
    if (matchesProjectPattern(projectName, group.projects)) {
      return { group, groupName };
    }
  }

  return {};
}

function generateTagName(
  projectName: string,
  version: string,
  options: {
    tagPrefix?: string;
    tagNaming?: ReleaseGroup['tagNaming'];
    projectsRelationship?: 'independent' | 'fixed';
    releaseGroup?: string;
  }
): string {
  // If tagPrefix is provided, use it
  if (options.tagPrefix) {
    return `${options.tagPrefix}${version}`;
  }

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

  const prefix =
    tagNaming.prefix ||
    (tagNaming.includeProjectName !== false && !releaseGroupName
      ? `${projectName}-v`
      : '');
  const suffix = tagNaming.suffix || '';
  const format = tagNaming.format || defaultFormat;

  return format
    .replace('{prefix}', prefix)
    .replace('{version}', version)
    .replace('{suffix}', suffix)
    .replace('{projectName}', projectName)
    .replace('{releaseGroupName}', releaseGroupName || '');
}

async function createTag(
  workspaceRoot: string,
  tag: string,
  name: string,
  message: string,
  projectRoot?: string,
  useSubtreeSplit?: boolean,
  projectName?: string,
  context?: ExecutorContext
): Promise<void> {
  // Check if tag already exists - skip without error
  try {
    execSync(`git rev-parse ${tag}`, {
      cwd: workspaceRoot,
      stdio: 'pipe',
    });
    logger.info(`ℹ️  Tag ${tag} already exists, skipping`);
    return;
  } catch {
    // Tag doesn't exist, create it
  }

  logger.info(`🏷️  Creating git tag: ${tag}...`);

  try {
    // Simple tag on current HEAD (no subtree split complexity)
    execSync(`git tag -a ${tag} -m "${name}"`, {
      cwd: workspaceRoot,
      stdio: 'inherit',
    });

    logger.info(`✅ Created tag: ${tag}`);
  } catch (error) {
    throw new Error(`Failed to create tag: ${error.message}`);
  }
}

function getProjectVersion(
  context: ExecutorContext,
  projectName: string,
  projectRoot: string
): string | null {
  // Get release group configuration to determine which files to check
  const { group } = getReleaseGroupForProject(projectName, context);
  const versionFiles = group?.versionFiles || ['project.json', 'package.json'];

  // Try version files in order specified by release group
  for (const versionFile of versionFiles) {
    const filePath = join(context.root, projectRoot, versionFile);
    if (existsSync(filePath)) {
      try {
        const fileContent = JSON.parse(readFileSync(filePath, 'utf-8'));
        if (fileContent.version) {
          return fileContent.version;
        }
      } catch {
        // Ignore and try next file
      }
    }
  }

  return null;
}

function getRepositoryInfo(
  workspaceRoot: string,
  ownerOption?: string,
  repoOption?: string
): { owner: string | null; repo: string | null } {
  if (ownerOption && repoOption) {
    return { owner: ownerOption, repo: repoOption };
  }

  try {
    const remoteUrl = execSync('git config --get remote.origin.url', {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    }).trim();

    // Parse GitHub/GitLab URL
    const match = remoteUrl.match(/[:/]([^/]+)\/([^/.]+)(\.git)?$/);
    if (match) {
      return {
        owner: ownerOption || match[1],
        repo: repoOption || match[2],
      };
    }
  } catch {
    // Ignore error
  }

  return { owner: null, repo: null };
}

function getReleaseNotes(
  workspaceRoot: string,
  projectRoot: string,
  changelogFile: string,
  version: string,
  generateNotes: boolean
): string {
  // Extract from CHANGELOG
  const changelogPath = join(workspaceRoot, projectRoot, changelogFile);
  if (existsSync(changelogPath)) {
    const changelog = readFileSync(changelogPath, 'utf-8');

    // Extract section for this version
    const versionPattern = new RegExp(
      `## \\[?${version.replace(
        /\./g,
        '\\.'
      )}\\]?.*?\\n([\\s\\S]*?)(?=\\n## |$)`,
      'i'
    );
    const match = changelog.match(versionPattern);

    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Fall back to generated notes
  if (generateNotes) {
    try {
      const previousTag = execSync('git describe --tags --abbrev=0 HEAD^', {
        cwd: workspaceRoot,
        encoding: 'utf-8',
      }).trim();

      const commits = execSync(
        `git log ${previousTag}..HEAD --pretty=format:"- %s (%h)"`,
        {
          cwd: workspaceRoot,
          encoding: 'utf-8',
        }
      ).trim();

      return commits || 'No changes';
    } catch {
      return 'Initial release';
    }
  }

  return `Release ${version}`;
}

async function collectAssets(
  workspaceRoot: string,
  projectRoot: string,
  assets?: string[],
  assetPatterns?: string[]
): Promise<string[]> {
  const collectedAssets: string[] = [];

  // Add explicit assets
  if (assets && assets.length > 0) {
    for (const asset of assets) {
      const assetPath = join(workspaceRoot, projectRoot, asset);
      if (existsSync(assetPath)) {
        collectedAssets.push(assetPath);
      } else {
        logger.warn(`⚠️  Asset not found: ${asset}`);
      }
    }
  }

  // Add pattern-matched assets
  if (assetPatterns && assetPatterns.length > 0) {
    for (const pattern of assetPatterns) {
      const matches = await glob(pattern, {
        cwd: join(workspaceRoot, projectRoot),
        absolute: true,
      });
      collectedAssets.push(...matches);
    }
  }

  return [...new Set(collectedAssets)];
}

async function createGitHubRelease(
  owner: string,
  repo: string,
  tag: string,
  name: string,
  body: string,
  assets: string[],
  options: ReleaseExecutorSchema,
  workspaceRoot: string
): Promise<void> {
  // Check if gh CLI is available
  try {
    execSync('gh --version', { stdio: 'ignore' });
  } catch {
    logger.error('❌ GitHub CLI (gh) is not installed');
    logger.info('   Install from: https://cli.github.com/');
    throw new Error('GitHub CLI not available');
  }

  logger.info('🚀 Creating GitHub release...');

  const args = [
    'release',
    'create',
    tag,
    '--title',
    `"${name}"`,
    '--notes',
    `"${body.replace(/"/g, '\\"')}"`,
    '--repo',
    `${owner}/${repo}`,
  ];

  if (options.draft) {
    args.push('--draft');
  }

  if (options.prerelease) {
    args.push('--prerelease');
  }

  if (options.targetCommitish) {
    args.push('--target', options.targetCommitish);
  }

  if (options.discussionCategory) {
    args.push('--discussion-category', options.discussionCategory);
  }

  // Add assets
  for (const asset of assets) {
    args.push(asset);
  }

  const command = `gh ${args.join(' ')}`;

  try {
    execSync(command, {
      cwd: workspaceRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        GITHUB_TOKEN: options.token || process.env.GITHUB_TOKEN,
      },
    });
    logger.info('✅ GitHub release created');
  } catch (error) {
    throw new Error(`Failed to create GitHub release: ${error.message}`);
  }
}
