import { Tree, formatFiles, logger } from '@nx/devkit';
import { InitGeneratorSchema } from './schema';
import { promptForConfig } from './lib/prompts';
import { updateNxJsonConfiguration, addTargetsToProjects } from './lib/config-builder';
import { detectExistingConfiguration, getDefaultAnswers, getPublishableProjects } from './lib/utils';
import { setupGitHooks } from './lib/hooks-setup';
import { createGitHubWorkflows } from './lib/workflows-setup';

export async function initGenerator(tree: Tree, options: InitGeneratorSchema) {
  logger.info('');
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('   nx-project-release Interactive Setup');
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('');

  // Track hooks setup for final instructions
  let hooksSetup = false;
  const hasHusky = tree.exists('.husky');

  // Detect existing configuration
  const existingConfig = detectExistingConfiguration(tree);
  if (existingConfig.hasNxJsonConfig || existingConfig.hasProjectConfigs) {
    logger.warn('⚠️  Existing configuration detected:');
    if (existingConfig.hasNxJsonConfig) {
      logger.warn('   - nx.json has targetDefaults for nx-project-release');
    }
    if (existingConfig.hasProjectConfigs) {
      logger.warn(`   - ${existingConfig.configuredProjects.length} projects have release targets`);
      logger.warn(`     Projects: ${existingConfig.configuredProjects.join(', ')}`);
    }
    logger.info('');
    logger.info('This generator will update existing configuration.');
    logger.info('');
  }

  if (!options.skipPrompts) {
    // Run interactive configuration
    const answers = await promptForConfig(tree);

    // Show summary
    logger.info('');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('   Configuration Summary');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('');
    logger.info(`Executor Type:       ${answers.executorType}`);
    logger.info(`Selected Projects:   ${answers.selectedProjects.length}`);
    logger.info(`                     ${answers.selectedProjects.join(', ')}`);
    logger.info(`Config Location:     ${answers.configLocation}`);
    logger.info(`Version Strategy:    ${answers.versionStrategy}`);
    logger.info(`Changelog Preset:    ${answers.preset}`);
    logger.info(`Registry:            ${answers.registryUrl}`);
    logger.info(`Git Commit:          ${answers.gitCommit ? 'Yes' : 'No'}`);
    logger.info(`Git Tag:             ${answers.gitTag ? 'Yes' : 'No'}`);
    logger.info(`Git Push:            ${answers.gitPush ? 'Yes' : 'No'}`);

    if (answers.configureTagNaming) {
      logger.info('');
      logger.info(`Tag Format:          ${answers.tagFormat}`);
      logger.info(`Tag Prefix:          ${answers.tagPrefix || '(none)'}`);
    }

    if (answers.configureReleaseGroups && answers.releaseGroupsConfig && answers.releaseGroupsConfig.length > 0) {
      logger.info('');
      logger.info(`Release Groups:      ${answers.releaseGroupsConfig.length} configured`);
      for (const group of answers.releaseGroupsConfig) {
        logger.info(`  - ${group.groupName}: ${group.versioning} (${group.projectsPattern})`);
      }
    }

    logger.info('');

    // Update nx.json if requested
    if (answers.configLocation === 'nx-json' || answers.configLocation === 'both') {
      updateNxJsonConfiguration(tree, answers);
    }

    // Add targets to projects if requested
    if (answers.configLocation === 'project-json' || answers.configLocation === 'both') {
      addTargetsToProjects(tree, answers);
    }

    // Set up git hooks if requested
    if (answers.setupHooks) {
      logger.info('');
      await setupGitHooks(tree, answers.hookOptions);
      hooksSetup = true;
    }

    // Set up GitHub workflows if requested
    if (answers.setupGitHubWorkflows && answers.workflowType !== 'none') {
      logger.info('');
      logger.info('🔄 Setting up GitHub Actions workflows...');
      createGitHubWorkflows(tree, answers.workflowType, answers.selectedProjects);
    }

    logger.info('');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('   ✅ Setup Complete!');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('');
    logger.info('Next steps:');
    logger.info('');

    if (answers.executorType === 'individual') {
      logger.info('  Run individual executors:');
      logger.info(`    nx run <project>:version`);
      logger.info(`    nx run <project>:changelog`);
      logger.info(`    nx run <project>:publish`);
    } else {
      logger.info('  Run the complete release workflow:');
      logger.info(`    nx run <project>:project-release`);
    }

    logger.info('');
    logger.info('  Or run for all configured projects:');
    logger.info(`    nx run-many -t ${answers.executorType === 'individual' ? 'version' : 'project-release'}`);
    logger.info('');

  } else {
    // Non-interactive mode: use defaults
    logger.info('Running in non-interactive mode with default configuration...');
    logger.info('');

    const defaults = getDefaultAnswers();
    const publishableProjects = getPublishableProjects(tree);

    if (publishableProjects.length === 0) {
      logger.warn('⚠️  No publishable projects found (projects with package.json)');
      logger.info('   Configuring workspace defaults only in nx.json');
      logger.info('');
    } else {
      defaults.selectedProjects = publishableProjects;
      logger.info(`Found ${publishableProjects.length} publishable projects:`);
      logger.info(`  ${publishableProjects.join(', ')}`);
      logger.info('');
    }

    // Apply default configuration
    updateNxJsonConfiguration(tree, defaults);

    if (defaults.selectedProjects.length > 0) {
      addTargetsToProjects(tree, defaults);
    }

    logger.info('✅ Default configuration applied successfully!');
    logger.info('');
  }

  // Format files
  if (!options.skipFormat) {
    await formatFiles(tree);
  }

  return () => {
    logger.info('');

    // Remind about npm install for simple-git-hooks
    if (hooksSetup && !hasHusky) {
      logger.warn('⚠️  Important: Run `npm install` to activate git hooks');
      logger.info('');
    }

    logger.info('📚 Documentation: https://github.com/Divagnz/nx-project-release');
    logger.info('');
  };
}

export default initGenerator;
