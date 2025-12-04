import { Tree, logger } from '@nx/devkit';

export interface HookSystem {
  type: 'husky' | 'simple-git-hooks' | 'none';
  detected: boolean;
}

/**
 * Detect which git hook system is being used in the workspace
 */
export function detectHookSystem(tree: Tree): HookSystem {
  // Check for Husky
  const hasHuskyDir = tree.exists('.husky');
  const hasHuskyScript =
    tree.exists('.husky/_/husky.sh') || tree.exists('.husky/pre-commit');

  if (hasHuskyDir || hasHuskyScript) {
    logger.info('📍 Detected: Husky');
    return { type: 'husky', detected: true };
  }

  // Check for simple-git-hooks in package.json
  if (tree.exists('package.json')) {
    const packageJson = JSON.parse(tree.read('package.json', 'utf-8') || '{}');
    if (
      packageJson['simple-git-hooks'] ||
      packageJson.devDependencies?.['simple-git-hooks']
    ) {
      logger.info('📍 Detected: simple-git-hooks');
      return { type: 'simple-git-hooks', detected: true };
    }
  }

  logger.info('📍 No git hooks detected');
  return { type: 'none', detected: false };
}

/**
 * Check if hooks directory needs to be created
 */
export function needsHooksDirectory(tree: Tree): boolean {
  return !tree.exists('.nx-project-release/hooks');
}

/**
 * Get hook script content from template
 */
export function getHookTemplate(
  hookName: 'pre-commit' | 'pre-push' | 'utils'
): string {
  // These will be read from the templates directory
  // For now, we'll return the path - the actual reading will be done in hooks-setup.ts
  return `hooks-templates/${hookName}.template.js`;
}

/**
 * Check if a hook is already configured (to avoid duplicates)
 */
export function isHookConfigured(
  tree: Tree,
  hookSystem: HookSystem,
  hookName: string
): boolean {
  if (hookSystem.type === 'husky') {
    const hookPath = `.husky/${hookName}`;
    if (tree.exists(hookPath)) {
      const content = tree.read(hookPath, 'utf-8') || '';
      return content.includes('nx-project-release');
    }
  } else if (hookSystem.type === 'simple-git-hooks') {
    if (tree.exists('package.json')) {
      const packageJson = JSON.parse(
        tree.read('package.json', 'utf-8') || '{}'
      );
      const hooks = packageJson['simple-git-hooks'] || {};
      return hooks[hookName]?.includes('nx-project-release') || false;
    }
  }

  return false;
}
