export interface ConfigurePublishSchema {
  projects?: string[];
  project?: string;
  configureRegistries?: Array<'npm' | 'nexus' | 's3' | 'custom'>;
  skipExisting?: boolean;
  updateArtifactDependency?: boolean;
  npmRegistry?: string;
  npmDistTag?: string;
  npmAccess?: 'public' | 'restricted';
  nexusUrl?: string;
  nexusRepository?: string;
  nexusPathStrategy?: 'flat' | 'version' | 'hash' | 'semver';
  s3Bucket?: string;
  s3Prefix?: string;
  s3Region?: string;
  s3PathStrategy?: 'flat' | 'version' | 'hash' | 'semver';
  customRegistryUrl?: string;
  listExisting?: boolean;
  interactive?: boolean;
}
