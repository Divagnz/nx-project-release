import {
  Tree,
  readNxJson,
  updateNxJson,
  getProjects,
  logger,
} from '@nx/devkit';
import { ConfigureReleaseGroupsSchema } from './schema';
import Enquirer from 'enquirer';
import { minimatch } from 'minimatch';

const { prompt } = Enquirer;

export default async function configureReleaseGroupsGenerator(
  tree: Tree,
  options: ConfigureReleaseGroupsSchema
) {
  logger.info('');
  logger.info('📦 Configure Release Groups');
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

  if (!nxJsonAny.projectRelease.releaseGroups) {
    nxJsonAny.projectRelease.releaseGroups = {};
  }

  const releaseGroups = nxJsonAny.projectRelease.releaseGroups;

  // Interactive mode - choose action
  if (options.interactive !== false && !options.action) {
    const { action } = await prompt<{
      action: 'create' | 'update' | 'delete' | 'list';
    }>({
      type: 'select',
      name: 'action',
      message: 'What do you want to do?',
      choices: [
        { name: 'create', message: 'Create new release group' },
        { name: 'update', message: 'Update existing release group' },
        { name: 'list', message: 'List all release groups' },
        { name: 'delete', message: 'Delete release group' },
      ],
    });
    options.action = action;
  }

  // List action
  if (options.action === 'list') {
    listReleaseGroups(releaseGroups);
    return;
  }

  // Delete action
  if (options.action === 'delete') {
    const groupNames = Object.keys(releaseGroups);
    if (groupNames.length === 0) {
      logger.warn('⚠️  No release groups found');
      return;
    }

    const { groupToDelete } = await prompt<{ groupToDelete: string }>({
      type: 'select',
      name: 'groupToDelete',
      message: 'Select release group to delete:',
      choices: groupNames,
    });

    const { confirm } = await prompt<{ confirm: boolean }>({
      type: 'confirm',
      name: 'confirm',
      message: `Delete release group '${groupToDelete}'?`,
      initial: false,
    });

    if (confirm) {
      delete releaseGroups[groupToDelete];
      updateNxJson(tree, nxJson);
      logger.info(`✅ Deleted release group: ${groupToDelete}`);
    } else {
      logger.info('ℹ️  Cancelled');
    }
    return;
  }

  // Create or Update actions
  let groupName = options.groupName;

  if (!groupName && options.interactive !== false) {
    if (options.action === 'update') {
      const groupNames = Object.keys(releaseGroups);
      if (groupNames.length === 0) {
        logger.warn('⚠️  No release groups found');
        return;
      }

      const response = await prompt<{ groupName: string }>({
        type: 'select',
        name: 'groupName',
        message: 'Select release group to update:',
        choices: groupNames,
      });
      groupName = response.groupName;
    } else {
      const response = await prompt<{ groupName: string }>({
        type: 'input',
        name: 'groupName',
        message: 'Release group name:',
        validate: (value: string) => {
          if (!value) return 'Group name is required';
          if (releaseGroups[value] && options.action === 'create') {
            return `Release group '${value}' already exists. Use 'update' action to modify it.`;
          }
          return true;
        },
      });
      groupName = response.groupName;
    }
  }

  if (!groupName) {
    logger.error('❌ Group name is required');
    return;
  }

  // Get existing group config if updating
  const existingGroup = releaseGroups[groupName] || {};

  // Interactive prompts for group configuration
  if (options.interactive !== false && !hasAnyOption(options)) {
    const config = await promptGroupConfiguration(existingGroup, tree);
    Object.assign(options, config);
  }

  // Build group configuration
  const groupConfig: any = {
    ...existingGroup,
  };

  if (options.registryType) {
    // Validate that this registry type exists in configure-publish
    const configuredRegistries = nxJsonAny.projectRelease?.registries || {};
    if (!configuredRegistries[options.registryType]) {
      logger.warn(
        `⚠️  Registry type '${options.registryType}' not configured in workspace`
      );
      logger.info('💡 Configure registries first with:');
      logger.info('   nx g nx-project-release:configure-publish');
      logger.info('');
      const { continueAnyway } = await prompt<{ continueAnyway: boolean }>({
        type: 'confirm',
        name: 'continueAnyway',
        message: 'Continue anyway?',
        initial: false,
      });
      if (!continueAnyway) {
        return;
      }
    }
    groupConfig.registryType = options.registryType;
  }

  if (options.versionStrategy) {
    groupConfig.versionStrategy = options.versionStrategy;
  }

  if (options.versionFiles && options.versionFiles.length > 0) {
    groupConfig.versionFiles = options.versionFiles;
  } else if (!groupConfig.versionFiles) {
    groupConfig.versionFiles = ['package.json'];
  }

  if (options.pathStrategy) {
    groupConfig.pathStrategy = options.pathStrategy;
  }

  if (options.tagNamingFormat) {
    groupConfig.tagNaming = {
      format: options.tagNamingFormat,
    };
  }

  // Handle projects
  if (options.projects && options.projects.length > 0) {
    groupConfig.projects = [
      ...new Set([...(groupConfig.projects || []), ...options.projects]),
    ];
  } else if (!groupConfig.projects) {
    groupConfig.projects = [];
  }

  // Handle project patterns
  if (options.projectPatterns && options.projectPatterns.length > 0) {
    groupConfig.projectPatterns = options.projectPatterns;

    // Expand patterns to actual projects
    const allProjects = Array.from(getProjects(tree).keys());

    // Get excluded projects list
    const excludedProjects = nxJsonAny.projectRelease?.excludedProjects || [];

    const matchedProjects: string[] = [];

    for (const pattern of options.projectPatterns) {
      const matches = allProjects.filter((p) => {
        // Check if project matches pattern
        const matchesPattern = minimatch(p, pattern);
        // Exclude if in excludedProjects list
        const isExcluded = excludedProjects.includes(p);
        return matchesPattern && !isExcluded;
      });
      matchedProjects.push(...matches);
    }

    if (matchedProjects.length > 0) {
      groupConfig.projects = [
        ...new Set([...groupConfig.projects, ...matchedProjects]),
      ];
      logger.info(
        `   📝 Matched ${matchedProjects.length} projects from patterns (excluding ${excludedProjects.length} excluded projects)`
      );
    }
  }

  // Update nx.json
  releaseGroups[groupName] = groupConfig;
  updateNxJson(tree, nxJson);

  logger.info('');
  logger.info(
    `✅ ${
      options.action === 'update' ? 'Updated' : 'Created'
    } release group: ${groupName}`
  );
  logger.info(`   Registry Type: ${groupConfig.registryType || 'not set'}`);
  logger.info(
    `   Version Strategy: ${groupConfig.versionStrategy || 'independent'}`
  );
  logger.info(`   Projects: ${groupConfig.projects?.length || 0}`);
  if (groupConfig.projectPatterns && groupConfig.projectPatterns.length > 0) {
    logger.info(`   Patterns: ${groupConfig.projectPatterns.join(', ')}`);
  }
  logger.info('');
  logger.info('💡 Next steps:');
  logger.info(
    '   - Use nx g nx-project-release:configure-release-groups to manage more groups'
  );
  logger.info('   - Run nx run <project>:validate to verify configuration');
  logger.info('');
}

function hasAnyOption(options: ConfigureReleaseGroupsSchema): boolean {
  return !!(
    options.registryType ||
    options.versionStrategy ||
    options.versionFiles ||
    options.projects ||
    options.projectPatterns ||
    options.tagNamingFormat ||
    options.pathStrategy
  );
}

async function promptGroupConfiguration(
  existingGroup: any,
  tree: Tree
): Promise<Partial<ConfigureReleaseGroupsSchema>> {
  const config: Partial<ConfigureReleaseGroupsSchema> = {};

  // Get configured registries from nx.json
  const nxJson = readNxJson(tree);
  const nxJsonAny = nxJson as any;
  const configuredRegistries = nxJsonAny?.projectRelease?.registries || {};
  const availableTypes = Object.keys(configuredRegistries);

  // Show available registries
  if (availableTypes.length > 0) {
    logger.info('');
    logger.info(
      `✅ Available configured registries: ${availableTypes.join(', ')}`
    );
    logger.info('');
  } else {
    logger.warn('⚠️  No registries configured yet');
    logger.info('💡 Run: nx g nx-project-release:configure-publish');
    logger.info('');
  }

  // Registry type
  const { registryType } = await prompt<{ registryType: string }>({
    type: 'select',
    name: 'registryType',
    message: 'Registry type:',
    choices: [
      { name: 'npm', message: 'NPM Registry' },
      { name: 'docker', message: 'Docker Registry' },
      { name: 'nexus', message: 'Nexus/Sonatype' },
      { name: 's3', message: 'AWS S3' },
      { name: 'github', message: 'GitHub Packages' },
      { name: 'none', message: 'No publishing (version only)' },
    ],
    initial: existingGroup.registryType || 'npm',
  });
  config.registryType = registryType as any;

  // Version strategy
  const { versionStrategy } = await prompt<{ versionStrategy: string }>({
    type: 'select',
    name: 'versionStrategy',
    message: 'Versioning strategy:',
    choices: [
      {
        name: 'independent',
        message: 'Independent - Each project has its own version',
      },
      { name: 'fixed', message: 'Fixed - All projects share the same version' },
    ],
    initial: existingGroup.versionStrategy === 'fixed' ? 1 : 0,
  });
  config.versionStrategy = versionStrategy as any;

  // Version files
  const { versionFilesInput } = await prompt<{ versionFilesInput: string }>({
    type: 'input',
    name: 'versionFilesInput',
    message: 'Version files (comma-separated):',
    initial: existingGroup.versionFiles?.join(', ') || 'package.json',
  });
  config.versionFiles = versionFilesInput.split(',').map((f) => f.trim());

  // Projects selection method
  const { selectionMethod } = await prompt<{ selectionMethod: string }>({
    type: 'select',
    name: 'selectionMethod',
    message: 'How to select projects?',
    choices: [
      {
        name: 'patterns',
        message: 'Use patterns (recommended - e.g., *-lib, app-*)',
      },
      { name: 'none', message: 'Skip project selection (configure later)' },
    ],
  });

  if (selectionMethod === 'patterns') {
    const { patternsInput } = await prompt<{ patternsInput: string }>({
      type: 'input',
      name: 'patternsInput',
      message: 'Project patterns (comma-separated, e.g., *-lib, app-*):',
      initial: existingGroup.projectPatterns?.join(', ') || '',
      validate: (value: string) =>
        value ? true : 'At least one pattern is required',
    });
    config.projectPatterns = patternsInput
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  }

  // Tag naming
  const { configureTagNaming } = await prompt<{ configureTagNaming: boolean }>({
    type: 'confirm',
    name: 'configureTagNaming',
    message: 'Configure custom tag naming?',
    initial: !!existingGroup.tagNaming,
  });

  if (configureTagNaming) {
    const { tagNamingFormat } = await prompt<{ tagNamingFormat: string }>({
      type: 'select',
      name: 'tagNamingFormat',
      message: 'Tag naming format:',
      choices: [
        {
          name: '{releaseGroupName}-v{version}',
          message: '{releaseGroupName}-v{version}',
        },
        { name: '{projectName}@{version}', message: '{projectName}@{version}' },
        { name: 'v{version}', message: 'v{version}' },
      ],
      initial:
        existingGroup.tagNaming?.format || '{releaseGroupName}-v{version}',
    });
    config.tagNamingFormat = tagNamingFormat;
  }

  return config;
}

function listReleaseGroups(releaseGroups: any) {
  const groupNames = Object.keys(releaseGroups);

  if (groupNames.length === 0) {
    logger.info('ℹ️  No release groups configured');
    logger.info('');
    logger.info('💡 Create a release group:');
    logger.info('   nx g nx-project-release:configure-release-groups');
    return;
  }

  logger.info(`📋 Release Groups (${groupNames.length}):`);
  logger.info('');

  for (const groupName of groupNames) {
    const group = releaseGroups[groupName];
    logger.info(`  ${groupName}`);
    logger.info(`    Registry: ${group.registryType || 'not set'}`);
    logger.info(
      `    (Registry details configured in: nx g nx-project-release:configure-publish)`
    );
    logger.info(`    Strategy: ${group.versionStrategy || 'independent'}`);
    logger.info(`    Projects: ${group.projects?.length || 0}`);
    if (group.projectPatterns && group.projectPatterns.length > 0) {
      logger.info(`    Patterns: ${group.projectPatterns.join(', ')}`);
    }
    logger.info('');
  }
}
