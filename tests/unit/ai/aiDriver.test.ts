import { AIDriver, AIDriverConfig, AIStep } from '../../../src/drivers/ai/AIDriver';
import { Logger } from '../../../src/utils/logger';
import { DriverRegistry } from '../../../src/drivers/driverRegistry';
import * as fs from 'fs/promises';

// Extend global type for mock driver registry
declare global {
  var MOCK_DRIVER_REGISTRY: any;
}

// Mock dependencies
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/drivers/driverRegistry');
jest.mock('fs/promises');

// Mock WebSocket for Node.js environment
const mockWebSocket = {
  send: jest.fn(),
  on: jest.fn(),
  close: jest.fn()
};

// @ts-ignore
global.WebSocket = jest.fn(() => mockWebSocket);

describe('AIDriver Unit Tests', () => {
  let aiDriver: AIDriver;
  let mockLogger: jest.Mocked<Logger>;
  let mockDriverRegistry: jest.Mocked<DriverRegistry>;
  let mockWebDriver: any;
  let mockVisionDriver: any;
  let mockSystemDriver: any;

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mocked instances
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      createChildLogger: jest.fn().mockReturnThis()
    } as any;    mockWebDriver = {
      execute: jest.fn()
    };

    mockVisionDriver = {
      execute: jest.fn().mockResolvedValue({
        success: true,
        data: { 
          scene: { 
            text: 'Sample text', 
            uiElements: [{ type: 'button', text: 'Submit', coordinates: { x: 100, y: 200 } }] 
          }
        }
      })
    };

    mockSystemDriver = {
      execute: jest.fn().mockResolvedValue({
        success: true,
        data: { screenshot: 'base64-image-data' }
      })
    };mockDriverRegistry = {
      listDriverIds: jest.fn().mockReturnValue(['ExampleDriver', 'VisionDriver', 'SystemDriver']),
      getInstance: jest.fn(),
      getDriver: jest.fn().mockImplementation((driverId: string) => {
        if (driverId === 'VisionDriver') return mockVisionDriver;
        if (driverId === 'SystemDriver') return mockSystemDriver;
        return mockWebDriver;
      }),
      getDriverInstance: jest.fn().mockImplementation((driverId: string) => {
        if (driverId === 'VisionDriver') return Promise.resolve(mockVisionDriver);
        if (driverId === 'SystemDriver') return Promise.resolve(mockSystemDriver);
        return Promise.resolve(mockWebDriver);
      })
    } as any;    // Mock static methods
    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);
    (DriverRegistry.getInstance as jest.Mock).mockReturnValue(mockDriverRegistry);

    // Expose mock driver registry globally for AI driver's getDriverInstance function
    global.MOCK_DRIVER_REGISTRY = mockDriverRegistry;

    // Mock fs operations
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

    // Create AIDriver instance
    aiDriver = new AIDriver({
      model: 'gpt-4',
      temperature: 0.7
    });

    await aiDriver.initialize();
  });
  afterEach(async () => {
    await aiDriver.shutdown();
    // Clean up global mock to prevent test interference
    delete global.MOCK_DRIVER_REGISTRY;
  });

  describe('Initialization', () => {    test('initializes with default config', async () => {
      await aiDriver.initialize({});
      expect(mockDriverRegistry.getDriver).toHaveBeenCalledWith('vision-driver');
      expect(mockDriverRegistry.getDriver).toHaveBeenCalledWith('system-driver');
    });test('initializes with custom config', async () => {
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
    });    test('warns when required drivers are not found', async () => {
      mockDriverRegistry.getDriver.mockReturnValue(undefined);

      await aiDriver.initialize({});
      expect(mockLogger.warn).toHaveBeenCalledWith('Required driver not found: vision-driver');
      expect(mockLogger.warn).toHaveBeenCalledWith('Required driver not found: system-driver');
    });
  });

  describe('Capabilities', () => {
    test('returns correct capabilities', () => {
      const capabilities = aiDriver.getCapabilities();

      expect(capabilities.name).toBe('AIDriver');      expect(capabilities.version).toBe('2.0.0');
      expect(capabilities.description).toBe('Enhanced AI orchestration driver with vision analysis and system-level automation for application-agnostic interactions');
      expect(capabilities.supportedActions).toContain('generateFeature');
      expect(capabilities.supportedActions).toContain('analyzeIntent');
      expect(capabilities.supportedActions).toContain('orchestrate');
      expect(capabilities.author).toBe('Runix Team');
    });
  });

  describe('Agent Mode', () => {
    beforeEach(async () => {
      await aiDriver.initialize({});
      
      // Mock successful screenshot
      mockWebDriver.executeStep.mockImplementation((action: string) => {
        if (action === 'takeScreenshot') {
          return Promise.resolve({
            success: true,
            data: { screenshot: 'base64-screenshot-data' }
          });
        }
        return Promise.resolve({ success: true, data: {} });
      });

      // Mock successful vision analysis
      mockVisionDriver.executeStep.mockImplementation((action: string) => {
        if (action === 'analyzeScene') {
          return Promise.resolve({
            success: true,
            data: {
              scene: {
                text: 'Login form with email and password fields',
                textBlocks: [
                  { text: 'Email', confidence: 0.9, bounds: { x: 50, y: 100, width: 60, height: 20 } },
                  { text: 'Password', confidence: 0.85, bounds: { x: 50, y: 150, width: 80, height: 20 } }
                ],
                uiElements: [
                  { type: 'input', label: 'Email Field', confidence: 0.9, bounds: { x: 120, y: 100, width: 200, height: 30 } },
                  { type: 'input', label: 'Password Field', confidence: 0.85, bounds: { x: 120, y: 150, width: 200, height: 30 } },
                  { type: 'button', label: 'Login Button', confidence: 0.95, bounds: { x: 150, y: 200, width: 100, height: 40 } }
                ]
              }
            }
          });
        }
        return Promise.resolve({ success: true, data: {} });
      });      // Setup driver registry mocks
      mockDriverRegistry.getDriverInstance.mockImplementation((driverId: string) => {
        if (driverId === 'web-driver') return Promise.resolve(mockWebDriver);
        if (driverId === 'vision-driver') return Promise.resolve(mockVisionDriver);
        if (driverId === 'system-driver') return Promise.resolve(mockSystemDriver);
        return Promise.resolve(null);
      });
    });

    test('completes basic agent task successfully', async () => {
      const result = await aiDriver.execute('agent', ['Take a screenshot and analyze the screen']);

      expect(result.success).toBe(true);
      expect(result.data.taskId).toMatch(/^agent-\d+$/);
      expect(result.data.task.mode).toBe('agent');
      expect(result.data.task.status).toBe('completed');
      expect(result.data.completedSteps).toBeGreaterThan(0);
      expect(result.data.artifacts).toHaveLength(1);
    });    test('handles screenshot failure gracefully', async () => {
      mockSystemDriver.executeStep.mockResolvedValue({
        success: false,
        error: { message: 'Screenshot failed' }
      });

      const result = await aiDriver.execute('agent', ['Take a screenshot']);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Failed to take initial screenshot');
    });

    test('handles vision analysis failure gracefully', async () => {
      mockVisionDriver.executeStep.mockResolvedValue({
        success: false,
        error: { message: 'Vision analysis failed' }
      });

      const result = await aiDriver.execute('agent', ['Analyze the screen']);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Failed to analyze screen');
    });

    test('generates feature file artifact', async () => {
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

    test('skips steps when confirmation is rejected', async () => {
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

      confirmSpy.mockRestore();
    });
  });

  describe('Editor Mode', () => {
    beforeEach(async () => {
      await aiDriver.initialize({});
    });

    test('starts editor session successfully', async () => {
      const result = await aiDriver.execute('editor', ['test-session']);

      expect(result.success).toBe(true);
      expect(result.data.sessionId).toMatch(/^editor-\d+$/);
      expect(result.data.message).toContain('Editor mode started');
      expect(result.data.observationId).toMatch(/^obs-\d+$/);
    });

    test('handles observation failure', async () => {
      // Mock observation failure
      const observeSpy = jest.spyOn(aiDriver as any, 'observeUserActions');
      observeSpy.mockResolvedValue({
        success: false,
        error: { message: 'Observation failed' }
      });

      const result = await aiDriver.execute('editor', ['failing-session']);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Failed to start user observation');

      observeSpy.mockRestore();
    });
  });

  describe('Ask Mode', () => {
    beforeEach(async () => {
      await aiDriver.initialize({});
        mockDriverRegistry.getDriverInstance.mockImplementation((driverId: string) => {
        if (driverId === 'web-driver') return Promise.resolve(mockWebDriver);
        return Promise.resolve(null);
      });

      mockWebDriver.executeStep.mockResolvedValue({
        success: true,
        data: { screenshot: 'base64-screenshot-data' }
      });
    });

    test('answers question without action', async () => {
      const result = await aiDriver.execute('ask', ['What is on this screen?']);

      expect(result.success).toBe(true);
      expect(result.data.answer).toBeDefined();
      expect(result.data.actionTaken).toBeNull();
    });

    test('performs action when requested', async () => {
      const result = await aiDriver.execute('ask', ['Click the submit button']);

      expect(result.success).toBe(true);
      expect(result.data.answer).toBeDefined();
      expect(result.data.actionTaken).toBeDefined();
      expect(result.data.featureFile).toBeDefined();
    });

    test('handles screenshot failure in ask mode', async () => {
      mockWebDriver.executeStep.mockResolvedValue({
        success: false,
        error: { message: 'Screenshot failed' }
      });

      const result = await aiDriver.execute('ask', ['What is visible?']);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Failed to take screenshot for context');
    });
  });

  describe('Individual Actions', () => {
    beforeEach(async () => {
      await aiDriver.initialize({});
        mockDriverRegistry.getDriverInstance.mockImplementation((driverId: string) => {
        if (driverId === 'web-driver') return Promise.resolve(mockWebDriver);
        if (driverId === 'vision-driver') return Promise.resolve(mockVisionDriver);
        return Promise.resolve(null);
      });
    });

    test('takes screenshot successfully', async () => {
      mockWebDriver.executeStep.mockResolvedValue({
        success: true,
        data: { screenshot: 'base64-data' }
      });

      const result = await aiDriver.execute('screenshot', []);

      expect(result.success).toBe(true);
      expect(mockSystemDriver.executeStep).toHaveBeenCalledWith('takeScreenshot', []);
    });

    test('analyzes screen successfully', async () => {
      mockVisionDriver.executeStep.mockResolvedValue({
        success: true,
        data: { scene: { text: 'Sample text', uiElements: [] } }
      });

      const result = await aiDriver.execute('analyze', ['base64-image']);

      expect(result.success).toBe(true);
      expect(mockVisionDriver.executeStep).toHaveBeenCalledWith('analyzeScene', ['base64-image']);
    });

    test('plans task successfully', async () => {
      const taskInfo = {
        description: 'Login to application',
        currentState: { text: 'Login form' }
      };

      const result = await aiDriver.execute('plan', [taskInfo]);

      expect(result.success).toBe(true);
      expect(result.data.plan).toBeDefined();
      expect(result.data.steps).toBeDefined();
      expect(Array.isArray(result.data.steps)).toBe(true);
    });

    test('generates feature file successfully', async () => {
      const task = {
        mode: 'test',
        description: 'Test task',
        steps: [          {
            id: 'step-1',
            description: 'Take screenshot',
            action: 'takeScreenshot',
            driver: 'web-driver',
            args: []
          }
        ]
      };

      const result = await aiDriver.execute('generate', [task, { includeScreenshots: true }]);

      expect(result.success).toBe(true);
      expect(result.data.filePath).toBeDefined();
      expect(result.data.fileName).toMatch(/test-\d+\.feature$/);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    test('handles unknown action', async () => {
      const result = await aiDriver.execute('unknownAction', []);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Unknown AI action: unknownAction');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await aiDriver.initialize({});
    });

    test('handles driver not available error', async () => {
      mockDriverRegistry.getDriverInstance.mockResolvedValue(null);

      const result = await aiDriver.execute('screenshot', []);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('System driver not available for screenshot');
    });

    test('handles step execution failure', async () => {      mockDriverRegistry.getDriverInstance.mockImplementation((driverId: string) => {
        if (driverId === 'web-driver') return Promise.resolve({
          executeStep: jest.fn().mockResolvedValue({
            success: false,
            error: { message: 'Step failed' }
          })
        });
        return Promise.resolve(null);
      });

      const result = await aiDriver.execute('agent', ['Failing task']);

      expect(result.success).toBe(true); // Agent mode handles step failures gracefully
      expect(result.data.task.steps.some((step: AIStep) => step.status === 'failed')).toBe(true);
    });

    test('logs errors appropriately', async () => {
      const result = await aiDriver.execute('unknownAction', []);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'AI action failed: unknownAction',
        expect.objectContaining({ error: expect.stringContaining('Unknown AI action') })
      );
    });
  });

  describe('Shutdown', () => {
    test('cleans up active tasks on shutdown', async () => {
      await aiDriver.initialize({});

      // Start an agent task but don't let it complete
      const taskPromise = aiDriver.execute('agent', ['Long running task']);
      
      // Shutdown before task completes
      await aiDriver.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith('AI Driver shutting down');
    });
  });

  describe('Configuration Sanitization', () => {
    test('sanitizes sensitive configuration data', async () => {
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
  });

  describe('Mock AI Responses', () => {
    test('generates appropriate mock response for login tasks', async () => {
      await aiDriver.initialize({});

      const result = await aiDriver.execute('plan', [{
        description: 'login to the application',
        currentState: { text: 'login form' }
      }]);

      expect(result.success).toBe(true);
      expect(result.data.plan).toContain('Login to the application');      expect(result.data.steps.some((step: AIStep) => 
        step.action === 'typeText' && step.args[0] === 'email@example.com'
      )).toBe(true);
    });

    test('generates generic mock response for other tasks', async () => {
      await aiDriver.initialize({});

      const result = await aiDriver.execute('plan', [{
        description: 'analyze the dashboard',
        currentState: { text: 'dashboard view' }
      }]);

      expect(result.success).toBe(true);
      expect(result.data.plan).toContain('Generic task execution');
      expect(result.data.steps.some((step: AIStep) => 
        step.action === 'takeScreenshot'
      )).toBe(true);
    });
  });
});

// Note: WebSocket tests commented out as they require different setup for Node.js environment
/*
describe('AIDriver WebSocket Tests', () => {
  // These tests would need to be run in a different environment or with proper WebSocket mocking
});
*/
