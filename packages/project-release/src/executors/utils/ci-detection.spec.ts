import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { isCI, getCIPlatform } from './ci-detection.js';

describe('CI Detection', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Clear all CI-related environment variables
    delete process.env.CI;
    delete process.env.CONTINUOUS_INTEGRATION;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITLAB_CI;
    delete process.env.CIRCLECI;
    delete process.env.TRAVIS;
    delete process.env.JENKINS_URL;
    delete process.env.BUILDKITE;
    delete process.env.DRONE;
    delete process.env.SEMAPHORE;
    delete process.env.BITBUCKET_PIPELINE;
    delete process.env.AZURE_PIPELINES;
    delete process.env.TF_BUILD;
    delete process.env.CODEBUILD_BUILD_ID;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('isCI()', () => {
    it('should return false when no CI environment variables are set', () => {
      expect(isCI()).toBe(false);
    });

    it('should return true when CI is set', () => {
      process.env.CI = 'true';
      expect(isCI()).toBe(true);
    });

    it('should return true when CONTINUOUS_INTEGRATION is set', () => {
      process.env.CONTINUOUS_INTEGRATION = 'true';
      expect(isCI()).toBe(true);
    });

    it('should return true when GITHUB_ACTIONS is set', () => {
      process.env.GITHUB_ACTIONS = 'true';
      expect(isCI()).toBe(true);
    });

    it('should return true when GITLAB_CI is set', () => {
      process.env.GITLAB_CI = 'true';
      expect(isCI()).toBe(true);
    });

    it('should return true when CIRCLECI is set', () => {
      process.env.CIRCLECI = 'true';
      expect(isCI()).toBe(true);
    });

    it('should return true when TRAVIS is set', () => {
      process.env.TRAVIS = 'true';
      expect(isCI()).toBe(true);
    });

    it('should return true when JENKINS_URL is set', () => {
      process.env.JENKINS_URL = 'http://jenkins.example.com';
      expect(isCI()).toBe(true);
    });

    it('should return true when BUILDKITE is set', () => {
      process.env.BUILDKITE = 'true';
      expect(isCI()).toBe(true);
    });

    it('should return true when DRONE is set', () => {
      process.env.DRONE = 'true';
      expect(isCI()).toBe(true);
    });

    it('should return true when SEMAPHORE is set', () => {
      process.env.SEMAPHORE = 'true';
      expect(isCI()).toBe(true);
    });

    it('should return true when BITBUCKET_PIPELINE is set', () => {
      process.env.BITBUCKET_PIPELINE = 'true';
      expect(isCI()).toBe(true);
    });

    it('should return true when AZURE_PIPELINES is set', () => {
      process.env.AZURE_PIPELINES = 'true';
      expect(isCI()).toBe(true);
    });

    it('should return true when TF_BUILD is set (Azure alternative)', () => {
      process.env.TF_BUILD = 'true';
      expect(isCI()).toBe(true);
    });

    it('should return true when CODEBUILD_BUILD_ID is set (AWS CodeBuild)', () => {
      process.env.CODEBUILD_BUILD_ID = 'build-123';
      expect(isCI()).toBe(true);
    });

    it('should handle truthy values correctly', () => {
      process.env.CI = '1';
      expect(isCI()).toBe(true);

      process.env.CI = 'false'; // String 'false' is truthy
      expect(isCI()).toBe(true);
    });

    it('should return true when multiple CI variables are set', () => {
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITLAB_CI = 'true';
      expect(isCI()).toBe(true);
    });
  });

  describe('getCIPlatform()', () => {
    it('should return null when no CI environment is detected', () => {
      expect(getCIPlatform()).toBeNull();
    });

    it('should return "GitHub Actions" when GITHUB_ACTIONS is set', () => {
      process.env.GITHUB_ACTIONS = 'true';
      expect(getCIPlatform()).toBe('GitHub Actions');
    });

    it('should return "GitLab CI" when GITLAB_CI is set', () => {
      process.env.GITLAB_CI = 'true';
      expect(getCIPlatform()).toBe('GitLab CI');
    });

    it('should return "CircleCI" when CIRCLECI is set', () => {
      process.env.CIRCLECI = 'true';
      expect(getCIPlatform()).toBe('CircleCI');
    });

    it('should return "Travis CI" when TRAVIS is set', () => {
      process.env.TRAVIS = 'true';
      expect(getCIPlatform()).toBe('Travis CI');
    });

    it('should return "Jenkins" when JENKINS_URL is set', () => {
      process.env.JENKINS_URL = 'http://jenkins.example.com';
      expect(getCIPlatform()).toBe('Jenkins');
    });

    it('should return "Buildkite" when BUILDKITE is set', () => {
      process.env.BUILDKITE = 'true';
      expect(getCIPlatform()).toBe('Buildkite');
    });

    it('should return "Drone" when DRONE is set', () => {
      process.env.DRONE = 'true';
      expect(getCIPlatform()).toBe('Drone');
    });

    it('should return "Semaphore" when SEMAPHORE is set', () => {
      process.env.SEMAPHORE = 'true';
      expect(getCIPlatform()).toBe('Semaphore');
    });

    it('should return "Bitbucket Pipelines" when BITBUCKET_PIPELINE is set', () => {
      process.env.BITBUCKET_PIPELINE = 'true';
      expect(getCIPlatform()).toBe('Bitbucket Pipelines');
    });

    it('should return "Azure Pipelines" when AZURE_PIPELINES is set', () => {
      process.env.AZURE_PIPELINES = 'true';
      expect(getCIPlatform()).toBe('Azure Pipelines');
    });

    it('should return "Azure Pipelines" when TF_BUILD is set', () => {
      process.env.TF_BUILD = 'true';
      expect(getCIPlatform()).toBe('Azure Pipelines');
    });

    it('should return "AWS CodeBuild" when CODEBUILD_BUILD_ID is set', () => {
      process.env.CODEBUILD_BUILD_ID = 'build-123';
      expect(getCIPlatform()).toBe('AWS CodeBuild');
    });

    it('should return "Unknown CI" when only generic CI flag is set', () => {
      process.env.CI = 'true';
      expect(getCIPlatform()).toBe('Unknown CI');
    });

    it('should return "Unknown CI" when only CONTINUOUS_INTEGRATION is set', () => {
      process.env.CONTINUOUS_INTEGRATION = 'true';
      expect(getCIPlatform()).toBe('Unknown CI');
    });

    it('should prioritize specific platform detection over generic CI flag', () => {
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';
      expect(getCIPlatform()).toBe('GitHub Actions');
    });

    it('should handle multiple specific CI platforms (first match wins)', () => {
      // GitHub Actions is checked first in the implementation
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITLAB_CI = 'true';
      expect(getCIPlatform()).toBe('GitHub Actions');
    });

    it('should prefer Azure Pipelines variable over TF_BUILD when both are set', () => {
      process.env.AZURE_PIPELINES = 'true';
      process.env.TF_BUILD = 'true';
      expect(getCIPlatform()).toBe('Azure Pipelines');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string environment variables', () => {
      process.env.CI = '';
      expect(isCI()).toBe(false);
    });

    it('should handle undefined vs unset environment variables', () => {
      process.env.CI = undefined as any;
      expect(isCI()).toBe(false);
    });

    it('should be consistent between isCI() and getCIPlatform()', () => {
      // When no CI is detected
      expect(isCI()).toBe(false);
      expect(getCIPlatform()).toBeNull();

      // When CI is detected
      process.env.GITHUB_ACTIONS = 'true';
      expect(isCI()).toBe(true);
      expect(getCIPlatform()).toBe('GitHub Actions');
    });
  });
});
