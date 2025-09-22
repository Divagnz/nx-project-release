export interface ReleaseExecutorSchema {
  version?: string;
  dryRun?: boolean;
  tag?: string;
  releaseAs?: 'major' | 'minor' | 'patch' | 'prerelease';
  skipCommit?: boolean;
  skipTag?: boolean;
  preset?: 'angular' | 'atom' | 'codemirror' | 'conventionalcommits' | 'ember' | 'eslint' | 'express' | 'jquery';
  tagPrefix?: string;
  publish?: boolean;
  registry?: string;
  registryType?: 'npm' | 'nexus' | 'custom';
  distTag?: string;
  access?: 'public' | 'restricted';
  buildTarget?: string;
  publishDir?: string;
  includeProjects?: string[];
  excludeProjects?: string[];
  projectFilter?: string;
  releaseAll?: boolean;
  releaseConfig?: Record<string, {
    skip?: boolean;
    registryType?: 'npm' | 'nexus' | 'custom';
    registry?: string;
    distTag?: string;
    access?: 'public' | 'restricted';
  }>;
  versionFile?: string;
  versionPath?: string;
  onlyChanged?: boolean;
  baseBranch?: string;
  sinceSha?: string;
  tagNaming?: {
    prefix?: string;
    suffix?: string;
    format?: string;
    includeProjectName?: boolean;
  };
}
