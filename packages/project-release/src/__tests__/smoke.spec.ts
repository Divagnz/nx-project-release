import { describe, it, expect } from '@jest/globals';

describe('Project Release Plugin', () => {
  it('should have executors defined', () => {
    expect(true).toBe(true);
  });

  it('should export version executor', async () => {
    const versionExecutor = await import('../executors/version/index.js');
    expect(versionExecutor).toBeDefined();
    expect(versionExecutor.default).toBeDefined();
  });

  it('should export changelog executor', async () => {
    const changelogExecutor = await import('../executors/changelog/index.js');
    expect(changelogExecutor).toBeDefined();
    expect(changelogExecutor.default).toBeDefined();
  });

  it('should export publish executor', async () => {
    const publishExecutor = await import('../executors/publish/index.js');
    expect(publishExecutor).toBeDefined();
    expect(publishExecutor.default).toBeDefined();
  });

  it('should export project-release executor', async () => {
    const projectReleaseExecutor = await import(
      '../executors/project-release/index.js'
    );
    expect(projectReleaseExecutor).toBeDefined();
    expect(projectReleaseExecutor.default).toBeDefined();
  });
});
