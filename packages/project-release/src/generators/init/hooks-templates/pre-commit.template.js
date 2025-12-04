#!/usr/bin/env node
/**
 * nx-project-release pre-commit hook
 * Detects unconfigured publishable projects and prompts for configuration
 */

const { getUnconfiguredPublishableProjects } = require('./utils');

async function main() {
  console.log('🔍 Checking for unconfigured projects...');

  const unconfigured = getUnconfiguredPublishableProjects();

  if (unconfigured.length === 0) {
    console.log('✅ All publishable projects are configured');
    return;
  }

  console.log('');
  console.log('⚠️  Unconfigured publishable projects detected:');
  unconfigured.forEach((project) => {
    console.log(`   - ${project}`);
  });
  console.log('');

  // Import enquirer dynamically to handle cases where it might not be installed
  let prompt;
  try {
    const enquirer = require('enquirer');
    prompt = enquirer.prompt;
  } catch (error) {
    // Enquirer not installed, fall back to blocking with message
    console.error(
      '❌ These projects need release configuration before commit.'
    );
    console.error('');
    console.error('Configure them by running:');
    unconfigured.forEach((project) => {
      console.error(`  npx nx g nx-project-release:init --project=${project}`);
    });
    console.error('');
    console.error('Or bypass this check with: git commit --no-verify');
    process.exit(1);
  }

  try {
    const { action } = await prompt({
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        {
          name: 'configure',
          message: '⚙️  Configure now',
          hint: 'Run interactive configuration for each project',
        },
        {
          name: 'skip',
          message: '⏭️  Skip (commit anyway)',
          hint: 'Continue with commit, configure later',
        },
        {
          name: 'abort',
          message: '🚫 Abort commit',
          hint: 'Cancel commit and configure manually',
        },
      ],
    });

    if (action === 'configure') {
      const { execSync } = require('child_process');

      console.log('');
      console.log('Configuring projects...');
      console.log('');

      for (const project of unconfigured) {
        console.log(`📦 Configuring ${project}...`);
        try {
          // Note: This will run the init generator in interactive mode for each project
          // We'll create a 'configuration' generator later that's more suitable for this
          execSync(`npx nx g nx-project-release:init --project=${project}`, {
            stdio: 'inherit',
          });
        } catch (error) {
          console.error(`Failed to configure ${project}`);
          process.exit(1);
        }
      }

      console.log('');
      console.log('✅ All projects configured!');
      console.log(
        "📝 Don't forget to add the configuration files to your commit"
      );
    } else if (action === 'abort') {
      console.log('');
      console.log('Commit aborted. Configure projects and try again.');
      process.exit(1);
    } else {
      // skip - allow commit to proceed
      console.log('');
      console.log(
        '⏭️  Skipping configuration. Remember to configure these projects later!'
      );
    }
  } catch (error) {
    // User cancelled (Ctrl+C)
    console.log('');
    console.log('Commit cancelled.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Hook error:', error);
  process.exit(1);
});
