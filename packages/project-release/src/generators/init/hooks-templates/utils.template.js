#!/usr/bin/env node
/**
 * Shared utilities for nx-project-release git hooks
 */

const { execSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');
const { join } = require('path');

/**
 * Get all projects in the workspace
 */
function getAllProjects() {
  try {
    const output = execSync('npx nx show projects --json', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(output);
  } catch (error) {
    console.error('Failed to get projects:', error.message);
    return [];
  }
}

/**
 * Get project configuration
 */
function getProjectConfig(projectName) {
  try {
    const output = execSync(`npx nx show project ${projectName} --json`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(output);
  } catch (error) {
    return null;
  }
}

/**
 * Check if project has release targets configured
 */
function hasReleaseConfig(projectName) {
  const config = getProjectConfig(projectName);
  if (!config || !config.targets) {
    return false;
  }

  const targets = config.targets;
  return !!(
    targets.version ||
    targets.changelog ||
    targets.publish ||
    targets['project-release']
  );
}

/**
 * Check if project is publishable (has package.json)
 */
function isPublishable(projectName) {
  const config = getProjectConfig(projectName);
  if (!config || !config.root) {
    return false;
  }

  const packageJsonPath = join(process.cwd(), config.root, 'package.json');
  return existsSync(packageJsonPath);
}

/**
 * Get unconfigured publishable projects
 */
function getUnconfiguredPublishableProjects() {
  const allProjects = getAllProjects();
  const unconfigured = [];

  for (const projectName of allProjects) {
    if (isPublishable(projectName) && !hasReleaseConfig(projectName)) {
      unconfigured.push(projectName);
    }
  }

  return unconfigured;
}

/**
 * Get all projects with release configuration
 */
function getProjectsWithReleaseConfig() {
  const allProjects = getAllProjects();
  const configured = [];

  for (const projectName of allProjects) {
    if (hasReleaseConfig(projectName)) {
      configured.push(projectName);
    }
  }

  return configured;
}

/**
 * Validate project's release configuration
 */
function validateProjectConfig(projectName) {
  const config = getProjectConfig(projectName);
  if (!config) {
    return { valid: false, errors: ['Project not found'] };
  }

  const errors = [];
  const targets = config.targets || {};

  // Check for version executor
  if (targets.version) {
    const versionConfig = targets.version;

    if (
      !versionConfig.options?.versionFiles ||
      versionConfig.options.versionFiles.length === 0
    ) {
      errors.push('version: Missing required option "versionFiles"');
    }
  }

  // Check for changelog executor
  if (targets.changelog) {
    const changelogConfig = targets.changelog;

    if (!changelogConfig.options?.preset) {
      errors.push('changelog: Missing required option "preset"');
    }
  }

  // Check for publish executor
  if (targets.publish) {
    const publishConfig = targets.publish;

    if (!publishConfig.options?.registryType) {
      errors.push('publish: Missing required option "registryType"');
    }

    const validRegistryTypes = ['npm', 'github', 'custom'];
    if (
      publishConfig.options?.registryType &&
      !validRegistryTypes.includes(publishConfig.options.registryType)
    ) {
      errors.push(
        `publish: Invalid registryType "${
          publishConfig.options.registryType
        }". Must be one of: ${validRegistryTypes.join(', ')}`
      );
    }
  }

  // Check for project-release executor
  if (targets['project-release']) {
    const releaseConfig = targets['project-release'];

    if (
      !releaseConfig.options?.versionFiles ||
      releaseConfig.options.versionFiles.length === 0
    ) {
      errors.push('project-release: Missing required option "versionFiles"');
    }

    if (!releaseConfig.options?.preset) {
      errors.push('project-release: Missing required option "preset"');
    }

    if (!releaseConfig.options?.registryType) {
      errors.push('project-release: Missing required option "registryType"');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  getAllProjects,
  getProjectConfig,
  hasReleaseConfig,
  isPublishable,
  getUnconfiguredPublishableProjects,
  getProjectsWithReleaseConfig,
  validateProjectConfig,
};
