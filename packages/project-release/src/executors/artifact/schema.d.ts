export interface ArtifactExecutorSchema {
  sourceDir: string;
  outputDir?: string;
  artifactName?: string;
  format?: 'zip' | 'tar' | 'tgz' | 'tar.gz';
  include?: string[];
  exclude?: string[];
  compressionLevel?: number;
  preservePermissions?: boolean;
  stripPrefix?: string;
  metadata?: Record<string, unknown>;
}
