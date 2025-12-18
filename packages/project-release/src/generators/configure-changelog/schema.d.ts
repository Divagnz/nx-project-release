export interface ConfigureChangelogSchema {
  projects?: string[];
  dryRun?: boolean;
  changelogFile?: string;
  preset?:
    | 'angular'
    | 'atom'
    | 'codemirror'
    | 'conventionalcommits'
    | 'ember'
    | 'eslint'
    | 'express'
    | 'jquery'
    | 'jshint';
  from?: string;
  to?: string;
  releaseCount?: number;
  skipUnstable?: boolean;
  append?: boolean;
  context?: Record<string, any>;
  workspaceChangelog?: boolean;
  projectChangelogs?: boolean;
  infile?: string;
  includeCommitBody?: boolean;
  interactive?: boolean | 'all' | 'workspace' | 'projects';
}
