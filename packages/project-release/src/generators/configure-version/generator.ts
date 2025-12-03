import {
  Tree,
  getProjects,
  readProjectConfiguration,
  updateProjectConfiguration,
  logger
} from '@nx/devkit';
import { ConfigureVersionSchema } from './schema';
import Enquirer from 'enquirer';

const { prompt } = Enquirer;

export default async function configureVersionGenerator(tree: Tree, options: ConfigureVersionSchema) {
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
      // @ts-ignore - enquirer types are incomplete
      hint: 'Space to select, Enter to confirm'
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
          options: {}
        };
      }

      const versionOptions = projectConfig.targets['version'].options || {};

      // Update version files (always provide default)
      if (options.versionFiles && options.versionFiles.length > 0) {
        versionOptions.versionFiles = options.versionFiles;
      } else if (!versionOptions.versionFiles) {
        versionOptions.versionFiles = ['package.json'];
      }

      // Update tag naming
      if (options.tagNamingFormat || options.tagNamingPrefix || options.tagNamingSuffix || options.includeProjectName !== undefined) {
        versionOptions.tagNaming = versionOptions.tagNaming || {};

        if (options.tagNamingFormat) {
          versionOptions.tagNaming.format = options.tagNamingFormat;
        }
        if (options.tagNamingPrefix !== undefined) {
          versionOptions.tagNaming.prefix = options.tagNamingPrefix;
        }
        if (options.tagNamingSuffix !== undefined) {
          versionOptions.tagNaming.suffix = options.tagNamingSuffix;
        }
        if (options.includeProjectName !== undefined) {
          versionOptions.tagNaming.includeProjectName = options.includeProjectName;
        }
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
  logger.info('   - Use nx g nx-project-release:configure-changelog for changelog settings');
  logger.info('');
}

async function promptVersionSettings(options: ConfigureVersionSchema): Promise<Partial<ConfigureVersionSchema>> {
  const settings: Partial<ConfigureVersionSchema> = {};

  // Version files
  const { versionFilesInput } = await prompt<{ versionFilesInput: string }>({
    type: 'input',
    name: 'versionFilesInput',
    message: 'Version files (comma-separated):',
    initial: 'package.json'
  });
  settings.versionFiles = versionFilesInput.split(',').map(f => f.trim());

  // Tag naming format
  const { useCustomTagNaming } = await prompt<{ useCustomTagNaming: boolean }>({
    type: 'confirm',
    name: 'useCustomTagNaming',
    message: 'Configure custom tag naming?',
    initial: false
  });

  if (useCustomTagNaming) {
    const tagSettings = await prompt<{
      tagNamingFormat?: string;
      tagNamingPrefix?: string;
      includeProjectName?: boolean;
    }>([
      {
        type: 'select',
        name: 'tagNamingFormat',
        message: 'Tag naming format:',
        choices: [
          { name: 'v{version}', message: 'v{version} (e.g., v1.0.0)' },
          { name: '{projectName}@{version}', message: '{projectName}@{version} (e.g., my-app@1.0.0)' },
          { name: '{projectName}-v{version}', message: '{projectName}-v{version} (e.g., my-app-v1.0.0)' },
          { name: 'custom', message: 'Custom format' }
        ]
      },
      {
        type: 'input',
        name: 'tagNamingPrefix',
        message: 'Tag prefix (optional):',
        initial: ''
      },
      {
        type: 'confirm',
        name: 'includeProjectName',
        message: 'Include project name in tag?',
        initial: false
      }
    ]);

    if (tagSettings.tagNamingFormat === 'custom') {
      const { customFormat } = await prompt<{ customFormat: string }>({
        type: 'input',
        name: 'customFormat',
        message: 'Custom tag format (use {version}, {projectName}):',
        initial: 'v{version}'
      });
      settings.tagNamingFormat = customFormat;
    } else {
      settings.tagNamingFormat = tagSettings.tagNamingFormat;
    }

    if (tagSettings.tagNamingPrefix) {
      settings.tagNamingPrefix = tagSettings.tagNamingPrefix;
    }
    if (tagSettings.includeProjectName !== undefined) {
      settings.includeProjectName = tagSettings.includeProjectName;
    }
  }

  // Bump dependents
  const { bumpDependents } = await prompt<{ bumpDependents: boolean }>({
    type: 'confirm',
    name: 'bumpDependents',
    message: 'Automatically bump dependent projects?',
    initial: false
  });
  settings.bumpDependents = bumpDependents;

  return settings;
}
