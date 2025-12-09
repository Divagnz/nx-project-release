export interface ConfigureReleaseSchema {
  projects?: string[];
  project?: string;
  platform?: 'github' | 'gitlab' | 'none';
  tagPrefix?: string;
  tagFormat?: string;
  releaseNotes?: 'changelog' | 'auto-generate' | 'both';
  changelogFile?: string;
  prerelease?: boolean;
  draft?: boolean;
  attachArtifacts?: boolean;
  assetPatterns?: string[];
  excludeProjects?: string[];
  interactive?: boolean;
}
