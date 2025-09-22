export interface ReleaseAllExecutorSchema {
  version?: string;
  dryRun?: boolean;
  releaseAs?: 'major' | 'minor' | 'patch' | 'prerelease';
  publish?: boolean;
  registry?: string;
  registryType?: 'npm' | 'nexus' | 'custom';
  skipCommit?: boolean;
  skipTag?: boolean;
  onlyChanged?: boolean;
}