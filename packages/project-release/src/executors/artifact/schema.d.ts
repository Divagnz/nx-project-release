export interface ArtifactExecutorSchema {
  sourceDir: string;
  outputDir?: string;
  artifactName?: string;
  format?: 'zip' | 'tar' | 'tgz' | 'tar.gz';
  include?: string[];
  exclude?: string[];
  compressionLevel?: number;
  preservePermissions?: boolean;
  /**
   * Remove prefix from archive entry paths.
   * @remarks Only supported for `zip` format. Ignored for `tar`, `tgz`, and `tar.gz` — a warning is logged at runtime.
   */
  stripPrefix?: string;
  metadata?: Record<string, unknown>;
  /** Log what would be created without writing any files to disk */
  dryRun?: boolean;
}
