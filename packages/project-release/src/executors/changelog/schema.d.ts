export interface ChangelogExecutorSchema {
  dryRun?: boolean;
  preset?: 'angular' | 'atom' | 'codemirror' | 'conventionalcommits' | 'ember' | 'eslint' | 'express' | 'jquery' | 'jshint';
  changelogFile?: string;
  releaseCount?: number;
  from?: string;
  to?: string;
}