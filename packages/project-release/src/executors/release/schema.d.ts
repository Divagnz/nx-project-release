export interface ProjectRelease {
  name: string;
  version: string;
  group?: string;
}

export interface ReleaseExecutorSchema {
  // Multi-project support
  projects?: ProjectRelease[];
  detectAffected?: boolean;

  // Single-project support
  version?: string;

  // Git workflow
  gitCommit?: boolean;
  gitCommitMessage?: string;
  gitTag?: boolean;
  tagPrefix?: string;
  gitPush?: boolean;
  releaseBranch?: string;
  createPR?: boolean;
  prTarget?: string;
  prTitle?: string;

  // Releases
  createGitHubRelease?: boolean;
  createGitLabRelease?: boolean;
  releaseName?: string;
  changelogFile?: string;
  draft?: boolean;
  prerelease?: boolean;
  generateNotes?: boolean;

  // Files and assets
  filesToCommit?: string[];
  assets?: string[];
  assetPatterns?: string[];

  // Repository
  owner?: string;
  repo?: string;
  token?: string;
  targetCommitish?: string;
  discussionCategory?: string;

  // Options
  dryRun?: boolean;
}
