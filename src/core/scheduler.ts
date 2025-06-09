import { Queue, Worker } from 'bullmq';
import { SessionManager } from './sessionManager';
import { BaseTask } from './task';

/**
 * NOTE: This file contains task scheduling functionality that is currently unused.
 * It provides BullMQ-based background job processing capabilities.
 * Keep for future distributed task execution features.
 */

const scenarioQueue = new Queue('scenarios');

const scenarioWorker = new Worker('scenarios', async (job) => {
  if (job.name === 'runScenario') {
    const { featurePath, sessionId } = job.data || {};
    const task = new BaseTask('scenarioTask');
    // Example usage
    await task.run(featurePath, sessionId);
  }
});

export async function scheduleScenario(featurePath: string) {
  const session = SessionManager.getInstance().createSession();
  await scenarioQueue.add('runScenario', { featurePath, sessionId: session.id });
}
