import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '@nx/devkit';
import { calculateChecksum } from './checksum';

export interface S3Config {
  bucket: string;
  prefix?: string; // Optional path prefix (e.g., 'artifacts/')
  region: string;
  pathStrategy: 'version' | 'hash' | 'flat';
  skipExisting?: boolean; // Skip upload if file already exists (default: true)

  // Authentication (optional - if not provided, uses IAM/OIDC from environment)
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string; // For temporary credentials
}

export interface S3UploadResult {
  uploaded: boolean;
  url: string;
  skipped: boolean;
  reason?: string;
}

/**
 * Upload artifact to AWS S3
 * Supports dual authentication:
 * 1. IAM/OIDC (recommended) - No credentials needed, auto-detected from environment
 * 2. Access keys - Explicit credentials provided
 *
 * Path formats:
 * - Version-based: {prefix}/{version}/{filename}
 * - Hash-based: {prefix}/{sha1hash}/{filename}
 * - Flat: {prefix}/{filename}
 *
 * @param artifactPath - Local path to the artifact file
 * @param version - Semantic version (used when pathStrategy is 'version')
 * @param config - S3 configuration
 * @returns Upload result with status and URL
 */
export async function uploadToS3(
  artifactPath: string,
  version: string,
  config: S3Config
): Promise<S3UploadResult> {
  // Validate inputs
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact file not found: ${artifactPath}`);
  }

  if (!config.bucket || !config.region) {
    throw new Error('S3 configuration incomplete. Required: bucket, region');
  }

  // Configure S3 client with dual auth support
  const s3ClientConfig: S3ClientConfig = {
    region: config.region,
  };

  // Explicit credentials (if provided)
  if (config.accessKeyId && config.secretAccessKey) {
    logger.info('🔑 Using explicit AWS credentials');
    s3ClientConfig.credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      ...(config.sessionToken && { sessionToken: config.sessionToken }),
    };
  } else {
    logger.info('🔑 Using IAM/OIDC authentication from environment');
    // SDK will auto-detect IAM role, OIDC, or environment variables
    // This is the recommended approach for CI/CD environments
  }

  const s3Client = new S3Client(s3ClientConfig);

  // Determine S3 key based on path strategy
  const filename = path.basename(artifactPath);
  let key: string;

  switch (config.pathStrategy) {
    case 'version':
      if (!version) {
        throw new Error(
          'Version is required when using version-based path strategy'
        );
      }
      key = `${config.prefix || ''}${version}/${filename}`;
      break;

    case 'hash':
      const sha1Hash = calculateChecksum(artifactPath, 'sha1');
      if (!sha1Hash) {
        throw new Error('Failed to calculate SHA1 hash for artifact');
      }
      key = `${config.prefix || ''}${sha1Hash}/${filename}`;
      break;

    case 'flat':
      key = `${config.prefix || ''}${filename}`;
      break;

    default:
      throw new Error(`Invalid path strategy: ${config.pathStrategy}`);
  }

  const s3Url = `s3://${config.bucket}/${key}`;
  logger.info(`📦 Uploading to S3: ${s3Url}`);

  // Check if file already exists (HEAD request)
  if (config.skipExisting !== false) {
    try {
      await s3Client.send(
        new HeadObjectCommand({
          Bucket: config.bucket,
          Key: key,
        })
      );

      logger.info(`✅ File already exists, skipping upload: ${filename}`);
      return {
        uploaded: false,
        url: s3Url,
        skipped: true,
        reason: 'File already exists in S3',
      };
    } catch (error: any) {
      // NotFound (404) means file doesn't exist, proceed with upload
      if (error.name !== 'NotFound') {
        logger.warn(`⚠️  HEAD request failed: ${error.message}`);
        logger.warn('Proceeding with upload attempt...');
      }
    }
  }

  // Read file and calculate MD5 checksum (required by S3)
  const fileBuffer = fs.readFileSync(artifactPath);
  const md5Checksum = calculateChecksum(artifactPath, 'md5');

  if (!md5Checksum) {
    throw new Error('Failed to calculate MD5 checksum');
  }

  // Convert MD5 hex to base64 (S3 expects base64-encoded MD5)
  const md5Base64 = Buffer.from(md5Checksum, 'hex').toString('base64');

  // Determine content type based on file extension
  const contentType = getContentType(filename);

  // Upload file (PUT request)
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: fileBuffer,
        ContentMD5: md5Base64,
        ContentType: contentType,
        ContentLength: fileBuffer.length,
        Metadata: {
          'original-filename': filename,
          'upload-timestamp': new Date().toISOString(),
          ...(version && { version }),
        },
      })
    );

    logger.info(`✅ Successfully uploaded to S3: ${filename}`);

    return {
      uploaded: true,
      url: s3Url,
      skipped: false,
    };
  } catch (error: any) {
    let errorMessage = `Failed to upload to S3: ${error.message}`;

    if (error.$metadata) {
      errorMessage += `\nHTTP Status: ${error.$metadata.httpStatusCode}`;
      errorMessage += `\nRequest ID: ${error.$metadata.requestId}`;
    }

    if (error.name === 'NoSuchBucket') {
      errorMessage += `\nBucket does not exist: ${config.bucket}`;
    } else if (error.name === 'AccessDenied') {
      errorMessage += '\nAccess denied. Check IAM permissions or credentials.';
    }

    throw new Error(errorMessage);
  }
}

/**
 * Validate S3 configuration before upload
 */
export function validateS3Config(
  config: Partial<S3Config>
): config is S3Config {
  const required = ['bucket', 'region', 'pathStrategy'];
  const missing = required.filter((field) => !config[field as keyof S3Config]);

  if (missing.length > 0) {
    logger.error(`❌ Missing required S3 configuration: ${missing.join(', ')}`);
    return false;
  }

  // Validate path strategy
  if (!['version', 'hash', 'flat'].includes(config.pathStrategy || '')) {
    logger.error(`❌ Invalid path strategy: ${config.pathStrategy}`);
    logger.error('Valid options: version, hash, flat');
    return false;
  }

  return true;
}

/**
 * Determine content type based on file extension
 */
function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();

  const contentTypes: Record<string, string> = {
    '.tgz': 'application/gzip',
    '.tar.gz': 'application/gzip',
    '.tar': 'application/x-tar',
    '.zip': 'application/zip',
    '.gz': 'application/gzip',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.txt': 'text/plain',
  };

  // Check for double extensions like .tar.gz
  if (filename.endsWith('.tar.gz')) {
    return 'application/gzip';
  }

  return contentTypes[ext] || 'application/octet-stream';
}

/**
 * Detect if running in environment with IAM/OIDC support
 * Useful for providing helpful error messages
 */
export function hasIAMSupport(): boolean {
  return !!(
    (
      process.env.AWS_ROLE_ARN || // ECS/Fargate task role
      process.env.AWS_WEB_IDENTITY_TOKEN_FILE || // OIDC (GitHub Actions, etc.)
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || // ECS
      process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI
    ) // ECS/Fargate
  );
}
