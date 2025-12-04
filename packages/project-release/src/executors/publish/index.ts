import {
  PromiseExecutor,
  logger,
  ExecutorContext,
  runExecutor as nxRunExecutor,
} from '@nx/devkit';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { uploadToNexus, validateNexusConfig } from './lib/nexus-client';
import { uploadToS3, validateS3Config } from './lib/s3-client';

export interface PublishExecutorSchema {
  // NEW: Artifact path input
  artifactPath?: string;
  releaseGroup?: string;

  dryRun?: boolean;
  registry?: string;
  registryType?: 'npm' | 'nexus' | 's3' | 'custom';
  distTag?: string;
  access?: 'public' | 'restricted';
  buildTarget?: string;
  publishDir?: string;
  skipBuild?: boolean;
  otp?: string;

  // Multi-registry support
  pathStrategy?: 'flat' | 'version' | 'hash' | 'semver';
  skipExisting?: boolean;

  // Nexus options
  nexusUrl?: string;
  nexusRepository?: string;
  nexusUsername?: string;
  nexusPassword?: string;

  // S3 options
  s3Bucket?: string;
  s3Prefix?: string;
  s3Region?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsSessionToken?: string;

  // NPM advanced
  npmScope?: string;
}

interface NxReleaseConfig {
  defaultRegistry?: {
    type?: string;
    url?: string;
    access?: string;
    distTag?: string;
  };
  projectConfigs?: Record<
    string,
    {
      registry?: {
        type?: string;
        url?: string;
        access?: string;
        distTag?: string;
      };
      buildTarget?: string;
      publishDir?: string;
    }
  >;
}

function getNxReleaseConfig(context: ExecutorContext): NxReleaseConfig {
  const nxJsonPath = path.join(context.root, 'nx.json');
  if (!fs.existsSync(nxJsonPath)) {
    return {};
  }

  try {
    const nxJson = JSON.parse(fs.readFileSync(nxJsonPath, 'utf8'));
    return (nxJson?.projectRelease as NxReleaseConfig) || {};
  } catch {
    return {};
  }
}

function mergeConfigWithNxJson(
  options: PublishExecutorSchema,
  context: ExecutorContext,
  projectName?: string
): PublishExecutorSchema {
  const nxConfig = getNxReleaseConfig(context);
  const nxProjectConfig = projectName
    ? nxConfig.projectConfigs?.[projectName]
    : undefined;

  let projectJsonConfig: Record<string, unknown> = {};
  if (projectName && context.projectsConfigurations?.projects[projectName]) {
    const projectRoot =
      context.projectsConfigurations.projects[projectName].root;
    const projectJsonPath = path.join(
      context.root,
      projectRoot,
      'project.json'
    );

    try {
      if (fs.existsSync(projectJsonPath)) {
        const projectJson = JSON.parse(
          fs.readFileSync(projectJsonPath, 'utf8')
        );
        projectJsonConfig = projectJson.targets?.['publish']?.options || {};
      }
    } catch {
      // Ignore project.json read errors
    }
  }

  const merged = { ...options };

  // Registry settings (priority: options > project.json > nx project config > nx global config)
  if (!merged.registry || !merged.registryType) {
    const registry = nxProjectConfig?.registry || nxConfig.defaultRegistry;
    if (registry) {
      merged.registry = merged.registry || registry.url;
      merged.registryType = (merged.registryType || registry.type) as
        | 'npm'
        | 'nexus'
        | 'custom';
      merged.access = (merged.access || registry.access) as
        | 'public'
        | 'restricted';
      merged.distTag = merged.distTag || registry.distTag;
    }
  }

  // Build target
  if (!merged.buildTarget) {
    merged.buildTarget =
      (projectJsonConfig.buildTarget as string) ||
      nxProjectConfig?.buildTarget ||
      'build';
  }

  // Publish directory
  if (!merged.publishDir) {
    merged.publishDir =
      (projectJsonConfig.publishDir as string) ||
      nxProjectConfig?.publishDir ||
      `dist/${context.projectName}`;
  }

  return merged;
}

const runExecutor: PromiseExecutor<PublishExecutorSchema> = async (
  options,
  context: ExecutorContext
) => {
  const mergedOptions = mergeConfigWithNxJson(
    options,
    context,
    context.projectName
  );

  logger.info(`📦 Publishing ${context.projectName}`);

  try {
    // Run build target if specified and not skipped
    if (mergedOptions.buildTarget && !mergedOptions.skipBuild) {
      logger.info(
        `🔨 Building project with target: ${mergedOptions.buildTarget}`
      );

      try {
        await nxRunExecutor(
          { project: context.projectName, target: mergedOptions.buildTarget },
          {},
          context
        );
        logger.info('✅ Build completed successfully');
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new Error(`Build failed: ${errorMessage}`);
      }
    }

    // Publish package
    await publishPackage(mergedOptions, context);

    logger.info(`✅ Successfully published ${context.projectName}`);
    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Publish failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
};

async function publishPackage(
  options: PublishExecutorSchema,
  context: ExecutorContext
): Promise<void> {
  const registryType = options.registryType || 'npm';
  const registry = options.registry;
  const distTag = options.distTag || 'latest';
  const access = options.access || 'public';
  const publishDir = options.publishDir || `dist/${context.projectName}`;

  const fullPublishDir = path.join(context.root, publishDir);

  if (!fs.existsSync(fullPublishDir)) {
    throw new Error(`Publish directory does not exist: ${fullPublishDir}`);
  }

  // Update package.json version if it exists in publish directory
  const publishPackageJsonPath = path.join(fullPublishDir, 'package.json');
  if (fs.existsSync(publishPackageJsonPath)) {
    const publishPackageJson = JSON.parse(
      fs.readFileSync(publishPackageJsonPath, 'utf8')
    );

    // Try to get version from source project
    const currentVersion = await getCurrentVersion(context);
    if (currentVersion) {
      publishPackageJson.version = currentVersion;
      fs.writeFileSync(
        publishPackageJsonPath,
        JSON.stringify(publishPackageJson, null, 2)
      );
      logger.info(
        `Updated package.json version to ${currentVersion} in ${publishDir}`
      );
    }
  }

  if (options.dryRun) {
    logger.info(
      `Would publish to ${registryType} registry: ${registry || 'default'}`
    );
    logger.info(`Publish directory: ${publishDir}`);
    logger.info(`Distribution tag: ${distTag}`);
    logger.info(`Access: ${access}`);
    return;
  }

  logger.info(`Publishing to ${registryType} registry...`);

  // Get current version for artifact uploads
  const currentVersion = await getCurrentVersion(context);

  switch (registryType) {
    case 'npm':
      await publishToNpm(
        fullPublishDir,
        registry,
        distTag,
        access,
        options.otp,
        options.npmScope
      );
      break;

    case 'nexus':
      if (!currentVersion) {
        throw new Error(
          'Version is required for Nexus publishing. Ensure version is set in project.json or package.json'
        );
      }
      await publishToNexusRegistry(fullPublishDir, currentVersion, options);
      break;

    case 's3':
      if (!currentVersion) {
        throw new Error(
          'Version is required for S3 publishing. Ensure version is set in project.json or package.json'
        );
      }
      await publishToS3Registry(fullPublishDir, currentVersion, options);
      break;

    case 'custom':
      if (!registry)
        throw new Error(
          'Registry URL is required for custom registry publishing'
        );
      await publishToCustomRegistry(
        fullPublishDir,
        registry,
        distTag,
        access,
        options.otp
      );
      break;

    default:
      throw new Error(`Unsupported registry type: ${registryType}`);
  }
}

async function publishToNpm(
  publishDir: string,
  registry?: string,
  distTag = 'latest',
  access = 'public',
  otp?: string,
  npmScope?: string
): Promise<void> {
  const publishCmd = ['npm', 'publish'];

  if (registry) {
    publishCmd.push('--registry', registry);
  }
  publishCmd.push('--tag', distTag);
  publishCmd.push('--access', access);

  if (otp) {
    publishCmd.push('--otp', otp);
  }

  // Advanced: override scope if provided
  if (npmScope) {
    logger.info(`Using custom NPM scope: ${npmScope}`);
    const packageJsonPath = path.join(publishDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const baseName = packageJson.name.replace(/^@[^/]+\//, '');
      packageJson.name = `${npmScope}/${baseName}`;
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      logger.info(`Updated package name to: ${packageJson.name}`);
    }
  }

  logger.info(`Running: ${publishCmd.join(' ')} (in ${publishDir})`);
  execSync(publishCmd.join(' '), { cwd: publishDir, stdio: 'inherit' });
}

async function publishToNexusRegistry(
  publishDir: string,
  version: string,
  options: PublishExecutorSchema
): Promise<void> {
  // Find artifact file (*.tgz, *.tar.gz, *.zip)
  const artifactPath = findArtifact(publishDir);
  if (!artifactPath) {
    throw new Error(
      `No artifact found in ${publishDir}. Expected *.tgz, *.tar.gz, or *.zip file`
    );
  }

  // Build Nexus config from options and environment variables
  const nexusConfig = {
    url: options.nexusUrl || process.env.NEXUS_URL || '',
    repository: options.nexusRepository || process.env.NEXUS_REPOSITORY || '',
    username: options.nexusUsername || process.env.NEXUS_USERNAME || '',
    password: options.nexusPassword || process.env.NEXUS_PASSWORD || '',
    pathStrategy: (options.pathStrategy || 'version') as 'version' | 'hash',
    skipExisting: options.skipExisting !== false,
  };

  if (!validateNexusConfig(nexusConfig)) {
    throw new Error(
      'Invalid Nexus configuration. Check required fields: url, repository, username, password'
    );
  }

  logger.info(
    `📦 Publishing to Nexus: ${nexusConfig.url}/repository/${nexusConfig.repository}`
  );
  logger.info(`   Path strategy: ${nexusConfig.pathStrategy}`);

  const result = await uploadToNexus(artifactPath, version, nexusConfig);

  if (result.skipped) {
    logger.info(`⏭️  ${result.reason}`);
  } else {
    logger.info(`✅ Published to: ${result.url}`);
  }
}

async function publishToS3Registry(
  publishDir: string,
  version: string,
  options: PublishExecutorSchema
): Promise<void> {
  // Find artifact file
  const artifactPath = findArtifact(publishDir);
  if (!artifactPath) {
    throw new Error(
      `No artifact found in ${publishDir}. Expected *.tgz, *.tar.gz, or *.zip file`
    );
  }

  // Build S3 config from options and environment variables
  const s3Config = {
    bucket: options.s3Bucket || process.env.S3_BUCKET || '',
    prefix: options.s3Prefix || process.env.S3_PREFIX,
    region: options.s3Region || process.env.AWS_REGION || '',
    pathStrategy: (options.pathStrategy || 'version') as
      | 'version'
      | 'hash'
      | 'flat',
    skipExisting: options.skipExisting !== false,
    accessKeyId: options.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey:
      options.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: options.awsSessionToken || process.env.AWS_SESSION_TOKEN,
  };

  if (!validateS3Config(s3Config)) {
    throw new Error(
      'Invalid S3 configuration. Check required fields: bucket, region'
    );
  }

  logger.info(
    `📦 Publishing to S3: s3://${s3Config.bucket}/${s3Config.prefix || ''}`
  );
  logger.info(`   Path strategy: ${s3Config.pathStrategy}`);

  const result = await uploadToS3(artifactPath, version, s3Config);

  if (result.skipped) {
    logger.info(`⏭️  ${result.reason}`);
  } else {
    logger.info(`✅ Published to: ${result.url}`);
  }
}

async function publishToCustomRegistry(
  publishDir: string,
  registry?: string,
  distTag = 'latest',
  access = 'public',
  otp?: string
): Promise<void> {
  const publishCmd = [
    'npm',
    'publish',
    '--registry',
    registry,
    '--tag',
    distTag,
    '--access',
    access,
  ];

  if (otp) {
    publishCmd.push('--otp', otp);
  }

  logger.info(`Running: ${publishCmd.join(' ')} (in ${publishDir})`);
  execSync(publishCmd.join(' '), { cwd: publishDir, stdio: 'inherit' });
}

async function getCurrentVersion(
  context: ExecutorContext
): Promise<string | null> {
  if (
    !context.projectName ||
    !context.projectsConfigurations?.projects[context.projectName]
  ) {
    return null;
  }

  const projectRoot =
    context.projectsConfigurations.projects[context.projectName].root;

  // Try project.json first
  try {
    const projectJsonPath = path.join(
      context.root,
      projectRoot,
      'project.json'
    );
    if (fs.existsSync(projectJsonPath)) {
      const projectJson = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
      if (projectJson.version) {
        return projectJson.version;
      }
    }
  } catch {
    // Ignore errors
  }

  // Try package.json
  try {
    const packageJsonPath = path.join(
      context.root,
      projectRoot,
      'package.json'
    );
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.version) {
        return packageJson.version;
      }
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/**
 * Find artifact file in publish directory
 * Looks for common archive formats: .tgz, .tar.gz, .zip
 */
function findArtifact(publishDir: string): string | null {
  const extensions = ['.tgz', '.tar.gz', '.zip'];

  const files = fs.readdirSync(publishDir);

  for (const ext of extensions) {
    const artifact = files.find((file) => file.endsWith(ext));
    if (artifact) {
      return path.join(publishDir, artifact);
    }
  }

  return null;
}

export default runExecutor;
