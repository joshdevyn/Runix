import { Queue, Worker } from 'bullmq';
import { SessionManager } from './sessionManager';
import { BaseTask } from './task';

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
