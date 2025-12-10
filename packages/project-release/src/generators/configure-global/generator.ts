import { Tree, readNxJson, updateNxJson, logger } from '@nx/devkit';
import { ConfigureGlobalSchema } from './schema';
import Enquirer from 'enquirer';

const { prompt } = Enquirer;

export default async function configureGlobalGenerator(
  tree: Tree,
  options: ConfigureGlobalSchema
) {
  logger.info('');
  logger.info('🌍 Configure Global Settings');
  logger.info('');

  const nxJson = readNxJson(tree);
  if (!nxJson) {
    throw new Error('Could not read nx.json');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nxJsonAny = nxJson as any;

  if (!nxJsonAny.projectRelease) {
    nxJsonAny.projectRelease = {};
  }

  // Interactive prompts
  if (options.interactive !== false && !hasAnyOption(options)) {
    const settings = await promptGlobalSettings();
    Object.assign(options, settings);
  }

  // Apply global settings
  let changesCount = 0;

  if (options.projectsRelationship) {
    nxJsonAny.projectRelease.projectsRelationship =
      options.projectsRelationship;
    logger.info(`✅ Set projectsRelationship: ${options.projectsRelationship}`);
    changesCount++;
  }

  if (options.versionFiles && options.versionFiles.length > 0) {
    nxJsonAny.projectRelease.versionFiles = options.versionFiles;
    logger.info(`✅ Set versionFiles: ${options.versionFiles.join(', ')}`);
    changesCount++;
  }

  // Tag naming configuration
  if (
    options.tagNamingFormat ||
    options.tagNamingPrefix ||
    options.tagNamingSuffix ||
    options.includeProjectName !== undefined
  ) {
    if (!nxJsonAny.projectRelease.tagNaming) {
      nxJsonAny.projectRelease.tagNaming = {};
    }

    if (options.tagNamingFormat) {
      nxJsonAny.projectRelease.tagNaming.format = options.tagNamingFormat;
      logger.info(`✅ Set tag format: ${options.tagNamingFormat}`);
      changesCount++;
    }

    if (options.tagNamingPrefix !== undefined) {
      nxJsonAny.projectRelease.tagNaming.prefix = options.tagNamingPrefix;
      logger.info(`✅ Set tag prefix: ${options.tagNamingPrefix}`);
      changesCount++;
    }

    if (options.tagNamingSuffix !== undefined) {
      nxJsonAny.projectRelease.tagNaming.suffix = options.tagNamingSuffix;
      logger.info(`✅ Set tag suffix: ${options.tagNamingSuffix}`);
      changesCount++;
    }

    if (options.includeProjectName !== undefined) {
      nxJsonAny.projectRelease.tagNaming.includeProjectName =
        options.includeProjectName;
      logger.info(`✅ Set includeProjectName: ${options.includeProjectName}`);
      changesCount++;
    }
  }

  // Changelog preset
  if (options.changelogPreset) {
    nxJsonAny.projectRelease.changelogPreset = options.changelogPreset;
    logger.info(`✅ Set changelogPreset: ${options.changelogPreset}`);
    changesCount++;
  }

  updateNxJson(tree, nxJson);

  logger.info('');
  if (changesCount === 0) {
    logger.warn('⚠️  No changes made');
    logger.info('💡 Run in interactive mode:');
    logger.info('   nx g nx-project-release:configure-global');
  } else {
    logger.info(`✅ Applied ${changesCount} global setting(s) to nx.json`);
    logger.info('');
    logger.info('💡 Next steps:');
    logger.info('   - These settings apply to all projects as defaults');
    logger.info('   - Project-specific settings override global settings');
    logger.info(
      '   - Use nx g nx-project-release:validate to view configuration'
    );
    logger.info('');
    logger.info('💡 To configure registries, use:');
    logger.info('   nx g nx-project-release:configure-publish');
  }
  logger.info('');
}

function hasAnyOption(options: ConfigureGlobalSchema): boolean {
  return !!(
    options.projectsRelationship ||
    options.versionFiles ||
    options.tagNamingFormat ||
    options.tagNamingPrefix ||
    options.tagNamingSuffix ||
    options.includeProjectName !== undefined ||
    options.changelogPreset
  );
}

async function promptGlobalSettings(): Promise<ConfigureGlobalSchema> {
  const settings: ConfigureGlobalSchema = {};

  // Projects relationship
  const { projectsRelationship } = await prompt<{
    projectsRelationship: 'independent' | 'fixed';
  }>({
    type: 'select',
    name: 'projectsRelationship',
    message: 'Default versioning strategy:',
    choices: [
      {
        name: 'independent',
        message: 'Independent - Each project has its own version',
      },
      { name: 'fixed', message: 'Fixed - All projects share the same version' },
    ],
    initial: 0,
  });
  settings.projectsRelationship = projectsRelationship;

  // Version files
  const { versionFilesInput } = await prompt<{ versionFilesInput: string }>({
    type: 'input',
    name: 'versionFilesInput',
    message: 'Default version files (comma-separated):',
    initial: 'package.json',
  });
  settings.versionFiles = versionFilesInput.split(',').map((f) => f.trim());

  // Tag naming
  const { configureTagNaming } = await prompt<{ configureTagNaming: boolean }>({
    type: 'confirm',
    name: 'configureTagNaming',
    message: 'Configure tag naming?',
    initial: true,
  });

  if (configureTagNaming) {
    const tagSettings = await prompt<{
      tagNamingFormat: string;
      includeProjectName: boolean;
    }>([
      {
        type: 'select',
        name: 'tagNamingFormat',
        message: 'Tag naming format:',
        choices: [
          { name: 'v{version}', message: 'v{version} (monolithic style)' },
          {
            name: '{projectName}@{version}',
            message: '{projectName}@{version} (npm style)',
          },
          {
            name: '{projectName}-v{version}',
            message: '{projectName}-v{version} (prefixed)',
          },
        ],
        initial: 0,
      },
      {
        type: 'confirm',
        name: 'includeProjectName',
        message: 'Include project name in tag?',
        initial: false,
      },
    ]);

    settings.tagNamingFormat = tagSettings.tagNamingFormat;
    settings.includeProjectName = tagSettings.includeProjectName;
  }

  // Changelog preset
  const { changelogPreset } = await prompt<{ changelogPreset: string }>({
    type: 'select',
    name: 'changelogPreset',
    message: 'Changelog preset:',
    choices: [
      { name: 'angular', message: 'Angular (recommended)' },
      { name: 'conventionalcommits', message: 'Conventional Commits' },
    ],
    initial: 0,
  });
  settings.changelogPreset = changelogPreset as any;

  return settings;
}
