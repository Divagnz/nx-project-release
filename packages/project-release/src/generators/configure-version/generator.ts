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

      // Update validation strategy
      if (options.validationStrategy && options.validationStrategy.length > 0) {
        versionOptions.validationStrategy = options.validationStrategy;
      } else if (!versionOptions.validationStrategy) {
        // Default to all strategies in precedence order
        versionOptions.validationStrategy = ['registry', 'git-tags', 'disk'];
      }

      // Update bump dependents
      if (options.bumpDependents !== undefined) {
        versionOptions.bumpDependents = options.bumpDependents;
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

  // Validation strategy
  const { validationStrategy } = await prompt<{ validationStrategy: string[] }>(
    {
      type: 'multiselect',
      name: 'validationStrategy',
      message: 'Which validation strategies to use? (checked in order: registry → git-tags → disk)',
      choices: [
        {
          name: 'registry',
          message: 'Registry (check npm/docker/etc - highest precedence)',
        },
        { name: 'git-tags', message: 'Git tags (check git history)' },
        {
          name: 'disk',
          message: 'Disk (check package.json/project.json - lowest precedence)',
        },
      ],
      initial: ['registry', 'git-tags', 'disk'],
      hint: 'Space to select, Enter to confirm',
    } as any
  );
  settings.validationStrategy = validationStrategy as Array<
    'registry' | 'git-tags' | 'disk'
  >;

  // Bump dependents
  const { bumpDependents } = await prompt<{ bumpDependents: boolean }>({
    type: 'confirm',
    name: 'bumpDependents',
    message: 'Automatically bump dependent projects?',
    initial: false,
  });
  settings.bumpDependents = bumpDependents;

  return settings;
}
