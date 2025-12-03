import { Tree, formatFiles, logger, getProjects, readNxJson, updateNxJson, readProjectConfiguration, updateProjectConfiguration } from '@nx/devkit';
import { ResetGeneratorSchema } from './schema';
import Enquirer from 'enquirer';

const { prompt } = Enquirer;

export async function resetGenerator(tree: Tree, options: ResetGeneratorSchema) {
  logger.info('');
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('   nx-project-release Reset');
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('');

  // Confirm if not skipped
  if (!options.skipConfirmation) {
    logger.warn('⚠️  This will remove all nx-project-release configuration from your workspace:');
    logger.warn('   - Remove targetDefaults from nx.json');
    logger.warn('   - Remove projectRelease configuration from nx.json');
    logger.warn('   - Remove release targets from all projects');
    if (options.removeHooks) {
      logger.warn('   - Remove ONLY nx-project-release git hooks (preserves other hooks)');
    }
    logger.info('');

    const { confirm } = await prompt<{ confirm: boolean }>({
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to continue?',
      initial: false
    });

    if (!confirm) {
      logger.info('Reset cancelled.');
      return;
    }
  }

  logger.info('');
  logger.info('🧹 Cleaning up nx-project-release configuration...');
  logger.info('');

  let itemsRemoved = 0;

  // 1. Clean nx.json
  const nxJson = readNxJson(tree);
  if (nxJson) {
    let nxJsonModified = false;

    // Remove targetDefaults for nx-project-release executors
    if (nxJson.targetDefaults) {
      const executors = [
        'nx-project-release:version',
        'nx-project-release:changelog',
        'nx-project-release:publish',
        'nx-project-release:project-release'
      ];

      for (const executor of executors) {
        if (nxJson.targetDefaults[executor]) {
          delete nxJson.targetDefaults[executor];
          nxJsonModified = true;
          itemsRemoved++;
        }
      }
    }

    // Remove projectRelease configuration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nxJsonAny = nxJson as any;
    if (nxJsonAny.projectRelease) {
      delete nxJsonAny.projectRelease;
      nxJsonModified = true;
      itemsRemoved++;
      logger.info('✅ Removed projectRelease configuration from nx.json');
    }

    if (nxJsonModified) {
      updateNxJson(tree, nxJson);
      logger.info('✅ Removed targetDefaults from nx.json');
    }
  }

  // 2. Clean project.json files
  const projects = getProjects(tree);
  const releaseTargets = ['version', 'changelog', 'publish', 'project-release'];
  let projectsModified = 0;
  let versionsRemoved = 0;

  for (const [projectName, projectConfig] of projects) {
    let modified = false;

    // Remove release targets
    if (projectConfig.targets) {
      for (const targetName of releaseTargets) {
        const target = projectConfig.targets[targetName];
        if (target && typeof target.executor === 'string' && target.executor.startsWith('nx-project-release:')) {
          delete projectConfig.targets[targetName];
          modified = true;
          itemsRemoved++;
        }
      }
    }

    // Remove version field from project.json (but NOT from package.json)
    // We need to directly manipulate the project.json file to remove the version field
    const projectJsonPath = `${projectConfig.root}/project.json`;
    if (tree.exists(projectJsonPath)) {
      const projectJsonContent = tree.read(projectJsonPath, 'utf-8');
      if (projectJsonContent) {
        const projectJson = JSON.parse(projectJsonContent);
        if (projectJson.version) {
          delete projectJson.version;
          tree.write(projectJsonPath, JSON.stringify(projectJson, null, 2) + '\n');
          versionsRemoved++;
          modified = true;
        }
      }
    }

    if (modified) {
      updateProjectConfiguration(tree, projectName, projectConfig);
      projectsModified++;
    }
  }

  if (projectsModified > 0) {
    logger.info(`✅ Removed release targets from ${projectsModified} projects`);
  }

  if (versionsRemoved > 0) {
    logger.info(`✅ Removed version field from ${versionsRemoved} project.json files`);
  }

  // 3. Clean git hooks (carefully!)
  if (options.removeHooks) {
    await cleanGitHooks(tree);
  }

  logger.info('');
  logger.info('═══════════════════════════════════════════════════════');
  logger.info(`   ✅ Reset Complete! (${itemsRemoved} items removed)`);
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('');

  if (itemsRemoved === 0) {
    logger.warn('⚠️  No nx-project-release configuration found to remove.');
  }

  await formatFiles(tree);
}

async function cleanGitHooks(tree: Tree): Promise<void> {
  const hasHusky = tree.exists('.husky');
  const hasSimpleGitHooks = tree.exists('package.json');

  if (hasHusky) {
    await cleanHuskyHooks(tree);
  } else if (hasSimpleGitHooks) {
    await cleanSimpleGitHooks(tree);
  }
}

async function cleanHuskyHooks(tree: Tree): Promise<void> {
  // For Husky, we need to carefully remove only nx-project-release lines
  const hooks = ['pre-commit', 'pre-push'];
  let hooksModified = 0;

  for (const hookName of hooks) {
    const hookPath = `.husky/${hookName}`;
    if (tree.exists(hookPath)) {
      const content = tree.read(hookPath, 'utf-8');
      if (content) {
        // Remove only lines that contain nx-project-release
        const lines = content.split('\n');
        const filteredLines = lines.filter(line =>
          !line.includes('nx-project-release') &&
          !line.includes('nx run-many') ||
          line.trim().startsWith('#') // Keep comments
        );

        // Only update if content changed
        if (filteredLines.length !== lines.length) {
          tree.write(hookPath, filteredLines.join('\n'));
          hooksModified++;
          logger.info(`✅ Cleaned ${hookName} hook (removed nx-project-release lines only)`);
        }
      }
    }
  }

  if (hooksModified === 0) {
    logger.info('ℹ️  No nx-project-release hooks found in Husky');
  }
}

async function cleanSimpleGitHooks(tree: Tree): Promise<void> {
  // For simple-git-hooks, remove from package.json
  const packageJsonPath = 'package.json';
  if (tree.exists(packageJsonPath)) {
    const packageJson = JSON.parse(tree.read(packageJsonPath, 'utf-8') || '{}');

    if (packageJson['simple-git-hooks']) {
      // Check if hooks contain nx-project-release commands
      let hooksModified = false;
      const hooks = packageJson['simple-git-hooks'];

      for (const [hookName, hookCommand] of Object.entries(hooks)) {
        if (typeof hookCommand === 'string' && hookCommand.includes('nx-project-release')) {
          delete hooks[hookName];
          hooksModified = true;
          logger.info(`✅ Removed ${hookName} hook from simple-git-hooks`);
        }
      }

      // If all hooks removed, remove the entire simple-git-hooks section
      if (Object.keys(hooks).length === 0) {
        delete packageJson['simple-git-hooks'];
        logger.info('✅ Removed empty simple-git-hooks section');
      }

      if (hooksModified) {
        tree.write(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
      }
    } else {
      logger.info('ℹ️  No simple-git-hooks configuration found');
    }
  }
}

export default resetGenerator;