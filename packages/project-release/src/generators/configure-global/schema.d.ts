export interface ConfigureGlobalSchema {
  projectsRelationship?: 'independent' | 'fixed';
  versionFiles?: string[];
  tagNamingFormat?: string;
  tagNamingPrefix?: string;
  tagNamingSuffix?: string;
  includeProjectName?: boolean;
  changelogPreset?:
    | 'angular'
    | 'conventionalcommits'
    | 'atom'
    | 'ember'
    | 'jshint';
  registryType?:
    | 'npm'
    | 'nexus'
    | 's3'
    | 'github'
    | 'docker'
    | 'custom'
    | 'none';
  registryUrl?: string;
  interactive?: boolean;
}
