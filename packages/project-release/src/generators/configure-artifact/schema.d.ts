export interface ConfigureArtifactSchema {
  project?: string;
  projects?: string[];
  sourceDir?: string;
  format?: 'zip' | 'tar' | 'tgz' | 'tar.gz';
  artifactName?: string;
  dependsOn?: string[];
  exclude?: string[];
  outputDir?: string;
  include?: string[];
  compressionLevel?: number;
  preservePermissions?: boolean;
  stripPrefix?: string;
  metadata?: Record<string, any>;
  updatePublish?: boolean;
}
