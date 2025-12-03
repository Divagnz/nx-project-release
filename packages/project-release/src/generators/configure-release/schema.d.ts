export interface ConfigureReleaseSchema {
  projects?: string[];
  project?: string;
  registryType?: 'npm' | 'nexus' | 's3' | 'github' | 'docker' | 'custom' | 'none';
  registryUrl?: string;
  versionFiles?: string[];
  initialVersion?: string;
  addToReleaseGroup?: boolean;
  releaseGroupName?: string;
  createNewGroup?: boolean;
  skipInstall?: boolean;
}
