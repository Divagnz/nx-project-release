import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ExecutorContext, logger, runExecutor as nxRunExecutor } from '@nx/devkit';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as childProcess from 'child_process';
import publishExecutor, { PublishExecutorSchema } from './index.js';
import * as nexusClient from './lib/nexus-client';
import * as s3Client from './lib/s3-client';

// Mock dependencies
jest.mock('@nx/devkit', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  },
  runExecutor: jest.fn()
}));

jest.mock('child_process');
jest.mock('./lib/nexus-client');
jest.mock('./lib/s3-client');

const mockExecSync = childProcess.execSync as jest.MockedFunction<typeof childProcess.execSync>;
const mockNxRunExecutor = nxRunExecutor as jest.MockedFunction<typeof nxRunExecutor>;
const mockUploadToNexus = nexusClient.uploadToNexus as jest.MockedFunction<typeof nexusClient.uploadToNexus>;
const mockValidateNexusConfig = nexusClient.validateNexusConfig as jest.MockedFunction<typeof nexusClient.validateNexusConfig>;
const mockUploadToS3 = s3Client.uploadToS3 as jest.MockedFunction<typeof s3Client.uploadToS3>;
const mockValidateS3Config = s3Client.validateS3Config as jest.MockedFunction<typeof s3Client.validateS3Config>;

describe('Publish Executor', () => {
  let tempDir: string;
  let context: ExecutorContext;
  let publishDir: string;

  beforeEach(() => {
    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-test-'));
    publishDir = path.join(tempDir, 'dist/test-project');

    // Reset mocks
    jest.clearAllMocks();

    // Setup context
    context = {
      root: tempDir,
      projectName: 'test-project',
      projectsConfigurations: {
        version: 2,
        projects: {
          'test-project': {
            root: 'projects/test-project'
          }
        }
      },
      cwd: tempDir,
      isVerbose: false,
      nxJsonConfiguration: {},
      projectGraph: {
        nodes: {},
        dependencies: {}
      }
    } as ExecutorContext;

    // Create directories
    fs.mkdirSync(path.join(tempDir, 'projects/test-project'), { recursive: true });
    fs.mkdirSync(publishDir, { recursive: true });

    // Create package.json in publish directory
    fs.writeFileSync(
      path.join(publishDir, 'package.json'),
      JSON.stringify({ name: 'test-project', version: '1.0.0' }, null, 2)
    );

    // Default mock implementations
    mockExecSync.mockReturnValue('' as any);
    mockNxRunExecutor.mockResolvedValue(async function* () {
      yield { success: true };
    }() as any);
    mockValidateNexusConfig.mockReturnValue(true);
    mockValidateS3Config.mockReturnValue(true);
    mockUploadToNexus.mockResolvedValue({ uploaded: true, url: 'https://nexus.example.com/artifact', skipped: false });
    mockUploadToS3.mockResolvedValue({ uploaded: true, url: 's3://bucket/artifact', skipped: false });
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('NPM Publishing', () => {
    it('should publish to NPM with default settings', async () => {
      const options: PublishExecutorSchema = {
        registryType: 'npm',
        publishDir: 'dist/test-project'
      };

      await publishExecutor(options, context);

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('npm publish'),
        expect.objectContaining({ cwd: publishDir })
      );
    });

    it('should use custom registry', async () => {
      const options: PublishExecutorSchema = {
        registryType: 'npm',
        registry: 'https://custom-registry.com',
        publishDir: 'dist/test-project'
      };

      await publishExecutor(options, context);

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--registry https://custom-registry.com'),
        expect.any(Object)
      );
    });

    it('should use custom dist tag', async () => {
      const options: PublishExecutorSchema = {
        registryType: 'npm',
        distTag: 'beta',
        publishDir: 'dist/test-project'
      };

      await publishExecutor(options, context);

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--tag beta'),
        expect.any(Object)
      );
    });

    it('should use custom access level', async () => {
      const options: PublishExecutorSchema = {
        registryType: 'npm',
        access: 'restricted',
        publishDir: 'dist/test-project'
      };

      await publishExecutor(options, context);

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--access restricted'),
        expect.any(Object)
      );
    });

    it('should include OTP when provided', async () => {
      const options: PublishExecutorSchema = {
        registryType: 'npm',
        otp: '123456',
        publishDir: 'dist/test-project'
      };

      await publishExecutor(options, context);

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--otp 123456'),
        expect.any(Object)
      );
    });

    it('should update package.json with custom scope', async () => {
      const options: PublishExecutorSchema = {
        registryType: 'npm',
        npmScope: '@my-org',
        publishDir: 'dist/test-project'
      };

      await publishExecutor(options, context);

      const packageJsonPath = path.join(publishDir, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      expect(packageJson.name).toBe('@my-org/test-project');
    });
  });

  describe('Nexus Publishing', () => {
    beforeEach(() => {
      // Create artifact file
      fs.writeFileSync(path.join(publishDir, 'test-project-1.0.0.tgz'), 'fake tarball content');

      // Set environment variables
      process.env.NEXUS_URL = 'https://nexus.example.com';
      process.env.NEXUS_REPOSITORY = 'raw-releases';
      process.env.NEXUS_USERNAME = 'admin';
      process.env.NEXUS_PASSWORD = 'password123';
    });

    afterEach(() => {
      delete process.env.NEXUS_URL;
      delete process.env.NEXUS_REPOSITORY;
      delete process.env.NEXUS_USERNAME;
      delete process.env.NEXUS_PASSWORD;
    });

    it('should publish to Nexus repository', async () => {
      // Add version to project.json
      const projectJsonPath = path.join(tempDir, 'projects/test-project/project.json');
      fs.writeFileSync(projectJsonPath, JSON.stringify({ version: '1.0.0' }));

      const options: PublishExecutorSchema = {
        registryType: 'nexus',
        publishDir: 'dist/test-project'
      };

      const result = await publishExecutor(options, context);

      expect(result.success).toBe(true);
      expect(mockUploadToNexus).toHaveBeenCalled();
    });

    it('should use custom Nexus configuration', async () => {
      const projectJsonPath = path.join(tempDir, 'projects/test-project/project.json');
      fs.writeFileSync(projectJsonPath, JSON.stringify({ version: '1.0.0' }));

      const options: PublishExecutorSchema = {
        registryType: 'nexus',
        nexusUrl: 'https://custom-nexus.com',
        nexusRepository: 'custom-repo',
        nexusUsername: 'user',
        nexusPassword: 'pass',
        publishDir: 'dist/test-project'
      };

      await publishExecutor(options, context);

      expect(mockUploadToNexus).toHaveBeenCalledWith(
        expect.any(String),
        '1.0.0',
        expect.objectContaining({
          url: 'https://custom-nexus.com',
          repository: 'custom-repo',
          username: 'user',
          password: 'pass'
        })
      );
    });

    it('should use version path strategy by default', async () => {
      const projectJsonPath = path.join(tempDir, 'projects/test-project/project.json');
      fs.writeFileSync(projectJsonPath, JSON.stringify({ version: '1.0.0' }));

      const options: PublishExecutorSchema = {
        registryType: 'nexus',
        publishDir: 'dist/test-project'
      };

      await publishExecutor(options, context);

      expect(mockUploadToNexus).toHaveBeenCalledWith(
        expect.any(String),
        '1.0.0',
        expect.objectContaining({ pathStrategy: 'version' })
      );
    });

    it('should support hash path strategy', async () => {
      const projectJsonPath = path.join(tempDir, 'projects/test-project/project.json');
      fs.writeFileSync(projectJsonPath, JSON.stringify({ version: '1.0.0' }));

      const options: PublishExecutorSchema = {
        registryType: 'nexus',
        pathStrategy: 'hash',
        publishDir: 'dist/test-project'
      };

      await publishExecutor(options, context);

      expect(mockUploadToNexus).toHaveBeenCalledWith(
        expect.any(String),
        '1.0.0',
        expect.objectContaining({ pathStrategy: 'hash' })
      );
    });

    it('should fail when no artifact found', async () => {
      // Remove artifact
      fs.unlinkSync(path.join(publishDir, 'test-project-1.0.0.tgz'));

      const projectJsonPath = path.join(tempDir, 'projects/test-project/project.json');
      fs.writeFileSync(projectJsonPath, JSON.stringify({ version: '1.0.0' }));

      const options: PublishExecutorSchema = {
        registryType: 'nexus',
        publishDir: 'dist/test-project'
      };

      const result = await publishExecutor(options, context);

      expect(result.success).toBe(false);
      if ('error' in result) {
        expect(result.error).toContain('No artifact found');
      }
    });

    it('should fail when version is not available', async () => {
      const options: PublishExecutorSchema = {
        registryType: 'nexus',
        publishDir: 'dist/test-project'
      };

      const result = await publishExecutor(options, context);

      expect(result.success).toBe(false);
      if ('error' in result) {
        expect(result.error).toContain('Version is required');
      }
    });

    it('should fail when Nexus config is invalid', async () => {
      mockValidateNexusConfig.mockReturnValue(false);

      const projectJsonPath = path.join(tempDir, 'projects/test-project/project.json');
      fs.writeFileSync(projectJsonPath, JSON.stringify({ version: '1.0.0' }));

      const options: PublishExecutorSchema = {
        registryType: 'nexus',
        publishDir: 'dist/test-project'
      };

      const result = await publishExecutor(options, context);

      expect(result.success).toBe(false);
      if ('error' in result) {
        expect(result.error).toContain('Invalid Nexus configuration');
      }
    });
  });

  describe('S3 Publishing', () => {
    beforeEach(() => {
      // Create artifact file
      fs.writeFileSync(path.join(publishDir, 'test-project-1.0.0.tgz'), 'fake tarball content');

      // Set environment variables
      process.env.S3_BUCKET = 'my-artifacts-bucket';
      process.env.AWS_REGION = 'us-east-1';
      process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
      process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    });

    afterEach(() => {
      delete process.env.S3_BUCKET;
      delete process.env.AWS_REGION;
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      delete process.env.S3_PREFIX;
    });

    it('should publish to S3 bucket', async () => {
      const projectJsonPath = path.join(tempDir, 'projects/test-project/project.json');
      fs.writeFileSync(projectJsonPath, JSON.stringify({ version: '1.0.0' }));

      const options: PublishExecutorSchema = {
        registryType: 's3',
        publishDir: 'dist/test-project'
      };

      const result = await publishExecutor(options, context);

      expect(result.success).toBe(true);
      expect(mockUploadToS3).toHaveBeenCalled();
    });

    it('should use custom S3 configuration', async () => {
      const projectJsonPath = path.join(tempDir, 'projects/test-project/project.json');
      fs.writeFileSync(projectJsonPath, JSON.stringify({ version: '1.0.0' }));

      const options: PublishExecutorSchema = {
        registryType: 's3',
        s3Bucket: 'custom-bucket',
        s3Region: 'us-west-2',
        s3Prefix: 'artifacts',
        publishDir: 'dist/test-project'
      };

      await publishExecutor(options, context);

      expect(mockUploadToS3).toHaveBeenCalledWith(
        expect.any(String),
        '1.0.0',
        expect.objectContaining({
          bucket: 'custom-bucket',
          region: 'us-west-2',
          prefix: 'artifacts'
        })
      );
    });

    it('should support flat path strategy', async () => {
      const projectJsonPath = path.join(tempDir, 'projects/test-project/project.json');
      fs.writeFileSync(projectJsonPath, JSON.stringify({ version: '1.0.0' }));

      const options: PublishExecutorSchema = {
        registryType: 's3',
        pathStrategy: 'flat',
        publishDir: 'dist/test-project'
      };

      await publishExecutor(options, context);

      expect(mockUploadToS3).toHaveBeenCalledWith(
        expect.any(String),
        '1.0.0',
        expect.objectContaining({ pathStrategy: 'flat' })
      );
    });

    it('should fail when S3 config is invalid', async () => {
      mockValidateS3Config.mockReturnValue(false);

      const projectJsonPath = path.join(tempDir, 'projects/test-project/project.json');
      fs.writeFileSync(projectJsonPath, JSON.stringify({ version: '1.0.0' }));

      const options: PublishExecutorSchema = {
        registryType: 's3',
        publishDir: 'dist/test-project'
      };

      const result = await publishExecutor(options, context);

      expect(result.success).toBe(false);
      if ('error' in result) {
        expect(result.error).toContain('Invalid S3 configuration');
      }
    });
  });

  describe('Custom Registry Publishing', () => {
    it('should publish to custom registry', async () => {
      const options: PublishExecutorSchema = {
        registryType: 'custom',
        registry: 'https://custom-registry.com',
        publishDir: 'dist/test-project'
      };

      await publishExecutor(options, context);

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--registry https://custom-registry.com'),
        expect.any(Object)
      );
    });

    it('should fail when registry URL is not provided', async () => {
      const options: PublishExecutorSchema = {
        registryType: 'custom',
        publishDir: 'dist/test-project'
      };

      const result = await publishExecutor(options, context);

      expect(result.success).toBe(false);
      if ('error' in result) {
        expect(result.error).toContain('Registry URL is required');
      }
    });
  });

  describe('Build Target Execution', () => {
    it('should run build target before publishing', async () => {
      const options: PublishExecutorSchema = {
        registryType: 'npm',
        buildTarget: 'build',
        publishDir: 'dist/test-project'
      };

      await publishExecutor(options, context);

      expect(mockNxRunExecutor).toHaveBeenCalledWith(
        expect.objectContaining({
          project: 'test-project',
          target: 'build'
        }),
        expect.any(Object),
        context
      );
    });

    it('should skip build when skipBuild is true', async () => {
      const options: PublishExecutorSchema = {
        registryType: 'npm',
        buildTarget: 'build',
        skipBuild: true,
        publishDir: 'dist/test-project'
      };

      await publishExecutor(options, context);

      expect(mockNxRunExecutor).not.toHaveBeenCalled();
    });

    it('should fail when build fails', async () => {
      mockNxRunExecutor.mockRejectedValue(new Error('Build failed'));

      const options: PublishExecutorSchema = {
        registryType: 'npm',
        buildTarget: 'build',
        publishDir: 'dist/test-project'
      };

      const result = await publishExecutor(options, context);

      expect(result.success).toBe(false);
      if ('error' in result) {
        expect(result.error).toContain('Build failed');
      }
    });
  });

  describe('Dry-run Mode', () => {
    it('should not publish in dry-run mode', async () => {
      const options: PublishExecutorSchema = {
        registryType: 'npm',
        dryRun: true,
        publishDir: 'dist/test-project'
      };

      await publishExecutor(options, context);

      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should log what would be published', async () => {
      const options: PublishExecutorSchema = {
        registryType: 'npm',
        registry: 'https://registry.npmjs.org',
        dryRun: true,
        publishDir: 'dist/test-project'
      };

      await publishExecutor(options, context);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Would publish to npm'));
    });
  });

  describe('Error Handling', () => {
    it('should fail when publish directory does not exist', async () => {
      const options: PublishExecutorSchema = {
        registryType: 'npm',
        publishDir: 'dist/nonexistent'
      };

      const result = await publishExecutor(options, context);

      expect(result.success).toBe(false);
      if ('error' in result) {
        expect(result.error).toContain('Publish directory does not exist');
      }
    });

    it('should fail for unsupported registry type', async () => {
      const options: PublishExecutorSchema = {
        registryType: 'invalid' as any,
        publishDir: 'dist/test-project'
      };

      const result = await publishExecutor(options, context);

      expect(result.success).toBe(false);
      if ('error' in result) {
        expect(result.error).toContain('Unsupported registry type');
      }
    });

    it('should handle npm publish errors', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('npm ERR! 404 Not Found');
      });

      const options: PublishExecutorSchema = {
        registryType: 'npm',
        publishDir: 'dist/test-project'
      };

      const result = await publishExecutor(options, context);

      expect(result.success).toBe(false);
    });
  });

  describe('Version Handling', () => {
    it('should update package.json version from project.json', async () => {
      const projectJsonPath = path.join(tempDir, 'projects/test-project/project.json');
      fs.writeFileSync(projectJsonPath, JSON.stringify({ version: '2.0.0' }));

      const options: PublishExecutorSchema = {
        registryType: 'npm',
        publishDir: 'dist/test-project',
        dryRun: true
      };

      await publishExecutor(options, context);

      const publishPackageJsonPath = path.join(publishDir, 'package.json');
      const publishPackageJson = JSON.parse(fs.readFileSync(publishPackageJsonPath, 'utf8'));
      expect(publishPackageJson.version).toBe('2.0.0');
    });

    it('should use package.json version if project.json has none', async () => {
      const packageJsonPath = path.join(tempDir, 'projects/test-project/package.json');
      fs.writeFileSync(packageJsonPath, JSON.stringify({ version: '3.0.0' }));

      const options: PublishExecutorSchema = {
        registryType: 'npm',
        publishDir: 'dist/test-project',
        dryRun: true
      };

      await publishExecutor(options, context);

      const publishPackageJsonPath = path.join(publishDir, 'package.json');
      const publishPackageJson = JSON.parse(fs.readFileSync(publishPackageJsonPath, 'utf8'));
      expect(publishPackageJson.version).toBe('3.0.0');
    });

    it('should keep existing version if no source version found', async () => {
      const options: PublishExecutorSchema = {
        registryType: 'npm',
        publishDir: 'dist/test-project',
        dryRun: true
      };

      await publishExecutor(options, context);

      const publishPackageJsonPath = path.join(publishDir, 'package.json');
      const publishPackageJson = JSON.parse(fs.readFileSync(publishPackageJsonPath, 'utf8'));
      expect(publishPackageJson.version).toBe('1.0.0'); // Original version
    });
  });

  describe('Configuration Merging', () => {
    it('should merge config from nx.json', async () => {
      const nxJsonPath = path.join(tempDir, 'nx.json');
      fs.writeFileSync(
        nxJsonPath,
        JSON.stringify({
          projectRelease: {
            defaultRegistry: {
              type: 'npm',
              url: 'https://registry.npmjs.org',
              access: 'public',
              distTag: 'latest'
            }
          }
        })
      );

      const options: PublishExecutorSchema = {
        publishDir: 'dist/test-project'
      };

      await publishExecutor(options, context);

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('npm publish'),
        expect.any(Object)
      );
    });

    it('should merge config from project.json publish target', async () => {
      const projectJsonPath = path.join(tempDir, 'projects/test-project/project.json');
      fs.writeFileSync(
        projectJsonPath,
        JSON.stringify({
          targets: {
            publish: {
              options: {
                buildTarget: 'custom-build',
                publishDir: 'dist/custom'
              }
            }
          }
        })
      );

      // Create custom publish directory
      const customPublishDir = path.join(tempDir, 'dist/custom');
      fs.mkdirSync(customPublishDir, { recursive: true });
      fs.writeFileSync(
        path.join(customPublishDir, 'package.json'),
        JSON.stringify({ name: 'test', version: '1.0.0' })
      );

      const options: PublishExecutorSchema = {
        registryType: 'npm'
      };

      await publishExecutor(options, context);

      expect(mockNxRunExecutor).toHaveBeenCalledWith(
        expect.objectContaining({ target: 'custom-build' }),
        expect.any(Object),
        context
      );
    });
  });

  describe('Artifact Detection', () => {
    it('should find .tgz artifact', async () => {
      fs.writeFileSync(path.join(publishDir, 'artifact.tgz'), 'content');

      const projectJsonPath = path.join(tempDir, 'projects/test-project/project.json');
      fs.writeFileSync(projectJsonPath, JSON.stringify({ version: '1.0.0' }));

      const options: PublishExecutorSchema = {
        registryType: 'nexus',
        publishDir: 'dist/test-project'
      };

      const result = await publishExecutor(options, context);

      expect(result.success).toBe(true);
      expect(mockUploadToNexus).toHaveBeenCalledWith(
        expect.stringContaining('artifact.tgz'),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should find .tar.gz artifact', async () => {
      fs.writeFileSync(path.join(publishDir, 'artifact.tar.gz'), 'content');

      const projectJsonPath = path.join(tempDir, 'projects/test-project/project.json');
      fs.writeFileSync(projectJsonPath, JSON.stringify({ version: '1.0.0' }));

      const options: PublishExecutorSchema = {
        registryType: 's3',
        publishDir: 'dist/test-project'
      };

      const result = await publishExecutor(options, context);

      expect(result.success).toBe(true);
      expect(mockUploadToS3).toHaveBeenCalledWith(
        expect.stringContaining('artifact.tar.gz'),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should find .zip artifact', async () => {
      fs.writeFileSync(path.join(publishDir, 'artifact.zip'), 'content');

      const projectJsonPath = path.join(tempDir, 'projects/test-project/project.json');
      fs.writeFileSync(projectJsonPath, JSON.stringify({ version: '1.0.0' }));

      const options: PublishExecutorSchema = {
        registryType: 'nexus',
        publishDir: 'dist/test-project'
      };

      const result = await publishExecutor(options, context);

      expect(result.success).toBe(true);
    });
  });

  describe('Success Logging', () => {
    it('should log success message', async () => {
      const options: PublishExecutorSchema = {
        registryType: 'npm',
        publishDir: 'dist/test-project'
      };

      await publishExecutor(options, context);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully published'));
    });

    it('should log project name', async () => {
      const options: PublishExecutorSchema = {
        registryType: 'npm',
        publishDir: 'dist/test-project'
      };

      await publishExecutor(options, context);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('test-project'));
    });
  });
});
