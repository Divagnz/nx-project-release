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
  if (answers.configureTagNaming || answers.configureReleaseGroups) {
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

    // Add release groups configuration
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
  for (const projectName of answers.selectedProjects) {
    try {
      const projectConfig = readProjectConfiguration(tree, projectName);

      if (!projectConfig.targets) {
        projectConfig.targets = {};
      }

      if (answers.executorType === 'individual') {
        // Add individual executor targets
        projectConfig.targets.version = {
          executor: 'nx-project-release:version'
          // Inherits options from nx.json targetDefaults
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
          dependsOn: [answers.buildTarget]
        };
      }

      updateProjectConfiguration(tree, projectName, projectConfig);
      logger.info(`✅ Added release targets to ${projectName}`);
    } catch (error) {
      logger.warn(`⚠️  Could not update project ${projectName}: ${error.message}`);
    }
  }
}
