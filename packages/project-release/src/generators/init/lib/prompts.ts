import { Tree, getProjects, logger } from '@nx/devkit';
import Enquirer from 'enquirer';

const { prompt } = Enquirer;

export interface ConfigAnswers {
  executorType: 'individual' | 'all-in-one';
  selectedProjects: string[];
  configLocation: 'nx-json' | 'project-json' | 'both';

  // Version executor options
  versionStrategy: 'git-tag' | 'disk' | 'registry';
  versionFiles: string[];
  gitCommit: boolean;
  gitTag: boolean;
  gitPush: boolean;
  mergeAfterRelease: boolean;
  mergeToBranches: string[];
  mergeStrategy: 'merge' | 'squash' | 'rebase';
  commitMessage: string;
  trackDeps: boolean;
  syncVersions: boolean;

  // Changelog executor options
  preset: string;
  projectChangelogs: boolean;
  workspaceChangelog: boolean;

  // Publish executor options
  registryType: 'npm' | 'nexus' | 's3' | 'github' | 'custom';
  registryUrl: string;
  access: 'public' | 'restricted';
  distTag: string;
  buildTarget: string;
  pathStrategy?: 'version' | 'hash' | 'flat';

  // Tag naming options
  configureTagNaming: boolean;
  tagPrefix: string;
  tagFormat: string;

  // Release groups options
  configureReleaseGroups: boolean;
  releaseGroupsConfig?: {
    groupName: string;
    projectsPattern: string;
    versioning: 'fixed' | 'independent';
  }[];

  // Git hooks options
  setupHooks: boolean;
  hookOptions: {
    enablePreCommit: boolean;
    enablePrePush: boolean;
  };

  // GitHub Workflows options
  setupGitHubWorkflows: boolean;
  workflowType: 'single' | 'two-step' | 'batch' | 'none';
  createReleaseBranch: boolean;
  autoCreatePR: boolean;
}

export async function promptForConfig(tree: Tree): Promise<ConfigAnswers> {
  logger.info('');
  logger.info('🚀 Welcome to nx-project-release interactive setup!');
  logger.info('');

  // 1. Executor type choice
  const { executorType } = await prompt<{ executorType: 'individual' | 'all-in-one' }>({
    type: 'select',
    name: 'executorType',
    message: 'How would you like to configure releases?',
    choices: [
      {
        name: 'individual',
        message: 'Individual executors (version, changelog, publish separately)',
        hint: 'More granular control over each step'
      },
      {
        name: 'all-in-one',
        message: 'All-in-one executor (project-release for complete workflow)',
        hint: 'Simpler setup, runs all steps together'
      }
    ]
  });

  // 2. Project selection
  const projects = getProjects(tree);
  const projectChoices = Array.from(projects.entries()).map(([name, config]) => {
    const hasPackageJson = tree.exists(`${config.root}/package.json`);
    return {
      name,
      message: hasPackageJson ? `${name} (publishable)` : name,
      hint: hasPackageJson ? 'Has package.json' : undefined
    };
  });

  const { selectedProjects } = await prompt<{ selectedProjects: string[] }>({
    type: 'multiselect',
    name: 'selectedProjects',
    message: 'Select projects to configure for release:',
    choices: projectChoices,
    validate: (value) => value.length > 0 || 'Please select at least one project'
  });

  // 3. Version executor configuration
  logger.info('');
  logger.info('📋 Version Configuration');
  logger.info('');

  const { versionStrategy } = await prompt<{ versionStrategy: 'git-tag' | 'disk' | 'registry' }>({
    type: 'select',
    name: 'versionStrategy',
    message: 'How should the current version be determined?',
    choices: [
      { name: 'git-tag', message: 'Git tags (recommended)', hint: 'Read from latest git tag' },
      { name: 'disk', message: 'Version files', hint: 'Read from package.json or other files' },
      { name: 'registry', message: 'NPM registry', hint: 'Query npm registry for latest version' }
    ]
  });

  const { versionFiles } = await prompt<{ versionFiles: string[] }>({
    type: 'multiselect',
    name: 'versionFiles',
    message: 'Which files should be updated with the new version?',
    // @ts-expect-error - enquirer types are incomplete
    choices: ['package.json', 'project.json', 'version.txt'],
    initial: [0], // Select package.json by default
    validate: (value: string[]) => value.length > 0 || 'Please select at least one file'
  });

  const { gitCommit } = await prompt<{ gitCommit: boolean }>({
    type: 'confirm',
    name: 'gitCommit',
    message: 'Create git commits for version changes?',
    initial: true
  });

  const { gitTag } = await prompt<{ gitTag: boolean }>({
    type: 'confirm',
    name: 'gitTag',
    message: 'Create git tags for releases?',
    initial: true
  });

  const { gitPush } = await prompt<{ gitPush: boolean }>({
    type: 'confirm',
    name: 'gitPush',
    message: 'Automatically push commits and tags to remote?',
    initial: false
  });

  const { mergeAfterRelease } = await prompt<{ mergeAfterRelease: boolean }>({
    type: 'confirm',
    name: 'mergeAfterRelease',
    message: 'Sync version bumps and changelog to other branches after release?',
    initial: false
  });

  let mergeToBranches: string[] = [];
  let mergeStrategy: 'merge' | 'squash' | 'rebase' = 'merge';

  if (mergeAfterRelease) {
    logger.info('');
    logger.info('This will merge the release commit (version bumps + changelog) to keep branches in sync.');
    logger.info('Example: Release on main → merge to develop to sync version numbers');
    logger.info('');

    const { branches } = await prompt<{ branches: string }>({
      type: 'input',
      name: 'branches',
      message: 'Branches to sync release metadata to (comma-separated):',
      initial: 'develop',
      validate: (value: string) => value.trim().length > 0 || 'At least one branch is required'
    });
    mergeToBranches = branches.split(',').map(b => b.trim());

    const { strategy } = await prompt<{ strategy: 'merge' | 'squash' | 'rebase' }>({
      type: 'select',
      name: 'strategy',
      message: 'Merge strategy:',
      choices: [
        { name: 'merge', message: 'merge (standard git merge)', hint: 'Preserves release commit as-is' },
        { name: 'squash', message: 'squash (squash and merge)', hint: 'Combines into single commit' },
        { name: 'rebase', message: 'rebase (rebase and merge)', hint: 'Linear history' }
      ]
    });
    mergeStrategy = strategy;
  }

  let commitMessage = 'chore(release): {projectName} version {version}';
  if (gitCommit) {
    const response = await prompt<{ commitMessage: string }>({
      type: 'input',
      name: 'commitMessage',
      message: 'Commit message template (use {version}, {projectName} placeholders):',
      initial: 'chore(release): {projectName} version {version}'
    });
    commitMessage = response.commitMessage;
  }

  const { trackDeps } = await prompt<{ trackDeps: boolean }>({
    type: 'confirm',
    name: 'trackDeps',
    message: 'Version projects automatically when their dependencies change?',
    initial: false
  });

  const { syncVersions } = await prompt<{ syncVersions: boolean }>({
    type: 'confirm',
    name: 'syncVersions',
    message: 'Keep all project versions synchronized?',
    initial: false
  });

  // 4. Changelog executor configuration
  logger.info('');
  logger.info('📝 Changelog Configuration');
  logger.info('');

  const { preset } = await prompt<{ preset: string }>({
    type: 'select',
    name: 'preset',
    message: 'Which conventional commit preset?',
    choices: [
      { name: 'angular', message: 'Angular (recommended)' },
      { name: 'conventionalcommits', message: 'Conventional Commits' },
      { name: 'atom', message: 'Atom' },
      { name: 'ember', message: 'Ember' }
    ]
  });

  const { projectChangelogs } = await prompt<{ projectChangelogs: boolean }>({
    type: 'confirm',
    name: 'projectChangelogs',
    message: 'Generate per-project CHANGELOG.md files?',
    initial: true
  });

  const { workspaceChangelog } = await prompt<{ workspaceChangelog: boolean }>({
    type: 'confirm',
    name: 'workspaceChangelog',
    message: 'Generate workspace-level CHANGELOG.md?',
    initial: false
  });

  // 5. Publish executor configuration
  logger.info('');
  logger.info('📦 Publish Configuration');
  logger.info('');

  const { registryType } = await prompt<{ registryType: 'npm' | 'nexus' | 's3' | 'github' | 'custom' }>({
    type: 'select',
    name: 'registryType',
    message: 'Which registry type?',
    choices: [
      { name: 'npm', message: 'NPM Registry (default)', hint: 'Publish to npmjs.org or private npm registry' },
      { name: 'nexus', message: 'Nexus Repository', hint: 'Upload artifacts to Sonatype Nexus (raw repository)' },
      { name: 's3', message: 'AWS S3', hint: 'Upload artifacts to Amazon S3 bucket' },
      { name: 'github', message: 'GitHub Packages', hint: 'Publish to GitHub npm registry' },
      { name: 'custom', message: 'Custom Registry', hint: 'Use a custom npm-compatible registry' }
    ]
  });

  let registryUrl = 'https://registry.npmjs.org';
  if (registryType === 'github') {
    registryUrl = 'https://npm.pkg.github.com';
  } else if (registryType === 'custom') {
    const response = await prompt<{ registryUrl: string }>({
      type: 'input',
      name: 'registryUrl',
      message: 'Custom registry URL:',
      initial: 'https://registry.npmjs.org'
    });
    registryUrl = response.registryUrl;
  }

  // Path strategy for Nexus/S3
  let pathStrategy: 'version' | 'hash' | 'flat' | undefined;
  if (registryType === 'nexus' || registryType === 's3') {
    const { selectedPathStrategy } = await prompt<{ selectedPathStrategy: 'version' | 'hash' | 'flat' }>({
      type: 'select',
      name: 'selectedPathStrategy',
      message: 'Artifact path strategy:',
      choices: [
        { name: 'version', message: 'Version-based (recommended)', hint: 'e.g., 1.2.3/artifact.tgz' },
        { name: 'hash', message: 'Hash-based', hint: 'e.g., abc123.../artifact.tgz (when semver not available)' },
        ...(registryType === 's3' ? [{ name: 'flat' as const, message: 'Flat', hint: 'No subdirectories, just filename' }] : [])
      ]
    });
    pathStrategy = selectedPathStrategy;
  }

  const { access } = await prompt<{ access: 'public' | 'restricted' }>({
    type: 'select',
    name: 'access',
    message: 'Package access level (for NPM):',
    choices: [
      { name: 'public', message: 'Public' },
      { name: 'restricted', message: 'Restricted' }
    ]
  });

  const { distTag } = await prompt<{ distTag: string }>({
    type: 'select',
    name: 'distTag',
    message: 'Dist tag strategy for NPM packages:',
    choices: [
      { name: 'latest', message: 'latest (recommended for stable releases)', hint: 'npm install package gets this version' },
      { name: 'version', message: 'Use version number (e.g., v1.2.3)', hint: 'Explicit version tags for better control' },
      { name: 'beta', message: 'beta (for beta releases)', hint: 'npm install package@beta' },
      { name: 'next', message: 'next (for preview releases)', hint: 'npm install package@next' },
      { name: 'canary', message: 'canary (for daily/bleeding edge)', hint: 'npm install package@canary' }
    ]
  });

  const { buildTarget } = await prompt<{ buildTarget: string }>({
    type: 'input',
    name: 'buildTarget',
    message: 'Build target to run before publishing:',
    initial: 'build'
  });

  // 6. Tag Naming Configuration
  logger.info('');
  logger.info('🏷️  Tag Naming Configuration');
  logger.info('');

  const { configureTagNaming } = await prompt<{ configureTagNaming: boolean }>({
    type: 'confirm',
    name: 'configureTagNaming',
    message: 'Configure custom git tag naming?',
    initial: false
  });

  let tagPrefix = 'v';
  let tagFormat = 'v{version}';

  if (configureTagNaming) {
    const tagPrefixResponse = await prompt<{ tagPrefix: string }>({
      type: 'input',
      name: 'tagPrefix',
      message: 'Tag prefix (e.g., "v", "release-", or empty for no prefix):',
      initial: 'v'
    });
    tagPrefix = tagPrefixResponse.tagPrefix;

    const tagFormatResponse = await prompt<{ tagFormat: string }>({
      type: 'select',
      name: 'tagFormat',
      message: 'Tag format pattern:',
      choices: [
        { name: 'v{version}', message: 'v{version} (e.g., v1.0.0)', hint: 'Standard semantic versioning' },
        { name: '{projectName}-v{version}', message: '{projectName}-v{version} (e.g., my-lib-v1.0.0)', hint: 'Include project name' },
        { name: '{projectName}@{version}', message: '{projectName}@{version} (e.g., my-lib@1.0.0)', hint: 'NPM-style format' },
        { name: 'release-{version}', message: 'release-{version} (e.g., release-1.0.0)', hint: 'Custom prefix' }
      ]
    });
    tagFormat = tagFormatResponse.tagFormat;
  }

  // 7. Release Groups Configuration
  logger.info('');
  logger.info('📦 Release Groups Configuration');
  logger.info('');

  const { configureReleaseGroups } = await prompt<{ configureReleaseGroups: boolean }>({
    type: 'confirm',
    name: 'configureReleaseGroups',
    message: 'Set up release groups for organized versioning?',
    initial: false
  });

  let releaseGroupsConfig: { groupName: string; projectsPattern: string; versioning: 'fixed' | 'independent' }[] | undefined;

  if (configureReleaseGroups) {
    logger.info('');
    logger.info('Release groups allow you to organize projects with different versioning strategies.');
    logger.info('Examples: backend (api, server), frontend (web-*, mobile-*), libs (libs/*)');
    logger.info('');

    releaseGroupsConfig = [];
    let addMore = true;

    while (addMore) {
      const groupName = await prompt<{ groupName: string }>({
        type: 'input',
        name: 'groupName',
        message: 'Release group name:',
        validate: (value: string) => value.length > 0 || 'Group name is required'
      });

      const projectsPattern = await prompt<{ projectsPattern: string }>({
        type: 'input',
        name: 'projectsPattern',
        message: 'Projects pattern (comma-separated, e.g., "api,server" or "web-*,mobile-*"):',
        validate: (value: string) => value.length > 0 || 'At least one pattern is required'
      });

      const versioning = await prompt<{ versioning: 'fixed' | 'independent' }>({
        type: 'select',
        name: 'versioning',
        message: 'Versioning strategy for this group:',
        choices: [
          { name: 'fixed', message: 'Fixed (all projects share the same version)', hint: 'Synchronized releases' },
          { name: 'independent', message: 'Independent (each project has its own version)', hint: 'Separate releases' }
        ]
      });

      releaseGroupsConfig.push({
        groupName: groupName.groupName,
        projectsPattern: projectsPattern.projectsPattern,
        versioning: versioning.versioning
      });

      const addAnother = await prompt<{ addAnother: boolean }>({
        type: 'confirm',
        name: 'addAnother',
        message: 'Add another release group?',
        initial: false
      });

      addMore = addAnother.addAnother;
    }
  }

  // 8. Configuration location
  logger.info('');
  logger.info('⚙️  Configuration Location');
  logger.info('');

  const { configLocation } = await prompt<{ configLocation: 'nx-json' | 'project-json' | 'both' }>({
    type: 'select',
    name: 'configLocation',
    message: 'Where should the configuration be stored?',
    choices: [
      {
        name: 'both',
        message: 'Both (nx.json defaults + project.json overrides)',
        hint: 'Recommended: workspace defaults with project-level flexibility'
      },
      {
        name: 'nx-json',
        message: 'nx.json only (workspace defaults)',
        hint: 'All projects inherit the same configuration'
      },
      {
        name: 'project-json',
        message: 'project.json only (per-project)',
        hint: 'Configure each project individually'
      }
    ]
  });

  // 9. Git Hooks Setup
  logger.info('');
  logger.info('🪝 Git Hooks Setup');
  logger.info('');

  // Detect existing hook system
  const hasHusky = tree.exists('.husky/_/husky.sh') || tree.exists('.husky');
  const hookSystem = hasHusky ? 'Husky' : 'simple-git-hooks';

  if (hasHusky) {
    logger.info('📍 Detected: Husky (will add to existing setup)');
  } else {
    logger.info('📍 Will use: simple-git-hooks (lightweight)');
  }
  logger.info('');

  const { setupHooks } = await prompt<{ setupHooks: boolean }>({
    type: 'confirm',
    name: 'setupHooks',
    message: 'Set up git hooks for automatic project detection and validation?',
    initial: true
  });

  let enablePreCommit = false;
  let enablePrePush = false;

  if (setupHooks) {
    const { selectedHooks } = await prompt<{ selectedHooks: string[] }>({
      type: 'multiselect',
      name: 'selectedHooks',
      message: 'Which hooks would you like to enable?',
      // @ts-expect-error - enquirer types are incomplete
      choices: [
        {
          name: 'pre-commit',
          message: 'pre-commit: Auto-detect unconfigured projects',
          hint: 'Prompts to configure new projects before commit'
        },
        {
          name: 'pre-push',
          message: 'pre-push: Validate configurations',
          hint: 'Checks all release configs are valid before push'
        }
      ],
      initial: [0, 1], // Both selected by default
      validate: (value: string[]) => value.length > 0 || 'Select at least one hook'
    });

    enablePreCommit = selectedHooks.includes('pre-commit');
    enablePrePush = selectedHooks.includes('pre-push');
  }

  // 10. GitHub Workflows Setup
  logger.info('');
  logger.info('🔄 GitHub Workflows Setup');
  logger.info('');

  const { setupGitHubWorkflows } = await prompt<{ setupGitHubWorkflows: boolean }>({
    type: 'confirm',
    name: 'setupGitHubWorkflows',
    message: 'Set up GitHub Actions workflows for automated releases?',
    initial: false
  });

  let workflowType: 'single' | 'two-step' | 'batch' | 'none' = 'none';
  let createReleaseBranch = false;
  let autoCreatePR = false;

  if (setupGitHubWorkflows) {
    const { selectedWorkflowType } = await prompt<{ selectedWorkflowType: 'single' | 'two-step' | 'batch' }>({
      type: 'select',
      name: 'selectedWorkflowType',
      message: 'Which workflow pattern?',
      choices: [
        {
          name: 'batch',
          message: 'Batch: Release multiple projects in one PR',
          hint: 'Recommended for monorepos: One release branch for all affected projects'
        },
        {
          name: 'two-step',
          message: 'Two-step: PR creation + manual merge & publish',
          hint: 'Creates PR for review, publishes after merge (one project at a time)'
        },
        {
          name: 'single',
          message: 'Single-step: Automated version bump & publish',
          hint: 'Direct push to main with automated publishing'
        }
      ]
    });

    workflowType = selectedWorkflowType;

    if (workflowType === 'batch') {
      createReleaseBranch = true;
      autoCreatePR = true;
      logger.info('✓ Will create: batch release workflow (one branch for all projects) + publish workflow');
    } else if (workflowType === 'two-step') {
      createReleaseBranch = true;
      autoCreatePR = true;
      logger.info('✓ Will create: release branch workflow + publish workflow');
    } else {
      logger.info('✓ Will create: single automated release workflow');
    }
  }

  return {
    executorType,
    selectedProjects,
    configLocation,
    versionStrategy,
    versionFiles,
    gitCommit,
    gitTag,
    gitPush,
    mergeAfterRelease,
    mergeToBranches,
    mergeStrategy,
    commitMessage,
    trackDeps,
    syncVersions,
    preset,
    projectChangelogs,
    workspaceChangelog,
    registryType,
    registryUrl,
    access,
    distTag,
    buildTarget,
    pathStrategy,
    configureTagNaming,
    tagPrefix,
    tagFormat,
    configureReleaseGroups,
    releaseGroupsConfig,
    setupHooks,
    hookOptions: {
      enablePreCommit,
      enablePrePush
    },
    setupGitHubWorkflows,
    workflowType,
    createReleaseBranch,
    autoCreatePR
  };
}
