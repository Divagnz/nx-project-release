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
  logger.info('   Configure Platform Release Settings');
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('');
  logger.info('ℹ️  This generator configures GitHub/GitLab platform releases');
  logger.info('   For tag configuration: nx g nx-project-release:configure-global');
  logger.info('   For exclusions: nx g nx-project-release:exclude-projects');
  logger.info('');

  // Step 1: Platform & Release Notes Configuration
  const workspaceConfig = await promptWorkspaceConfig(options);
  updateWorkspaceDefaults(tree, workspaceConfig);

  // Step 2: Project Selection
  const selectedProjects = await selectProjects(tree, options);

  if (selectedProjects.length === 0) {
    logger.warn('⚠️  No projects selected for release configuration');
    return;
  }

  // Step 3: Per-Project Configuration
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
  logger.info('   ✅ Platform Release Configuration Complete!');
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('');
  logger.info(`Configured ${selectedProjects.length} project(s) for platform releases`);
  logger.info('');
  logger.info('Next steps:');
  logger.info('  1. Run version executor to bump version');
  logger.info('  2. Run changelog executor to generate changelog');
  logger.info('  3. Run release executor to create GitHub/GitLab release');
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
  logger.info('📋 Platform & Release Notes Configuration');
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
  logger.info('✅ Platform configuration:');
  logger.info(`   Platform: ${config.platform}`);
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
 * Step 3: Configure each project individually
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
