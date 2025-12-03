import { Tree, logger } from '@nx/devkit';
import setupWorkflowsGenerator from '../../setup-workflows/generator.js';
import { SetupWorkflowsSchema } from '../../setup-workflows/schema';

export async function createGitHubWorkflows(
  tree: Tree,
  workflowType: 'release-publish' | 'affected' | 'manual' | 'on-merge' | 'pr-validation' | 'all',
  projectNames: string[]
): Promise<void> {
  logger.info('');
  logger.info('⚙️  Setting up GitHub Actions workflows...');

  // Use the setup-workflows generator
  const options: SetupWorkflowsSchema = {
    platform: 'github',
    workflowType: workflowType,
    defaultBranch: 'main',
    enableWorkflowDispatch: true,
    createGitHubRelease: true,
    autoMergeReleasePR: false,
    nodeVersion: '20'
  };

  await setupWorkflowsGenerator(tree, options);
}
