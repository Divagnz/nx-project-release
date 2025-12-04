import {
  Tree,
  readProjectConfiguration,
  updateProjectConfiguration,
  readNxJson,
  updateNxJson,
  logger,
} from '@nx/devkit';
import { ConfigAnswers } from './prompts';

interface TargetDefault {
  cache?: boolean;
  options?: Record<string, unknown>;
  dependsOn?: string[];
}

export function buildNxJsonTargetDefaults(
  answers: ConfigAnswers
): Record<string, TargetDefault> {
  const targetDefaults: Record<string, TargetDefault> = {};

  if (answers.executorType === 'individual') {
    // Version executor configuration
    targetDefaults['nx-project-release:version'] = {
      cache: false,
      options: {
        versionFiles: answers.versionFiles,
        trackDeps: answers.trackDeps,
        syncVersions: answers.syncVersions,
      },
    };

    // Add version strategy specific options
    if (answers.versionStrategy === 'git-tag') {
      targetDefaults[
        'nx-project-release:version'
      ].options.currentVersionResolver = 'git-tag';
      targetDefaults[
        'nx-project-release:version'
      ].options.fallbackCurrentVersionResolver = 'disk';
    } else if (answers.versionStrategy === 'registry') {
      targetDefaults[
        'nx-project-release:version'
      ].options.currentVersionResolver = 'registry';
      targetDefaults[
        'nx-project-release:version'
      ].options.fallbackCurrentVersionResolver = 'git-tag';
    } else {
      targetDefaults[
        'nx-project-release:version'
      ].options.currentVersionResolver = 'disk';
    }

    // Changelog executor configuration
    targetDefaults['nx-project-release:changelog'] = {
      cache: false,
      options: {
        preset: answers.preset,
        projectChangelogs: answers.projectChangelogs,
      },
    };

    // Artifact executor configuration
    targetDefaults['nx-project-release:artifact'] = {
      cache: false,
      dependsOn: [answers.buildTarget],
      options: {
        sourceDir: 'dist/{projectRoot}',
        outputDir: 'dist/artifacts',
        format: 'tgz',
      },
    };

    // Release executor configuration
    targetDefaults['nx-project-release:release'] = {
      cache: false,
      options: {
        gitPush: false,
        createGitHubRelease: false,
      },
    };

    // Publish executor configuration
    targetDefaults['nx-project-release:publish'] = {
      cache: false,
      dependsOn: [answers.buildTarget],
      options: {
        registryType: answers.registryType,
        registry: answers.registryUrl,
        access: answers.access,
        distTag: answers.distTag,
      },
    };
  } else {
    // All-in-one project-release executor
    targetDefaults['nx-project-release:project-release'] = {
      cache: false,
      dependsOn: [answers.buildTarget],
      options: {
        // Version options
        versionFiles: answers.versionFiles,
        gitCommit: answers.gitCommit,
        gitTag: answers.gitTag,
        ciOnly: answers.ciOnly,
        gitCommitMessage: answers.commitMessage,
        trackDeps: answers.trackDeps,
        syncVersions: answers.syncVersions,

        // Changelog options
        preset: answers.preset,
        projectChangelogs: answers.projectChangelogs,

        // Publish options
        registryType: answers.registryType,
        registry: answers.registryUrl,
        access: answers.access,
        distTag: answers.distTag,
      },
    };

    // Add version strategy
    if (answers.versionStrategy === 'git-tag') {
      targetDefaults[
        'nx-project-release:project-release'
      ].options.currentVersionResolver = 'git-tag';
      targetDefaults[
        'nx-project-release:project-release'
      ].options.fallbackCurrentVersionResolver = 'disk';
    } else if (answers.versionStrategy === 'registry') {
      targetDefaults[
        'nx-project-release:project-release'
      ].options.currentVersionResolver = 'registry';
      targetDefaults[
        'nx-project-release:project-release'
      ].options.fallbackCurrentVersionResolver = 'git-tag';
    } else {
      targetDefaults[
        'nx-project-release:project-release'
      ].options.currentVersionResolver = 'disk';
    }
  }

  return targetDefaults;
}

export function updateNxJsonConfiguration(
  tree: Tree,
  answers: ConfigAnswers,
  skipPrompts = false
): void {
  const nxJson = readNxJson(tree);
  if (!nxJson) {
    throw new Error('Could not read nx.json');
  }

  if (!nxJson.targetDefaults) {
    nxJson.targetDefaults = {};
  }

  // Build and merge target defaults
  const newTargetDefaults = buildNxJsonTargetDefaults(answers);
  Object.assign(nxJson.targetDefaults, newTargetDefaults);

  // Add projectRelease configuration section (always create it to hold excludedProjects, releaseGroups, tagNaming, etc.)
  // This is a ROOT-LEVEL property in nx.json, NOT inside targetDefaults
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nxJsonAny = nxJson as any;

  if (!nxJsonAny.projectRelease) {
    nxJsonAny.projectRelease = {};
  }

  // Only add documentation/examples if user skipped wizard (using --skip-prompts flag OR skip in wizard)
  const userSkippedWizard = skipPrompts || answers._wizardSkipped || false;

  // Add excluded projects configuration
  if (answers.excludedProjects && answers.excludedProjects.length > 0) {
    nxJsonAny.projectRelease.excludedProjects = answers.excludedProjects;
    logger.info(
      `✅ Added ${answers.excludedProjects.length} excluded projects to nx.json`
    );
  }

  // Add minimal default configuration
  if (!nxJsonAny.projectRelease.projectsRelationship) {
    nxJsonAny.projectRelease.projectsRelationship = 'independent';
  }
  if (!nxJsonAny.projectRelease.versionFiles) {
    nxJsonAny.projectRelease.versionFiles = ['package.json'];
  }
  if (!nxJsonAny.projectRelease.changelogPreset) {
    nxJsonAny.projectRelease.changelogPreset = 'angular';
  }

  // Add tag naming configuration
  if (answers.configureTagNaming) {
    nxJsonAny.projectRelease.tagNaming = {
      prefix: answers.tagPrefix,
      format: answers.tagFormat,
    };
    logger.info('✅ Added tag naming configuration to nx.json');
  }

  // Add release groups configuration (new format)
  if (
    answers.useReleaseGroups &&
    answers.releaseGroups &&
    answers.releaseGroups.length > 0
  ) {
    nxJsonAny.projectRelease.releaseGroups = {};

    for (const group of answers.releaseGroups) {
      nxJsonAny.projectRelease.releaseGroups[group.groupName] = {
        registryType: group.registryType,
        registryUrl: group.registryUrl,
        versionStrategy: group.versionStrategy,
        versionFiles: group.versionFiles,
        pathStrategy: group.pathStrategy,
        projects: group.projects,
      };
    }

    logger.info(
      `✅ Added ${answers.releaseGroups.length} release groups to nx.json`
    );
  }

  // Add release groups configuration (legacy format - for backward compatibility)
  if (answers.configureReleaseGroups && answers.releaseGroupsConfig) {
    nxJsonAny.projectRelease.releaseGroups = {};

    for (const group of answers.releaseGroupsConfig) {
      const projects = group.projectsPattern.split(',').map((p) => p.trim());

      nxJsonAny.projectRelease.releaseGroups[group.groupName] = {
        projects,
        projectsRelationship: group.versioning,
        tagNaming: {
          format:
            group.versioning === 'independent'
              ? '{projectName}@{version}'
              : `${group.groupName}-v{version}`,
        },
      };
    }

    logger.info('✅ Added release groups configuration to nx.json');
  }

  updateNxJson(tree, nxJson);
  logger.info('✅ Updated nx.json with targetDefaults');

  // Create example configuration file ONLY if user skipped wizard
  if (userSkippedWizard) {
    createExampleConfigFile(tree);
  }
}

function createExampleConfigFile(tree: Tree): void {
  const exampleConfig = `# nx-project-release Configuration Examples

This file contains comprehensive examples for configuring nx-project-release.
Copy the relevant sections to your nx.json file and customize as needed.

## Basic Configuration

Add to the root level of nx.json (not inside targetDefaults):

\`\`\`json
{
  "projectRelease": {
    "projectsRelationship": "independent",  // or "fixed" to share versions
    "versionFiles": ["package.json"],       // where to store version
    "changelogPreset": "angular"            // commit message format
  }
}
\`\`\`

## Excluded Projects

Skip certain projects (e2e tests, internal tools, etc.):

\`\`\`json
{
  "projectRelease": {
    "excludedProjects": [
      "my-app-e2e",
      "another-app-e2e",
      "internal-tool"
    ]
  }
}
\`\`\`

Or use the generator: \`nx g nx-project-release:exclude-projects\`

## Default Registry

Set default registry for all projects (can be overridden per group/project):

\`\`\`json
{
  "projectRelease": {
    "defaultRegistry": {
      "type": "npm",
      "url": "https://registry.npmjs.org"
    }
  }
}
\`\`\`

Registry types: npm, nexus, s3, github, docker, custom, none

## Tag Naming

Customize git tag format:

\`\`\`json
{
  "projectRelease": {
    "tagNaming": {
      "format": "{projectName}@{version}",
      "includeProjectName": true
    }
  }
}
\`\`\`

Common formats:
- \`v{version}\` → v1.0.0
- \`{projectName}@{version}\` → my-lib@1.0.0
- \`{projectName}-v{version}\` → my-lib-v1.0.0

## Release Groups

Organize projects by registry type, versioning strategy, or deployment target:

### NPM Packages

\`\`\`json
{
  "projectRelease": {
    "releaseGroups": {
      "npm-packages": {
        "registryType": "npm",
        "registryUrl": "https://registry.npmjs.org",
        "versionStrategy": "independent",
        "versionFiles": ["package.json"],
        "pathStrategy": "semver",
        "tagNaming": {
          "format": "{projectName}@{version}",
          "includeProjectName": true
        },
        "projects": ["lib-a", "lib-b", "lib-c"],
        "projectPatterns": ["*-lib", "*-package"]
      }
    }
  }
}
\`\`\`

### Docker Images

\`\`\`json
{
  "projectRelease": {
    "releaseGroups": {
      "docker-images": {
        "registryType": "docker",
        "registryUrl": "ghcr.io/myorg",
        "versionStrategy": "independent",
        "versionFiles": ["project.json"],
        "versionPath": "version",
        "pathStrategy": "version",
        "tagNaming": {
          "format": "{projectName}:v{version}",
          "includeProjectName": true
        },
        "projects": ["api-gateway", "microservice-a"],
        "projectPatterns": ["api-*", "service-*"]
      }
    }
  }
}
\`\`\`

### Nexus Repository (Maven/Gradle)

\`\`\`json
{
  "projectRelease": {
    "releaseGroups": {
      "nexus-releases": {
        "registryType": "nexus",
        "registryUrl": "https://nexus.company.com/repository/releases",
        "versionStrategy": "independent",
        "versionFiles": ["pom.xml", "gradle.properties"],
        "versionPath": "version",
        "pathStrategy": "version",
        "projects": ["java-service", "kotlin-lib"]
      }
    }
  }
}
\`\`\`

### AWS S3 Artifacts

\`\`\`json
{
  "projectRelease": {
    "releaseGroups": {
      "s3-artifacts": {
        "registryType": "s3",
        "registryUrl": "s3://my-bucket/artifacts",
        "versionStrategy": "fixed",
        "versionFiles": ["version.txt"],
        "pathStrategy": "hash",
        "projects": ["python-lambda", "go-cli"]
      }
    }
  }
}
\`\`\`

### GitHub Releases

\`\`\`json
{
  "projectRelease": {
    "releaseGroups": {
      "github-releases": {
        "registryType": "github",
        "registryUrl": "https://github.com/myorg/myrepo",
        "versionStrategy": "independent",
        "versionFiles": ["package.json"],
        "pathStrategy": "version",
        "tagNaming": {
          "format": "{projectName}@{version}",
          "includeProjectName": true
        },
        "projects": ["electron-app", "cli-tool"]
      }
    }
  }
}
\`\`\`

### No Publishing (Version & Tag Only)

\`\`\`json
{
  "projectRelease": {
    "releaseGroups": {
      "internal-tools": {
        "registryType": "none",
        "versionStrategy": "independent",
        "versionFiles": ["project.json"],
        "versionPath": "version",
        "tagNaming": {
          "format": "tools/{projectName}-v{version}",
          "includeProjectName": true
        },
        "projects": ["build-tool", "dev-server"]
      }
    }
  }
}
\`\`\`

## Per-Project Configuration

Override settings for specific projects:

\`\`\`json
{
  "projectRelease": {
    "projectConfigs": {
      "my-special-lib": {
        "versionFiles": ["package.json", "custom-version.json"],
        "versionPath": "version",
        "tagNaming": {
          "format": "{projectName}-v{version}",
          "includeProjectName": true
        }
      },
      "legacy-app": {
        "versionFiles": ["VERSION.txt"],
        "versionPath": "version"
      }
    }
  }
}
\`\`\`

## Configuration Options Reference

### Registry Types
- \`npm\` - NPM registry (npmjs.org or private)
- \`nexus\` - Nexus repository (Maven/Gradle)
- \`s3\` - AWS S3 bucket
- \`github\` - GitHub releases
- \`docker\` - Docker registry
- \`custom\` - Custom registry endpoint
- \`none\` - No publishing (version & tag only)

### Version Strategies
- \`independent\` - Each project has its own version
- \`fixed\` - All projects share the same version
- \`git-tag\` - Resolve from git tags
- \`disk\` - Read from version files
- \`registry\` - Query from registry

### Path Strategies (for Nexus/S3)
- \`version\` - Use version in path (artifacts/1.0.0/)
- \`hash\` - Use commit hash (artifacts/abc123/)
- \`semver\` - Organize by semver (artifacts/1.x/1.0.0/)
- \`flat\` - No subdirectories (artifacts/)

### Changelog Presets
- \`angular\` - Angular convention
- \`conventionalcommits\` - Conventional commits
- \`atom\` - Atom convention
- \`ember\` - Ember convention
- \`jshint\` - JSHint convention

## Target Defaults Configuration

The plugin provides these executors that can be configured in \`targetDefaults\`:

### Individual Executors (Recommended)

\`\`\`json
{
  "targetDefaults": {
    "nx-project-release:version": {
      "cache": false,
      "options": {
        "versionFiles": ["package.json"],
        "gitCommit": false,
        "gitTag": false,
        "ciOnly": true
      }
    },
    "nx-project-release:changelog": {
      "cache": false,
      "options": {
        "preset": "angular",
        "projectChangelogs": true
      }
    },
    "nx-project-release:artifact": {
      "cache": false,
      "dependsOn": ["build"],
      "options": {
        "sourceDir": "dist/{projectRoot}",
        "outputDir": "dist/artifacts",
        "format": "tgz"
      }
    },
    "nx-project-release:release": {
      "cache": false,
      "options": {
        "gitPush": false,
        "createGitHubRelease": false
      }
    },
    "nx-project-release:publish": {
      "cache": false,
      "dependsOn": ["build"],
      "options": {
        "registryType": "npm",
        "registry": "https://registry.npmjs.org",
        "access": "public",
        "distTag": "latest"
      }
    }
  }
}
\`\`\`

### All-in-One Executor (Alternative)

\`\`\`json
{
  "targetDefaults": {
    "nx-project-release:project-release": {
      "cache": false,
      "dependsOn": ["build"],
      "options": {
        "versionFiles": ["package.json"],
        "gitCommit": true,
        "gitTag": true,
        "ciOnly": true,
        "preset": "angular",
        "registryType": "npm",
        "registry": "https://registry.npmjs.org"
      }
    }
  }
}
\`\`\`

## Release Flow

The recommended release flow uses individual executors:

1. **Version** - Bump version numbers
2. **Changelog** - Generate changelogs
3. **Commit** - Manual git commit (or in CI workflow)
4. **Build** - Build the project
5. **Artifact** - Create distributable archives
6. **Release** - Create git tags
7. **Publish** - Publish to registry
8. **Push** - Push commits and tags

Example workflow:
\`\`\`bash
nx affected -t version --base=origin/main~1
nx affected -t changelog --base=origin/main~1
git add . && git commit -m "chore(release): version bumps"
nx affected -t build --base=origin/main~1
nx affected -t artifact --base=origin/main~1
nx affected -t release --base=origin/main~1
nx affected -t publish --base=origin/main~1
git push && git push --tags
\`\`\`

## Next Steps

1. Copy relevant examples to your nx.json
2. Customize project names and URLs
3. Remove this example file
4. Run: \`nx run <project>:version\` to test

Documentation: https://github.com/Divagnz/nx-project-release
`;

  tree.write('nx-project-release.config.examples.md', exampleConfig);
  logger.info('');
  logger.info(
    '📄 Created nx-project-release.config.examples.md with comprehensive examples'
  );
  logger.info(
    '   Copy relevant sections to your nx.json and customize as needed'
  );
}

export function addTargetsToProjects(tree: Tree, answers: ConfigAnswers): void {
  // Build a map of project name to group name
  const projectToGroup = new Map<string, string>();
  if (answers.releaseGroups) {
    for (const group of answers.releaseGroups) {
      for (const projectName of group.projects) {
        projectToGroup.set(projectName, group.groupName);
      }
    }
  }

  for (const projectName of answers.selectedProjects) {
    // Skip if project is excluded
    if (answers.excludedProjects?.includes(projectName)) {
      continue;
    }

    try {
      const projectConfig = readProjectConfiguration(tree, projectName);

      if (!projectConfig.targets) {
        projectConfig.targets = {};
      }

      // Get the release group for this project
      const groupName = projectToGroup.get(projectName);
      const groupOptions = groupName ? { releaseGroup: groupName } : {};

      if (answers.executorType === 'individual') {
        // Add individual executor targets
        projectConfig.targets.version = {
          executor: 'nx-project-release:version',
          options: groupOptions,
          // Inherits other options from nx.json targetDefaults
        };

        projectConfig.targets.changelog = {
          executor: 'nx-project-release:changelog',
        };

        projectConfig.targets.publish = {
          executor: 'nx-project-release:publish',
          dependsOn: [answers.buildTarget],
        };
      } else {
        // Add all-in-one executor target
        projectConfig.targets['project-release'] = {
          executor: 'nx-project-release:project-release',
          dependsOn: [answers.buildTarget],
          options: groupOptions,
        };
      }

      updateProjectConfiguration(tree, projectName, projectConfig);
      const groupInfo = groupName ? ` (group: ${groupName})` : '';
      logger.info(`✅ Added release targets to ${projectName}${groupInfo}`);
    } catch (error) {
      logger.warn(
        `⚠️  Could not update project ${projectName}: ${error.message}`
      );
    }
  }
}
