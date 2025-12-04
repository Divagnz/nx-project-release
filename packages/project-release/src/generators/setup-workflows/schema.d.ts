export interface SetupWorkflowsSchema {
  platform?: 'github' | 'gitlab' | 'circleci';
  workflowType?:
    | 'release-publish'
    | 'affected'
    | 'manual'
    | 'on-merge'
    | 'pr-validation'
    | 'all';
  defaultBranch?: string;
  enableWorkflowDispatch?: boolean;
  createGitHubRelease?: boolean;
  autoMergeReleasePR?: boolean;
  triggerPaths?: string[];
  nodeVersion?: string;
  twoStepRelease?: boolean;
}
