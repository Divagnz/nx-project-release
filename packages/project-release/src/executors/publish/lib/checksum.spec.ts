import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { calculateChecksum, calculateChecksums } from './checksum.js';

describe('Checksum Utilities', () => {
  let tempDir: string;
  let testFilePath: string;
  const testContent = 'Hello, World! This is a test file for checksum calculation.';

  beforeEach(() => {
    // Create a temporary directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checksum-test-'));
    testFilePath = path.join(tempDir, 'test-file.txt');

    // Write test content to file
    fs.writeFileSync(testFilePath, testContent, 'utf8');
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('calculateChecksum()', () => {
    describe('SHA1 algorithm', () => {
      it('should calculate SHA1 checksum for a valid file', () => {
        const checksum = calculateChecksum(testFilePath, 'sha1');
        expect(checksum).toBeDefined();
        expect(checksum).not.toBeNull();
        expect(typeof checksum).toBe('string');
        expect(checksum).toHaveLength(40); // SHA1 produces 40-character hex string
        expect(checksum).toMatch(/^[a-f0-9]{40}$/); // Should be valid hex
      });

      it('should produce consistent SHA1 checksums for same content', () => {
        const checksum1 = calculateChecksum(testFilePath, 'sha1');
        const checksum2 = calculateChecksum(testFilePath, 'sha1');
        expect(checksum1).toBe(checksum2);
      });

      it('should produce different SHA1 checksums for different content', () => {
        const checksum1 = calculateChecksum(testFilePath, 'sha1');

        // Modify the file
        const modifiedFilePath = path.join(tempDir, 'modified-file.txt');
        fs.writeFileSync(modifiedFilePath, 'Different content', 'utf8');

        const checksum2 = calculateChecksum(modifiedFilePath, 'sha1');
        expect(checksum1).not.toBe(checksum2);
      });
    });

    describe('MD5 algorithm', () => {
      it('should calculate MD5 checksum for a valid file', () => {
        const checksum = calculateChecksum(testFilePath, 'md5');
        expect(checksum).toBeDefined();
        expect(checksum).not.toBeNull();
        expect(typeof checksum).toBe('string');
        expect(checksum).toHaveLength(32); // MD5 produces 32-character hex string
        expect(checksum).toMatch(/^[a-f0-9]{32}$/); // Should be valid hex
      });

      it('should produce consistent MD5 checksums for same content', () => {
        const checksum1 = calculateChecksum(testFilePath, 'md5');
        const checksum2 = calculateChecksum(testFilePath, 'md5');
        expect(checksum1).toBe(checksum2);
      });

      it('should produce different MD5 checksums for different content', () => {
        const checksum1 = calculateChecksum(testFilePath, 'md5');

        // Modify the file
        const modifiedFilePath = path.join(tempDir, 'modified-file.txt');
        fs.writeFileSync(modifiedFilePath, 'Different content', 'utf8');

        const checksum2 = calculateChecksum(modifiedFilePath, 'md5');
        expect(checksum1).not.toBe(checksum2);
      });

      it('should produce different checksums for SHA1 vs MD5', () => {
        const sha1Checksum = calculateChecksum(testFilePath, 'sha1');
        const md5Checksum = calculateChecksum(testFilePath, 'md5');
        expect(sha1Checksum).not.toBe(md5Checksum);
      });
    });

    describe('None algorithm', () => {
      it('should return null when algorithm is "none"', () => {
        const checksum = calculateChecksum(testFilePath, 'none');
        expect(checksum).toBeNull();
      });
    });

    describe('Error handling', () => {
      it('should throw error for non-existent file', () => {
        const nonExistentPath = path.join(tempDir, 'non-existent-file.txt');
        expect(() => calculateChecksum(nonExistentPath, 'sha1')).toThrow('File not found');
      });

      it('should throw error with specific file path in error message', () => {
        const nonExistentPath = path.join(tempDir, 'non-existent-file.txt');
        expect(() => calculateChecksum(nonExistentPath, 'md5')).toThrow(nonExistentPath);
      });
    });

    describe('Edge cases', () => {
      it('should handle empty files', () => {
        const emptyFilePath = path.join(tempDir, 'empty-file.txt');
        fs.writeFileSync(emptyFilePath, '', 'utf8');

        const checksum = calculateChecksum(emptyFilePath, 'sha1');
        expect(checksum).toBeDefined();
        expect(checksum).not.toBeNull();
        expect(checksum).toHaveLength(40);
        // SHA1 hash of empty string
        expect(checksum).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
      });

      it('should handle binary files', () => {
        const binaryFilePath = path.join(tempDir, 'binary-file.bin');
        const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE, 0xFD]);
        fs.writeFileSync(binaryFilePath, binaryData);

        const checksum = calculateChecksum(binaryFilePath, 'sha1');
        expect(checksum).toBeDefined();
        expect(checksum).not.toBeNull();
        expect(checksum).toHaveLength(40);
      });

      it('should handle large files', () => {
        const largeFilePath = path.join(tempDir, 'large-file.txt');
        const largeContent = 'x'.repeat(1024 * 1024); // 1MB of 'x'
        fs.writeFileSync(largeFilePath, largeContent, 'utf8');

        const checksum = calculateChecksum(largeFilePath, 'sha1');
        expect(checksum).toBeDefined();
        expect(checksum).not.toBeNull();
        expect(checksum).toHaveLength(40);
      });

      it('should handle files with special characters in content', () => {
        const specialCharsPath = path.join(tempDir, 'special-chars.txt');
        const specialContent = '你好世界 🚀 émojis & spëcial chårs';
        fs.writeFileSync(specialCharsPath, specialContent, 'utf8');

        const checksum = calculateChecksum(specialCharsPath, 'sha1');
        expect(checksum).toBeDefined();
        expect(checksum).not.toBeNull();
        expect(checksum).toHaveLength(40);
      });
    });
  });

  describe('calculateChecksums()', () => {
    it('should calculate multiple checksums at once', () => {
      const checksums = calculateChecksums(testFilePath, ['sha1', 'md5']);
      expect(checksums).toBeDefined();
      expect(typeof checksums).toBe('object');
      expect(checksums).toHaveProperty('sha1');
      expect(checksums).toHaveProperty('md5');
    });

    it('should return correct SHA1 checksum in multiple checksums', () => {
      const checksums = calculateChecksums(testFilePath, ['sha1', 'md5']);
      const singleSha1 = calculateChecksum(testFilePath, 'sha1');
      expect(checksums.sha1).toBe(singleSha1);
    });

    it('should return correct MD5 checksum in multiple checksums', () => {
      const checksums = calculateChecksums(testFilePath, ['sha1', 'md5']);
      const singleMd5 = calculateChecksum(testFilePath, 'md5');
      expect(checksums.md5).toBe(singleMd5);
    });

    it('should handle single algorithm array', () => {
      const checksums = calculateChecksums(testFilePath, ['sha1']);
      expect(checksums).toHaveProperty('sha1');
      expect(checksums).not.toHaveProperty('md5');
      expect(Object.keys(checksums)).toHaveLength(1);
    });

    it('should handle empty algorithm array', () => {
      const checksums = calculateChecksums(testFilePath, []);
      expect(checksums).toBeDefined();
      expect(typeof checksums).toBe('object');
      expect(Object.keys(checksums)).toHaveLength(0);
    });

    it('should return checksums in consistent format', () => {
      const checksums = calculateChecksums(testFilePath, ['sha1', 'md5']);
      expect(checksums.sha1).toMatch(/^[a-f0-9]{40}$/);
      expect(checksums.md5).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should handle file not found error', () => {
      const nonExistentPath = path.join(tempDir, 'non-existent-file.txt');
      expect(() => calculateChecksums(nonExistentPath, ['sha1', 'md5'])).toThrow('File not found');
    });

    it('should work with only MD5', () => {
      const checksums = calculateChecksums(testFilePath, ['md5']);
      expect(checksums).toHaveProperty('md5');
      expect(checksums.md5).toHaveLength(32);
    });

    it('should produce consistent results across multiple calls', () => {
      const checksums1 = calculateChecksums(testFilePath, ['sha1', 'md5']);
      const checksums2 = calculateChecksums(testFilePath, ['sha1', 'md5']);
      expect(checksums1).toEqual(checksums2);
    });
  });

  describe('Real-world scenarios', () => {
    it('should verify file integrity after copy', () => {
      const originalChecksum = calculateChecksum(testFilePath, 'sha1');

      // Copy the file
      const copiedFilePath = path.join(tempDir, 'copied-file.txt');
      fs.copyFileSync(testFilePath, copiedFilePath);

      const copiedChecksum = calculateChecksum(copiedFilePath, 'sha1');
      expect(copiedChecksum).toBe(originalChecksum);
    });

    it('should detect file corruption', () => {
      const originalChecksum = calculateChecksum(testFilePath, 'sha1');

      // Simulate file corruption by appending data
      fs.appendFileSync(testFilePath, 'corrupted');

      const corruptedChecksum = calculateChecksum(testFilePath, 'sha1');
      expect(corruptedChecksum).not.toBe(originalChecksum);
    });

    it('should support common use case for package verification', () => {
      // Simulate a package file
      const packagePath = path.join(tempDir, 'package.tgz');
      fs.writeFileSync(packagePath, 'fake package content', 'utf8');

      const checksums = calculateChecksums(packagePath, ['sha1', 'md5']);

      expect(checksums).toHaveProperty('sha1');
      expect(checksums).toHaveProperty('md5');
      expect(checksums.sha1).toHaveLength(40);
      expect(checksums.md5).toHaveLength(32);
    });
  });
});
