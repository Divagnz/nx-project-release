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
      // @ts-expect-error - enquirer types are incomplete
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

      // Update dry run
      if (options.dryRun !== undefined) {
        changelogOptions.dryRun = options.dryRun;
      }

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

      // Update from
      if (options.from) {
        changelogOptions.from = options.from;
      }

      // Update to
      if (options.to) {
        changelogOptions.to = options.to;
      }

      // Update release count (default changed to 1 to match executor)
      if (options.releaseCount !== undefined) {
        changelogOptions.releaseCount = options.releaseCount;
      } else if (changelogOptions.releaseCount === undefined) {
        changelogOptions.releaseCount = 1;
      }

      // Update skip unstable (default changed to true to match executor)
      if (options.skipUnstable !== undefined) {
        changelogOptions.skipUnstable = options.skipUnstable;
      } else if (changelogOptions.skipUnstable === undefined) {
        changelogOptions.skipUnstable = true;
      }

      // Update append
      if (options.append !== undefined) {
        changelogOptions.append = options.append;
      }

      // Update context
      if (options.context) {
        changelogOptions.context = options.context;
      }

      // Update workspace changelog
      if (options.workspaceChangelog !== undefined) {
        changelogOptions.workspaceChangelog = options.workspaceChangelog;
      }

      // Update project changelogs
      if (options.projectChangelogs !== undefined) {
        changelogOptions.projectChangelogs = options.projectChangelogs;
      }

      // Update infile (generator-specific)
      if (options.infile) {
        changelogOptions.infile = options.infile;
      }

      // Update include commit body (generator-specific)
      if (options.includeCommitBody !== undefined) {
        changelogOptions.includeCommitBody = options.includeCommitBody;
      }

      // Update interactive
      if (options.interactive !== undefined) {
        changelogOptions.interactive = options.interactive;
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
      { name: 'codemirror', message: 'CodeMirror' },
      { name: 'ember', message: 'Ember' },
      { name: 'eslint', message: 'ESLint' },
      { name: 'express', message: 'Express' },
      { name: 'jquery', message: 'jQuery' },
      { name: 'jshint', message: 'JSHint' },
    ],
    initial: 0,
  });
  settings.preset = preset as any;

  // Release count (default changed to 1 to match executor)
  const { releaseCount } = await prompt<{ releaseCount: number }>({
    type: 'numeral',
    name: 'releaseCount',
    message: 'Number of releases to include:',
    initial: 1,
  });
  settings.releaseCount = releaseCount;

  // Skip unstable (default changed to true to match executor)
  const { skipUnstable } = await prompt<{ skipUnstable: boolean }>({
    type: 'confirm',
    name: 'skipUnstable',
    message: 'Skip unstable/prerelease versions?',
    initial: true,
  });
  settings.skipUnstable = skipUnstable;

  // Append to existing changelog
  const { append } = await prompt<{ append: boolean }>({
    type: 'confirm',
    name: 'append',
    message: 'Append to existing changelog instead of replacing?',
    initial: true,
  });
  settings.append = append;

  // Workspace changelog
  const { workspaceChangelog } = await prompt<{ workspaceChangelog: boolean }>({
    type: 'confirm',
    name: 'workspaceChangelog',
    message: 'Generate workspace-level CHANGELOG.md at root?',
    initial: false,
  });
  settings.workspaceChangelog = workspaceChangelog;

  // Project changelogs (conditional)
  if (workspaceChangelog) {
    const { projectChangelogs } = await prompt<{ projectChangelogs: boolean }>({
      type: 'confirm',
      name: 'projectChangelogs',
      message: 'Also generate individual project changelogs?',
      initial: false,
    });
    settings.projectChangelogs = projectChangelogs;
  }

  // Version range (optional)
  const { configureVersionRange } = await prompt<{
    configureVersionRange: boolean;
  }>({
    type: 'confirm',
    name: 'configureVersionRange',
    message: 'Configure version range (from/to tags)?',
    initial: false,
  });

  if (configureVersionRange) {
    const { from } = await prompt<{ from: string }>({
      type: 'input',
      name: 'from',
      message: 'Generate changelog from this version/tag (optional):',
    });
    if (from) {
      settings.from = from;
    }

    const { to } = await prompt<{ to: string }>({
      type: 'input',
      name: 'to',
      message: 'Generate changelog to this version/tag (optional):',
    });
    if (to) {
      settings.to = to;
    }
  }

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
