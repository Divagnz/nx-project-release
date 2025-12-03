#!/usr/bin/env node
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import readline from 'readline';

// Allow opt-out
if (process.env.SKIP_NX_PROJECT_RELEASE_SETUP === 'true') {
  process.exit(0);
}

// Find workspace root
function findWorkspaceRoot() {
  let current = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(current, 'package.json'))) {
      return current;
    }
    current = join(current, '..');
    if (current === '/') break;
  }
  return process.cwd();
}

// Check if commitlint configured
function hasCommitlint(root) {
  const configs = [
    'commitlint.config.js',
    'commitlint.config.ts',
    '.commitlintrc.json',
    '.commitlintrc.js'
  ];
  return configs.some(c => existsSync(join(root, c)));
}

// Prompt user yes/no
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(query, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const root = findWorkspaceRoot();

  // Skip if already configured
  if (hasCommitlint(root)) {
    process.exit(0);
  }

  console.log('\n📦 nx-project-release installed!');
  console.log('\n💡 Commitlint validates conventional commits for accurate changelogs.');

  const answer = await askQuestion('\nInstall commitlint? (y/n): ');

  if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
    console.log('\n📥 Installing commitlint...\n');

    try {
      // Install dependencies
      execSync(
        'npm install --save-dev @commitlint/cli @commitlint/config-conventional @commitlint/config-nx-scopes',
        { cwd: root, stdio: 'inherit' }
      );

      // Create config
      const configPath = join(root, 'commitlint.config.js');
      const configContent = `module.exports = {
  extends: ['@commitlint/config-conventional', '@commitlint/config-nx-scopes'],
  rules: {
    'scope-enum': [0], // Disabled - handled by @commitlint/config-nx-scopes
  }
};
`;

      writeFileSync(configPath, configContent, 'utf8');

      console.log('\n✅ Commitlint configured!');
      console.log('\n💡 Next: Set up git hooks');
      console.log('   npx nx g nx-project-release:init\n');

    } catch (error) {
      console.error('\n⚠️  Installation failed:', error.message);
      console.log('\n💡 Install manually:');
      console.log('   npx nx g nx-project-release:setup-commitlint\n');
    }
  } else {
    console.log('\n⏭️  Skipped commitlint installation');
    console.log('\n💡 Install anytime with:');
    console.log('   npx nx g nx-project-release:setup-commitlint');
    console.log('\n💡 Skip this prompt next time:');
    console.log('   SKIP_NX_PROJECT_RELEASE_SETUP=true npm install\n');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(0);
});
