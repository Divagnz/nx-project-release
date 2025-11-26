import {
  Tree,
  readProjectConfiguration,
  updateProjectConfiguration,
  readNxJson,
  updateNxJson,
  logger
} from '@nx/devkit';
import { ConfigAnswers } from './prompts';

interface TargetDefault {
  cache?: boolean;
  options?: Record<string, unknown>;
  dependsOn?: string[];
}

export function buildNxJsonTargetDefaults(answers: ConfigAnswers): Record<string, TargetDefault> {
  const targetDefaults: Record<string, TargetDefault> = {};

  if (answers.executorType === 'individual') {
    // Version executor configuration
    targetDefaults['nx-project-release:version'] = {
      cache: false,
      options: {
        versionFiles: answers.versionFiles,
        gitCommit: answers.gitCommit,
        gitTag: answers.gitTag,
        ciOnly: answers.ciOnly,
        gitCommitMessage: answers.commitMessage,
        trackDeps: answers.trackDeps,
        syncVersions: answers.syncVersions
      }
    };

    // Add version strategy specific options
    if (answers.versionStrategy === 'git-tag') {
      targetDefaults['nx-project-release:version'].options.currentVersionResolver = 'git-tag';
      targetDefaults['nx-project-release:version'].options.fallbackCurrentVersionResolver = 'disk';
    } else if (answers.versionStrategy === 'registry') {
      targetDefaults['nx-project-release:version'].options.currentVersionResolver = 'registry';
      targetDefaults['nx-project-release:version'].options.fallbackCurrentVersionResolver = 'git-tag';
    } else {
      targetDefaults['nx-project-release:version'].options.currentVersionResolver = 'disk';
    }

    // Changelog executor configuration
    targetDefaults['nx-project-release:changelog'] = {
      cache: false,
      options: {
        preset: answers.preset,
        projectChangelogs: answers.projectChangelogs
      }
    };

    // Publish executor configuration
    targetDefaults['nx-project-release:publish'] = {
      cache: false,
      dependsOn: [answers.buildTarget],
      options: {
        registryType: answers.registryType,
        registry: answers.registryUrl,
        access: answers.access,
        distTag: answers.distTag
      }
    };
  } else {
    // All-in-one project-release executor
    targetDefaults['nx-project-release:project-release'] = {
      cache: false,
      dependsOn: [answers.buildTarget],
      options: {
        // Version options
        versionFiles: answers.versionFiles,
        gitCommit: answers.gitCommit,
        gitTag: answers.gitTag,
        ciOnly: answers.ciOnly,
        gitCommitMessage: answers.commitMessage,
        trackDeps: answers.trackDeps,
        syncVersions: answers.syncVersions,

        // Changelog options
        preset: answers.preset,
        projectChangelogs: answers.projectChangelogs,

        // Publish options
        registryType: answers.registryType,
        registry: answers.registryUrl,
        access: answers.access,
        distTag: answers.distTag
      }
    };

    // Add version strategy
    if (answers.versionStrategy === 'git-tag') {
      targetDefaults['nx-project-release:project-release'].options.currentVersionResolver = 'git-tag';
      targetDefaults['nx-project-release:project-release'].options.fallbackCurrentVersionResolver = 'disk';
    } else if (answers.versionStrategy === 'registry') {
      targetDefaults['nx-project-release:project-release'].options.currentVersionResolver = 'registry';
      targetDefaults['nx-project-release:project-release'].options.fallbackCurrentVersionResolver = 'git-tag';
    } else {
      targetDefaults['nx-project-release:project-release'].options.currentVersionResolver = 'disk';
    }
  }

  return targetDefaults;
}

export function updateNxJsonConfiguration(tree: Tree, answers: ConfigAnswers): void {
  const nxJson = readNxJson(tree);
  if (!nxJson) {
    throw new Error('Could not read nx.json');
  }

  if (!nxJson.targetDefaults) {
    nxJson.targetDefaults = {};
  }

  // Build and merge target defaults
  const newTargetDefaults = buildNxJsonTargetDefaults(answers);
  Object.assign(nxJson.targetDefaults, newTargetDefaults);

  // Add projectRelease configuration section if tag naming or release groups are configured
  if (answers.configureTagNaming || answers.configureReleaseGroups || answers.useReleaseGroups) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nxJsonAny = nxJson as any;

    if (!nxJsonAny.projectRelease) {
      nxJsonAny.projectRelease = {};
    }

    // Add tag naming configuration
    if (answers.configureTagNaming) {
      nxJsonAny.projectRelease.tagNaming = {
        prefix: answers.tagPrefix,
        format: answers.tagFormat
      };
      logger.info('✅ Added tag naming configuration to nx.json');
    }

    // Add release groups configuration (new format)
    if (answers.useReleaseGroups && answers.releaseGroups && answers.releaseGroups.length > 0) {
      nxJsonAny.projectRelease.releaseGroups = {};

      for (const group of answers.releaseGroups) {
        nxJsonAny.projectRelease.releaseGroups[group.groupName] = {
          registryType: group.registryType,
          registryUrl: group.registryUrl,
          versionStrategy: group.versionStrategy,
          versionFiles: group.versionFiles,
          pathStrategy: group.pathStrategy,
          projects: group.projects
        };
      }

      logger.info(`✅ Added ${answers.releaseGroups.length} release groups to nx.json`);
    }

    // Add excluded projects configuration
    if (answers.excludedProjects && answers.excludedProjects.length > 0) {
      nxJsonAny.projectRelease.excludedProjects = answers.excludedProjects;
      logger.info(`✅ Added ${answers.excludedProjects.length} excluded projects to nx.json`);
    }

    // Add release groups configuration (legacy format - for backward compatibility)
    if (answers.configureReleaseGroups && answers.releaseGroupsConfig) {
      nxJsonAny.projectRelease.releaseGroups = {};

      for (const group of answers.releaseGroupsConfig) {
        const projects = group.projectsPattern.split(',').map(p => p.trim());

        nxJsonAny.projectRelease.releaseGroups[group.groupName] = {
          projects,
          projectsRelationship: group.versioning,
          tagNaming: {
            format: group.versioning === 'independent'
              ? '{projectName}@{version}'
              : `${group.groupName}-v{version}`
          }
        };
      }

      logger.info('✅ Added release groups configuration to nx.json');
    }
  }

  updateNxJson(tree, nxJson);
  logger.info('✅ Updated nx.json with targetDefaults');
}

export function addTargetsToProjects(tree: Tree, answers: ConfigAnswers): void {
  // Build a map of project name to group name
  const projectToGroup = new Map<string, string>();
  if (answers.releaseGroups) {
    for (const group of answers.releaseGroups) {
      for (const projectName of group.projects) {
        projectToGroup.set(projectName, group.groupName);
      }
    }
  }

  for (const projectName of answers.selectedProjects) {
    // Skip if project is excluded
    if (answers.excludedProjects?.includes(projectName)) {
      continue;
    }

    try {
      const projectConfig = readProjectConfiguration(tree, projectName);

      if (!projectConfig.targets) {
        projectConfig.targets = {};
      }

      // Get the release group for this project
      const groupName = projectToGroup.get(projectName);
      const groupOptions = groupName ? { releaseGroup: groupName } : {};

      if (answers.executorType === 'individual') {
        // Add individual executor targets
        projectConfig.targets.version = {
          executor: 'nx-project-release:version',
          options: groupOptions
          // Inherits other options from nx.json targetDefaults
        };

        projectConfig.targets.changelog = {
          executor: 'nx-project-release:changelog'
        };

        projectConfig.targets.publish = {
          executor: 'nx-project-release:publish',
          dependsOn: [answers.buildTarget]
        };
      } else {
        // Add all-in-one executor target
        projectConfig.targets['project-release'] = {
          executor: 'nx-project-release:project-release',
          dependsOn: [answers.buildTarget],
          options: groupOptions
        };
      }

      updateProjectConfiguration(tree, projectName, projectConfig);
      const groupInfo = groupName ? ` (group: ${groupName})` : '';
      logger.info(`✅ Added release targets to ${projectName}${groupInfo}`);
    } catch (error) {
      logger.warn(`⚠️  Could not update project ${projectName}: ${error.message}`);
    }
  }
}
