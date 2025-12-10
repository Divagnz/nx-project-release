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
  interactive?: boolean;
}
