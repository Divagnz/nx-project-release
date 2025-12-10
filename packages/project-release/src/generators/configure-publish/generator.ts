import {
  Tree,
  readProjectConfiguration,
  updateProjectConfiguration,
  readNxJson,
  updateNxJson,
  formatFiles,
  getProjects,
  logger,
} from '@nx/devkit';
import { ConfigurePublishSchema } from './schema';
import Enquirer from 'enquirer';

const { prompt } = Enquirer;

export default async function configurePublishGenerator(
  tree: Tree,
  options: ConfigurePublishSchema
) {
  logger.info('');
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('   Configure Publish Targets');
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('');

  // Step 1: List existing registries
  if (options.listExisting !== false) {
    listExistingRegistries(tree);
  }

  // Step 2: Configure registries (multiple types)
  const existingRegistries = getConfiguredRegistries(tree);
  const registryTypes = await selectRegistriesToConfigure(
    options,
    existingRegistries
  );

  if (registryTypes.length > 0) {
    await configureRegistries(tree, options, registryTypes);
  } else {
    if (existingRegistries.length === 0) {
      logger.error('❌ No registries configured!');
      logger.info('');
      logger.info(
        'You must configure at least one registry before adding publish targets.'
      );
      logger.info('Please run this generator again and select registries to configure.');
      logger.info('');
      return;
    }

    logger.info('ℹ️  No registries selected for configuration');
    logger.info('   Proceeding with existing registry configuration');
    logger.info('');
  }

  // Step 3: Project Selection
  const selectedProjects = await selectProjects(tree, options);

  if (selectedProjects.length === 0) {
    logger.warn('⚠️  No projects selected for publish configuration');
    return;
  }

  // Step 4: Get configured registries to offer as choices
  const configuredRegistries = getConfiguredRegistries(tree);

  // Step 5: Configure each project with registry selection
  await configureProjectsWithRegistries(
    tree,
    selectedProjects,
    configuredRegistries,
    options
  );

  await formatFiles(tree);

  logger.info('');
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('   ✅ Publish Configuration Complete!');
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('');
  logger.info(`Configured ${selectedProjects.length} project(s) for publishing`);
  logger.info('');
  logger.info('Next steps:');
  logger.info('  1. Set environment variables for authentication:');
  if (configuredRegistries.includes('npm')) {
    logger.info('     - NPM_TOKEN for npm registry');
  }
  if (configuredRegistries.includes('nexus')) {
    logger.info('     - NEXUS_USERNAME and NEXUS_PASSWORD for Nexus');
  }
  if (configuredRegistries.includes('s3')) {
    logger.info(
      '     - AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY for S3 (or use IAM roles)'
    );
  }
  logger.info('  2. Test publish with dry run:');
  logger.info(`     nx run ${selectedProjects[0]}:publish --dryRun`);
  logger.info('');
}

/**
 * List existing registry configurations
 */
function listExistingRegistries(tree: Tree): void {
  const nxJson = readNxJson(tree);
  const registries = (nxJson as any)?.projectRelease?.registries || {};

  const configuredTypes = Object.keys(registries);

  if (configuredTypes.length === 0) {
    logger.info('📋 No registries configured yet');
    logger.info('');
    return;
  }

  logger.info('📋 Existing Registry Configurations:');
  logger.info('');

  for (const type of configuredTypes) {
    const config = registries[type];
    logger.info(`   ${type.toUpperCase()}:`);

    if (type === 'npm') {
      logger.info(`      Registry: ${config.registry || 'default'}`);
      logger.info(`      Dist Tag: ${config.distTag || 'latest'}`);
      logger.info(`      Access: ${config.access || 'public'}`);
    } else if (type === 'nexus') {
      logger.info(`      URL: ${config.nexusUrl}`);
      logger.info(`      Repository: ${config.nexusRepository}`);
      logger.info(`      Path Strategy: ${config.pathStrategy || 'version'}`);
    } else if (type === 's3') {
      logger.info(`      Bucket: ${config.s3Bucket}`);
      logger.info(`      Prefix: ${config.s3Prefix || '(none)'}`);
      logger.info(`      Region: ${config.s3Region}`);
      logger.info(`      Path Strategy: ${config.pathStrategy || 'version'}`);
    } else if (type === 'custom') {
      logger.info(`      URL: ${config.registryUrl}`);
    }
    logger.info('');
  }
}

/**
 * Get list of configured registry types
 */
function getConfiguredRegistries(tree: Tree): string[] {
  const nxJson = readNxJson(tree);
  const registries = (nxJson as any)?.projectRelease?.registries || {};
  return Object.keys(registries);
}

/**
 * Select which registries to configure
 */
async function selectRegistriesToConfigure(
  options: ConfigurePublishSchema,
  existingRegistries: string[]
): Promise<Array<'npm' | 'nexus' | 's3' | 'custom'>> {
  if (options.configureRegistries && options.configureRegistries.length > 0) {
    return options.configureRegistries;
  }

  if (options.interactive === false) {
    return [];
  }

  const hintMessage =
    existingRegistries.length > 0
      ? 'Space to select, Enter to confirm (or skip to keep existing)'
      : 'Space to select, Enter to confirm (at least one required)';

  const { selectedRegistries } = await prompt<{
    selectedRegistries: Array<'npm' | 'nexus' | 's3' | 'custom'>;
  }>({
    type: 'multiselect',
    name: 'selectedRegistries',
    message: 'Which registries do you want to configure?',
    choices: [
      { name: 'npm', message: 'NPM Registry' },
      { name: 'nexus', message: 'Nexus Repository' },
      { name: 's3', message: 'AWS S3' },
      { name: 'custom', message: 'Custom Registry' },
    ],
    // @ts-expect-error - enquirer types are incomplete
    hint: hintMessage,
  });

  return selectedRegistries;
}

/**
 * Configure multiple registries
 */
async function configureRegistries(
  tree: Tree,
  options: ConfigurePublishSchema,
  registryTypes: Array<'npm' | 'nexus' | 's3' | 'custom'>
): Promise<void> {
  logger.info('');
  logger.info('⚙️  Registry Configuration');
  logger.info('   (Stored in nx.json for reuse across projects)');
  logger.info('');

  const nxJson = readNxJson(tree);
  if (!nxJson) {
    throw new Error('Could not read nx.json');
  }

  const nxJsonAny = nxJson as any;
  if (!nxJsonAny.projectRelease) {
    nxJsonAny.projectRelease = {};
  }
  if (!nxJsonAny.projectRelease.registries) {
    nxJsonAny.projectRelease.registries = {};
  }

  // Configure each selected registry type
  for (const type of registryTypes) {
    const existingConfig = nxJsonAny.projectRelease.registries?.[type];
    const action = existingConfig ? 'Updating' : 'Configuring';

    logger.info(`${action} ${type.toUpperCase()} registry...`);
    if (existingConfig) {
      logger.info(`   (Current configuration will be used as defaults)`);
    }

    if (type === 'npm') {
      nxJsonAny.projectRelease.registries.npm = await promptNpmConfig(
        options,
        existingConfig
      );
    } else if (type === 'nexus') {
      nxJsonAny.projectRelease.registries.nexus = await promptNexusConfig(
        options,
        existingConfig
      );
    } else if (type === 's3') {
      nxJsonAny.projectRelease.registries.s3 = await promptS3Config(
        options,
        existingConfig
      );
    } else if (type === 'custom') {
      nxJsonAny.projectRelease.registries.custom = await promptCustomConfig(
        options,
        existingConfig
      );
    }

    const verb = existingConfig ? 'updated' : 'configured';
    logger.info(`   ✅ ${type.toUpperCase()} ${verb}`);
    logger.info('');
  }

  updateNxJson(tree, nxJson);

  logger.info('✅ Updated nx.json with registry configurations');
  logger.info('');
}

async function promptNpmConfig(
  options: ConfigurePublishSchema,
  existingConfig?: NpmRegistryConfig
): Promise<NpmRegistryConfig> {
  const config: NpmRegistryConfig = {};

  if (options.interactive !== false) {
    const answers = await prompt<{
      registry: string;
      distTag: string;
      access: string;
    }>([
      {
        type: 'input',
        name: 'registry',
        message: '   NPM registry URL:',
        initial:
          existingConfig?.registry ||
          options.npmRegistry ||
          'https://registry.npmjs.org',
      },
      {
        type: 'input',
        name: 'distTag',
        message: '   Distribution tag:',
        initial: existingConfig?.distTag || options.npmDistTag || 'latest',
      },
      {
        type: 'select',
        name: 'access',
        message: '   Package access:',
        choices: [
          { name: 'public', message: 'Public' },
          { name: 'restricted', message: 'Restricted' },
        ],
        initial:
          existingConfig?.access === 'restricted' ||
          options.npmAccess === 'restricted'
            ? 1
            : 0,
      },
    ]);

    config.registry = answers.registry;
    config.distTag = answers.distTag;
    config.access = answers.access as 'public' | 'restricted';
  } else {
    config.registry =
      options.npmRegistry ||
      existingConfig?.registry ||
      'https://registry.npmjs.org';
    config.distTag = options.npmDistTag || existingConfig?.distTag || 'latest';
    config.access =
      options.npmAccess || existingConfig?.access || 'public';
  }

  return config;
}

async function promptNexusConfig(
  options: ConfigurePublishSchema,
  existingConfig?: NexusRegistryConfig
): Promise<NexusRegistryConfig> {
  const config: NexusRegistryConfig = {};

  if (options.interactive !== false) {
    const pathStrategyChoices = [
      { name: 'version', message: 'Version (bucket/1.2.3/artifact.zip)' },
      { name: 'flat', message: 'Flat (bucket/artifact.zip)' },
      { name: 'hash', message: 'Hash (bucket/a1b2c3d/artifact.zip)' },
      {
        name: 'semver',
        message: 'Semver (bucket/v1/1.2/1.2.3/artifact.zip)',
      },
    ];

    const answers = await prompt<{
      nexusUrl: string;
      nexusRepository: string;
      pathStrategy: string;
    }>([
      {
        type: 'input',
        name: 'nexusUrl',
        message: '   Nexus URL:',
        initial: existingConfig?.nexusUrl || options.nexusUrl || '',
        validate: (value: string) => (value ? true : 'Nexus URL is required'),
      },
      {
        type: 'input',
        name: 'nexusRepository',
        message: '   Nexus repository name:',
        initial:
          existingConfig?.nexusRepository ||
          options.nexusRepository ||
          'raw-releases',
      },
      {
        type: 'select',
        name: 'pathStrategy',
        message: '   Path strategy:',
        choices: pathStrategyChoices,
        initial: existingConfig?.pathStrategy
          ? Math.max(
              0,
              pathStrategyChoices.findIndex(
                (c) => c.name === existingConfig.pathStrategy
              )
            )
          : 0,
      },
    ]);

    config.nexusUrl = answers.nexusUrl;
    config.nexusRepository = answers.nexusRepository;
    config.pathStrategy = answers.pathStrategy as any;
  } else {
    if (!options.nexusUrl && !existingConfig?.nexusUrl) {
      throw new Error('nexusUrl is required for nexus registry type');
    }
    config.nexusUrl = options.nexusUrl || existingConfig?.nexusUrl || '';
    config.nexusRepository =
      options.nexusRepository ||
      existingConfig?.nexusRepository ||
      'raw-releases';
    config.pathStrategy =
      options.nexusPathStrategy || existingConfig?.pathStrategy || 'version';
  }

  return config;
}

async function promptS3Config(
  options: ConfigurePublishSchema,
  existingConfig?: S3RegistryConfig
): Promise<S3RegistryConfig> {
  const config: S3RegistryConfig = {};

  if (options.interactive !== false) {
    const pathStrategyChoices = [
      { name: 'version', message: 'Version (bucket/1.2.3/artifact.zip)' },
      { name: 'flat', message: 'Flat (bucket/artifact.zip)' },
      { name: 'hash', message: 'Hash (bucket/a1b2c3d/artifact.zip)' },
      {
        name: 'semver',
        message: 'Semver (bucket/v1/1.2/1.2.3/artifact.zip)',
      },
    ];

    const answers = await prompt<{
      s3Bucket: string;
      s3Prefix: string;
      s3Region: string;
      pathStrategy: string;
    }>([
      {
        type: 'input',
        name: 's3Bucket',
        message: '   S3 bucket name:',
        initial: existingConfig?.s3Bucket || options.s3Bucket || '',
        validate: (value: string) => (value ? true : 'S3 bucket is required'),
      },
      {
        type: 'input',
        name: 's3Prefix',
        message: '   S3 key prefix (optional):',
        initial:
          existingConfig?.s3Prefix || options.s3Prefix || 'artifacts/',
      },
      {
        type: 'input',
        name: 's3Region',
        message: '   AWS region:',
        initial: existingConfig?.s3Region || options.s3Region || 'us-east-1',
      },
      {
        type: 'select',
        name: 'pathStrategy',
        message: '   Path strategy:',
        choices: pathStrategyChoices,
        initial: existingConfig?.pathStrategy
          ? Math.max(
              0,
              pathStrategyChoices.findIndex(
                (c) => c.name === existingConfig.pathStrategy
              )
            )
          : 0,
      },
    ]);

    config.s3Bucket = answers.s3Bucket;
    config.s3Prefix = answers.s3Prefix;
    config.s3Region = answers.s3Region;
    config.pathStrategy = answers.pathStrategy as any;
  } else {
    if (!options.s3Bucket && !existingConfig?.s3Bucket) {
      throw new Error('s3Bucket is required for s3 registry type');
    }
    config.s3Bucket = options.s3Bucket || existingConfig?.s3Bucket || '';
    config.s3Prefix =
      options.s3Prefix || existingConfig?.s3Prefix || 'artifacts/';
    config.s3Region = options.s3Region || existingConfig?.s3Region || 'us-east-1';
    config.pathStrategy =
      options.s3PathStrategy || existingConfig?.pathStrategy || 'version';
  }

  return config;
}

async function promptCustomConfig(
  options: ConfigurePublishSchema,
  existingConfig?: CustomRegistryConfig
): Promise<CustomRegistryConfig> {
  const config: CustomRegistryConfig = {};

  if (options.interactive !== false) {
    const answers = await prompt<{ registryUrl: string }>([
      {
        type: 'input',
        name: 'registryUrl',
        message: '   Custom registry URL:',
        initial:
          existingConfig?.registryUrl || options.customRegistryUrl || '',
        validate: (value: string) =>
          value ? true : 'Registry URL is required',
      },
    ]);

    config.registryUrl = answers.registryUrl;
  } else {
    if (!options.customRegistryUrl && !existingConfig?.registryUrl) {
      throw new Error('customRegistryUrl is required for custom registry type');
    }
    config.registryUrl =
      options.customRegistryUrl || existingConfig?.registryUrl || '';
  }

  return config;
}

/**
 * Select projects to configure
 */
async function selectProjects(
  tree: Tree,
  options: ConfigurePublishSchema
): Promise<string[]> {
  logger.info('📦 Select Projects for Publish');
  logger.info('');

  const allProjects = Array.from(getProjects(tree).keys());

  // If projects provided via CLI
  if (options.projects && options.projects.length > 0) {
    return filterExistingTargets(tree, options.projects, options.skipExisting);
  }

  if (options.project) {
    return filterExistingTargets(tree, [options.project], options.skipExisting);
  }

  // Interactive multi-select
  const { selectedProjects } = await prompt<{ selectedProjects: string[] }>({
    type: 'multiselect',
    name: 'selectedProjects',
    message: 'Select projects to add publish target:',
    choices: allProjects,
    // @ts-expect-error - enquirer types are incomplete
    hint: 'Space to select, Enter to confirm',
  });

  return filterExistingTargets(tree, selectedProjects, options.skipExisting);
}

/**
 * Filter out projects that already have publish targets
 */
function filterExistingTargets(
  tree: Tree,
  projects: string[],
  skipExisting?: boolean
): string[] {
  if (skipExisting === false) {
    return projects;
  }

  const filtered: string[] = [];
  const skipped: string[] = [];

  for (const projectName of projects) {
    const projectConfig = readProjectConfiguration(tree, projectName);
    if (projectConfig.targets?.['publish']) {
      skipped.push(projectName);
    } else {
      filtered.push(projectName);
    }
  }

  if (skipped.length > 0) {
    logger.info(
      `ℹ️  Skipped ${skipped.length} project(s) with existing publish targets:`
    );
    for (const projectName of skipped) {
      logger.info(`   - ${projectName}`);
    }
    logger.info('');
  }

  return filtered;
}

/**
 * Configure projects with registry selection
 */
async function configureProjectsWithRegistries(
  tree: Tree,
  projects: string[],
  availableRegistries: string[],
  options: ConfigurePublishSchema
): Promise<void> {
  logger.info('⚙️  Per-Project Configuration');
  logger.info('');

  // If only one registry is available, use it for all
  if (availableRegistries.length === 1) {
    const registry = availableRegistries[0];
    logger.info(`Using ${registry.toUpperCase()} registry for all projects`);
    logger.info('');

    for (const projectName of projects) {
      configureProjectPublish(tree, projectName, registry, options);
    }
    return;
  }

  // Multiple registries available - ask user preference
  let useSameForAll = false;
  let selectedRegistry = availableRegistries[0];

  // In non-interactive mode, use first registry for all
  if (options.interactive === false) {
    logger.info(
      `ℹ️  Non-interactive mode: Using ${selectedRegistry.toUpperCase()} registry for all projects`
    );
    logger.info('');
  }

  if (options.interactive !== false) {
    const { sameForAll } = await prompt<{ sameForAll: boolean }>({
      type: 'confirm',
      name: 'sameForAll',
      message: 'Use the same registry for all projects?',
      initial: true,
    });
    useSameForAll = sameForAll;

    if (useSameForAll) {
      const { registry } = await prompt<{ registry: string }>({
        type: 'select',
        name: 'registry',
        message: 'Which registry?',
        choices: availableRegistries.map((r) => ({
          name: r,
          message: r.toUpperCase(),
        })),
        initial: 0,
      });
      selectedRegistry = registry;

      logger.info('');
      logger.info(`Using ${selectedRegistry.toUpperCase()} for all projects`);
      logger.info('');
    } else {
      logger.info('');
      logger.info('Configuring registry per project...');
      logger.info('');
    }
  }

  // Configure each project
  for (const projectName of projects) {
    let registryForProject = selectedRegistry;

    // If not using same for all, ask for each project
    if (!useSameForAll && options.interactive !== false) {
      const { registry } = await prompt<{ registry: string }>({
        type: 'select',
        name: 'registry',
        message: `Which registry for ${projectName}?`,
        choices: availableRegistries.map((r) => ({
          name: r,
          message: r.toUpperCase(),
        })),
        initial: 0,
      });
      registryForProject = registry;
    }

    configureProjectPublish(tree, projectName, registryForProject, options);
  }
}

/**
 * Configure publish target for a project
 */
function configureProjectPublish(
  tree: Tree,
  projectName: string,
  registryType: string,
  options: ConfigurePublishSchema
): void {
  const projectConfig = readProjectConfiguration(tree, projectName);

  if (!projectConfig.targets) {
    projectConfig.targets = {};
  }

  // Check if artifact target exists
  const hasArtifactTarget = !!projectConfig.targets['artifact'];

  // Create publish target
  const publishTarget: any = {
    executor: 'nx-project-release:publish',
    options: {
      registryType: registryType,
    },
  };

  // Add artifact dependency if it exists
  if (hasArtifactTarget && options.updateArtifactDependency !== false) {
    publishTarget.dependsOn = ['artifact'];
  }

  projectConfig.targets['publish'] = publishTarget;

  updateProjectConfiguration(tree, projectName, projectConfig);

  logger.info(`✓ ${projectName} → ${registryType.toUpperCase()} registry`);
  if (hasArtifactTarget) {
    logger.info(`  → Depends on artifact target`);
  }
}

// Type definitions
interface NpmRegistryConfig {
  registry?: string;
  distTag?: string;
  access?: 'public' | 'restricted';
}

interface NexusRegistryConfig {
  nexusUrl?: string;
  nexusRepository?: string;
  pathStrategy?: 'flat' | 'version' | 'hash' | 'semver';
}

interface S3RegistryConfig {
  s3Bucket?: string;
  s3Prefix?: string;
  s3Region?: string;
  pathStrategy?: 'flat' | 'version' | 'hash' | 'semver';
}

interface CustomRegistryConfig {
  registryUrl?: string;
}

export { configurePublishGenerator };
