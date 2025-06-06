import { AIDriverConfig } from '../../../src/drivers/ai/AIDriver';
import { setupAIDriverTest, cleanupAIDriverTest, TestSetup } from './aiDriver.testSetup';

describe('AIDriver - Initialization', () => {
  let testSetup: TestSetup;

  beforeEach(() => {
    testSetup = setupAIDriverTest();
  });

  afterEach(() => {
    cleanupAIDriverTest();
  });

  describe('Basic Initialization', () => {
    test('initializes with default config', async () => {
      const { aiDriver, mockDriverRegistry } = testSetup;
      
      await aiDriver.initialize({});
      
      expect(mockDriverRegistry.getDriver).toHaveBeenCalledWith('vision-driver');
      expect(mockDriverRegistry.getDriver).toHaveBeenCalledWith('system-driver');
    });

    test('initializes with custom config', async () => {
      const { aiDriver, mockDriverRegistry } = testSetup;
      
      const config: AIDriverConfig = {
        openaiApiKey: 'test-key',
        model: 'gpt-4',
        temperature: 0.5,
        outputDir: './custom-output',
        visionDriver: 'CustomVision',
        systemDriver: 'CustomSystem'
      };

      await aiDriver.initialize(config);

      expect(mockDriverRegistry.getDriver).toHaveBeenCalledWith('CustomVision');
      expect(mockDriverRegistry.getDriver).toHaveBeenCalledWith('CustomSystem');
    });

    test('warns when required drivers are not found', async () => {
      const { aiDriver, mockDriverRegistry, mockLogger } = testSetup;
      mockDriverRegistry.getDriver.mockReturnValue(undefined);

      await aiDriver.initialize({});
      
      expect(mockLogger.warn).toHaveBeenCalledWith('Required driver not found: vision-driver');
      expect(mockLogger.warn).toHaveBeenCalledWith('Required driver not found: system-driver');
    });
  });

  describe('Configuration Handling', () => {
    test('sanitizes API key in logs', async () => {
      const { aiDriver, mockLogger } = testSetup;
      
      const config: AIDriverConfig = {
        openaiApiKey: 'secret-key-123',
        model: 'gpt-4',
        temperature: 0.7
      };

      await aiDriver.initialize(config);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'AI Driver initializing',
        expect.objectContaining({
          config: expect.objectContaining({
            openaiApiKey: '***',
            model: 'gpt-4',
            temperature: 0.7
          })
        })
      );
    });

    test('creates output directory', async () => {
      const { aiDriver } = testSetup;
      const fs = require('fs/promises');
      
      await aiDriver.initialize({ outputDir: './test-output' });
      
      expect(fs.mkdir).toHaveBeenCalledWith('./test-output', { recursive: true });
    });
  });
});
