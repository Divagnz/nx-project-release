export interface ConfigureVersionSchema {
  projects?: string[];
  versionFiles?: string[];
  versionStrategy?: 'independent' | 'fixed';
  initialVersion?: string;
  validationStrategy?: Array<'registry' | 'git-tags' | 'disk'>;
  bumpDependents?: boolean;
  interactive?: boolean;
}
