import {
  Tree,
  readProjectConfiguration,
  updateProjectConfiguration,
  readNxJson,
  updateNxJson,
  logger,
  addDependenciesToPackageJson,
  getProjects,
} from '@nx/devkit';
import { ConfigureReleaseSchema } from './schema';
import * as path from 'path';
import Enquirer from 'enquirer';

const { prompt } = Enquirer;

export default async function configureReleaseGenerator(
  tree: Tree,
  options: ConfigureReleaseSchema
) {
  // Handle project selection - support both single project and multiple projects
  let selectedProjects: string[] = [];

  if (options.projects && options.projects.length > 0) {
    selectedProjects = options.projects;
  } else if (options.project) {
    selectedProjects = [options.project];
  } else {
    // Interactive multi-select for projects
    const allProjects = Array.from(getProjects(tree).keys());

    const { projects } = await prompt<{ projects: string[] }>({
      type: 'multiselect',
      name: 'projects',
      message: 'Select projects to configure for release:',
      choices: allProjects,
      // limit: 15
    });

    selectedProjects = projects;
  }

  if (selectedProjects.length === 0) {
    logger.error('❌ No projects selected');
    return;
  }

  // Validate all projects exist
  for (const projectName of selectedProjects) {
    try {
      readProjectConfiguration(tree, projectName);
    } catch (error) {
      logger.error(`❌ Project '${projectName}' not found`);
      throw error;
    }
  }

  logger.info('');
  logger.info(
    `⚙️  Configuring release for ${
      selectedProjects.length
    } project(s): ${selectedProjects.join(', ')}`
  );
  logger.info('');

  // Check for existing release groups and prompt if not provided via options
  // Pass the first project for checking current group
  await promptForReleaseGroupIfNeeded(tree, options, selectedProjects);

  // Process each project
  for (const projectName of selectedProjects) {
    const projectConfig = readProjectConfiguration(tree, projectName);

    // Add release targets to project
    addReleaseTargets(tree, options, projectConfig, projectName);

    // Initialize version file if it doesn't exist
    initializeVersionFile(tree, options, projectConfig);
  }

  // Add to release group if requested
  if (options.addToReleaseGroup || options.createNewGroup) {
    addToReleaseGroupMultiple(tree, options, selectedProjects);
  }

  logger.info('');
  logger.info('✅ Release configuration complete!');
  logger.info('');
  logger.info('📝 Next steps:');
  logger.info(
    `   nx run ${options.project}:version --releaseAs=minor --dryRun`
  );
  logger.info(`   nx run ${options.project}:changelog --dryRun`);
  logger.info(`   nx run ${options.project}:publish --dryRun`);
  logger.info('');

  return () => {
    if (!options.skipInstall) {
      logger.info('📦 Installing dependencies...');
    }
  };
}

async function promptForReleaseGroupIfNeeded(
  tree: Tree,
  options: ConfigureReleaseSchema,
  selectedProjects: string[]
): Promise<void> {
  // If release group options are already provided, skip prompting
  if (
    options.releaseGroupName ||
    options.addToReleaseGroup !== undefined ||
    options.createNewGroup !== undefined
  ) {
    return;
  }

  const nxJson = readNxJson(tree);
  if (!nxJson) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nxJsonAny = nxJson as any;
  const existingGroups = nxJsonAny.projectRelease?.releaseGroups || {};
  const groupNames = Object.keys(existingGroups);

  // Find which groups the selected projects are currently in
  const projectGroupMap = new Map<string, string>();
  for (const projectName of selectedProjects) {
    for (const groupName of groupNames) {
      const group = existingGroups[groupName];
      if (
        group.projects &&
        Array.isArray(group.projects) &&
        group.projects.includes(projectName)
      ) {
        projectGroupMap.set(projectName, groupName);
        break;
      }
    }
  }

  logger.info('');

  if (projectGroupMap.size > 0) {
    logger.info(`ℹ️  Current release groups for selected projects:`);
    for (const [projectName, groupName] of projectGroupMap) {
      logger.info(`   • ${projectName} → '${groupName}'`);
    }
    const ungrouped = selectedProjects.filter((p) => !projectGroupMap.has(p));
    if (ungrouped.length > 0) {
      logger.info(`   • ${ungrouped.join(', ')} → (no group)`);
    }
    logger.info('');
  }

  if (groupNames.length > 0) {
    logger.info(`📦 Found ${groupNames.length} existing release group(s):`);
    for (const groupName of groupNames) {
      const group = existingGroups[groupName];
      logger.info(
        `   • ${groupName} (${group.registryType || 'unknown'} - ${
          group.projects?.length || 0
        } projects)`
      );
    }
    logger.info('');

    const { action } = await prompt<{ action: string }>({
      type: 'select',
      name: 'action',
      message: 'How do you want to configure this project?',
      choices: [
        { name: 'existing', message: 'Add to an existing release group' },
        { name: 'new', message: 'Create a new release group' },
        {
          name: 'standalone',
          message: 'Configure as standalone (no release group)',
        },
      ],
    });

    if (action === 'existing') {
      // Show list of existing groups
      const choices = groupNames.map((name) => {
        const group = existingGroups[name];
        return {
          name,
          message: `${name} (${group.registryType || 'unknown'} - ${
            group.projects?.length || 0
          } projects)`,
        };
      });

      const { selectedGroup } = await prompt<{ selectedGroup: string }>({
        type: 'select',
        name: 'selectedGroup',
        message: 'Select a release group:',
        choices,
      });

      options.addToReleaseGroup = true;
      options.releaseGroupName = selectedGroup;

      // Inherit settings from the selected group
      const selectedGroupConfig = existingGroups[selectedGroup];
      if (selectedGroupConfig.registryType) {
        options.registryType = selectedGroupConfig.registryType;
      }
      if (selectedGroupConfig.registryUrl) {
        options.registryUrl = selectedGroupConfig.registryUrl;
      }
      if (selectedGroupConfig.versionFiles) {
        options.versionFiles = selectedGroupConfig.versionFiles;
      }

      logger.info('');
      logger.info(
        `✅ Will add selected projects to release group '${selectedGroup}'`
      );
    } else if (action === 'new') {
      options.createNewGroup = true;

      // Prompt for new group name if not provided
      if (!options.releaseGroupName) {
        const { groupName } = await prompt<{ groupName: string }>({
          type: 'input',
          name: 'groupName',
          message: 'Enter a name for the new release group:',
          initial: `${options.registryType || 'my'}-group`,
        });
        options.releaseGroupName = groupName;
      }

      logger.info('');
      logger.info(
        `✅ Will create new release group '${options.releaseGroupName}'`
      );
    } else {
      // Standalone - prompt for registry settings if not provided
      options.addToReleaseGroup = false;
      options.createNewGroup = false;

      // Prompt for registryType if not provided
      if (!options.registryType) {
        const { registryType } = await prompt<{ registryType: string }>({
          type: 'select',
          name: 'registryType',
          message: 'Which registry type?',
          choices: [
            { name: 'npm', message: 'NPM (npmjs.org or private)' },
            { name: 'docker', message: 'Docker (container registry)' },
            { name: 'nexus', message: 'Nexus (Sonatype)' },
            { name: 's3', message: 'AWS S3' },
            { name: 'github', message: 'GitHub Releases' },
            { name: 'custom', message: 'Custom registry' },
            { name: 'none', message: 'No publishing (version & tag only)' },
          ],
        });
        options.registryType = registryType as any;
      }

      // Prompt for registryUrl if registry type requires it
      if (!options.registryUrl && options.registryType !== 'none') {
        const defaultUrl = getDefaultRegistry(options.registryType);
        const { registryUrl } = await prompt<{ registryUrl: string }>({
          type: 'input',
          name: 'registryUrl',
          message: `Registry URL?`,
          initial: defaultUrl,
        });
        options.registryUrl = registryUrl || defaultUrl;
      }

      logger.info('');
      logger.info(`✅ Will configure as standalone project`);
    }
  } else {
    logger.info('ℹ️  No existing release groups found');
    logger.info('');

    const { createGroup } = await prompt<{ createGroup: boolean }>({
      type: 'confirm',
      name: 'createGroup',
      message: 'Create a new release group for this project?',
      initial: false,
    });

    if (createGroup) {
      options.createNewGroup = true;

      // Prompt for new group name if not provided
      if (!options.releaseGroupName) {
        const { groupName } = await prompt<{ groupName: string }>({
          type: 'input',
          name: 'groupName',
          message: 'Enter a name for the new release group:',
          initial: `${options.registryType || 'my'}-group`,
        });
        options.releaseGroupName = groupName;
      }
    } else {
      // Standalone - prompt for registry settings if not provided
      options.addToReleaseGroup = false;
      options.createNewGroup = false;

      // Prompt for registryType if not provided
      if (!options.registryType) {
        const { registryType } = await prompt<{ registryType: string }>({
          type: 'select',
          name: 'registryType',
          message: 'Which registry type?',
          choices: [
            { name: 'npm', message: 'NPM (npmjs.org or private)' },
            { name: 'docker', message: 'Docker (container registry)' },
            { name: 'nexus', message: 'Nexus (Sonatype)' },
            { name: 's3', message: 'AWS S3' },
            { name: 'github', message: 'GitHub Releases' },
            { name: 'custom', message: 'Custom registry' },
            { name: 'none', message: 'No publishing (version & tag only)' },
          ],
        });
        options.registryType = registryType as any;
      }

      // Prompt for registryUrl if registry type requires it
      if (!options.registryUrl && options.registryType !== 'none') {
        const defaultUrl = getDefaultRegistry(options.registryType);
        const { registryUrl } = await prompt<{ registryUrl: string }>({
          type: 'input',
          name: 'registryUrl',
          message: `Registry URL?`,
          initial: defaultUrl,
        });
        options.registryUrl = registryUrl || defaultUrl;
      }

      logger.info('');
      logger.info(`✅ Will configure as standalone project`);
    }
  }
}

function addReleaseTargets(
  tree: Tree,
  options: ConfigureReleaseSchema,
  projectConfig: any,
  projectName: string
) {
  if (!projectConfig.targets) {
    projectConfig.targets = {};
  }

  // 1. Add version target (always)
  projectConfig.targets['version'] = {
    executor: 'nx-project-release:version',
    options: {
      versionFiles: options.versionFiles || ['package.json'],
    },
  };

  // 2. Add changelog target (always)
  projectConfig.targets['changelog'] = {
    executor: 'nx-project-release:changelog',
  };

  // 3. Add artifact target (always)
  projectConfig.targets['artifact'] = {
    executor: 'nx-project-release:artifact',
    dependsOn: ['build'],
    options: {
      sourceDir: `dist/${projectConfig.root}`,
      outputDir: 'dist/artifacts',
      format: 'tgz',
      artifactName: `{projectName}-{version}.tgz`,
    },
    outputs: ['{workspaceRoot}/dist/artifacts'],
  };

  // 4. Add release target (always)
  projectConfig.targets['release'] = {
    executor: 'nx-project-release:release',
    options: {
      gitPush: false,
      createGitHubRelease: false,
    },
  };

  // 5. Add publish target (only if registryType !== 'none')
  if (options.registryType && options.registryType !== 'none') {
    projectConfig.targets['publish'] = {
      executor: 'nx-project-release:publish',
      options: {
        registryType: options.registryType,
        registry:
          options.registryUrl || getDefaultRegistry(options.registryType),
      },
      dependsOn: ['build', 'artifact'],
    };

    // Add registry-specific options
    if (options.registryType === 'npm') {
      projectConfig.targets['publish'].options.access = 'public';
      projectConfig.targets['publish'].options.distTag = 'latest';
    } else if (options.registryType === 'docker') {
      projectConfig.targets['publish'].options.imageName = projectName;
      projectConfig.targets['publish'].options.tags = ['{version}', 'latest'];
    }
  }

  updateProjectConfiguration(tree, projectName, projectConfig);
  logger.info(`✅ Added release targets to ${projectName}`);
}

function initializeVersionFile(
  tree: Tree,
  options: ConfigureReleaseSchema,
  projectConfig: any
) {
  const projectRoot = projectConfig.root;
  const versionFile = options.versionFiles?.[0] || 'package.json';
  const versionFilePath = path.join(projectRoot, versionFile);

  if (!tree.exists(versionFilePath)) {
    // Create version file
    if (versionFile === 'package.json') {
      const packageJson = {
        name: options.project,
        version: options.initialVersion || '0.1.0',
        private: true,
      };
      tree.write(versionFilePath, JSON.stringify(packageJson, null, 2) + '\n');
      logger.info(
        `✅ Created ${versionFilePath} with version ${
          options.initialVersion || '0.1.0'
        }`
      );
    } else if (versionFile === 'project.json') {
      // Read existing project.json and add version
      if (tree.exists(path.join(projectRoot, 'project.json'))) {
        const existingConfig = JSON.parse(
          tree.read(path.join(projectRoot, 'project.json'), 'utf-8') || '{}'
        );
        existingConfig.version = options.initialVersion || '0.1.0';
        tree.write(
          path.join(projectRoot, 'project.json'),
          JSON.stringify(existingConfig, null, 2) + '\n'
        );
        logger.info(
          `✅ Added version ${
            options.initialVersion || '0.1.0'
          } to ${versionFilePath}`
        );
      }
    } else {
      // Create custom version file
      const versionData = {
        version: options.initialVersion || '0.1.0',
      };
      tree.write(versionFilePath, JSON.stringify(versionData, null, 2) + '\n');
      logger.info(
        `✅ Created ${versionFilePath} with version ${
          options.initialVersion || '0.1.0'
        }`
      );
    }
  } else {
    // File exists, check if it has a version
    const content = tree.read(versionFilePath, 'utf-8');
    if (content) {
      try {
        const json = JSON.parse(content);
        if (!json.version) {
          json.version = options.initialVersion || '0.1.0';
          tree.write(versionFilePath, JSON.stringify(json, null, 2) + '\n');
          logger.info(
            `✅ Added version ${
              options.initialVersion || '0.1.0'
            } to ${versionFilePath}`
          );
        } else {
          logger.info(
            `ℹ️  ${versionFilePath} already has version: ${json.version}`
          );
        }
      } catch (error) {
        logger.warn(`⚠️  Could not parse ${versionFilePath}: ${error}`);
      }
    }
  }
}

function addToReleaseGroupMultiple(
  tree: Tree,
  options: ConfigureReleaseSchema,
  selectedProjects: string[]
) {
  const nxJson = readNxJson(tree);
  if (!nxJson) {
    logger.warn('⚠️  Could not read nx.json');
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nxJsonAny = nxJson as any;

  if (!nxJsonAny.projectRelease) {
    nxJsonAny.projectRelease = {};
  }

  if (!nxJsonAny.projectRelease.releaseGroups) {
    nxJsonAny.projectRelease.releaseGroups = {};
  }

  const groupName = options.releaseGroupName || `${options.registryType}-group`;

  // First, remove all projects from any other release groups
  for (const projectName of selectedProjects) {
    removeProjectFromOtherGroups(nxJsonAny, projectName, groupName);
  }

  if (
    options.createNewGroup ||
    !nxJsonAny.projectRelease.releaseGroups[groupName]
  ) {
    // Create new release group with all selected projects
    nxJsonAny.projectRelease.releaseGroups[groupName] = {
      registryType: options.registryType,
      registryUrl:
        options.registryUrl || getDefaultRegistry(options.registryType),
      versionStrategy: 'independent',
      versionFiles: options.versionFiles || ['package.json'],
      projects: selectedProjects,
    };
    logger.info(
      `✅ Created release group '${groupName}' with ${selectedProjects.length} projects`
    );
  } else {
    // Add to existing group
    const group = nxJsonAny.projectRelease.releaseGroups[groupName];
    if (!group.projects) {
      group.projects = [];
    }

    let addedCount = 0;
    for (const projectName of selectedProjects) {
      if (!group.projects.includes(projectName)) {
        group.projects.push(projectName);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      logger.info(
        `✅ Added ${addedCount} project(s) to release group '${groupName}'`
      );
    } else {
      logger.info(
        `ℹ️  All selected projects already in release group '${groupName}'`
      );
    }
  }

  updateNxJson(tree, nxJson);
}

function removeProjectFromOtherGroups(
  nxJsonAny: any,
  projectName: string,
  currentGroupName: string
): void {
  if (!nxJsonAny.projectRelease?.releaseGroups) {
    return;
  }

  const releaseGroups = nxJsonAny.projectRelease.releaseGroups;

  for (const [groupName, group] of Object.entries(releaseGroups)) {
    // Skip the current group
    if (groupName === currentGroupName) {
      continue;
    }

    const groupData = group as any;
    if (groupData.projects && Array.isArray(groupData.projects)) {
      const index = groupData.projects.indexOf(projectName);
      if (index > -1) {
        groupData.projects.splice(index, 1);
        logger.info(
          `ℹ️  Removed ${projectName} from release group '${groupName}'`
        );

        // If group is now empty, optionally remove it
        if (groupData.projects.length === 0) {
          logger.warn(`⚠️  Release group '${groupName}' is now empty`);
        }
      }
    }
  }
}

function getDefaultRegistry(registryType?: string): string {
  switch (registryType) {
    case 'npm':
      return 'https://registry.npmjs.org';
    case 'docker':
      return 'docker.io';
    case 'github':
      return 'https://github.com';
    case 'nexus':
      return 'https://nexus.company.com/repository/releases';
    case 's3':
      return 's3://my-bucket/artifacts';
    default:
      return '';
  }
}
