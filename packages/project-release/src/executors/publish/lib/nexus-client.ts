import * as fs from 'fs';
import * as path from 'path';
import axios, { AxiosError } from 'axios';
import { logger } from '@nx/devkit';
import { calculateChecksum } from './checksum';

export interface NexusConfig {
  url: string;
  repository: string;
  username: string;
  password: string;
  pathStrategy: 'version' | 'hash';
  skipExisting?: boolean; // Skip upload if file already exists (default: true)
}

export interface NexusUploadResult {
  uploaded: boolean;
  url: string;
  skipped: boolean;
  reason?: string;
}

/**
 * Upload artifact to Nexus Repository Manager (raw repository)
 * Converted from Go implementation to TypeScript
 *
 * Path formats:
 * - Version-based: {url}/repository/{repo}/{version}/{filename}
 * - Hash-based: {url}/repository/{repo}/{sha1hash}/{filename}
 *
 * @param artifactPath - Local path to the artifact file
 * @param version - Semantic version (used when pathStrategy is 'version')
 * @param config - Nexus configuration
 * @returns Upload result with status and URL
 */
export async function uploadToNexus(
  artifactPath: string,
  version: string,
  config: NexusConfig
): Promise<NexusUploadResult> {
  // Validate inputs
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact file not found: ${artifactPath}`);
  }

  if (!config.url || !config.repository || !config.username || !config.password) {
    throw new Error('Nexus configuration incomplete. Required: url, repository, username, password');
  }

  // Determine path segment based on strategy
  const filename = path.basename(artifactPath);
  let pathSegment: string;

  if (config.pathStrategy === 'version') {
    if (!version) {
      throw new Error('Version is required when using version-based path strategy');
    }
    pathSegment = version;
  } else {
    // Hash-based path
    const sha1Hash = calculateChecksum(artifactPath, 'sha1');
    if (!sha1Hash) {
      throw new Error('Failed to calculate SHA1 hash for artifact');
    }
    pathSegment = sha1Hash;
  }

  // Construct upload URL
  const uploadUrl = `${config.url.replace(/\/$/, '')}/repository/${config.repository}/${pathSegment}/${filename}`;

  logger.info(`📦 Uploading to Nexus: ${uploadUrl}`);

  // Check if file already exists (HTTP HEAD request)
  if (config.skipExisting !== false) {
    try {
      await axios.head(uploadUrl, {
        auth: {
          username: config.username,
          password: config.password
        },
        timeout: 10000
      });

      logger.info(`✅ File already exists, skipping upload: ${filename}`);
      return {
        uploaded: false,
        url: uploadUrl,
        skipped: true,
        reason: 'File already exists in repository'
      };
    } catch (error) {
      const axiosError = error as AxiosError;

      // 404 means file doesn't exist, proceed with upload
      if (axiosError.response?.status !== 404) {
        // Other errors (401, 403, 500, etc.)
        logger.warn(`⚠️  HEAD request failed: ${axiosError.message}`);
        logger.warn('Proceeding with upload attempt...');
      }
    }
  }

  // Read file and calculate checksum
  const fileBuffer = fs.readFileSync(artifactPath);
  const sha1Checksum = calculateChecksum(artifactPath, 'sha1');

  if (!sha1Checksum) {
    throw new Error('Failed to calculate SHA1 checksum');
  }

  // Upload file (HTTP PUT request)
  try {
    await axios.put(uploadUrl, fileBuffer, {
      auth: {
        username: config.username,
        password: config.password
      },
      headers: {
        'Content-Type': 'application/gzip',
        'X-Checksum-Sha1': sha1Checksum,
        'Content-Length': fileBuffer.length.toString()
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 60000 // 60 second timeout for large files
    });

    logger.info(`✅ Successfully uploaded to Nexus: ${filename}`);
    return {
      uploaded: true,
      url: uploadUrl,
      skipped: false
    };
  } catch (error) {
    const axiosError = error as AxiosError;

    let errorMessage = `Failed to upload to Nexus: ${axiosError.message}`;

    if (axiosError.response) {
      errorMessage += `\nStatus: ${axiosError.response.status}`;
      errorMessage += `\nResponse: ${JSON.stringify(axiosError.response.data)}`;
    }

    throw new Error(errorMessage);
  }
}

/**
 * Validate Nexus configuration before upload
 */
export function validateNexusConfig(config: Partial<NexusConfig>): config is NexusConfig {
  const required = ['url', 'repository', 'username', 'password', 'pathStrategy'];
  const missing = required.filter(field => !config[field as keyof NexusConfig]);

  if (missing.length > 0) {
    logger.error(`❌ Missing required Nexus configuration: ${missing.join(', ')}`);
    return false;
  }

  return true;
}
