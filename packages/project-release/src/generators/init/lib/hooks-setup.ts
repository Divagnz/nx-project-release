import {
  Tree,
  logger,
  readJson,
  updateJson,
  joinPathFragments,
} from '@nx/devkit';
import { detectHookSystem, isHookConfigured } from './hooks-utils';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface HookOptions {
  enablePreCommit: boolean;
  enablePrePush: boolean;
}

/**
 * Set up git hooks based on detected hook system
 */
export async function setupGitHooks(
  tree: Tree,
  options: HookOptions
): Promise<void> {
  const hookSystem = detectHookSystem(tree);

  // Create hooks directory if needed
  ensureHooksDirectory(tree);

  // Copy hook scripts to workspace
  copyHookScripts(tree);

  // Set up hooks based on detected system
  if (hookSystem.type === 'husky') {
    await setupHuskyHooks(tree, options, {
      type: 'husky',
      detected: hookSystem.detected,
    });
  } else {
    await setupSimpleGitHooks(tree, options);
  }

  logger.info('✅ Git hooks configured');
}

/**
 * Ensure .nx-project-release/hooks directory exists
 */
function ensureHooksDirectory(tree: Tree): void {
  const hooksDir = '.nx-project-release/hooks';

  if (!tree.exists(hooksDir)) {
    // Create directory structure
    tree.write(joinPathFragments(hooksDir, '.gitkeep'), '');
    logger.info(`📁 Created ${hooksDir}/`);
  }
}

/**
 * Copy hook script templates to workspace
 */
function copyHookScripts(tree: Tree): void {
  const hooksDir = '.nx-project-release/hooks';
  const templateDir = join(__dirname, '../hooks-templates');

  const scripts = [
    'pre-commit.template.js',
    'pre-push.template.js',
    'utils.template.js',
  ];

  for (const scriptFile of scripts) {
    const templatePath = join(templateDir, scriptFile);
    const targetFileName = scriptFile.replace('.template.js', '.js');
    const targetPath = joinPathFragments(hooksDir, targetFileName);

    try {
      // Read template content
      const content = readFileSync(templatePath, 'utf-8');

      // Write to workspace
      tree.write(targetPath, content);

      logger.info(`📝 Created ${targetPath}`);
    } catch (error) {
      logger.error(`Failed to copy ${scriptFile}: ${error.message}`);
    }
  }
}

/**
 * Set up hooks for Husky
 */
async function setupHuskyHooks(
  tree: Tree,
  options: HookOptions,
  hookSystem: { type: 'husky'; detected: boolean }
): Promise<void> {
  logger.info('⚙️  Configuring Husky hooks...');

  if (options.enablePreCommit) {
    const hookPath = '.husky/pre-commit';

    if (isHookConfigured(tree, hookSystem, 'pre-commit')) {
      logger.warn(
        `⚠️  ${hookPath} already has nx-project-release hook, skipping`
      );
    } else {
      let content = '';

      if (tree.exists(hookPath)) {
        // Append to existing hook
        content = tree.read(hookPath, 'utf-8') || '';
      } else {
        // Create new hook with Husky header
        content = '#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n\n';
      }

      // Add our hook
      content += '\n# nx-project-release: detect unconfigured projects\n';
      content += 'node .nx-project-release/hooks/pre-commit.js || exit 1\n';

      tree.write(hookPath, content);
      logger.info(`✅ Updated ${hookPath}`);
    }
  }

  if (options.enablePrePush) {
    const hookPath = '.husky/pre-push';

    if (isHookConfigured(tree, hookSystem, 'pre-push')) {
      logger.warn(
        `⚠️  ${hookPath} already has nx-project-release hook, skipping`
      );
    } else {
      let content = '';

      if (tree.exists(hookPath)) {
        // Append to existing hook
        content = tree.read(hookPath, 'utf-8') || '';
      } else {
        // Create new hook with Husky header
        content = '#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n\n';
      }

      // Add our hook
      content += '\n# nx-project-release: validate configurations\n';
      content += 'node .nx-project-release/hooks/pre-push.js || exit 1\n';

      tree.write(hookPath, content);
      logger.info(`✅ Updated ${hookPath}`);
    }
  }
}

/**
 * Set up hooks for simple-git-hooks
 */
async function setupSimpleGitHooks(
  tree: Tree,
  options: HookOptions
): Promise<void> {
  logger.info('⚙️  Configuring simple-git-hooks...');

  updateJson(tree, 'package.json', (json) => {
    // Add simple-git-hooks to devDependencies if not present
    if (!json.devDependencies) {
      json.devDependencies = {};
    }

    if (!json.devDependencies['simple-git-hooks']) {
      json.devDependencies['simple-git-hooks'] = '^2.11.1';
      logger.info('➕ Added simple-git-hooks to devDependencies');
    }

    // Initialize simple-git-hooks config
    if (!json['simple-git-hooks']) {
      json['simple-git-hooks'] = {};
    }

    // Add hooks
    if (options.enablePreCommit) {
      const existingHook = json['simple-git-hooks']['pre-commit'];
      const ourHook = 'node .nx-project-release/hooks/pre-commit.js';

      if (existingHook && existingHook.includes('nx-project-release')) {
        logger.warn('⚠️  pre-commit hook already configured, skipping');
      } else if (existingHook) {
        // Combine with existing hook
        json['simple-git-hooks'][
          'pre-commit'
        ] = `${existingHook} && ${ourHook}`;
        logger.info('✅ Added to existing pre-commit hook');
      } else {
        // Set new hook
        json['simple-git-hooks']['pre-commit'] = ourHook;
        logger.info('✅ Configured pre-commit hook');
      }
    }

    if (options.enablePrePush) {
      const existingHook = json['simple-git-hooks']['pre-push'];
      const ourHook = 'node .nx-project-release/hooks/pre-push.js';

      if (existingHook && existingHook.includes('nx-project-release')) {
        logger.warn('⚠️  pre-push hook already configured, skipping');
      } else if (existingHook) {
        // Combine with existing hook
        json['simple-git-hooks']['pre-push'] = `${existingHook} && ${ourHook}`;
        logger.info('✅ Added to existing pre-push hook');
      } else {
        // Set new hook
        json['simple-git-hooks']['pre-push'] = ourHook;
        logger.info('✅ Configured pre-push hook');
      }
    }

    // Add prepare script if not present
    if (!json.scripts) {
      json.scripts = {};
    }

    if (!json.scripts.prepare) {
      json.scripts.prepare = 'simple-git-hooks';
      logger.info('✅ Added prepare script');
    } else if (!json.scripts.prepare.includes('simple-git-hooks')) {
      json.scripts.prepare = `${json.scripts.prepare} && simple-git-hooks`;
      logger.info('✅ Updated prepare script');
    }

    return json;
  });

  logger.info('');
  logger.warn('⚠️  Run `npm install` to activate git hooks');
}
