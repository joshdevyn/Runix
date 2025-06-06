import { AIStep } from '../../../src/drivers/ai/AIDriver';
import { setupAIDriverTest, cleanupAIDriverTest, TestSetup } from './aiDriver.testSetup';

describe('AIDriver - Agent Mode', () => {
  let testSetup: TestSetup;

  beforeEach(async () => {
    testSetup = setupAIDriverTest();
    await testSetup.aiDriver.initialize({});
  });

  afterEach(() => {
    cleanupAIDriverTest();
  });

  describe('Basic Agent Mode Execution', () => {
    test('executes agent mode successfully', async () => {
      const { aiDriver } = testSetup;
      const result = await aiDriver.execute('agent', ['Take a screenshot and analyze it']);

      expect(result.success).toBe(true);
      expect(result.data.taskId).toBeDefined();
      expect(result.data.task).toBeDefined();
      expect(result.data.completedSteps).toBeGreaterThan(0);
      expect(result.data.totalSteps).toBeGreaterThan(0);
    });

    test('handles screenshot failure in agent mode', async () => {
      const { aiDriver, mockSystemDriver } = testSetup;
      mockSystemDriver.execute.mockResolvedValue({
        success: false,
        error: { message: 'Screenshot failed' }
      });

      const result = await aiDriver.execute('agent', ['Take a screenshot']);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Failed to take initial screenshot');
    });

    test('handles vision analysis failure gracefully', async () => {
      const { aiDriver, mockVisionDriver } = testSetup;
      mockVisionDriver.execute.mockResolvedValue({
        success: false,
        error: { message: 'Vision analysis failed' }
      });

      const result = await aiDriver.execute('agent', ['Analyze the screen']);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Failed to analyze screen');
    });
  });

  describe('Step Execution and Tracking', () => {
    test('tracks completed steps correctly', async () => {
      const { aiDriver, mockSystemDriver, mockVisionDriver } = testSetup;
      
      // Mock successful step execution
      mockSystemDriver.execute.mockResolvedValue({
        success: true,
        data: { screenshot: 'test-data' }
      });
      
      mockVisionDriver.execute.mockResolvedValue({
        success: true,
        data: { scene: { elements: [] } }
      });

      const result = await aiDriver.execute('agent', ['Simple test task']);

      expect(result.success).toBe(true);
      expect(result.data.completedSteps).toBeGreaterThan(0);
      expect(result.data.task.steps.filter((s: AIStep) => s.status === 'completed').length)
        .toEqual(result.data.completedSteps);
    });

    test('handles step execution failures', async () => {
      const { aiDriver, mockSystemDriver } = testSetup;
      
      // Mock step failure after initial screenshot
      let callCount = 0;
      mockSystemDriver.execute.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: true,
            data: { screenshot: 'test-data' }
          });
        }
        return Promise.resolve({
          success: false,
          error: { message: 'Step failed' }
        });
      });

      const result = await aiDriver.execute('agent', ['Failing task']);

      expect(result.success).toBe(true); // Agent mode handles step failures gracefully
      expect(result.data.task.steps.some((step: AIStep) => step.status === 'failed')).toBe(true);
    });
  });

  describe('Confirmation Flow', () => {
    test('skips steps when confirmation is rejected', async () => {
      const { aiDriver } = testSetup;
      await aiDriver.initialize({ confirmActions: true });

      // Mock rejection of confirmation
      const confirmSpy = jest.spyOn(aiDriver as any, 'confirmActions');
      confirmSpy.mockResolvedValue({
        success: true,
        data: { approved: false }
      });

      const result = await aiDriver.execute('agent', ['Test task with confirmation']);

      expect(result.success).toBe(true);
      expect(result.data.task.steps.some((step: AIStep) => step.status === 'skipped')).toBe(true);
    });

    test('executes steps when confirmation is approved', async () => {
      const { aiDriver } = testSetup;
      await aiDriver.initialize({ confirmActions: true });

      // Mock approval of confirmation
      const confirmSpy = jest.spyOn(aiDriver as any, 'confirmActions');
      confirmSpy.mockResolvedValue({
        success: true,
        data: { approved: true }
      });

      const result = await aiDriver.execute('agent', ['Test task with confirmation']);

      expect(result.success).toBe(true);
      expect(result.data.completedSteps).toBeGreaterThan(0);
    });
  });

  describe('Artifact Generation', () => {
    test('generates feature file artifact', async () => {
      const { aiDriver } = testSetup;
      const fs = require('fs/promises');
      
      const result = await aiDriver.execute('agent', ['Simple test task']);

      expect(result.success).toBe(true);
      expect(fs.writeFile).toHaveBeenCalled();
      
      const writeCall = (fs.writeFile as jest.Mock).mock.calls.find(call => 
        call[0].includes('.feature')
      );
      expect(writeCall).toBeDefined();
      expect(writeCall[1]).toContain('Feature:');
      expect(writeCall[1]).toContain('Simple test task');
    });

    test('includes artifacts in result', async () => {
      const { aiDriver } = testSetup;
      
      const result = await aiDriver.execute('agent', ['Task with artifacts']);

      expect(result.success).toBe(true);
      expect(result.data.artifacts).toBeDefined();
      expect(Array.isArray(result.data.artifacts)).toBe(true);
    });
  });
});
