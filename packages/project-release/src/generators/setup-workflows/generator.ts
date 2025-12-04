import {
  Tree,
  formatFiles,
  logger,
  generateFiles,
  joinPathFragments,
} from '@nx/devkit';
import * as path from 'path';
import { SetupWorkflowsSchema } from './schema';
import { readFileSync } from 'fs';

export async function setupWorkflowsGenerator(
  tree: Tree,
  options: SetupWorkflowsSchema
) {
  logger.info('');
  logger.info('⚙️  Setting up CI/CD workflows...');
  logger.info('');

  // Validate platform
  if (options.platform !== 'github') {
    logger.error(`❌ Platform '${options.platform}' is not yet supported`);
    logger.info('💡 Currently supported: github');
    logger.info('💡 Coming soon: gitlab, circleci');
    return;
  }

  // Set defaults
  const normalizedOptions = {
    platform: options.platform || 'github',
    workflowType: options.workflowType || 'release-publish',
    defaultBranch: options.defaultBranch || 'main',
    enableWorkflowDispatch: options.enableWorkflowDispatch !== false,
    createGitHubRelease: options.createGitHubRelease !== false,
    autoMergeReleasePR: options.autoMergeReleasePR || false,
    triggerPaths: options.triggerPaths || [],
    nodeVersion: options.nodeVersion || '20',
    twoStepRelease: options.twoStepRelease || false,
  };

  // Create workflows directory
  const workflowsDir = '.github/workflows';
  if (!tree.exists(workflowsDir)) {
    logger.info(`📁 Creating ${workflowsDir} directory`);
  }

  // Generate workflows based on type
  const workflowsToCreate: Array<{ name: string; template: string }> = [];

  // If two-step release is enabled, override workflow selection
  if (normalizedOptions.twoStepRelease) {
    workflowsToCreate.push(
      { name: 'release-pr.yml', template: 'github-two-step-pr.yml.template' },
      {
        name: 'publish-release.yml',
        template: 'github-two-step-publish.yml.template',
      }
    );
  } else if (normalizedOptions.workflowType === 'all') {
    workflowsToCreate.push(
      {
        name: 'release-publish.yml',
        template: 'github-release-publish.yml.template',
      },
      {
        name: 'release-affected.yml',
        template: 'github-affected.yml.template',
      },
      { name: 'release-manual.yml', template: 'github-manual.yml.template' },
      { name: 'release-on-merge.yml', template: 'github-merge.yml.template' },
      {
        name: 'pr-validation.yml',
        template: 'github-pr-validation.yml.template',
      }
    );
  } else {
    const templateMap = {
      'release-publish': 'github-release-publish.yml.template',
      affected: 'github-affected.yml.template',
      manual: 'github-manual.yml.template',
      'on-merge': 'github-merge.yml.template',
      'pr-validation': 'github-pr-validation.yml.template',
    };

    const fileNameMap = {
      'release-publish': 'release-publish.yml',
      affected: 'release-affected.yml',
      manual: 'release-manual.yml',
      'on-merge': 'release-on-merge.yml',
      'pr-validation': 'pr-validation.yml',
    };

    workflowsToCreate.push({
      name: fileNameMap[normalizedOptions.workflowType],
      template: templateMap[normalizedOptions.workflowType],
    });
  }

  // Generate each workflow file
  for (const workflow of workflowsToCreate) {
    const templatePath = path.join(__dirname, 'templates', workflow.template);
    const outputPath = path.join(workflowsDir, workflow.name);

    try {
      // Read template from filesystem (templates are part of the package)
      let templateContent: string;
      try {
        templateContent = readFileSync(templatePath, 'utf-8');
      } catch (err) {
        logger.warn(
          `⚠️  Template not found: ${workflow.template} at ${templatePath}`
        );
        continue;
      }

      // Simple EJS-style template rendering
      let renderedContent = templateContent;

      // Replace template variables
      renderedContent = renderedContent.replace(
        /<%=\s*defaultBranch\s*%>/g,
        normalizedOptions.defaultBranch
      );
      renderedContent = renderedContent.replace(
        /<%=\s*nodeVersion\s*%>/g,
        normalizedOptions.nodeVersion
      );
      renderedContent = renderedContent.replace(
        /<%=\s*createGitHubRelease\s*%>/g,
        String(normalizedOptions.createGitHubRelease)
      );

      // Handle conditionals
      renderedContent = handleConditionals(renderedContent, {
        enableWorkflowDispatch: normalizedOptions.enableWorkflowDispatch,
        createGitHubRelease: normalizedOptions.createGitHubRelease,
        triggerPaths: normalizedOptions.triggerPaths,
        hasTriggerPaths: normalizedOptions.triggerPaths.length > 0,
      });

      // Handle triggerPaths array
      if (normalizedOptions.triggerPaths.length > 0) {
        const pathsSection = normalizedOptions.triggerPaths
          .map((p) => `      - '${p}'`)
          .join('\n');
        const triggerPathsRegex = new RegExp(
          '<% triggerPaths\\.forEach\\(path => \\{ %>[\\s\\S]*?<% \\}\\); %>',
          'g'
        );
        renderedContent = renderedContent.replace(
          triggerPathsRegex,
          pathsSection
        );
      }

      // Write workflow file
      tree.write(outputPath, renderedContent);
      logger.info(`✅ Created ${outputPath}`);
    } catch (error) {
      logger.error(
        `❌ Failed to create ${workflow.name}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  await formatFiles(tree);

  logger.info('');
  logger.info('✅ CI/CD workflows configured!');
  logger.info('');

  if (normalizedOptions.twoStepRelease) {
    logger.info('🔄 Two-Step Release Workflow:');
    logger.info(
      '   Step 1: release-pr.yml - Version, Changelog, Tag (on push)'
    );
    logger.info(
      '   Step 2: publish-release.yml - Build, Artifact, Publish (triggered by release commit)'
    );
    logger.info('');
  }

  logger.info('📋 Next steps:');
  logger.info(`   1. Review workflows in ${workflowsDir}/`);
  logger.info('   2. Add required secrets to your repository:');
  logger.info('      - GITHUB_TOKEN (automatically provided)');
  logger.info('      - NPM_TOKEN (if publishing to npm)');
  logger.info('   3. Commit and push the workflow files');
  logger.info('');
}

/**
 * Handle conditional blocks in templates
 */
function handleConditionals(
  template: string,
  context: Record<string, any>
): string {
  let result = template;

  // Handle <% if (condition) { %> ... <% } %> blocks
  const conditionalRegex = new RegExp(
    '<%\\s*if\\s*\\((.*?)\\)\\s*\\{\\s*%>([\\s\\S]*?)<%\\s*}\\s*%>',
    'g'
  );

  result = result.replace(conditionalRegex, (match, condition, content) => {
    // Evaluate simple conditions
    const conditionResult = evaluateCondition(condition.trim(), context);
    return conditionResult ? content : '';
  });

  return result;
}

/**
 * Evaluate simple conditions from templates
 */
function evaluateCondition(
  condition: string,
  context: Record<string, any>
): boolean {
  // Handle simple variable checks
  if (condition.includes('&&')) {
    const parts = condition.split('&&').map((p) => p.trim());
    return parts.every((part) => evaluateCondition(part, context));
  }

  if (condition.includes('||')) {
    const parts = condition.split('||').map((p) => p.trim());
    return parts.some((part) => evaluateCondition(part, context));
  }

  // Handle array length checks
  if (condition.includes('.length >')) {
    const [varName, comparison] = condition
      .split('.length >')
      .map((s) => s.trim());
    const value = context[varName];
    const threshold = parseInt(comparison);
    return Array.isArray(value) && value.length > threshold;
  }

  // Handle simple variable truthiness
  const cleanCondition = condition.replace(/^\!/, '').trim();
  const isNegated = condition.startsWith('!');
  const value = context[cleanCondition];

  return isNegated ? !value : !!value;
}

export default setupWorkflowsGenerator;
