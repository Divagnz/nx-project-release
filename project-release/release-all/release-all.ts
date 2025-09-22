import { PromiseExecutor, logger, ExecutorContext, runExecutor as nxRunExecutor } from '@nx/devkit';
import { execSync } from 'child_process';
import { ReleaseExecutorSchema } from '../release/schema';

interface ReleaseAllExecutorSchema extends ReleaseExecutorSchema {
  releaseAll?: boolean;
}

const runExecutor: PromiseExecutor<ReleaseAllExecutorSchema> = async (options, context: ExecutorContext) => {
  logger.info('🚀 Running project-release-all executor');

  try {
    if (!context.projectsConfigurations?.projects) {
      throw new Error('No projects found in workspace');
    }

    const projectNames = Object.keys(context.projectsConfigurations.projects);
    const results: Array<{ project: string; success: boolean; error?: string; skipped?: boolean }> = [];

    logger.info(`Found ${projectNames.length} projects in workspace`);

    for (const projectName of projectNames) {
      logger.info(`\n📦 Processing project: ${projectName}`);

      try {
        // Skip projects that don't have the release target
        const projectConfig = context.projectsConfigurations.projects[projectName];
        if (!projectConfig.targets?.release) {
          logger.info(`⏭️ Skipping ${projectName} - no release target configured`);
          results.push({ project: projectName, success: true, skipped: true });
          continue;
        }

        // Run the release executor for this project
        const result = await nxRunExecutor(
          { project: projectName, target: 'release' },
          {
            ...options,
            releaseAll: false // Prevent infinite recursion
          },
          context
        );

        results.push({
          project: projectName,
          success: result.success,
          skipped: false
        });

        if (!result.success) {
          logger.error(`❌ Failed to release ${projectName}`);
        }

      } catch (error: any) {
        logger.error(`❌ Failed to release ${projectName}: ${error.message}`);
        results.push({
          project: projectName,
          success: false,
          error: error.message
        });
      }
    }

    // Summary
    const successful = results.filter(r => r.success && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.success).length;

    logger.info(`\n📊 Release Summary:`);
    logger.info(`✅ Successfully released: ${successful} projects`);
    logger.info(`⏭️ Skipped: ${skipped} projects`);
    logger.info(`❌ Failed: ${failed} projects`);

    if (failed > 0) {
      logger.error('\nFailed projects:');
      results.filter(r => !r.success).forEach(r => {
        logger.error(`  - ${r.project}: ${r.error}`);
      });
    }

    return { success: failed === 0 };

  } catch (error: any) {
    logger.error(`❌ Release-all failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

export default runExecutor;