import { RunixEngine } from '../../src/core/engine';
import { DriverRegistry } from '../../src/drivers/driverRegistry';
import { StepRegistry } from '../../src/core/stepRegistry';
import { Logger } from '../../src/utils/logger';

// Mock dependencies
jest.mock('../../src/drivers/driverRegistry');
jest.mock('../../src/core/stepRegistry');
jest.mock('../../src/utils/logger');

describe('RunixEngine', () => {
  let engine: RunixEngine;
  let mockDriverRegistry: jest.Mocked<DriverRegistry>;
  let mockStepRegistry: jest.Mocked<StepRegistry>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
      // Mock DriverRegistry
    mockDriverRegistry = {
      getInstance: jest.fn().mockReturnThis(),
      initialize: jest.fn().mockResolvedValue(undefined),
      getDriver: jest.fn().mockImplementation((driverId: string) => {
        if (driverId === 'system-driver') {
          return {
            id: 'system-driver',
            name: 'SystemDriver',
            version: '2.0.0',
            path: 'drivers/system-driver',
            executable: 'index.js'
          };
        }
        return undefined;
      }),
      listDriverIds: jest.fn().mockReturnValue(['system-driver', 'test-driver']),
      startDriver: jest.fn().mockResolvedValue({
        start: jest.fn().mockResolvedValue({
          name: 'SystemDriver',
          version: '2.0.0',
          supportedActions: ['takeScreenshot', 'clickAt', 'typeText']
        }),
        initialize: jest.fn().mockResolvedValue(undefined),
        execute: jest.fn().mockResolvedValue({ success: true }),
        shutdown: jest.fn().mockResolvedValue(undefined)
      })
    } as any;

    // Mock StepRegistry
    mockStepRegistry = {
      getInstance: jest.fn().mockReturnThis(),
      initialize: jest.fn().mockResolvedValue(undefined),
      registerSteps: jest.fn(),
      findMatchingStep: jest.fn().mockReturnValue({
        driverId: 'test-driver',
        step: {
          id: 'test-step',
          pattern: 'test step',
          action: 'test'
        }
      })
    } as any;

    // Setup singleton returns
    (DriverRegistry.getInstance as jest.Mock).mockReturnValue(mockDriverRegistry);
    (StepRegistry.getInstance as jest.Mock).mockReturnValue(mockStepRegistry);

    // Mock Logger
    const mockLogger = {
      logMethodEntry: jest.fn().mockReturnValue('trace-id'),
      logMethodExit: jest.fn(),
      logMethodError: jest.fn(),
      startTrace: jest.fn().mockReturnValue('trace-id'),
      endTrace: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      trace: jest.fn()
    };
    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);

    engine = new RunixEngine();
  });

  describe('initialization', () => {
    it('should initialize successfully without driver', async () => {
      await expect(engine.initialize()).resolves.not.toThrow();
      expect(mockDriverRegistry.initialize).toHaveBeenCalled();
      expect(mockStepRegistry.initialize).toHaveBeenCalled();
    });

    it('should initialize with a specific driver when configured', async () => {
      const mockDriverMetadata = {
        id: 'test-driver',
        name: 'TestDriver',
        version: '1.0.0',
        path: '/path/to/driver',
        executable: 'test-driver.js'
      };

      mockDriverRegistry.getDriver.mockReturnValue(mockDriverMetadata);
      
      const engineWithDriver = new RunixEngine({ driverName: 'test-driver' });
      
      await expect(engineWithDriver.initialize()).resolves.not.toThrow();
      expect(mockDriverRegistry.getDriver).toHaveBeenCalledWith('test-driver');
      expect(mockDriverRegistry.startDriver).toHaveBeenCalledWith('test-driver');
    });

    it('should throw error when specified driver is not found', async () => {
      mockDriverRegistry.getDriver.mockReturnValue(undefined);
      
      const engineWithInvalidDriver = new RunixEngine({ driverName: 'invalid-driver' });
      
      await expect(engineWithInvalidDriver.initialize()).rejects.toThrow(
        "Driver 'invalid-driver' not found in registry"
      );
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await engine.initialize();
      await expect(engine.shutdown()).resolves.not.toThrow();
    });
  });
});
