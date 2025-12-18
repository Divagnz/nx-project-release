export interface ConfigureVersionSchema {
  projects?: string[];
  versionFiles?: string[];

  // OLD (deprecated but supported for backward compatibility)
  /** @deprecated Use projectsRelationship instead */
  versionStrategy?: 'independent' | 'fixed';
  /** @deprecated Use trackDeps instead */
  bumpDependents?: boolean;
  /** @deprecated Use currentVersionResolver and fallbackCurrentVersionResolver instead */
  validationStrategy?: Array<'registry' | 'git-tags' | 'disk'>;

  // NEW (preferred options)
  projectsRelationship?: 'independent' | 'fixed';
  trackDeps?: boolean;
  currentVersionResolver?: 'disk' | 'git-tag' | 'registry';
  fallbackCurrentVersionResolver?: 'disk' | 'git-tag' | 'registry';

  // MISSING OPTIONS (from executor)
  versionPath?: string;
  tagNaming?: {
    prefix?: string;
    suffix?: string;
    format?: string;
    includeProjectName?: boolean;
  };
  syncVersions?: boolean;
  syncProjects?: string[];
  syncStrategy?: 'highest' | 'bump';
  postTargets?: string[];
  postTargetOptions?: Record<string, any>;

  // GENERATOR HELPERS
  initialVersion?: string;
  interactive?: boolean;
}
