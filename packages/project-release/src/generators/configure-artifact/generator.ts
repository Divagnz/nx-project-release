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

    const { sourceDir: sourceDirValue } = await prompt<{ sourceDir: string }>({
      type: 'input',
      name: 'sourceDir',
      message:
        'Source directory to archive? (use {projectName} as placeholder)',
      initial: suggestedDir,
    } as any);
    sourceDir = sourceDirValue;
  }

  // Get output directory if not provided
  let outputDir = options.outputDir;
  if (!outputDir && projectsToConfig.length === 1) {
    const { outputDir: outputDirValue } = await prompt<{ outputDir: string }>({
      type: 'input',
      name: 'outputDir',
      message: 'Output directory for artifacts?',
      initial: 'dist/artifacts',
    } as any);
    outputDir = outputDirValue;
  }

  // Get compression level if not provided
  let compressionLevel = options.compressionLevel;
  if (compressionLevel === undefined && projectsToConfig.length === 1) {
    const { level } = await prompt<{ level: number }>({
      type: 'numeral',
      name: 'level',
      message: 'Compression level (0-9, where 9 is max)?',
      initial: 6,
    } as any);
    compressionLevel = level;
  }

  // Get preservePermissions if not provided
  let preservePermissions = options.preservePermissions;
  if (preservePermissions === undefined && projectsToConfig.length === 1) {
    const { preserve } = await prompt<{ preserve: boolean }>({
      type: 'confirm',
      name: 'preserve',
      message: 'Preserve file permissions (Unix)?',
      initial: true,
    } as any);
    preservePermissions = preserve;
  }

  // Configure each project
  for (const projectName of projectsToConfig) {
    configureProjectArtifact(tree, projectName, {
      ...options,
      sourceDir: sourceDir || `dist/{projectName}`,
      outputDir: outputDir,
      format,
      compressionLevel,
      preservePermissions,
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
  } else {
    logger.info(
      `  nx run <project>:artifact                         # Create artifact`
    );
  }
  logger.info('');
  logger.info('💡 Next step: Configure publish targets with:');
  logger.info('  nx g nx-project-release:configure-publish');
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

  // Build options object
  const artifactOptions: any = {
    sourceDir,
    outputDir: options.outputDir || 'dist/artifacts',
    artifactName: options.artifactName || `{projectName}-{version}.${extension}`,
    format: format,
  };

  // Add optional options only if provided
  if (options.include && options.include.length > 0) {
    artifactOptions.include = options.include;
  }

  if (options.exclude && options.exclude.length > 0) {
    artifactOptions.exclude = options.exclude;
  }

  if (options.compressionLevel !== undefined) {
    artifactOptions.compressionLevel = options.compressionLevel;
  }

  if (options.preservePermissions !== undefined) {
    artifactOptions.preservePermissions = options.preservePermissions;
  }

  if (options.stripPrefix) {
    artifactOptions.stripPrefix = options.stripPrefix;
  }

  if (options.metadata) {
    artifactOptions.metadata = options.metadata;
  }

  projectConfig.targets['artifact'] = {
    executor: 'nx-project-release:artifact',
    dependsOn: options.dependsOn || ['build'],
    options: artifactOptions,
    outputs: ['{workspaceRoot}/dist/artifacts'],
  };

  updateProjectConfiguration(tree, projectName, projectConfig);

  logger.info(`✓ Configured ${projectName}`);
}
