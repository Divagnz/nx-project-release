export interface ConfigureArtifactSchema {
  project?: string;
  projects?: string[];
  sourceDir?: string;
  format?: 'zip' | 'tar' | 'tgz' | 'tar.gz';
  artifactName?: string;
  dependsOn?: string[];
  exclude?: string[];
  updatePublish?: boolean;
}
