import {
  Tree,
  readProjectConfiguration,
  updateProjectConfiguration,
  readNxJson,
  updateNxJson,
  logger,
  getProjects,
} from '@nx/devkit';
import { ConfigureReleaseSchema } from './schema';
import Enquirer from 'enquirer';

const { prompt } = Enquirer;

export default async function configureReleaseGenerator(
  tree: Tree,
  options: ConfigureReleaseSchema
) {
  logger.info('');
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('   Configure Release Settings');
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('');

  // Step 1: Workspace-Level Configuration
  const workspaceConfig = await promptWorkspaceConfig(options);
  updateWorkspaceDefaults(tree, workspaceConfig);

  // Step 2: Project Selection
  const selectedProjects = await selectProjects(tree, options);

  if (selectedProjects.length === 0) {
    logger.warn('⚠️  No projects selected for release configuration');
    return;
  }

  // Step 3: Exclusion Configuration
  const excludedProjects = await selectExcludedProjects(tree, options);
  updateExcludedProjects(tree, excludedProjects);

  // Step 4: Per-Project Configuration
  const projectConfigs = await configureProjects(
    tree,
    selectedProjects,
    options
  );

  // Apply configurations to each project
  for (const [projectName, config] of Object.entries(projectConfigs)) {
    applyProjectConfig(tree, projectName, config);
  }

  logger.info('');
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('   ✅ Release Configuration Complete!');
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('');
  logger.info(`Configured ${selectedProjects.length} project(s) for releases`);
  logger.info(`Excluded ${excludedProjects.length} project(s) from releases`);
  logger.info('');
  logger.info('Next steps:');
  logger.info('  1. Run version executor to bump version');
  logger.info('  2. Run changelog executor to generate changelog');
  logger.info('  3. Run release executor to create release');
  logger.info('');
  logger.info('Example:');
  logger.info(`  nx run ${selectedProjects[0]}:release --dryRun`);
  logger.info('');
}

/**
 * Step 1: Prompt for workspace-level release configuration
 */
async function promptWorkspaceConfig(
  options: ConfigureReleaseSchema
): Promise<WorkspaceConfig> {
  logger.info('📋 Workspace-Level Configuration');
  logger.info('   (These settings apply to all projects)');
  logger.info('');

  const config: WorkspaceConfig = {};

  // Platform
  if (!options.platform) {
    const { platform } = await prompt<{ platform: string }>({
      type: 'select',
      name: 'platform',
      message: 'Which release platform?',
      choices: [
        { name: 'github', message: 'GitHub (create GitHub releases)' },
        { name: 'gitlab', message: 'GitLab (create GitLab releases)' },
        { name: 'none', message: 'None (git tags only, no platform release)' },
      ],
      initial: 0,
    });
    config.platform = platform as 'github' | 'gitlab' | 'none';
  } else {
    config.platform = options.platform;
  }

  // Tag prefix
  if (options.tagPrefix === undefined) {
    const { tagPrefix } = await prompt<{ tagPrefix: string }>({
      type: 'input',
      name: 'tagPrefix',
      message: "Tag prefix? (e.g., 'v', 'release-', or empty)",
      initial: 'v',
    });
    config.tagPrefix = tagPrefix;
  } else {
    config.tagPrefix = options.tagPrefix;
  }

  // Tag format
  if (!options.tagFormat) {
    const { tagFormat } = await prompt<{ tagFormat: string }>({
      type: 'input',
      name: 'tagFormat',
      message:
        'Tag format? (use {version}, {projectName} placeholders, or leave empty for default)',
      initial: '',
    });
    config.tagFormat = tagFormat || undefined;
  } else {
    config.tagFormat = options.tagFormat;
  }

  // Release notes strategy
  if (!options.releaseNotes) {
    const { releaseNotes } = await prompt<{ releaseNotes: string }>({
      type: 'select',
      name: 'releaseNotes',
      message: 'How to generate release notes?',
      choices: [
        {
          name: 'changelog',
          message: 'Use changelog file (CHANGELOG.md)',
        },
        {
          name: 'auto-generate',
          message: 'Auto-generate from commits',
        },
        {
          name: 'both',
          message: 'Both (try changelog, fallback to auto-generate)',
        },
      ],
      initial: 0,
    });
    config.releaseNotes = releaseNotes as
      | 'changelog'
      | 'auto-generate'
      | 'both';
  } else {
    config.releaseNotes = options.releaseNotes;
  }

  // Changelog file path
  if (
    (config.releaseNotes === 'changelog' || config.releaseNotes === 'both') &&
    !options.changelogFile
  ) {
    const { changelogFile } = await prompt<{ changelogFile: string }>({
      type: 'input',
      name: 'changelogFile',
      message: 'Changelog file path?',
      initial: 'CHANGELOG.md',
    });
    config.changelogFile = changelogFile;
  } else {
    config.changelogFile = options.changelogFile || 'CHANGELOG.md';
  }

  logger.info('');
  logger.info('✅ Workspace configuration:');
  logger.info(`   Platform: ${config.platform}`);
  logger.info(`   Tag prefix: ${config.tagPrefix || '(none)'}`);
  if (config.tagFormat) {
    logger.info(`   Tag format: ${config.tagFormat}`);
  }
  logger.info(`   Release notes: ${config.releaseNotes}`);
  if (config.releaseNotes !== 'auto-generate') {
    logger.info(`   Changelog file: ${config.changelogFile}`);
  }
  logger.info('');

  return config;
}

/**
 * Step 2: Select projects to enable for releases
 */
async function selectProjects(
  tree: Tree,
  options: ConfigureReleaseSchema
): Promise<string[]> {
  logger.info('📦 Select Projects for Release');
  logger.info('');

  const allProjects = Array.from(getProjects(tree).keys());

  // If projects provided via CLI
  if (options.projects && options.projects.length > 0) {
    return options.projects;
  }

  if (options.project) {
    return [options.project];
  }

  // Interactive multi-select
  const { selectedProjects } = await prompt<{ selectedProjects: string[] }>({
    type: 'multiselect',
    name: 'selectedProjects',
    message: 'Select projects to enable release target:',
    choices: allProjects,
    // @ts-expect-error - enquirer types are incomplete
    hint: 'Space to select, Enter to confirm',
  });

  return selectedProjects;
}

/**
 * Step 3: Select projects to exclude from releases (workspace-wide)
 */
async function selectExcludedProjects(
  tree: Tree,
  options: ConfigureReleaseSchema
): Promise<string[]> {
  logger.info('');
  logger.info('🚫 Exclude Projects (Workspace-Wide)');
  logger.info('');

  // If provided via CLI
  if (options.excludeProjects && options.excludeProjects.length > 0) {
    return options.excludeProjects;
  }

  const allProjects = Array.from(getProjects(tree).keys());

  // Get current exclusions
  const nxJson = readNxJson(tree);
  const currentExcluded =
    (nxJson as any)?.projectRelease?.excludedProjects || [];

  const { wantExclude } = await prompt<{ wantExclude: boolean }>({
    type: 'confirm',
    name: 'wantExclude',
    message: `Exclude projects from releases? (Current: ${currentExcluded.length} excluded)`,
    initial: currentExcluded.length > 0,
  });

  if (!wantExclude) {
    return currentExcluded;
  }

  const { excludedProjects } = await prompt<{ excludedProjects: string[] }>({
    type: 'multiselect',
    name: 'excludedProjects',
    message: 'Select projects to exclude from releases:',
    choices: allProjects,
    initial: currentExcluded,
    // @ts-expect-error - enquirer types are incomplete
    hint: 'Space to select, Enter to confirm',
  });

  return excludedProjects;
}

/**
 * Step 4: Configure each project individually
 */
async function configureProjects(
  tree: Tree,
  projects: string[],
  options: ConfigureReleaseSchema
): Promise<Record<string, ProjectReleaseConfig>> {
  logger.info('');
  logger.info('⚙️  Per-Project Configuration');
  logger.info('');

  const configs: Record<string, ProjectReleaseConfig> = {};

  for (const projectName of projects) {
    logger.info(`Configuring: ${projectName}`);

    const projectConfig = readProjectConfiguration(tree, projectName);
    const hasArtifactTarget = !!projectConfig.targets?.['artifact'];

    const config: ProjectReleaseConfig = {};

    // Prerelease
    if (options.prerelease !== undefined) {
      config.prerelease = options.prerelease;
    } else if (options.interactive !== false) {
      const { prerelease } = await prompt<{ prerelease: boolean }>({
        type: 'confirm',
        name: 'prerelease',
        message: `  Mark ${projectName} releases as prerelease?`,
        initial: false,
      });
      config.prerelease = prerelease;
    }

    // Draft
    if (options.draft !== undefined) {
      config.draft = options.draft;
    } else if (options.interactive !== false) {
      const { draft } = await prompt<{ draft: boolean }>({
        type: 'confirm',
        name: 'draft',
        message: `  Create ${projectName} releases as draft?`,
        initial: false,
      });
      config.draft = draft;
    }

    // Artifacts (only if artifact target exists)
    if (hasArtifactTarget) {
      if (options.attachArtifacts !== undefined) {
        config.attachArtifacts = options.attachArtifacts;
      } else if (options.interactive !== false) {
        const { attachArtifacts } = await prompt<{ attachArtifacts: boolean }>(
          {
            type: 'confirm',
            name: 'attachArtifacts',
            message: `  Attach artifacts to ${projectName} releases?`,
            initial: true,
          }
        );
        config.attachArtifacts = attachArtifacts;
      }

      // Auto-derive asset patterns from artifact target
      if (config.attachArtifacts) {
        const artifactTarget = projectConfig.targets['artifact'];
        const artifactOptions = artifactTarget.options || {};
        const outputDir = artifactOptions.outputDir || 'dist/artifacts';
        const artifactName =
          artifactOptions.artifactName || '{projectName}-{version}.*';

        config.assetPatterns = [`${outputDir}/${artifactName}`];
      }
    }

    configs[projectName] = config;
    logger.info(
      `  ✓ Prerelease: ${config.prerelease || false}, Draft: ${
        config.draft || false
      }, Artifacts: ${config.attachArtifacts || false}`
    );
  }

  return configs;
}

/**
 * Update nx.json with workspace-level targetDefaults
 */
function updateWorkspaceDefaults(tree: Tree, config: WorkspaceConfig): void {
  const nxJson = readNxJson(tree);
  if (!nxJson) {
    throw new Error('Could not read nx.json');
  }

  if (!nxJson.targetDefaults) {
    nxJson.targetDefaults = {};
  }

  const releaseDefaults: any = {
    options: {},
  };

  // Platform
  if (config.platform === 'github') {
    releaseDefaults.options.createGitHubRelease = true;
  } else if (config.platform === 'gitlab') {
    releaseDefaults.options.createGitLabRelease = true;
  }

  // Tag prefix
  if (config.tagPrefix !== undefined) {
    releaseDefaults.options.tagPrefix = config.tagPrefix;
  }

  // Tag format (if custom)
  if (config.tagFormat) {
    releaseDefaults.options.tagFormat = config.tagFormat;
  }

  // Release notes
  if (config.releaseNotes === 'changelog') {
    releaseDefaults.options.generateNotes = false;
    releaseDefaults.options.changelogFile = config.changelogFile;
  } else if (config.releaseNotes === 'auto-generate') {
    releaseDefaults.options.generateNotes = true;
  } else {
    // both
    releaseDefaults.options.generateNotes = true;
    releaseDefaults.options.changelogFile = config.changelogFile;
  }

  nxJson.targetDefaults['nx-project-release:release'] = releaseDefaults;

  updateNxJson(tree, nxJson);

  logger.info('✅ Updated nx.json targetDefaults');
}

/**
 * Update nx.json with excluded projects
 */
function updateExcludedProjects(tree: Tree, excludedProjects: string[]): void {
  const nxJson = readNxJson(tree);
  if (!nxJson) {
    throw new Error('Could not read nx.json');
  }

  const nxJsonAny = nxJson as any;

  if (!nxJsonAny.projectRelease) {
    nxJsonAny.projectRelease = {};
  }

  nxJsonAny.projectRelease.excludedProjects = excludedProjects;

  updateNxJson(tree, nxJson);

  if (excludedProjects.length > 0) {
    logger.info(`✅ Updated excluded projects: ${excludedProjects.join(', ')}`);
  }
}

/**
 * Apply release target configuration to a project
 */
function applyProjectConfig(
  tree: Tree,
  projectName: string,
  config: ProjectReleaseConfig
): void {
  const projectConfig = readProjectConfiguration(tree, projectName);

  if (!projectConfig.targets) {
    projectConfig.targets = {};
  }

  // Create or update release target
  const releaseTarget: any = {
    executor: 'nx-project-release:release',
    options: {},
  };

  // Per-project options
  if (config.prerelease !== undefined) {
    releaseTarget.options.prerelease = config.prerelease;
  }

  if (config.draft !== undefined) {
    releaseTarget.options.draft = config.draft;
  }

  if (config.attachArtifacts && config.assetPatterns) {
    releaseTarget.options.assetPatterns = config.assetPatterns;
  }

  projectConfig.targets['release'] = releaseTarget;

  updateProjectConfiguration(tree, projectName, projectConfig);

  logger.info(`✅ Configured release target for: ${projectName}`);
}

// Type definitions
interface WorkspaceConfig {
  platform?: 'github' | 'gitlab' | 'none';
  tagPrefix?: string;
  tagFormat?: string;
  releaseNotes?: 'changelog' | 'auto-generate' | 'both';
  changelogFile?: string;
}

interface ProjectReleaseConfig {
  prerelease?: boolean;
  draft?: boolean;
  attachArtifacts?: boolean;
  assetPatterns?: string[];
}

export { configureReleaseGenerator };
