import { RunixEngine } from '../../src/core/engine';
import { DriverRegistry } from '../../src/drivers/driverRegistry';
import { Database } from '../../src/db/database';
import { StepRegistry } from '../../src/core/stepRegistry';

// Mock dependencies
jest.mock('../../src/drivers/driverRegistry');
jest.mock('../../src/db/database');
jest.mock('../../src/parser/parser');
jest.mock('../../src/core/stepRegistry');

describe('RunixEngine Unit Tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Reset singletons safely
    (DriverRegistry as any).instance = undefined;
    (Database as any).instance = undefined;
    (StepRegistry as any).instance = undefined;
    
    // Setup mocks with proper error handling and logging methods
    const mockDriverRegistry = DriverRegistry.getInstance as jest.Mock;
    mockDriverRegistry.mockReturnValue({
      listDriverIds: jest.fn().mockReturnValue(['mockDriver']),
      initialize: jest.fn().mockResolvedValue(undefined),
      getDriver: jest.fn().mockReturnValue({ 
        id: 'mockDriver', 
        name: 'MockDriver',
        executable: 'mock.exe',
        path: '/mock/path'
      }),
      startDriver: jest.fn().mockResolvedValue({
        start: jest.fn().mockResolvedValue({
          name: 'MockDriver',
          version: '1.0.0',
          supportedActions: ['mockAction']
        }),
        initialize: jest.fn().mockResolvedValue(undefined),
        execute: jest.fn().mockResolvedValue({ 
          success: true, 
          data: { result: 'mock result' }
        }),
        shutdown: jest.fn().mockResolvedValue(undefined)
      })
    });
    
    // Mock database with validation
    const mockDatabase = Database.getInstance as jest.Mock;
    mockDatabase.mockReturnValue({
      initialize: jest.fn().mockImplementation((config) => {
        if (config && typeof config !== 'object') {
          throw new Error('Invalid database config');
        }
        return Promise.resolve();
      }),
      disconnect: jest.fn().mockResolvedValue(undefined)
    });
    
    // Mock step registry with enhanced logging methods
    const mockStepRegistry = StepRegistry.getInstance as jest.Mock;
    mockStepRegistry.mockReturnValue({
      initialize: jest.fn().mockResolvedValue(undefined),
      registerSteps: jest.fn(),
      findMatchingStep: jest.fn().mockReturnValue({
        driverId: 'mockDriver',
        step: { id: 'mock-step', pattern: 'mock (.*)', action: 'mockAction' }
      })
    });

    // Mock Logger with enhanced methods
    const mockLogger = require('../../src/utils/logger').Logger.getInstance as jest.Mock;
    mockLogger.mockReturnValue({
      info: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      startTrace: jest.fn().mockReturnValue('mock-trace-id'),
      endTrace: jest.fn(),
      logMethodEntry: jest.fn().mockReturnValue('mock-trace-id'),
      logMethodExit: jest.fn(),
      logMethodError: jest.fn(),
      createChildLogger: jest.fn().mockReturnThis()
    });
  });
  
  afterEach(async () => {
    // Cleanup any remaining resources
    jest.clearAllTimers();
  });
  
  test('initializes with default config', async () => {
    const engine = new RunixEngine();
    
    await expect(engine.initialize()).resolves.not.toThrow();
    
    // Verify driver registry was used
    expect(DriverRegistry.getInstance).toHaveBeenCalled();
    const mockRegistry = DriverRegistry.getInstance();
    expect(mockRegistry.getDriver).toHaveBeenCalledWith('WebDriver');
    expect(mockRegistry.startDriver).toHaveBeenCalled();
  });
  
  test('initializes with custom config and validates input', async () => {
    const validConfig = {
      driverName: 'CustomDriver',
      driverConfig: { timeout: 5000 }
    };
    
    const engine = new RunixEngine(validConfig);
    await expect(engine.initialize()).resolves.not.toThrow();
    
    const mockRegistry = DriverRegistry.getInstance();
    expect(mockRegistry.getDriver).toHaveBeenCalledWith('CustomDriver');
  });
  
  test('handles driver initialization failure gracefully', async () => {
    const mockRegistry = DriverRegistry.getInstance as jest.Mock;
    mockRegistry.mockReturnValueOnce({
      ...mockRegistry(),
      getDriver: jest.fn().mockReturnValue(null)
    });
    
    const engine = new RunixEngine({ driverName: 'NonExistentDriver' });
    
    await expect(engine.initialize()).rejects.toThrow('Driver not found: NonExistentDriver');
  });
  
  test('shuts down properly with resource cleanup', async () => {
    const engine = new RunixEngine();
    await engine.initialize();
    
    await expect(engine.shutdown()).resolves.not.toThrow();
    
    // Verify proper cleanup
    const mockRegistry = DriverRegistry.getInstance();
    const mockDriver = await mockRegistry.startDriver('mockDriver');
    expect(mockDriver.shutdown).toHaveBeenCalled();
    
    const mockDb = Database.getInstance();
    expect(mockDb.disconnect).toHaveBeenCalled();
  });
  
  test('handles concurrent initialization attempts', async () => {
    const engine = new RunixEngine();
    
    // Attempt multiple concurrent initializations
    const promises = Array(5).fill(null).map(() => engine.initialize());
    
    await expect(Promise.all(promises)).resolves.not.toThrow();
    
    // Should only initialize once
    const mockRegistry = DriverRegistry.getInstance();
    expect(mockRegistry.startDriver).toHaveBeenCalledTimes(1);
  });
});
