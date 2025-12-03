import { Tree, formatFiles, logger, addDependenciesToPackageJson, updateJson } from '@nx/devkit';
import { SetupCommitlintSchema } from './schema';
import { detectHookSystem } from '../init/lib/hooks-utils.js';

export async function setupCommitlintGenerator(tree: Tree, options: SetupCommitlintSchema) {
  logger.info('');
  logger.info('⚙️  Setting up commitlint...');
  logger.info('');

  // Check if already configured
  const configFiles = [
    'commitlint.config.js',
    'commitlint.config.ts',
    '.commitlintrc.json',
    '.commitlintrc.js'
  ];

  const hasConfig = configFiles.some(f => tree.exists(f));

  if (hasConfig) {
    logger.warn('⚠️  commitlint config already exists');
    logger.info('   Skipping configuration file creation');
    logger.info('');
  } else {
    // Create commitlint.config.js
    const configContent = options.useNxScopes
      ? `module.exports = {
  extends: ['@commitlint/config-conventional', '@commitlint/config-nx-scopes'],
  rules: {
    'scope-enum': [0], // Disabled - handled by @commitlint/config-nx-scopes
  }
};
`
      : `module.exports = {
  extends: ['@commitlint/config-conventional'],
};
`;

    tree.write('commitlint.config.js', configContent);
    logger.info('✅ Created commitlint.config.js');
  }

  // Install dependencies
  const devDeps: Record<string, string> = {
    '@commitlint/cli': '*',
    '@commitlint/config-conventional': '*'
  };

  if (options.useNxScopes) {
    devDeps['@commitlint/config-nx-scopes'] = '*';
  }

  const installTask = addDependenciesToPackageJson(tree, {}, devDeps);
  logger.info('✅ Added commitlint dependencies');

  // Set up hook if not skipped
  if (!options.skipHooks) {
    const hookSystem = detectHookSystem(tree);

    if (hookSystem.type === 'husky') {
      setupHuskyHook(tree);
    } else {
      setupSimpleGitHook(tree);
    }
  }

  await formatFiles(tree);

  logger.info('');
  logger.info('✅ Commitlint setup complete!');
  logger.info('');
  logger.info('💡 Test it:');
  logger.info('   git commit -m "invalid commit message"');
  logger.info('   (should fail validation)');
  logger.info('');

  return async () => {
    await installTask();
  };
}

function setupHuskyHook(tree: Tree): void {
  const hookPath = '.husky/commit-msg';

  let content = '';
  if (tree.exists(hookPath)) {
    content = tree.read(hookPath, 'utf-8') || '';
    if (content.includes('commitlint')) {
      logger.warn('⚠️  Husky commit-msg hook already has commitlint');
      return;
    }
  } else {
    content = '#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n\n';
  }

  content += 'npx --no -- commitlint --edit "$1"\n';
  tree.write(hookPath, content);
  logger.info('✅ Added commit-msg hook to Husky');
}

function setupSimpleGitHook(tree: Tree): void {
  updateJson(tree, 'package.json', (json) => {
    json['simple-git-hooks'] = json['simple-git-hooks'] || {};

    if (json['simple-git-hooks']['commit-msg']) {
      logger.warn('⚠️  simple-git-hooks commit-msg already configured');
      return json;
    }

    json['simple-git-hooks']['commit-msg'] = 'npx commitlint --edit "$1"';
    logger.info('✅ Added commit-msg hook to simple-git-hooks');
    return json;
  });
}

export default setupCommitlintGenerator;
