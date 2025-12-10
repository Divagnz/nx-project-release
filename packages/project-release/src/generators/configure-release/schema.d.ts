export interface ConfigureReleaseSchema {
  projects?: string[];
  project?: string;
  platform?: 'github' | 'gitlab' | 'none';
  releaseNotes?: 'changelog' | 'auto-generate' | 'both';
  changelogFile?: string;
  prerelease?: boolean;
  draft?: boolean;
  attachArtifacts?: boolean;
  assetPatterns?: string[];
  interactive?: boolean;
}
