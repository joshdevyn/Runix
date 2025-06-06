import { setupAIDriverTest, cleanupAIDriverTest, TestSetup } from './aiDriver.testSetup';

describe('AIDriver - Individual Actions', () => {
  let testSetup: TestSetup;

  beforeEach(async () => {
    testSetup = setupAIDriverTest();
    await testSetup.aiDriver.initialize({});
  });

  afterEach(() => {
    cleanupAIDriverTest();
  });

  describe('Screenshot Action', () => {
    test('takes screenshot successfully', async () => {
      const { aiDriver, mockSystemDriver } = testSetup;
      mockSystemDriver.execute.mockResolvedValue({
        success: true,
        data: { screenshot: 'base64-data' }
      });

      const result = await aiDriver.execute('screenshot', []);

      expect(result.success).toBe(true);
      expect(mockSystemDriver.execute).toHaveBeenCalledWith('takeScreenshot', []);
    });

    test('handles screenshot failure', async () => {
      const { aiDriver, mockSystemDriver } = testSetup;
      mockSystemDriver.execute.mockResolvedValue({
        success: false,
        error: { message: 'Screenshot failed' }
      });

      const result = await aiDriver.execute('screenshot', []);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Screenshot failed');
    });

    test('stores screenshot data internally', async () => {
      const { aiDriver, mockSystemDriver } = testSetup;
      const screenshotData = 'test-screenshot-base64';
      mockSystemDriver.execute.mockResolvedValue({
        success: true,
        data: { screenshot: screenshotData }
      });

      await aiDriver.execute('screenshot', []);

      // Verify screenshot is stored by taking another action that uses it
      const analyzeResult = await aiDriver.execute('analyze', []);
      expect(analyzeResult.success).toBe(true);
    });
  });

  describe('Analyze Action', () => {
    test('analyzes provided screenshot', async () => {
      const { aiDriver, mockVisionDriver } = testSetup;
      const screenshotData = 'provided-screenshot-data';

      const result = await aiDriver.execute('analyze', [screenshotData]);

      expect(result.success).toBe(true);
      expect(mockVisionDriver.execute).toHaveBeenCalledWith('analyzeScene', [screenshotData]);
    });

    test('analyzes stored screenshot when none provided', async () => {
      const { aiDriver, mockSystemDriver, mockVisionDriver } = testSetup;
      
      // First take a screenshot
      mockSystemDriver.execute.mockResolvedValue({
        success: true,
        data: { screenshot: 'stored-screenshot' }
      });
      await aiDriver.execute('screenshot', []);

      // Then analyze without providing new screenshot
      const result = await aiDriver.execute('analyze', []);

      expect(result.success).toBe(true);
      expect(mockVisionDriver.execute).toHaveBeenCalledWith('analyzeScene', ['stored-screenshot']);
    });

    test('fails when no screenshot available', async () => {
      const { aiDriver } = testSetup;
      
      const result = await aiDriver.execute('analyze', []);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('No screenshot available for analysis');
    });

    test('enhances analysis with AI insights', async () => {
      const { aiDriver, mockVisionDriver } = testSetup;
      mockVisionDriver.execute.mockResolvedValue({
        success: true,
        data: { scene: { elements: [] } }
      });

      const enhanceSpy = jest.spyOn(aiDriver as any, 'enhanceWithAI');
      enhanceSpy.mockResolvedValue({
        summary: 'AI enhanced analysis',
        recommendations: ['recommendation1'],
        confidence: 0.9
      });

      const result = await aiDriver.execute('analyze', ['test-screenshot']);

      expect(result.success).toBe(true);
      expect(result.data.aiInsights).toBeDefined();
      expect(enhanceSpy).toHaveBeenCalled();
    });
  });

  describe('Plan Action', () => {
    test('plans task successfully', async () => {
      const { aiDriver } = testSetup;
      
      const taskInfo = {
        description: 'login to application',
        currentState: { text: 'login form' }
      };

      const result = await aiDriver.execute('plan', [taskInfo]);

      expect(result.success).toBe(true);
      expect(result.data.plan).toBeDefined();
      expect(result.data.steps).toBeDefined();
      expect(Array.isArray(result.data.steps)).toBe(true);
      expect(result.data.confidence).toBeDefined();
    });

    test('handles planning errors', async () => {
      const { aiDriver } = testSetup;
      
      // Mock AI call to return invalid JSON
      const callAISpy = jest.spyOn(aiDriver as any, 'callAI');
      callAISpy.mockResolvedValue('invalid json response');

      const result = await aiDriver.execute('plan', [{ description: 'test task' }]);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Failed to parse AI planning response');
    });
  });

  describe('Execute Action', () => {
    test('executes task by ID', async () => {
      const { aiDriver } = testSetup;
      
      // First create a task through agent mode
      const agentResult = await aiDriver.execute('agent', ['Test task']);
      expect(agentResult.success).toBe(true);
      
      const taskId = agentResult.data.taskId;
      const result = await aiDriver.execute('execute', [taskId]);

      expect(result.success).toBe(true);
      expect(result.data.taskId).toBe(taskId);
    });

    test('handles non-existent task ID', async () => {
      const { aiDriver } = testSetup;
      
      const result = await aiDriver.execute('execute', ['non-existent-task']);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Task not found');
    });
  });

  describe('Other Actions', () => {
    test('handles confirm action', async () => {
      const { aiDriver } = testSetup;
      
      const result = await aiDriver.execute('confirm', ['task-id', [{ id: 'step1' }]]);

      expect(result.success).toBe(true);
      expect(result.data.approved).toBe(true);
    });

    test('handles learn action', async () => {
      const { aiDriver } = testSetup;
      
      const actions = [{ action: 'click', target: 'button' }];
      const result = await aiDriver.execute('learn', [actions]);

      expect(result.success).toBe(true);
      expect(result.data.learned).toBe(true);
    });

    test('handles generate action', async () => {
      const { aiDriver } = testSetup;
      const fs = require('fs/promises');
      
      const task = { description: 'test task', mode: 'agent' };
      const result = await aiDriver.execute('generate', [task, {}]);

      expect(result.success).toBe(true);
      expect(result.data.filePath).toBeDefined();
      expect(fs.writeFile).toHaveBeenCalled();
    });

    test('handles observe action', async () => {
      const { aiDriver } = testSetup;
      
      const options = { duration: 5000 };
      const result = await aiDriver.execute('observe', [options]);

      expect(result.success).toBe(true);
      expect(result.data.observationId).toBeDefined();
    });

    test('handles interact action', async () => {
      const { aiDriver } = testSetup;
      
      const result = await aiDriver.execute('interact', ['Hello user']);

      expect(result.success).toBe(true);
      expect(result.data.message).toBeDefined();
    });

    test('handles unknown action', async () => {
      const { aiDriver } = testSetup;
      
      const result = await aiDriver.execute('unknownAction', []);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Unknown AI action: unknownAction');
    });
  });
});
