import {
  Tree,
  getProjects,
  readProjectConfiguration,
  updateProjectConfiguration,
  logger,
} from '@nx/devkit';
import { ConfigureChangelogSchema } from './schema';
import Enquirer from 'enquirer';

const { prompt } = Enquirer;

export default async function configureChangelogGenerator(
  tree: Tree,
  options: ConfigureChangelogSchema
) {
  logger.info('');
  logger.info('📝 Configure Changelog Settings');
  logger.info('');

  const allProjects = Array.from(getProjects(tree).keys());
  let projectsToProcess: string[] = [];

  // Interactive project selection
  if (options.interactive !== false && !options.projects) {
    const { selectedProjects } = await prompt<{ selectedProjects: string[] }>({
      type: 'multiselect',
      name: 'selectedProjects',
      message: 'Select projects to configure changelog settings:',
      choices: allProjects,
      // @ts-ignore - enquirer types are incomplete
      hint: 'Space to select, Enter to confirm',
    });

    projectsToProcess = selectedProjects;

    if (projectsToProcess.length === 0) {
      logger.warn('⚠️  No projects selected');
      return;
    }

    // Prompt for changelog settings
    const settings = await promptChangelogSettings(options);
    Object.assign(options, settings);
  } else if (options.projects && options.projects.length > 0) {
    projectsToProcess = options.projects;
  } else {
    logger.error('❌ No projects specified');
    logger.info('💡 Run without arguments for interactive mode:');
    logger.info('   nx g nx-project-release:configure-changelog');
    return;
  }

  // Apply settings to each project
  for (const projectName of projectsToProcess) {
    try {
      const projectConfig = readProjectConfiguration(tree, projectName);

      if (!projectConfig.targets) {
        projectConfig.targets = {};
      }

      // Ensure changelog target exists
      if (!projectConfig.targets['changelog']) {
        projectConfig.targets['changelog'] = {
          executor: 'nx-project-release:changelog',
          options: {},
        };
      }

      const changelogOptions = projectConfig.targets['changelog'].options || {};

      // Update changelog file (always provide default)
      if (options.changelogFile) {
        changelogOptions.changelogFile = options.changelogFile;
      } else if (!changelogOptions.changelogFile) {
        changelogOptions.changelogFile = 'CHANGELOG.md';
      }

      // Update preset (always provide default)
      if (options.preset) {
        changelogOptions.preset = options.preset;
      } else if (!changelogOptions.preset) {
        changelogOptions.preset = 'angular';
      }

      // Update infile
      if (options.infile) {
        changelogOptions.infile = options.infile;
      }

      // Update release count (always provide default)
      if (options.releaseCount !== undefined) {
        changelogOptions.releaseCount = options.releaseCount;
      } else if (changelogOptions.releaseCount === undefined) {
        changelogOptions.releaseCount = 0; // 0 means all releases
      }

      // Update skip unstable (always provide default)
      if (options.skipUnstable !== undefined) {
        changelogOptions.skipUnstable = options.skipUnstable;
      } else if (changelogOptions.skipUnstable === undefined) {
        changelogOptions.skipUnstable = false;
      }

      // Update include commit body (always provide default)
      if (options.includeCommitBody !== undefined) {
        changelogOptions.includeCommitBody = options.includeCommitBody;
      } else if (changelogOptions.includeCommitBody === undefined) {
        changelogOptions.includeCommitBody = false;
      }

      projectConfig.targets['changelog'].options = changelogOptions;

      updateProjectConfiguration(tree, projectName, projectConfig);

      logger.info(`✅ Configured changelog settings for: ${projectName}`);
    } catch (error) {
      logger.error(`❌ Failed to configure ${projectName}: ${error.message}`);
    }
  }

  logger.info('');
  logger.info(`✅ Configured ${projectsToProcess.length} project(s)`);
  logger.info('');
  logger.info('💡 Next steps:');
  logger.info('   - Run nx run <project>:changelog to test the configuration');
  logger.info(
    '   - Use nx g nx-project-release:configure-version for version settings'
  );
  logger.info('');
}

async function promptChangelogSettings(
  options: ConfigureChangelogSchema
): Promise<Partial<ConfigureChangelogSchema>> {
  const settings: Partial<ConfigureChangelogSchema> = {};

  // Changelog file
  const { changelogFile } = await prompt<{ changelogFile: string }>({
    type: 'input',
    name: 'changelogFile',
    message: 'Changelog file name:',
    initial: 'CHANGELOG.md',
  });
  settings.changelogFile = changelogFile;

  // Preset
  const { preset } = await prompt<{ preset: string }>({
    type: 'select',
    name: 'preset',
    message: 'Conventional changelog preset:',
    choices: [
      { name: 'angular', message: 'Angular (recommended)' },
      { name: 'conventionalcommits', message: 'Conventional Commits' },
      { name: 'atom', message: 'Atom' },
      { name: 'ember', message: 'Ember' },
      { name: 'jshint', message: 'JSHint' },
    ],
    initial: 0,
  });
  settings.preset = preset as any;

  // Release count
  const { releaseCount } = await prompt<{ releaseCount: number }>({
    type: 'numeral',
    name: 'releaseCount',
    message: 'Number of releases to generate (0 for all):',
    initial: 0,
  });
  settings.releaseCount = releaseCount;

  // Skip unstable
  const { skipUnstable } = await prompt<{ skipUnstable: boolean }>({
    type: 'confirm',
    name: 'skipUnstable',
    message: 'Skip unstable/pre-release versions?',
    initial: false,
  });
  settings.skipUnstable = skipUnstable;

  // Include commit body
  const { includeCommitBody } = await prompt<{ includeCommitBody: boolean }>({
    type: 'confirm',
    name: 'includeCommitBody',
    message: 'Include commit body in changelog?',
    initial: false,
  });
  settings.includeCommitBody = includeCommitBody;

  return settings;
}
