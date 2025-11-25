import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * Calculate file checksum for integrity verification
 * @param filePath - Absolute path to the file
 * @param algorithm - Hash algorithm to use ('sha1', 'md5', or 'none')
 * @returns Hex-encoded hash string or null if algorithm is 'none'
 */
export function calculateChecksum(
  filePath: string,
  algorithm: 'sha1' | 'md5' | 'none'
): string | null {
  if (algorithm === 'none') {
    return null;
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileBuffer = fs.readFileSync(filePath);
  const hash = crypto.createHash(algorithm);
  hash.update(fileBuffer);
  return hash.digest('hex');
}

/**
 * Calculate multiple checksums at once
 * Useful for registries that require multiple hash types
 */
export function calculateChecksums(
  filePath: string,
  algorithms: Array<'sha1' | 'md5'>
): Record<string, string> {
  const checksums: Record<string, string> = {};

  for (const algorithm of algorithms) {
    const hash = calculateChecksum(filePath, algorithm);
    if (hash) {
      checksums[algorithm] = hash;
    }
  }

  return checksums;
}
