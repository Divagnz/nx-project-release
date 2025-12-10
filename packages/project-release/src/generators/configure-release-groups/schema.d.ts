export interface ConfigureReleaseGroupsSchema {
  groupName?: string;
  registryType?:
    | 'npm'
    | 'nexus'
    | 's3'
    | 'github'
    | 'docker'
    | 'custom'
    | 'none';
  versionStrategy?: 'independent' | 'fixed';
  versionFiles?: string[];
  projects?: string[];
  projectPatterns?: string[];
  tagNamingFormat?: string;
  pathStrategy?: 'version' | 'hash' | 'flat' | 'semver';
  interactive?: boolean;
  action?: 'create' | 'update' | 'delete' | 'list';
}
