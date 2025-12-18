import {
  Tree,
  getProjects,
  readProjectConfiguration,
  updateProjectConfiguration,
  logger,
} from '@nx/devkit';
import { ConfigureVersionSchema } from './schema';
import Enquirer from 'enquirer';

const { prompt } = Enquirer;

export default async function configureVersionGenerator(
  tree: Tree,
  options: ConfigureVersionSchema
) {
  logger.info('');
  logger.info('⚙️  Configure Version Settings');
  logger.info('');

  // Apply backward compatibility layer
  applyBackwardCompatibility(options);

  const allProjects = Array.from(getProjects(tree).keys());
  let projectsToProcess: string[] = [];

  // Interactive project selection
  if (options.interactive !== false && !options.projects) {
    const { selectedProjects } = await prompt<{ selectedProjects: string[] }>({
      type: 'multiselect',
      name: 'selectedProjects',
      message: 'Select projects to configure version settings:',
      choices: allProjects,
      // @ts-expect-error - enquirer types are incomplete
      hint: 'Space to select, Enter to confirm',
    });

    projectsToProcess = selectedProjects;

    if (projectsToProcess.length === 0) {
      logger.warn('⚠️  No projects selected');
      return;
    }

    // Prompt for version settings
    const settings = await promptVersionSettings(options);
    Object.assign(options, settings);
  } else if (options.projects && options.projects.length > 0) {
    projectsToProcess = options.projects;
  } else {
    logger.error('❌ No projects specified');
    logger.info('💡 Run without arguments for interactive mode:');
    logger.info('   nx g nx-project-release:configure-version');
    return;
  }

  // Apply settings to each project
  for (const projectName of projectsToProcess) {
    try {
      const projectConfig = readProjectConfiguration(tree, projectName);

      if (!projectConfig.targets) {
        projectConfig.targets = {};
      }

      // Ensure version target exists
      if (!projectConfig.targets['version']) {
        projectConfig.targets['version'] = {
          executor: 'nx-project-release:version',
          options: {},
        };
      }

      const versionOptions = projectConfig.targets['version'].options || {};

      // Update version files (always provide default)
      if (options.versionFiles && options.versionFiles.length > 0) {
        versionOptions.versionFiles = options.versionFiles;
      } else if (!versionOptions.versionFiles) {
        versionOptions.versionFiles = ['package.json'];
      }

      // Update version path
      if (options.versionPath !== undefined) {
        versionOptions.versionPath = options.versionPath;
      }

      // Update projects relationship
      if (options.projectsRelationship !== undefined) {
        versionOptions.projectsRelationship = options.projectsRelationship;
      }

      // Update initial version
      if (options.initialVersion !== undefined) {
        versionOptions.initialVersion = options.initialVersion;
      }

      // Update current version resolver (NEW - replaces validationStrategy)
      if (options.currentVersionResolver !== undefined) {
        versionOptions.currentVersionResolver = options.currentVersionResolver;
      }

      // Update fallback resolver
      if (options.fallbackCurrentVersionResolver !== undefined) {
        versionOptions.fallbackCurrentVersionResolver =
          options.fallbackCurrentVersionResolver;
      }

      // Update track deps (NEW - replaces bumpDependents)
      if (options.trackDeps !== undefined) {
        versionOptions.trackDeps = options.trackDeps;
      }

      // Update tag naming
      if (options.tagNaming !== undefined) {
        versionOptions.tagNaming = options.tagNaming;
      }

      // Update sync versions
      if (options.syncVersions !== undefined) {
        versionOptions.syncVersions = options.syncVersions;
      }

      // Update sync projects
      if (options.syncProjects && options.syncProjects.length > 0) {
        versionOptions.syncProjects = options.syncProjects;
      }

      // Update sync strategy
      if (options.syncStrategy !== undefined) {
        versionOptions.syncStrategy = options.syncStrategy;
      }

      // Update post targets
      if (options.postTargets && options.postTargets.length > 0) {
        versionOptions.postTargets = options.postTargets;
      }

      // Update post target options
      if (options.postTargetOptions !== undefined) {
        versionOptions.postTargetOptions = options.postTargetOptions;
      }

      projectConfig.targets['version'].options = versionOptions;

      updateProjectConfiguration(tree, projectName, projectConfig);

      logger.info(`✅ Configured version settings for: ${projectName}`);
    } catch (error) {
      logger.error(`❌ Failed to configure ${projectName}: ${error.message}`);
    }
  }

  logger.info('');
  logger.info(`✅ Configured ${projectsToProcess.length} project(s)`);
  logger.info('');
  logger.info('💡 Next steps:');
  logger.info('   - Run nx run <project>:version to test the configuration');
  logger.info(
    '   - Use nx g nx-project-release:configure-changelog for changelog settings'
  );
  logger.info('');
}

/**
 * Apply backward compatibility for deprecated options
 * Maps old option names to new ones and logs deprecation warnings
 */
function applyBackwardCompatibility(options: ConfigureVersionSchema): void {
  // versionStrategy → projectsRelationship
  if (options.versionStrategy !== undefined) {
    logger.warn(
      '⚠️  DEPRECATED: "versionStrategy" is deprecated. Use "projectsRelationship" instead.'
    );
    if (options.projectsRelationship === undefined) {
      options.projectsRelationship = options.versionStrategy;
    }
  }

  // bumpDependents → trackDeps
  if (options.bumpDependents !== undefined) {
    logger.warn(
      '⚠️  DEPRECATED: "bumpDependents" is deprecated. Use "trackDeps" instead.'
    );
    if (options.trackDeps === undefined) {
      options.trackDeps = options.bumpDependents;
    }
  }

  // validationStrategy (array) → currentVersionResolver + fallbackCurrentVersionResolver
  if (options.validationStrategy && options.validationStrategy.length > 0) {
    logger.warn(
      '⚠️  DEPRECATED: "validationStrategy" is deprecated. Use "currentVersionResolver" and "fallbackCurrentVersionResolver" instead.'
    );

    // Map old validation strategy to new resolver pattern
    if (options.currentVersionResolver === undefined) {
      // Use first strategy as primary resolver
      const primary = options.validationStrategy[0];
      options.currentVersionResolver = mapValidationStrategyToResolver(primary);
    }

    if (
      options.fallbackCurrentVersionResolver === undefined &&
      options.validationStrategy.length > 1
    ) {
      // Use second strategy as fallback
      const fallback = options.validationStrategy[1];
      options.fallbackCurrentVersionResolver =
        mapValidationStrategyToResolver(fallback);
    }
  }
}

/**
 * Map old validationStrategy values to new resolver values
 */
function mapValidationStrategyToResolver(
  strategy: 'registry' | 'git-tags' | 'disk'
): 'disk' | 'git-tag' | 'registry' {
  const mapping: Record<
    'registry' | 'git-tags' | 'disk',
    'disk' | 'git-tag' | 'registry'
  > = {
    registry: 'registry',
    'git-tags': 'git-tag',
    disk: 'disk',
  };
  return mapping[strategy];
}

async function promptVersionSettings(
  options: ConfigureVersionSchema
): Promise<Partial<ConfigureVersionSchema>> {
  const settings: Partial<ConfigureVersionSchema> = {};

  // Version files
  const { versionFilesInput } = await prompt<{ versionFilesInput: string }>({
    type: 'input',
    name: 'versionFilesInput',
    message: 'Version files (comma-separated):',
    initial: 'package.json',
  });
  settings.versionFiles = versionFilesInput.split(',').map((f) => f.trim());

  // Current version resolver (replaces validationStrategy)
  const { currentVersionResolver } = await prompt<{
    currentVersionResolver: 'disk' | 'git-tag' | 'registry';
  }>({
    type: 'select',
    name: 'currentVersionResolver',
    message: 'How to resolve current version?',
    choices: [
      { name: 'disk', message: 'Disk (read from version files)' },
      { name: 'git-tag', message: 'Git tags (find latest tag)' },
      { name: 'registry', message: 'Registry (query package registry)' },
    ],
    initial: 'disk',
  } as any);
  settings.currentVersionResolver = currentVersionResolver;

  // Fallback resolver
  const { useFallback } = await prompt<{ useFallback: boolean }>({
    type: 'confirm',
    name: 'useFallback',
    message: 'Configure fallback resolver if primary fails?',
    initial: false,
  });

  if (useFallback) {
    const { fallbackCurrentVersionResolver } = await prompt<{
      fallbackCurrentVersionResolver: 'disk' | 'git-tag' | 'registry';
    }>({
      type: 'select',
      name: 'fallbackCurrentVersionResolver',
      message: 'Fallback resolver:',
      choices: [
        { name: 'disk', message: 'Disk (read from version files)' },
        { name: 'git-tag', message: 'Git tags (find latest tag)' },
        { name: 'registry', message: 'Registry (query package registry)' },
      ],
    } as any);
    settings.fallbackCurrentVersionResolver = fallbackCurrentVersionResolver;
  }

  // Track dependencies (replaces bumpDependents)
  const { trackDeps } = await prompt<{ trackDeps: boolean }>({
    type: 'confirm',
    name: 'trackDeps',
    message: 'Track workspace dependencies and auto-version dependent projects?',
    initial: false,
  });
  settings.trackDeps = trackDeps;

  return settings;
}
