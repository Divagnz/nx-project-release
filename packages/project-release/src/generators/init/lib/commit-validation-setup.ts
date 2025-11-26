import { Tree, logger, updateJson, joinPathFragments, addDependenciesToPackageJson } from '@nx/devkit';
import { detectHookSystem } from './hooks-utils.js';

export interface CommitValidationOptions {
  enableCommitizen: boolean;
  enableCommitlint: boolean;
  useNxScopes: boolean;
}

/**
 * Set up commit validation tools (commitizen + commitlint)
 */
export async function setupCommitValidation(
  tree: Tree,
  options: CommitValidationOptions
): Promise<void> {
  logger.info('⚙️  Setting up commit validation...');

  const tasks: any[] = [];

  // Install dependencies
  if (options.enableCommitizen || options.enableCommitlint) {
    const deps = installDependencies(tree, options);
    if (deps) {
      tasks.push(deps);
    }
  }

  // Configure commitizen
  if (options.enableCommitizen) {
    configureCommitizen(tree);
  }

  // Configure commitlint
  if (options.enableCommitlint) {
    configureCommitlint(tree, options.useNxScopes);
    setupCommitMsgHook(tree);
  }

  // Add npm scripts
  if (options.enableCommitizen || options.enableCommitlint) {
    addNpmScripts(tree, options);
  }

  logger.info('✅ Commit validation configured');

  // Execute installation tasks
  for (const task of tasks) {
    await task();
  }
}

/**
 * Install required npm dependencies
 */
function installDependencies(
  tree: Tree,
  options: CommitValidationOptions
): (() => void) | null {
  const devDependencies: Record<string, string> = {};

  if (options.enableCommitizen) {
    devDependencies['commitizen'] = '*';
    devDependencies['cz-conventional-changelog'] = '*';
  }

  if (options.enableCommitlint) {
    devDependencies['@commitlint/cli'] = '*';
    devDependencies['@commitlint/config-conventional'] = '*';

    if (options.useNxScopes) {
      devDependencies['@commitlint/config-nx-scopes'] = '*';
    }
  }

  if (Object.keys(devDependencies).length === 0) {
    return null;
  }

  logger.info(`📦 Installing dependencies: ${Object.keys(devDependencies).join(', ')}`);

  return addDependenciesToPackageJson(tree, {}, devDependencies);
}

/**
 * Configure commitizen
 */
function configureCommitizen(tree: Tree): void {
  logger.info('⚙️  Configuring commitizen...');

  // Add configuration to package.json
  updateJson(tree, 'package.json', (json) => {
    json.config = json.config || {};
    json.config.commitizen = {
      path: './node_modules/cz-conventional-changelog'
    };
    return json;
  });

  logger.info('✅ Commitizen configured');
}

/**
 * Configure commitlint
 */
function configureCommitlint(tree: Tree, useNxScopes: boolean): void {
  logger.info('⚙️  Configuring commitlint...');

  const configContent = useNxScopes
    ? `module.exports = {
  extends: ['@commitlint/config-conventional', '@commitlint/config-nx-scopes'],
  rules: {
    // Nx projects as valid scopes
    'scope-enum': [0], // Disabled, handled by @commitlint/config-nx-scopes
  }
};
`
    : `module.exports = {
  extends: ['@commitlint/config-conventional'],
};
`;

  tree.write('commitlint.config.js', configContent);
  logger.info('📝 Created commitlint.config.js');
}

/**
 * Add npm scripts for commit validation
 */
function addNpmScripts(tree: Tree, options: CommitValidationOptions): void {
  logger.info('⚙️  Adding npm scripts...');

  updateJson(tree, 'package.json', (json) => {
    json.scripts = json.scripts || {};

    if (options.enableCommitizen) {
      json.scripts.commit = 'git-cz';
      logger.info('✅ Added script: npm run commit');
    }

    if (options.enableCommitlint) {
      json.scripts['commitlint'] = 'commitlint --edit';
      logger.info('✅ Added script: npm run commitlint');
    }

    return json;
  });
}

/**
 * Set up commit-msg hook for commitlint
 */
function setupCommitMsgHook(tree: Tree): void {
  const hookSystem = detectHookSystem(tree);

  if (hookSystem.type === 'husky') {
    setupHuskyCommitMsgHook(tree);
  } else {
    setupSimpleGitHooksCommitMsg(tree);
  }
}

/**
 * Set up commit-msg hook for Husky
 */
function setupHuskyCommitMsgHook(tree: Tree): void {
  const hookPath = '.husky/commit-msg';

  let content = '';

  if (tree.exists(hookPath)) {
    // Append to existing hook
    content = tree.read(hookPath, 'utf-8') || '';

    if (content.includes('commitlint')) {
      logger.warn('⚠️  Husky commit-msg hook already has commitlint, skipping');
      return;
    }
  } else {
    // Create new hook with Husky header
    content = '#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n\n';
  }

  // Add commitlint
  content += 'npx --no -- commitlint --edit "$1"\n';

  tree.write(hookPath, content);
  logger.info('✅ Added commit-msg hook to Husky');
}

/**
 * Set up commit-msg hook for simple-git-hooks
 */
function setupSimpleGitHooksCommitMsg(tree: Tree): void {
  updateJson(tree, 'package.json', (json) => {
    json['simple-git-hooks'] = json['simple-git-hooks'] || {};

    if (json['simple-git-hooks']['commit-msg']) {
      logger.warn('⚠️  simple-git-hooks commit-msg already configured, skipping');
      return json;
    }

    json['simple-git-hooks']['commit-msg'] = 'npx commitlint --edit "$1"';

    logger.info('✅ Added commit-msg hook to simple-git-hooks');
    return json;
  });
}
