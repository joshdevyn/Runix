import { setupAIDriverTest, cleanupAIDriverTest, TestSetup } from './aiDriver.testSetup';

describe('AIDriver - Ask Mode', () => {
  let testSetup: TestSetup;

  beforeEach(async () => {
    testSetup = setupAIDriverTest();
    await testSetup.aiDriver.initialize({});
  });

  afterEach(() => {
    cleanupAIDriverTest();
  });

  describe('Question Answering', () => {
    test('answers question without action', async () => {
      const { aiDriver } = testSetup;
      
      const result = await aiDriver.execute('ask', ['What is on this screen?']);

      expect(result.success).toBe(true);
      expect(result.data.answer).toBeDefined();
      expect(result.data.actionTaken).toBeNull();
    });

    test('performs action when requested', async () => {
      const { aiDriver } = testSetup;
      
      const result = await aiDriver.execute('ask', ['Click the submit button']);

      expect(result.success).toBe(true);
      expect(result.data.answer).toBeDefined();
      expect(result.data.actionTaken).toBeDefined();
      expect(result.data.featureFile).toBeDefined();
    });

    test('takes screenshot for context', async () => {
      const { aiDriver, mockSystemDriver } = testSetup;
      
      await aiDriver.execute('ask', ['What is visible?']);

      expect(mockSystemDriver.execute).toHaveBeenCalledWith('takeScreenshot', []);
    });
  });

  describe('Error Handling in Ask Mode', () => {
    test('handles screenshot failure in ask mode', async () => {
      const { aiDriver, mockSystemDriver } = testSetup;
      mockSystemDriver.execute.mockResolvedValue({
        success: false,
        error: { message: 'Screenshot failed' }
      });

      const result = await aiDriver.execute('ask', ['What is visible?']);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Failed to take screenshot for context');
    });

    test('handles question analysis gracefully', async () => {
      const { aiDriver } = testSetup;
      
      // Mock the analyze method to ensure it gets called
      const analyzeSpy = jest.spyOn(aiDriver as any, 'analyzeQuestion');
      analyzeSpy.mockResolvedValue({
        answer: 'Mock answer',
        requiresAction: false,
        confidence: 0.8
      });

      const result = await aiDriver.execute('ask', ['Simple question']);

      expect(result.success).toBe(true);
      expect(analyzeSpy).toHaveBeenCalledWith('Simple question', 'mock-screenshot-data');
    });
  });

  describe('Action Detection', () => {
    test('detects when action is required', async () => {
      const { aiDriver } = testSetup;
      
      // Mock analyze to require action
      const analyzeSpy = jest.spyOn(aiDriver as any, 'analyzeQuestion');
      analyzeSpy.mockResolvedValue({
        answer: 'I can click that for you',
        requiresAction: true,
        confidence: 0.9
      });

      const executeActionSpy = jest.spyOn(aiDriver as any, 'executeHelpfulAction');
      executeActionSpy.mockResolvedValue({
        description: 'Clicked submit button',
        steps: []
      });

      const result = await aiDriver.execute('ask', ['Click the submit button']);

      expect(result.success).toBe(true);
      expect(executeActionSpy).toHaveBeenCalled();
    });

    test('skips action when not required', async () => {
      const { aiDriver } = testSetup;
      
      // Mock analyze to not require action
      const analyzeSpy = jest.spyOn(aiDriver as any, 'analyzeQuestion');
      analyzeSpy.mockResolvedValue({
        answer: 'Here is what I see',
        requiresAction: false,
        confidence: 0.8
      });

      const executeActionSpy = jest.spyOn(aiDriver as any, 'executeHelpfulAction');

      const result = await aiDriver.execute('ask', ['What do you see?']);

      expect(result.success).toBe(true);
      expect(result.data.actionTaken).toBeNull();
      expect(executeActionSpy).not.toHaveBeenCalled();
    });
  });

  describe('Feature Generation for Actions', () => {
    test('generates feature file when action is taken', async () => {
      const { aiDriver } = testSetup;
      const fs = require('fs/promises');
      
      // Mock analyze to require action
      const analyzeSpy = jest.spyOn(aiDriver as any, 'analyzeQuestion');
      analyzeSpy.mockResolvedValue({
        answer: 'I can help with that',
        requiresAction: true,
        confidence: 0.9
      });

      const executeActionSpy = jest.spyOn(aiDriver as any, 'executeHelpfulAction');
      executeActionSpy.mockResolvedValue({
        description: 'Helpful action performed',
        steps: []
      });

      const result = await aiDriver.execute('ask', ['Click something']);

      expect(result.success).toBe(true);
      expect(result.data.featureFile).toBeDefined();
      expect(fs.writeFile).toHaveBeenCalled();
    });

    test('does not generate feature file when no action taken', async () => {
      const { aiDriver } = testSetup;
      const fs = require('fs/promises');
      
      // Mock analyze to not require action
      const analyzeSpy = jest.spyOn(aiDriver as any, 'analyzeQuestion');
      analyzeSpy.mockResolvedValue({
        answer: 'Just answering your question',
        requiresAction: false,
        confidence: 0.8
      });

      const result = await aiDriver.execute('ask', ['What color is the sky?']);

      expect(result.success).toBe(true);
      expect(result.data.featureFile).toBeNull();
      // Feature file should not be written for non-action questions
      expect(fs.writeFile).not.toHaveBeenCalledWith(
        expect.stringContaining('.feature'),
        expect.any(String),
        expect.any(String)
      );
    });
  });
});
