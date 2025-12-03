import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';

describe('project-release', () => {
  let projectDirectory: string;

  beforeAll(() => {
    projectDirectory = createTestProject();

    // The plugin has been built and published to a local registry in the jest globalSetup
    // Install the plugin built with the latest source code into the test repo
    execSync(`npm install -D nx-project-release@e2e`, {
      cwd: projectDirectory,
      stdio: 'inherit',
      env: process.env
    });
  });

  afterAll(() => {
    if (projectDirectory) {
      // Cleanup the test project
      rmSync(projectDirectory, {
        recursive: true,
        force: true
      });
    }
  });

  it('should be installed', () => {
    // npm ls will fail if the package is not installed properly
    execSync('npm ls nx-project-release', {
      cwd: projectDirectory,
      stdio: 'inherit'
    });
  });

  it('should list all executors', () => {
    const output = execSync('npx nx list nx-project-release', {
      cwd: projectDirectory,
      encoding: 'utf-8'
    });

    // Should show all executors
    expect(output).toContain('version');
    expect(output).toContain('changelog');
    expect(output).toContain('publish');
    expect(output).toContain('project-release');
  });

  describe('executors', () => {
    beforeEach(() => {
      // Create a test library for executor testing
      execSync('npx nx g @nx/js:library test-executor-lib --bundler=tsc', {
        cwd: projectDirectory,
        stdio: 'inherit'
      });

      // Add release targets to the library
      const projectJsonPath = join(projectDirectory, 'test-executor-lib/project.json');
      const projectJson = JSON.parse(readFileSync(projectJsonPath, 'utf-8'));

      projectJson.version = '0.0.0';
      projectJson.targets = {
        ...projectJson.targets,
        version: {
          executor: 'nx-project-release:version',
          options: {
            versionFiles: ['package.json', 'project.json'],
            versionPath: 'version'
          }
        },
        changelog: {
          executor: 'nx-project-release:changelog',
          options: {
            preset: 'angular'
          }
        },
        publish: {
          executor: 'nx-project-release:publish',
          options: {
            buildTarget: 'build',
            registryType: 'npm'
          }
        },
        'project-release': {
          executor: 'nx-project-release:project-release',
          options: {
            buildTarget: 'build'
          }
        }
      };

      writeFileSync(projectJsonPath, JSON.stringify(projectJson, null, 2));
    });

    it('version executor should show current version with --show', () => {
      const output = execSync('npx nx run test-executor-lib:version --show', {
        cwd: projectDirectory,
        encoding: 'utf-8'
      });

      expect(output).toContain('Current version');
    });

    it('version executor should work in dry-run mode', () => {
      const output = execSync('npx nx run test-executor-lib:version --dryRun --releaseAs=patch', {
        cwd: projectDirectory,
        encoding: 'utf-8'
      });

      expect(output).toContain('DRY RUN');
    });

    it('changelog executor should work in dry-run mode', () => {
      const output = execSync('npx nx run test-executor-lib:changelog --dryRun', {
        cwd: projectDirectory,
        encoding: 'utf-8'
      });

      expect(output).toContain('DRY RUN');
    });

    it('publish executor should work in dry-run mode', () => {
      const output = execSync('npx nx run test-executor-lib:publish --dryRun', {
        cwd: projectDirectory,
        encoding: 'utf-8'
      });

      expect(output).toContain('DRY RUN');
    });
  });
});

/**
 * Creates a test project with create-nx-workspace and installs the plugin
 * @returns The directory where the test project was created
 */
function createTestProject() {
  const projectName = 'test-project';
  const projectDirectory = join(process.cwd(), 'tmp', projectName);

  // Ensure projectDirectory is empty
  rmSync(projectDirectory, {
    recursive: true,
    force: true
  });
  mkdirSync(dirname(projectDirectory), {
    recursive: true
  });

  execSync(
    `npx create-nx-workspace@latest ${projectName} --preset apps --nxCloud=skip --no-interactive`,
    {
      cwd: dirname(projectDirectory),
      stdio: 'inherit',
      env: process.env
    }
  );
  console.log(`Created test project in "${projectDirectory}"`);

  return projectDirectory;
}
