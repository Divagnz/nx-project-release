import { Tree, readNxJson, getProjects } from '@nx/devkit';

export function detectExistingConfiguration(tree: Tree): {
  hasNxJsonConfig: boolean;
  hasProjectConfigs: boolean;
  configuredProjects: string[];
} {
  const nxJson = readNxJson(tree);
  const hasNxJsonConfig =
    !!nxJson?.targetDefaults?.['nx-project-release:version'] ||
    !!nxJson?.targetDefaults?.['nx-project-release:changelog'] ||
    !!nxJson?.targetDefaults?.['nx-project-release:publish'] ||
    !!nxJson?.targetDefaults?.['nx-project-release:project-release'];

  const projects = getProjects(tree);
  const configuredProjects: string[] = [];

  for (const [name, config] of projects.entries()) {
    const hasReleaseTargets =
      !!config.targets?.version ||
      !!config.targets?.changelog ||
      !!config.targets?.publish ||
      !!config.targets?.['project-release'];

    if (hasReleaseTargets) {
      configuredProjects.push(name);
    }
  }

  return {
    hasNxJsonConfig,
    hasProjectConfigs: configuredProjects.length > 0,
    configuredProjects
  };
}

export function getPublishableProjects(tree: Tree): string[] {
  const projects = getProjects(tree);
  const publishableProjects: string[] = [];

  for (const [name, config] of projects.entries()) {
    const packageJsonPath = `${config.root}/package.json`;
    if (tree.exists(packageJsonPath)) {
      publishableProjects.push(name);
    }
  }

  return publishableProjects;
}

export function getDefaultAnswers() {
  return {
    executorType: 'all-in-one' as const,
    selectedProjects: [],
    configLocation: 'both' as const,
    versionStrategy: 'git-tag' as const,
    versionFiles: ['package.json'],
    gitCommit: true,
    gitTag: true,
    gitPush: false,
    commitMessage: 'chore(release): {projectName} version {version}',
    trackDeps: false,
    syncVersions: false,
    preset: 'angular',
    projectChangelogs: true,
    workspaceChangelog: false,
    registryType: 'npm' as const,
    registryUrl: 'https://registry.npmjs.org',
    access: 'public' as const,
    distTag: 'latest',
    buildTarget: 'build',
    configureTagNaming: false,
    tagPrefix: 'v',
    tagFormat: 'v{version}',
    configureReleaseGroups: false,
    releaseGroupsConfig: undefined,
    setupHooks: false,
    hookOptions: {
      enablePreCommit: false,
      enablePrePush: false
    },
    setupGitHubWorkflows: false,
    workflowType: 'none' as const,
    createReleaseBranch: false,
    autoCreatePR: false
  };
}
