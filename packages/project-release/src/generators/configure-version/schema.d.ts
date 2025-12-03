export interface ConfigureVersionSchema {
  projects?: string[];
  versionFiles?: string[];
  versionStrategy?: 'independent' | 'fixed';
  initialVersion?: string;
  tagNamingFormat?: string;
  tagNamingPrefix?: string;
  tagNamingSuffix?: string;
  includeProjectName?: boolean;
  bumpDependents?: boolean;
  interactive?: boolean;
}
