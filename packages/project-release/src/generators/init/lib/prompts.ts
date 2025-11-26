import { Tree, getProjects, logger } from '@nx/devkit';
import Enquirer from 'enquirer';

const { prompt } = Enquirer;

export interface ReleaseGroup {
  groupName: string;
  registryType: 'npm' | 'nexus' | 's3' | 'github' | 'custom' | 'none';
  registryUrl?: string;
  versionStrategy: 'git-tag' | 'disk' | 'registry';
  versionFiles: string[];
  pathStrategy?: 'version' | 'hash' | 'flat';
  tagPrefix?: string;
  tagFormat?: string;
  projects: string[];
}

export interface ConfigAnswers {
  executorType: 'individual' | 'all-in-one';
  useReleaseGroups: boolean;

  // Release groups (if useReleaseGroups = true)
  releaseGroups?: ReleaseGroup[];

  // Global settings
  gitCommit: boolean;
  gitTag: boolean;
  ciOnly: boolean;
  mergeAfterRelease: boolean;
  mergeToBranches: string[];
  mergeStrategy: 'merge' | 'squash' | 'rebase';
  commitMessage: string;
  trackDeps: boolean;

  // Changelog options
  preset: string;
  projectChangelogs: boolean;
  workspaceChangelog: boolean;

  // Tag naming options
  configureTagNaming: boolean;
  tagPrefix: string;
  tagFormat: string;

  // Git hooks options
  setupHooks: boolean;
  hookOptions: {
    enablePreCommit: boolean;
    enablePrePush: boolean;
  };

  // Commit validation options
  setupCommitValidation: boolean;
  commitValidationOptions: {
    enableCommitizen: boolean;
    enableCommitlint: boolean;
    useNxScopes: boolean;
  };

  // GitHub Workflows options
  setupGitHubWorkflows: boolean;
  workflowType: 'single' | 'two-step' | 'none';
  createReleaseBranch: boolean;
  autoCreatePR: boolean;

  // Legacy fields for backward compatibility
  selectedProjects: string[];
  excludedProjects: string[];
  configLocation: 'nx-json' | 'project-json' | 'both';
  versionStrategy: 'git-tag' | 'disk' | 'registry';
  versionFiles: string[];
  syncVersions: boolean;
  registryType: 'npm' | 'nexus' | 's3' | 'github' | 'custom' | 'none';
  registryUrl: string;
  access: 'public' | 'restricted';
  distTag: string;
  buildTarget: string;
  pathStrategy?: 'version' | 'hash' | 'flat';
  configureReleaseGroups: boolean;
  releaseGroupsConfig?: {
    groupName: string;
    projectsPattern: string;
    versioning: 'fixed' | 'independent';
  }[];
}

export async function promptForConfig(tree: Tree): Promise<ConfigAnswers> {
  logger.info('');
  logger.info('🚀 Welcome to nx-project-release interactive setup!');
  logger.info('');

  // 1. Global Git Configuration
  logger.info('');
  logger.info('⚙️  Git Configuration');
  logger.info('');

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

  const { ciOnly } = await prompt<{ ciOnly: boolean }>({
    type: 'confirm',
    name: 'ciOnly',
    message: 'Enforce CI-only releases (prevent accidental local releases)?',
    initial: true
  });

  if (ciOnly) {
    logger.info('');
    logger.info('✓ CI-only mode enabled (recommended for safety)');
    logger.info('  Git operations (commit/tag/push) will only run in CI environments.');
    logger.info('  Commits and tags will be automatically pushed in CI.');
    logger.info('  Set --ciOnly=false to test locally (use --gitPush=false to prevent push).');
    logger.info('');
  } else {
    logger.info('');
    logger.info('⚠ CI-only mode disabled');
    logger.info('  Git operations can run locally. Use --gitPush flag to control push behavior.');
    logger.info('');
  }

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

  // 2. Changelog Configuration
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

  // 3. NPM Configuration
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

  // 4. Tag Naming Configuration
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

  // 5. Configuration Location
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

  // 6. Git Hooks Setup
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

  // 7. Commit Validation Setup
  logger.info('');
  logger.info('✅ Commit Validation Setup');
  logger.info('');
  logger.info('Enforce conventional commits with validated scopes');
  logger.info('');

  const { setupCommitValidation } = await prompt<{ setupCommitValidation: boolean }>({
    type: 'confirm',
    name: 'setupCommitValidation',
    message: 'Set up commit validation (commitizen + commitlint)?',
    initial: true
  });

  let enableCommitizen = false;
  let enableCommitlint = false;
  let useNxScopes = false;

  if (setupCommitValidation) {
    const { selectedTools } = await prompt<{ selectedTools: string[] }>({
      type: 'multiselect',
      name: 'selectedTools',
      message: 'Which tools would you like to enable?',
      // @ts-expect-error - enquirer types are incomplete
      choices: [
        {
          name: 'commitizen',
          message: 'commitizen: Interactive commit helper',
          hint: 'Prompts for conventional commit format (use: npm run commit)'
        },
        {
          name: 'commitlint',
          message: 'commitlint: Commit message validation',
          hint: 'Validates commit messages follow conventional format'
        }
      ],
      initial: [0, 1], // Both selected by default
      validate: (value: string[]) => value.length > 0 || 'Select at least one tool'
    });

    enableCommitizen = selectedTools.includes('commitizen');
    enableCommitlint = selectedTools.includes('commitlint');

    if (enableCommitlint) {
      const { enableNxScopes } = await prompt<{ enableNxScopes: boolean }>({
        type: 'confirm',
        name: 'enableNxScopes',
        message: 'Validate scopes against Nx project names?',
        initial: true
      });
      useNxScopes = enableNxScopes;
    }
  }

  // 8. GitHub Workflows Setup
  logger.info('');
  logger.info('🔄 GitHub Workflows Setup');
  logger.info('');

  const { setupGitHubWorkflows } = await prompt<{ setupGitHubWorkflows: boolean }>({
    type: 'confirm',
    name: 'setupGitHubWorkflows',
    message: 'Set up GitHub Actions workflows for automated releases?',
    initial: false
  });

  let workflowType: 'single' | 'two-step' | 'none' = 'none';
  let createReleaseBranch = false;
  let autoCreatePR = false;

  if (setupGitHubWorkflows) {
    const { selectedWorkflowType } = await prompt<{ selectedWorkflowType: 'single' | 'two-step' }>({
      type: 'select',
      name: 'selectedWorkflowType',
      message: 'Which workflow pattern?',
      choices: [
        {
          name: 'two-step',
          message: 'Two-step: PR creation + manual merge & publish',
          hint: 'Creates release branch + PR for review, publishes after merge'
        },
        {
          name: 'single',
          message: 'Single-step: Automated version bump & publish',
          hint: 'Direct push to main with automated publishing'
        }
      ]
    });

    workflowType = selectedWorkflowType;

    if (workflowType === 'two-step') {
      createReleaseBranch = true;
      autoCreatePR = true;
      logger.info('✓ Will create: release branch workflow + publish workflow');
    } else {
      logger.info('✓ Will create: single automated release workflow');
    }
  }

  // 8. Create Release Groups
  logger.info('');
  logger.info('📦 Create Release Groups');
  logger.info('');
  logger.info('Release groups are configuration templates that organize projects');
  logger.info('by type, registry, or deployment target.');
  logger.info('');
  logger.info('Examples:');
  logger.info('  • "backend-services" → Nexus, project.json versions');
  logger.info('  • "npm-libraries" → npm registry, package.json + git tags');
  logger.info('  • "frontend-apps" → No publishing, git tags only');
  logger.info('');
  logger.info('Note: All projects always version independently based on their commits.');
  logger.info('');

  const releaseGroups: ReleaseGroup[] = [];
  let addMore = true;

  while (addMore) {
      // Group name
      const { groupName } = await prompt<{ groupName: string }>({
        type: 'input',
        name: 'groupName',
        message: 'Release group name:',
        validate: (value: string) => value.length > 0 || 'Group name is required'
      });

      // Do they want to publish artifacts?
      const { shouldPublish } = await prompt<{ shouldPublish: boolean }>({
        type: 'confirm',
        name: 'shouldPublish',
        message: `[${groupName}] Publish artifacts to a registry?`,
        initial: true
      });

      // Registry type (only if publishing)
      let registryType: 'npm' | 'nexus' | 's3' | 'github' | 'custom' | 'none' = 'none';

      if (shouldPublish) {
        const registryTypeResponse = await prompt<{ registryType: 'npm' | 'nexus' | 's3' | 'github' | 'custom' }>({
          type: 'select',
          name: 'registryType',
          message: `[${groupName}] Registry type:`,
          choices: [
            { name: 'npm', message: 'NPM Registry', hint: 'Publish to npmjs.org or private npm registry' },
            { name: 'nexus', message: 'Nexus Repository', hint: 'Upload artifacts to Sonatype Nexus (raw repository)' },
            { name: 's3', message: 'AWS S3', hint: 'Upload artifacts to Amazon S3 bucket' },
            { name: 'github', message: 'GitHub Packages', hint: 'Publish to GitHub npm registry' },
            { name: 'custom', message: 'Custom Registry', hint: 'Use a custom npm-compatible registry' }
          ]
        });
        registryType = registryTypeResponse.registryType;
      } else {
        logger.info('');
        logger.info(`  Skipping registry configuration (version-only group)`);
        logger.info('');
      }

      // Registry URL (if needed)
      let registryUrl: string | undefined;
      if (registryType === 'github') {
        registryUrl = 'https://npm.pkg.github.com';
      } else if (registryType === 'custom') {
        const response = await prompt<{ registryUrl: string }>({
          type: 'input',
          name: 'registryUrl',
          message: `[${groupName}] Custom registry URL:`,
          initial: 'https://registry.npmjs.org'
        });
        registryUrl = response.registryUrl;
      }

      // Version strategy
      const { versionStrategy } = await prompt<{ versionStrategy: 'git-tag' | 'disk' | 'registry' }>({
        type: 'select',
        name: 'versionStrategy',
        message: `[${groupName}] How should the current version be determined?`,
        choices: [
          { name: 'git-tag', message: 'Git tags (recommended)', hint: 'Read from latest git tag' },
          { name: 'disk', message: 'Version files', hint: 'Read from package.json or other files' },
          { name: 'registry', message: 'NPM registry', hint: 'Query npm registry for latest version' }
        ]
      });

      // Version files
      const { versionFiles } = await prompt<{ versionFiles: string[] }>({
        type: 'multiselect',
        name: 'versionFiles',
        message: `[${groupName}] Which files should be updated with the new version?`,
        // @ts-expect-error - enquirer types are incomplete
        choices: ['package.json', 'project.json', 'version.txt'],
        initial: [0], // Select package.json by default
        validate: (value: string[]) => value.length > 0 || 'Please select at least one file'
      });

      // Path strategy for Nexus/S3
      let pathStrategy: 'version' | 'hash' | 'flat' | undefined;
      if (registryType === 'nexus' || registryType === 's3') {
        const { selectedPathStrategy } = await prompt<{ selectedPathStrategy: 'version' | 'hash' | 'flat' }>({
          type: 'select',
          name: 'selectedPathStrategy',
          message: `[${groupName}] Artifact path strategy:`,
          choices: [
            { name: 'version', message: 'Version-based (recommended)', hint: 'e.g., 1.2.3/artifact.tgz' },
            { name: 'hash', message: 'Hash-based', hint: 'e.g., abc123.../artifact.tgz (when semver not available)' },
            ...(registryType === 's3' ? [{ name: 'flat' as const, message: 'Flat', hint: 'No subdirectories, just filename' }] : [])
          ]
        });
        pathStrategy = selectedPathStrategy;
      }

      releaseGroups.push({
        groupName,
        registryType,
        registryUrl,
        versionStrategy,
        versionFiles,
        pathStrategy,
        projects: [] // Will be populated when assigning projects
      });

      const { addAnother } = await prompt<{ addAnother: boolean }>({
        type: 'confirm',
        name: 'addAnother',
        message: 'Add another release group?',
        initial: false
      });

      addMore = addAnother;
  }

  // 9. Assign Projects to Groups
  logger.info('');
  logger.info('📋 Assign Projects to Release Groups');
  logger.info('');
  logger.info('For each project, type a group number or X to skip:');
  logger.info('');

  // Show available groups
  releaseGroups.forEach((group, index) => {
    logger.info(`  ${index + 1}: ${group.groupName} (${group.registryType})`);
  });
  logger.info(`  X: Skip (no release)`);
  logger.info('');

  const projects = getProjects(tree);
  const projectList = Array.from(projects.entries()).map(([name, config]) => {
    // Determine project type based on projectType field or path conventions
    let projectType = 'lib'; // default
    if (config.projectType === 'application') {
      projectType = 'app';
    } else if (config.projectType === 'library') {
      projectType = 'lib';
    } else if (config.root?.startsWith('apps/')) {
      projectType = 'app';
    } else if (config.root?.startsWith('libs/')) {
      projectType = 'lib';
    } else if (config.root?.startsWith('tools/')) {
      projectType = 'tool';
    }

    const hasPackageJson = tree.exists(`${config.root}/package.json`);

    return {
      name,
      projectType,
      hasPackageJson
    };
  });

  // Assign each project to a group
  const selectedProjects: string[] = [];
  const excludedProjects: string[] = [];

  for (const project of projectList) {
    const validChoices = releaseGroups.map((_, index) => String(index + 1));
    validChoices.push('X', 'x');

    const { groupChoice } = await prompt<{ groupChoice: string }>({
      type: 'input',
      name: 'groupChoice',
      message: `${project.name} (${project.projectType}):`,
      validate: (value: string) => {
        if (!value || !validChoices.includes(value.trim())) {
          return `Please enter a valid group number (1-${releaseGroups.length}) or X to skip`;
        }
        return true;
      }
    });

    const choice = groupChoice.trim();
    if (choice.toLowerCase() === 'x') {
      excludedProjects.push(project.name);
    } else {
      const groupIndex = parseInt(choice) - 1;
      releaseGroups[groupIndex].projects.push(project.name);
      selectedProjects.push(project.name);
    }
  }

  logger.info('');
  logger.info('Project assignment complete:');
  releaseGroups.forEach(group => {
    if (group.projects.length > 0) {
      logger.info(`  ${group.groupName}: ${group.projects.length} project(s)`);
    }
  });
  const skippedCount = projectList.length - selectedProjects.length;
  if (skippedCount > 0) {
    logger.info(`  Skipped: ${skippedCount} project(s)`);
  }
  logger.info('');

  return {
    executorType: 'individual', // Default to individual since we don't ask anymore
    useReleaseGroups: true, // Always use release groups
    releaseGroups,
    selectedProjects,
    excludedProjects,
    configLocation,
    // Legacy fields - use first group's settings as defaults
    versionStrategy: releaseGroups[0]?.versionStrategy || 'git-tag',
    versionFiles: releaseGroups[0]?.versionFiles || ['package.json'],
    gitCommit,
    gitTag,
    ciOnly,
    mergeAfterRelease,
    mergeToBranches,
    mergeStrategy,
    commitMessage,
    trackDeps,
    syncVersions,
    preset,
    projectChangelogs,
    workspaceChangelog,
    registryType: releaseGroups[0]?.registryType || 'npm',
    registryUrl: releaseGroups[0]?.registryUrl || 'https://registry.npmjs.org',
    access,
    distTag,
    buildTarget,
    pathStrategy: releaseGroups[0]?.pathStrategy,
    configureTagNaming,
    tagPrefix,
    tagFormat,
    configureReleaseGroups: true, // Always true
    releaseGroupsConfig: undefined, // Legacy field, replaced by releaseGroups
    setupHooks,
    hookOptions: {
      enablePreCommit,
      enablePrePush
    },
    setupCommitValidation,
    commitValidationOptions: {
      enableCommitizen,
      enableCommitlint,
      useNxScopes
    },
    setupGitHubWorkflows,
    workflowType,
    createReleaseBranch,
    autoCreatePR
  };
}
