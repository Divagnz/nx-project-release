/**
 * Detects if the current environment is a CI/CD environment
 * Checks common CI environment variables
 */
export function isCI(): boolean {
  return !!(
    (
      process.env.CI || // Generic CI flag
      process.env.CONTINUOUS_INTEGRATION || // Generic CI flag (alternative)
      process.env.GITHUB_ACTIONS || // GitHub Actions
      process.env.GITLAB_CI || // GitLab CI
      process.env.CIRCLECI || // CircleCI
      process.env.TRAVIS || // Travis CI
      process.env.JENKINS_URL || // Jenkins
      process.env.BUILDKITE || // Buildkite
      process.env.DRONE || // Drone
      process.env.SEMAPHORE || // Semaphore
      process.env.BITBUCKET_PIPELINE || // Bitbucket Pipelines
      process.env.AZURE_PIPELINES || // Azure Pipelines
      process.env.TF_BUILD || // Azure Pipelines (alternative)
      process.env.CODEBUILD_BUILD_ID
    ) // AWS CodeBuild
  );
}

/**
 * Gets the name of the CI/CD platform if detected
 */
export function getCIPlatform(): string | null {
  if (process.env.GITHUB_ACTIONS) return 'GitHub Actions';
  if (process.env.GITLAB_CI) return 'GitLab CI';
  if (process.env.CIRCLECI) return 'CircleCI';
  if (process.env.TRAVIS) return 'Travis CI';
  if (process.env.JENKINS_URL) return 'Jenkins';
  if (process.env.BUILDKITE) return 'Buildkite';
  if (process.env.DRONE) return 'Drone';
  if (process.env.SEMAPHORE) return 'Semaphore';
  if (process.env.BITBUCKET_PIPELINE) return 'Bitbucket Pipelines';
  if (process.env.AZURE_PIPELINES || process.env.TF_BUILD)
    return 'Azure Pipelines';
  if (process.env.CODEBUILD_BUILD_ID) return 'AWS CodeBuild';
  if (process.env.CI || process.env.CONTINUOUS_INTEGRATION) return 'Unknown CI';
  return null;
}
