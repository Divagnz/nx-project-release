import {
  Tree,
  getProjects,
  readNxJson,
  updateNxJson,
  readProjectConfiguration,
  updateProjectConfiguration,
  logger,
} from '@nx/devkit';
import { ExcludeProjectsSchema } from './schema';
import Enquirer from 'enquirer';

const { prompt } = Enquirer;

export default async function excludeProjectsGenerator(
  tree: Tree,
  options: ExcludeProjectsSchema
) {
  logger.info('');
  logger.info('📋 Manage Excluded Projects');
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

  const currentExcluded = nxJsonAny.projectRelease.excludedProjects || [];
  const allProjects = Array.from(getProjects(tree).keys());

  let projectsToProcess: string[] = [];

  // Pattern-based selection
  if (options.pattern) {
    const regex = new RegExp(options.pattern.replace(/\*/g, '.*'));
    projectsToProcess = allProjects.filter((p) => regex.test(p));
    logger.info(
      `📝 Found ${projectsToProcess.length} projects matching pattern: ${options.pattern}`
    );
    logger.info(`   ${projectsToProcess.join(', ')}`);
  }
  // Interactive multi-select
  else if (options.interactive !== false && !options.projects) {
    const action = await promptAction(options);

    if (action === 'add' || action === 'set') {
      // Show all projects, mark currently excluded ones
      const choices = allProjects.map((project) => ({
        name: project,
        message: currentExcluded.includes(project)
          ? `${project} (currently excluded)`
          : project,
        hint: currentExcluded.includes(project) ? 'Already excluded' : '',
      }));

      const { selectedProjects } = await prompt<{ selectedProjects: string[] }>(
        {
          type: 'multiselect',
          name: 'selectedProjects',
          message:
            action === 'add'
              ? 'Select projects to ADD to excluded list:'
              : 'Select projects to EXCLUDE from versioning:',
          choices: choices,
          initial: action === 'set' ? currentExcluded : [],
          // @ts-expect-error - enquirer types are incomplete
          hint: 'Space to select, Enter to confirm',
        }
      );

      projectsToProcess = selectedProjects;
      options.add = action === 'add';
    } else if (action === 'remove') {
      if (currentExcluded.length === 0) {
        logger.warn('⚠️  No projects are currently excluded');
        return;
      }

      const choices = currentExcluded.map((project) => ({
        name: project,
        message: project,
      }));

      const { selectedProjects } = await prompt<{ selectedProjects: string[] }>(
        {
          type: 'multiselect',
          name: 'selectedProjects',
          message: 'Select projects to REMOVE from excluded list:',
          choices: choices,
          // @ts-expect-error - enquirer types are incomplete
          hint: 'Space to select, Enter to confirm',
        }
      );

      projectsToProcess = selectedProjects;
      options.remove = true;
    } else if (action === 'clear') {
      const { confirm } = await prompt<{ confirm: boolean }>({
        type: 'confirm',
        name: 'confirm',
        message: `Clear all ${currentExcluded.length} excluded projects?`,
        initial: false,
      });

      if (confirm) {
        nxJsonAny.projectRelease.excludedProjects = [];
        updateNxJson(tree, nxJson);
        logger.info('✅ Cleared all excluded projects');
        return;
      } else {
        logger.info('ℹ️  Cancelled');
        return;
      }
    } else if (action === 'view') {
      showCurrentExcluded(currentExcluded);
      return;
    }
  }
  // Command-line arguments
  else if (options.projects && options.projects.length > 0) {
    projectsToProcess = options.projects;
  } else {
    logger.error('❌ No projects specified');
    logger.info('💡 Run without arguments for interactive mode:');
    logger.info('   nx g nx-project-release:exclude-projects');
    return;
  }

  // Process the projects
  if (options.remove) {
    // Remove from excluded list (re-enable projects)
    const updated = currentExcluded.filter(
      (p: string) => !projectsToProcess.includes(p)
    );
    const removed = currentExcluded.filter((p: string) =>
      projectsToProcess.includes(p)
    );

    nxJsonAny.projectRelease.excludedProjects = updated;
    updateNxJson(tree, nxJson);

    logger.info('');
    logger.info(`✅ Removed ${removed.length} projects from excluded list:`);
    removed.forEach((p: string) => logger.info(`   - ${p}`));

    if (updated.length > 0) {
      logger.info('');
      logger.info(`📋 Still excluded (${updated.length}):`);
      updated.forEach((p: string) => logger.info(`   - ${p}`));
    }
  } else if (options.add) {
    // Add to existing excluded list
    const newExcluded = [
      ...new Set([...currentExcluded, ...projectsToProcess]),
    ];
    const added = newExcluded.filter((p) => !currentExcluded.includes(p));

    nxJsonAny.projectRelease.excludedProjects = newExcluded;
    updateNxJson(tree, nxJson);

    // Remove release targets from newly excluded projects
    removeReleaseTargets(tree, added);

    logger.info('');
    logger.info(`✅ Added ${added.length} projects to excluded list:`);
    added.forEach((p) => logger.info(`   - ${p}`));

    logger.info('');
    logger.info(`📋 Total excluded: ${newExcluded.length} projects`);
  } else {
    // Replace entire excluded list
    nxJsonAny.projectRelease.excludedProjects = projectsToProcess;
    updateNxJson(tree, nxJson);

    // Remove release targets from all excluded projects
    removeReleaseTargets(tree, projectsToProcess);

    logger.info('');
    logger.info(`✅ Set excluded projects (${projectsToProcess.length}):`);
    projectsToProcess.forEach((p) => logger.info(`   - ${p}`));
  }

  logger.info('');
  logger.info('💡 Next steps:');
  logger.info(
    '   - Run nx g nx-project-release:init to configure remaining projects'
  );
  logger.info(
    '   - Or run nx g nx-project-release:exclude-projects again to modify'
  );
  logger.info('');
}

async function promptAction(
  options: ExcludeProjectsSchema
): Promise<'add' | 'remove' | 'set' | 'clear' | 'view'> {
  const { action } = await prompt<{
    action: 'add' | 'remove' | 'set' | 'clear' | 'view';
  }>({
    type: 'select',
    name: 'action',
    message: 'What do you want to do?',
    choices: [
      {
        name: 'set',
        message: 'Set excluded projects (replace current list)',
        hint: 'Start fresh with a new selection',
      },
      {
        name: 'add',
        message: 'Add to excluded projects',
        hint: 'Add more projects to existing list',
      },
      {
        name: 'remove',
        message: 'Remove from excluded projects',
        hint: 'Stop excluding some projects',
      },
      {
        name: 'view',
        message: 'View currently excluded projects',
        hint: 'Just show the current list',
      },
      {
        name: 'clear',
        message: 'Clear all excluded projects',
        hint: 'Remove all exclusions',
      },
    ],
  });

  return action;
}

function showCurrentExcluded(excluded: string[]) {
  logger.info('');
  if (excluded.length === 0) {
    logger.info('ℹ️  No projects are currently excluded');
  } else {
    logger.info(`📋 Currently excluded (${excluded.length} projects):`);
    excluded.forEach((p) => logger.info(`   - ${p}`));
  }
  logger.info('');
}

function removeReleaseTargets(tree: Tree, projects: string[]) {
  const releaseTargets = [
    'version',
    'changelog',
    'release',
    'artifact',
    'publish',
    'project-release',
  ];

  for (const projectName of projects) {
    try {
      const projectConfig = readProjectConfiguration(tree, projectName);

      if (!projectConfig.targets) {
        continue;
      }

      let removedCount = 0;
      const removedTargets: string[] = [];
      for (const targetName of releaseTargets) {
        if (projectConfig.targets[targetName]) {
          delete projectConfig.targets[targetName];
          removedCount++;
          removedTargets.push(targetName);
        }
      }

      // Add tag to mark project as excluded from release
      if (!projectConfig.tags) {
        projectConfig.tags = [];
      }
      if (!projectConfig.tags.includes('release:excluded')) {
        projectConfig.tags.push('release:excluded');
      }

      if (removedCount > 0 || projectConfig.tags.includes('release:excluded')) {
        updateProjectConfiguration(tree, projectName, projectConfig);
        logger.info(
          `   🗑️  Removed ${removedCount} target(s) from ${projectName}: ${removedTargets.join(
            ', '
          )}`
        );
        logger.info(`   🏷️  Added tag: release:excluded`);
      }
    } catch (error) {
      logger.warn(
        `   ⚠️  Could not update ${projectName}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
