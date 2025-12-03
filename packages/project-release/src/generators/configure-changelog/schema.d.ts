export interface ConfigureChangelogSchema {
  projects?: string[];
  changelogFile?: string;
  preset?: 'angular' | 'conventionalcommits' | 'atom' | 'ember' | 'jshint';
  infile?: string;
  releaseCount?: number;
  skipUnstable?: boolean;
  includeCommitBody?: boolean;
  interactive?: boolean;
}
