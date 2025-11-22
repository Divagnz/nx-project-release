import { Tree, getProjects, logger } from '@nx/devkit';
import { prompt } from 'enquirer';

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
  commitMessage: string;
  trackDeps: boolean;
  syncVersions: boolean;

  // Changelog executor options
  preset: string;
  projectChangelogs: boolean;
  workspaceChangelog: boolean;

  // Publish executor options
  registryType: 'npm' | 'github' | 'custom';
  registryUrl: string;
  access: 'public' | 'restricted';
  distTag: string;
  buildTarget: string;
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
    choices: ['package.json', 'project.json', 'version.txt'],
    initial: [0], // Select package.json by default
    validate: (value: any) => value.length > 0 || 'Please select at least one file'
  } as any);

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

  let commitMessage = 'chore(release): {projectName} version {version}';
  if (gitCommit) {
    const response = await prompt<{ commitMessage: string }>({
      type: 'input',
      name: 'commitMessage',
      message: 'Commit message template (use {version}, {projectName} placeholders):',
      initial: 'chore(release): {projectName} version {version}'
    } as any);
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

  const { registryType } = await prompt<{ registryType: 'npm' | 'github' | 'custom' }>({
    type: 'select',
    name: 'registryType',
    message: 'Which registry type?',
    choices: [
      { name: 'npm', message: 'NPM Registry (default)' },
      { name: 'github', message: 'GitHub Packages' },
      { name: 'custom', message: 'Custom Registry' }
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

  const { access } = await prompt<{ access: 'public' | 'restricted' }>({
    type: 'select',
    name: 'access',
    message: 'Package access level:',
    choices: [
      { name: 'public', message: 'Public' },
      { name: 'restricted', message: 'Restricted' }
    ]
  });

  const { distTag } = await prompt<{ distTag: string }>({
    type: 'input',
    name: 'distTag',
    message: 'Dist tag for published packages:',
    initial: 'latest'
  });

  const { buildTarget } = await prompt<{ buildTarget: string }>({
    type: 'input',
    name: 'buildTarget',
    message: 'Build target to run before publishing:',
    initial: 'build'
  });

  // 6. Configuration location
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

  return {
    executorType,
    selectedProjects,
    configLocation,
    versionStrategy,
    versionFiles,
    gitCommit,
    gitTag,
    gitPush,
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
    buildTarget
  };
}
