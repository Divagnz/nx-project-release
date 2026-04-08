import { ExecutorContext, logger } from '@nx/devkit';
import { ArtifactExecutorSchema } from './schema';
import {
  createWriteStream,
  existsSync,
  statSync,
  writeFileSync,
  unlinkSync,
  readFileSync,
  mkdirSync,
} from 'fs';
import { join } from 'path';
import { glob } from 'glob';
import { execSync } from 'child_process';

export default async function artifactExecutor(
  options: ArtifactExecutorSchema,
  context: ExecutorContext
): Promise<{ success: boolean; artifactPath?: string; artifactSize?: number }> {
  const projectName = context.projectName || '';
  const version = getProjectVersion(projectName, context);
  const hash = getGitShortHash(context.root);
  const timestamp = Date.now().toString();
  const date = new Date().toISOString().split('T')[0];
  const platform = process.platform;
  const arch = process.arch;

  logger.info('');
  logger.info('═══════════════════════════════════════════════════════');
  logger.info(`   Create Artifact: ${projectName}`);
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('');

  // 1. Resolve source directory
  const sourceDir = resolveTemplate(options.sourceDir, {
    projectName,
    version,
  });
  const fullSourcePath = join(context.root, sourceDir);

  if (!existsSync(fullSourcePath)) {
    logger.error(`❌ Source directory not found: ${sourceDir}`);
    logger.info(`   Full path: ${fullSourcePath}`);
    return { success: false };
  }

  logger.info(`📂 Source: ${sourceDir}`);

  // 2. Determine format and extension
  const format = options.format || 'tgz';
  const extension = getExtension(format);

  // 3. Resolve output directory
  const outputDir = resolveTemplate(options.outputDir || 'dist/artifacts', {
    projectName,
    version,
  });
  const fullOutputPath = join(context.root, outputDir);
  mkdirSync(fullOutputPath, { recursive: true });

  // 4. Resolve artifact name
  const artifactName = resolveTemplate(
    options.artifactName || '{projectName}-{version}.{extension}',
    {
      projectName,
      version,
      hash,
      timestamp,
      date,
      platform,
      arch,
      extension,
    }
  );

  const artifactPath = join(fullOutputPath, artifactName);

  logger.info(`📦 Artifact: ${artifactName}`);
  logger.info(`📍 Output: ${outputDir}`);
  logger.info(`🗜️  Format: ${format}`);
  logger.info('');

  // 5. Collect files to include
  try {
    const files = await collectFiles(
      fullSourcePath,
      options.include || ['**/*'],
      options.exclude || []
    );

    logger.info(`📄 Files: ${files.length} items`);
    logger.info('');

    if (files.length === 0) {
      logger.warn('⚠️  No files found matching include/exclude patterns');
      logger.info(
        `   Include patterns: ${JSON.stringify(options.include || ['**/*'])}`
      );
      if (options.exclude && options.exclude.length > 0) {
        logger.info(`   Exclude patterns: ${JSON.stringify(options.exclude)}`);
      }
      return { success: false };
    }

    // 6. Create artifact
    if (options.dryRun) {
      logger.info('🔍 Dry run — no archive will be written to disk');
      logger.info(`   Would create: ${artifactPath}`);
      logger.info(`   Files to include: ${files.length}`);
      return { success: true };
    }

    logger.info('🔨 Creating artifact...');

    switch (format) {
      case 'zip':
        await createZipArchive(fullSourcePath, artifactPath, files, options);
        break;

      case 'tar':
      case 'tgz':
      case 'tar.gz':
        await createTarArchive(
          fullSourcePath,
          artifactPath,
          files,
          options,
          format
        );
        break;

      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    const stats = statSync(artifactPath);
    const size = stats.size;
    const sizeFormatted = formatBytes(size);

    logger.info('');
    logger.info(`✅ Artifact created: ${artifactName}`);
    logger.info(`📊 Size: ${sizeFormatted}`);
    logger.info(`📍 Path: ${artifactPath}`);
    logger.info('');

    return {
      success: true,
      artifactPath: artifactPath,
      artifactSize: size,
    };
  } catch (error) {
    logger.error(`❌ Failed to create artifact: ${(error as Error).message}`);
    if ((error as any).stack) {
      logger.error((error as any).stack);
    }
    return { success: false };
  }
}

async function createZipArchive(
  sourceDir: string,
  outputPath: string,
  files: string[],
  options: ArtifactExecutorSchema
): Promise<void> {
  const { default: archiver } = await import('archiver');

  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: options.compressionLevel || 6 },
    });

    output.on('close', () => resolve());
    output.on('error', (err) => reject(err));
    archive.on('error', (err) => reject(err));

    archive.pipe(output);

    for (const file of files) {
      const filePath = join(sourceDir, file);
      let archivePath = file;

      // Strip prefix if specified
      if (options.stripPrefix && file.startsWith(options.stripPrefix)) {
        archivePath = file.substring(options.stripPrefix.length);
        if (archivePath.startsWith('/')) {
          archivePath = archivePath.substring(1);
        }
      }

      archive.file(filePath, { name: archivePath });
    }

    // Add metadata manifest if specified
    if (options.metadata) {
      const manifest = JSON.stringify(options.metadata, null, 2);
      archive.append(manifest, { name: '.artifact-metadata.json' });
    }

    archive.finalize();
  });
}

async function createTarArchive(
  sourceDir: string,
  outputPath: string,
  files: string[],
  options: ArtifactExecutorSchema,
  format: string
): Promise<void> {
  const tar = await import('tar');
  const gzip = format === 'tgz' || format === 'tar.gz';

  // Prepare files list, applying stripPrefix if needed
  const filesToArchive = files;

  if (options.stripPrefix) {
    logger.warn(
      `⚠️  stripPrefix is not supported for '${format}' format and will be ignored`
    );
  }

  await tar.create(
    {
      file: outputPath,
      cwd: sourceDir,
      gzip: gzip,
      portable: true,
      preservePaths: false,
      ...(options.preservePermissions && { preserveOwner: false }),
    },
    filesToArchive
  );

  // Add metadata if specified (by appending to tar)
  if (options.metadata) {
    const manifestPath = join(sourceDir, '.artifact-metadata.json');
    writeFileSync(manifestPath, JSON.stringify(options.metadata, null, 2));

    try {
      // Append to tar
      await tar.update(
        {
          file: outputPath,
          cwd: sourceDir,
          gzip: gzip,
        },
        ['.artifact-metadata.json']
      );
    } finally {
      // Clean up temp file
      if (existsSync(manifestPath)) {
        unlinkSync(manifestPath);
      }
    }
  }
}

async function collectFiles(
  sourceDir: string,
  include: string[],
  exclude: string[]
): Promise<string[]> {
  const allFiles: Set<string> = new Set();

  // Collect included files
  for (const pattern of include) {
    const matches = await glob(pattern, {
      cwd: sourceDir,
      dot: true,
      nodir: true,
    });
    matches.forEach((f) => allFiles.add(f));
  }

  // Remove excluded files
  for (const pattern of exclude) {
    const matches = await glob(pattern, {
      cwd: sourceDir,
      dot: true,
      nodir: true,
    });
    matches.forEach((f) => allFiles.delete(f));
  }

  return Array.from(allFiles).sort();
}

function resolveTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }

  return result;
}

function getExtension(format: string): string {
  switch (format) {
    case 'zip':
      return 'zip';
    case 'tar':
      return 'tar';
    case 'tgz':
      return 'tgz';
    case 'tar.gz':
      return 'tar.gz';
    default:
      return format;
  }
}

function getProjectVersion(
  projectName: string,
  context: ExecutorContext
): string {
  if (!projectName) {
    return '0.0.0';
  }

  try {
    const project = context.projectGraph?.nodes?.[projectName];
    if (!project) {
      return '0.0.0';
    }
    const projectRoot = project.data.root;

    // Try package.json
    const packageJsonPath = join(context.root, projectRoot, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        if (pkg.version) return pkg.version;
      } catch {
        // Ignore
      }
    }

    // Try project.json
    const projectJsonPath = join(context.root, projectRoot, 'project.json');
    if (existsSync(projectJsonPath)) {
      try {
        const projectJson = JSON.parse(readFileSync(projectJsonPath, 'utf-8'));
        if (projectJson.version) return projectJson.version;
      } catch {
        // Ignore
      }
    }

    return '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function getGitShortHash(workspaceRoot: string): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: workspaceRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
