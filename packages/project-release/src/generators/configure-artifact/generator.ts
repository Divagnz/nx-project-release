import {
  Tree,
  readProjectConfiguration,
  updateProjectConfiguration,
  formatFiles,
  getProjects,
  logger,
} from '@nx/devkit';
import { ConfigureArtifactSchema } from './schema';
import Enquirer from 'enquirer';

const { prompt } = Enquirer;

export default async function configureArtifactGenerator(
  tree: Tree,
  options: ConfigureArtifactSchema
) {
  // Determine which projects to configure
  let projectsToConfig: string[] = [];

  if (options.projects && options.projects.length > 0) {
    projectsToConfig = options.projects;
  } else if (options.project) {
    projectsToConfig = [options.project];
  } else {
    // Interactive project selection
    const allProjects = Array.from(getProjects(tree).keys());
    const { selectedProjects } = await prompt<{ selectedProjects: string[] }>({
      type: 'multiselect',
      name: 'selectedProjects',
      message: 'Select projects to configure artifact creation for:',
      choices: allProjects,
    } as any);
    projectsToConfig = selectedProjects;
  }

  if (projectsToConfig.length === 0) {
    logger.warn('No projects selected');
    return;
  }

  // Get format if not provided
  let format = options.format || 'tgz';
  if (!options.format && projectsToConfig.length === 1) {
    const { selectedFormat } = await prompt<{ selectedFormat: string }>({
      type: 'select',
      name: 'selectedFormat',
      message: 'Which archive format?',
      choices: [
        { name: 'ZIP (.zip)', value: 'zip' },
        { name: 'Gzipped Tar (.tgz)', value: 'tgz' },
        { name: 'Gzipped Tar (.tar.gz)', value: 'tar.gz' },
        { name: 'Tar (.tar)', value: 'tar' },
      ],
    });
    format = selectedFormat as any;
  }

  // Get source directory pattern if not provided
  let sourceDir = options.sourceDir;
  if (!sourceDir && projectsToConfig.length === 1) {
    const projectConfig = readProjectConfiguration(tree, projectsToConfig[0]);
    const suggestedDir = `dist/${projectConfig.root}`;

    const { dir } = await prompt<{ dir: string }>({
      type: 'input',
      name: 'dir',
      message:
        'Source directory to archive? (use {projectName} as placeholder)',
      initial: suggestedDir,
    } as any);
    sourceDir = dir;
  }

  // Configure each project
  for (const projectName of projectsToConfig) {
    configureProjectArtifact(tree, projectName, {
      ...options,
      sourceDir: sourceDir || `dist/{projectName}`,
      format,
    });
  }

  await formatFiles(tree);

  // Show summary
  logger.info('');
  logger.info('✅ Artifact targets configured successfully');
  logger.info('');
  logger.info('Configured projects:');
  for (const projectName of projectsToConfig) {
    logger.info(`  - ${projectName}`);
  }
  logger.info('');
  logger.info('Usage:');
  if (projectsToConfig.length === 1) {
    logger.info(
      `  nx run ${projectsToConfig[0]}:artifact              # Create artifact`
    );
    logger.info(
      `  nx run ${projectsToConfig[0]}:publish              # Build → Artifact → Publish`
    );
  } else {
    logger.info(
      `  nx run <project>:artifact                         # Create artifact`
    );
    logger.info(
      `  nx run <project>:publish                          # Build → Artifact → Publish`
    );
  }
  logger.info('');

  return;
}

function configureProjectArtifact(
  tree: Tree,
  projectName: string,
  options: ConfigureArtifactSchema
) {
  const projectConfig = readProjectConfiguration(tree, projectName);

  // Determine extension
  const format = options.format || 'tgz';
  const extension = format === 'tar.gz' ? 'tar.gz' : format;

  // Resolve source directory for this specific project
  const sourceDir =
    options.sourceDir?.replace('{projectName}', projectName) ||
    `dist/${projectConfig.root}`;

  // Add artifact target
  projectConfig.targets = projectConfig.targets || {};
  projectConfig.targets['artifact'] = {
    executor: 'nx-project-release:artifact',
    dependsOn: options.dependsOn || ['build'],
    options: {
      sourceDir,
      outputDir: 'dist/artifacts',
      artifactName:
        options.artifactName || `{projectName}-{version}.${extension}`,
      format: format,
      ...(options.exclude &&
        options.exclude.length > 0 && { exclude: options.exclude }),
    },
    outputs: ['{workspaceRoot}/dist/artifacts'],
  };

  // Update publish target if it exists and updatePublish is true
  if (options.updatePublish !== false && projectConfig.targets['publish']) {
    const publishTarget = projectConfig.targets['publish'];
    publishTarget.dependsOn = publishTarget.dependsOn || [];

    if (!publishTarget.dependsOn.includes('artifact')) {
      publishTarget.dependsOn.push('artifact');
    }

    // Set artifactPath to use artifact target output
    publishTarget.options = publishTarget.options || {};
    publishTarget.options.artifactPath = `dist/artifacts/{projectName}-{version}.${extension}`;
  }

  updateProjectConfiguration(tree, projectName, projectConfig);

  logger.info(`✓ Configured ${projectName}`);
}
