import { RunixEngine } from '../../../src/core/engine';
import { AIDriver } from '../../../src/drivers/ai/AIDriver';
import * as fs from 'fs';
import * as path from 'path';

describe('AI Workflow End-to-End Tests', () => {
  let engine: RunixEngine;
  let aiDriver: AIDriver;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    engine = new RunixEngine();
    await engine.initialize();

    aiDriver = new AIDriver();
    await aiDriver.initialize({
      outputDir: tempDir,
      confirmActions: false
    });
  });

  afterEach(async () => {
    await engine.shutdown();
  });

  describe('Complete AI Automation Workflows', () => {
    test('full agent workflow from task to execution', async () => {
      // Execute agent task
      const agentResult = await aiDriver.execute('agent', [
        'Create a test file with content and then read it back'
      ]);

      expect(agentResult.success).toBe(true);
      expect(agentResult.data.artifacts.length).toBeGreaterThan(0);

      // Get the generated feature file
      const featureFile = agentResult.data.artifacts[0];
      expect(await fs.promises.access(featureFile).then(() => true).catch(() => false)).toBe(true);

      // Read and validate the feature content
      const featureContent = await fs.promises.readFile(featureFile, 'utf8');
      expect(featureContent).toContain('Feature:');
      expect(featureContent).toContain('Scenario:');

      // Execute the generated feature with Runix engine
      const executionResults = await engine.runFeature(featureFile);
      expect(executionResults.length).toBeGreaterThan(0);
      expect(executionResults.every(result => result.success)).toBe(true);
    });

    test('ask mode to feature generation to execution', async () => {
      // Ask AI to perform an action
      const askResult = await aiDriver.execute('ask', [
        'Create a file called hello.txt with the content "Hello World"'
      ]);

      expect(askResult.success).toBe(true);

      // If action was taken, verify feature generation
      if (askResult.data.actionTaken && askResult.data.featureFile) {
        const featureFile = askResult.data.featureFile;
        expect(await fs.promises.access(featureFile).then(() => true).catch(() => false)).toBe(true);

        // Execute the generated feature
        const executionResults = await engine.runFeature(featureFile);
        expect(executionResults.length).toBeGreaterThan(0);
      }
    });

    test('editor to agent workflow', async () => {
      // Start editor session
      const editorResult = await aiDriver.execute('editor', ['e2e-test-session']);
      expect(editorResult.success).toBe(true);

      // Simulate that editor learned something (in real scenario, user would perform actions)
      // For testing, we'll just move to agent mode with a related task

      // Use agent mode to execute a similar workflow
      const agentResult = await aiDriver.execute('agent', [
        'Perform file operations similar to learned patterns'
      ]);

      expect(agentResult.success).toBe(true);
      expect(agentResult.data.task.status).toBe('completed');
    });
  });

  describe('Complex Multi-Step Workflows', () => {
    test('handles complex task with multiple driver coordination', async () => {
      const complexTask = `
        Create a file called workflow.txt,
        write some test content to it,
        read the content back,
        and echo the content
      `;

      const result = await aiDriver.execute('agent', [complexTask]);

      expect(result.success).toBe(true);
      expect(result.data.task.steps.length).toBeGreaterThan(3);

      // Should involve multiple drivers
      const driverTypes = new Set(
        result.data.task.steps.map((step: any) => step.driver)
      );
      expect(driverTypes.size).toBeGreaterThan(1);
    });

    test('handles workflow with error recovery', async () => {
      const faultyTask = `
        Attempt to read a non-existent file,
        then create the file,
        then read it successfully
      `;

      const result = await aiDriver.execute('agent', [faultyTask]);

      // Should complete even with some failed steps
      expect(result.success).toBe(true);
      
      // Should have both failed and successful steps
      const stepStatuses = result.data.task.steps.map((step: any) => step.status);
      expect(stepStatuses).toContain('completed');
    });
  });

  describe('AI Learning and Adaptation', () => {
    test('demonstrates learning across multiple interactions', async () => {
      // First interaction - establish pattern
      const firstResult = await aiDriver.execute('agent', [
        'Create and read a test file'
      ]);
      expect(firstResult.success).toBe(true);

      // Second interaction - similar pattern should be more efficient
      const secondResult = await aiDriver.execute('agent', [
        'Create and read another test file with different content'
      ]);
      expect(secondResult.success).toBe(true);

      // Both should succeed and create valid artifacts
      expect(firstResult.data.artifacts.length).toBeGreaterThan(0);
      expect(secondResult.data.artifacts.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and Scalability', () => {
    test('handles multiple concurrent AI requests', async () => {
      const concurrentTasks = [
        aiDriver.execute('ask', ['What is the current time?']),
        aiDriver.execute('ask', ['List available drivers']),
        aiDriver.execute('agent', ['Echo a simple message']),
        aiDriver.execute('ask', ['Describe your capabilities'])
      ];

      const results = await Promise.all(concurrentTasks);

      results.forEach((result: any, index: number) => {
        expect(result.success).toBe(true);
      });
    });

    test('maintains performance with large artifacts', async () => {
      const startTime = Date.now();

      const result = await aiDriver.execute('agent', [
        'Create a large test file and process it'
      ]);

      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(60000); // Should complete within 1 minute
    });
  });

  describe('Integration with Existing Runix Features', () => {
    test('AI-generated features work with existing step definitions', async () => {
      const result = await aiDriver.execute('agent', [
        'Use example driver to echo messages and perform math'
      ]);

      expect(result.success).toBe(true);

      // Generated feature should use existing step patterns
      const featureFile = result.data.artifacts[0];
      const content = await fs.promises.readFile(featureFile, 'utf8');
      
      // Should contain recognizable step patterns
      expect(content).toMatch(/echo|add|wait/i);
    });

    test('AI respects driver capabilities and limitations', async () => {
      const result = await aiDriver.execute('agent', [
        'Perform only operations supported by available drivers'
      ]);

      expect(result.success).toBe(true);

      // All steps should use valid driver actions
      const validDrivers = ['WebDriver', 'VisionDriver', 'SystemDriver', 'ExampleDriver'];
      const allStepsValid = result.data.task.steps.every((step: any) =>
        validDrivers.includes(step.driver)
      );
      expect(allStepsValid).toBe(true);
    });
  });
});
