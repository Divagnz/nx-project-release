import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'fs';

describe('init generator', () => {
  let projectDirectory: string;

  beforeAll(() => {
    projectDirectory = createTestProject();

    // Install the plugin built with the latest source code
    execSync(`npm install -D nx-project-release@e2e`, {
      cwd: projectDirectory,
      stdio: 'inherit',
      env: process.env,
    });
  });

  afterAll(() => {
    if (projectDirectory) {
      // Cleanup the test project
      rmSync(projectDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  describe('non-interactive mode', () => {
    it('should generate default configuration with --skipPrompts', () => {
      // Run init generator in non-interactive mode
      execSync('npx nx g nx-project-release:init --skipPrompts --skipFormat', {
        cwd: projectDirectory,
        stdio: 'inherit',
      });

      // Verify nx.json was updated with targetDefaults
      const nxJsonPath = join(projectDirectory, 'nx.json');
      expect(existsSync(nxJsonPath)).toBe(true);

      const nxJson = JSON.parse(readFileSync(nxJsonPath, 'utf-8'));

      // Check for all-in-one executor configuration (default)
      expect(nxJson.targetDefaults).toBeDefined();
      expect(
        nxJson.targetDefaults['nx-project-release:project-release']
      ).toBeDefined();

      const config =
        nxJson.targetDefaults['nx-project-release:project-release'];
      expect(config.cache).toBe(false);
      expect(config.dependsOn).toContain('build');
      expect(config.options).toBeDefined();
      expect(config.options.versionFiles).toContain('package.json');
      expect(config.options.preset).toBe('angular');
      expect(config.options.registryType).toBe('npm');
      expect(config.options.gitCommit).toBe(true);
      expect(config.options.gitTag).toBe(true);
    });

    it('should detect and configure publishable projects', () => {
      // Create a test library with package.json
      execSync('npx nx g @nx/js:library test-lib --bundler=tsc', {
        cwd: projectDirectory,
        stdio: 'inherit',
      });

      // Run init generator
      execSync('npx nx g nx-project-release:init --skipPrompts --skipFormat', {
        cwd: projectDirectory,
        stdio: 'inherit',
      });

      // Check if the library got release targets added
      const projectJsonPath = join(projectDirectory, 'test-lib/project.json');
      if (existsSync(projectJsonPath)) {
        const projectJson = JSON.parse(readFileSync(projectJsonPath, 'utf-8'));

        // Should have project-release target
        expect(projectJson.targets['project-release']).toBeDefined();
        expect(projectJson.targets['project-release'].executor).toBe(
          'nx-project-release:project-release'
        );
      }
    });
  });

  describe('dry-run mode', () => {
    it('should not modify files with --dry-run', () => {
      // Read original nx.json
      const nxJsonPath = join(projectDirectory, 'nx.json');
      const originalContent = readFileSync(nxJsonPath, 'utf-8');

      // Run with dry-run
      execSync('npx nx g nx-project-release:init --skipPrompts --dry-run', {
        cwd: projectDirectory,
        stdio: 'inherit',
      });

      // Verify nx.json was not changed
      const newContent = readFileSync(nxJsonPath, 'utf-8');
      expect(newContent).toBe(originalContent);
    });
  });

  describe('configuration structure', () => {
    it('should create valid nx.json targetDefaults structure', () => {
      execSync('npx nx g nx-project-release:init --skipPrompts --skipFormat', {
        cwd: projectDirectory,
        stdio: 'inherit',
      });

      const nxJsonPath = join(projectDirectory, 'nx.json');
      const nxJson = JSON.parse(readFileSync(nxJsonPath, 'utf-8'));

      const targetDefaults =
        nxJson.targetDefaults['nx-project-release:project-release'];

      // Verify required fields
      expect(targetDefaults.options.versionFiles).toBeDefined();
      expect(Array.isArray(targetDefaults.options.versionFiles)).toBe(true);
      expect(targetDefaults.options.gitCommit).toBeDefined();
      expect(typeof targetDefaults.options.gitCommit).toBe('boolean');
      expect(targetDefaults.options.gitTag).toBeDefined();
      expect(typeof targetDefaults.options.gitTag).toBe('boolean');
      expect(targetDefaults.options.preset).toBeDefined();
      expect(typeof targetDefaults.options.preset).toBe('string');
      expect(targetDefaults.options.registryType).toBeDefined();
      expect(['npm', 'github', 'custom']).toContain(
        targetDefaults.options.registryType
      );
    });
  });

  describe('generator registration', () => {
    it('should be listed in available generators', () => {
      const output = execSync('npx nx list nx-project-release', {
        cwd: projectDirectory,
        encoding: 'utf-8',
      });

      // Should show init generator
      expect(output).toContain('init');
    });

    it('should show generator help', () => {
      const output = execSync('npx nx g nx-project-release:init --help', {
        cwd: projectDirectory,
        encoding: 'utf-8',
      });

      // Should show description and options
      expect(output).toContain('Initialize nx-project-release');
      expect(output).toContain('skipPrompts');
    });
  });

  describe('idempotency', () => {
    it('should handle running init multiple times', () => {
      // Run init twice
      execSync('npx nx g nx-project-release:init --skipPrompts --skipFormat', {
        cwd: projectDirectory,
        stdio: 'inherit',
      });

      execSync('npx nx g nx-project-release:init --skipPrompts --skipFormat', {
        cwd: projectDirectory,
        stdio: 'inherit',
      });

      // Should still have valid configuration
      const nxJsonPath = join(projectDirectory, 'nx.json');
      const nxJson = JSON.parse(readFileSync(nxJsonPath, 'utf-8'));

      expect(
        nxJson.targetDefaults['nx-project-release:project-release']
      ).toBeDefined();
    });
  });
});

/**
 * Creates a test project with create-nx-workspace and installs the plugin
 * @returns The directory where the test project was created
 */
function createTestProject() {
  const projectName = 'test-init-gen-project';
  const projectDirectory = join(process.cwd(), 'tmp', projectName);

  // Ensure projectDirectory is empty
  rmSync(projectDirectory, {
    recursive: true,
    force: true,
  });
  mkdirSync(dirname(projectDirectory), {
    recursive: true,
  });

  execSync(
    `npx create-nx-workspace@latest ${projectName} --preset apps --nxCloud=skip --no-interactive`,
    {
      cwd: dirname(projectDirectory),
      stdio: 'inherit',
      env: process.env,
    }
  );
  console.log(`Created test project in "${projectDirectory}"`);

  return projectDirectory;
}
