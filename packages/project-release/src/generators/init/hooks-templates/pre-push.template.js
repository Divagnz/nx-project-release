#!/usr/bin/env node
/**
 * nx-project-release pre-push hook
 * Validates all release configurations before push
 */

const {
  getProjectsWithReleaseConfig,
  validateProjectConfig,
} = require('./utils');

function main() {
  console.log('🔍 Validating release configurations...');

  const releaseProjects = getProjectsWithReleaseConfig();

  if (releaseProjects.length === 0) {
    console.log('ℹ️  No projects with release configuration found');
    return;
  }

  const validationResults = [];
  let hasErrors = false;

  for (const project of releaseProjects) {
    const result = validateProjectConfig(project);
    if (!result.valid) {
      validationResults.push({ project, errors: result.errors });
      hasErrors = true;
    }
  }

  if (!hasErrors) {
    console.log(
      `✅ All ${releaseProjects.length} release configurations are valid`
    );
    return;
  }

  // Display errors
  console.log('');
  console.error('❌ Release configuration errors detected:');
  console.log('');

  for (const { project, errors } of validationResults) {
    console.error(`📦 ${project}:`);
    errors.forEach((error) => {
      console.error(`   ❌ ${error}`);
    });
    console.log('');
  }

  console.error('Fix configuration errors before pushing.');
  console.error('');
  console.error('To fix these errors:');
  console.error('  1. Run: npx nx g nx-project-release:refreshConf');
  console.error('  2. Or manually edit project.json for each project');
  console.error('  3. Or bypass this check with: git push --no-verify');
  console.error('');

  process.exit(1);
}

main();
