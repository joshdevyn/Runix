import { RunixEngine } from '../../src/core/engine';
import { DriverRegistry } from '../../src/drivers/driverRegistry';
import { Database } from '../../src/db/database';

// Mock dependencies
jest.mock('../../src/drivers/driverRegistry');
jest.mock('../../src/db/database');
jest.mock('../../src/parser/parser');

describe('RunixEngine Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocks
    const mockDriverRegistry = DriverRegistry.getInstance as jest.Mock;
    mockDriverRegistry.mockReturnValue({
      listDriverIds: jest.fn().mockReturnValue(['mockDriver']),
      discoverDrivers: jest.fn().mockResolvedValue(undefined),
      getDriver: jest.fn().mockReturnValue({ id: 'mockDriver', name: 'MockDriver' }),
      startDriver: jest.fn().mockResolvedValue({
        start: jest.fn().mockResolvedValue({
          name: 'MockDriver',
          version: '1.0.0',
          supportedActions: ['mockAction']
        }),
        initialize: jest.fn().mockResolvedValue(undefined),
        execute: jest.fn().mockResolvedValue({ success: true, data: {} }),
        shutdown: jest.fn().mockResolvedValue(undefined)
      })
    });
    
    // Mock database
    const mockDatabase = Database.getInstance as jest.Mock;
    mockDatabase.mockReturnValue({
      initialize: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined)
    });
  });
  
  test('initializes with default config', async () => {
    const engine = new RunixEngine();
    await engine.initialize();
    
    // Verify driver registry was used
    expect(DriverRegistry.getInstance).toHaveBeenCalled();
    const mockRegistry = DriverRegistry.getInstance();
    expect(mockRegistry.getDriver).toHaveBeenCalledWith('WebDriver');
    expect(mockRegistry.startDriver).toHaveBeenCalled();
  });
  
  test('initializes with custom config', async () => {
    const engine = new RunixEngine({
      driverName: 'CustomDriver',
      driverConfig: { option: 'value' }
    });
    await engine.initialize();
    
    // Verify driver registry was used with custom config
    const mockRegistry = DriverRegistry.getInstance();
    expect(mockRegistry.getDriver).toHaveBeenCalledWith('CustomDriver');
  });
  
  test('shuts down properly', async () => {
    const engine = new RunixEngine();
    await engine.initialize();
    await engine.shutdown();
    
    // Verify driver was shut down
    const mockRegistry = DriverRegistry.getInstance();
    const mockDriver = await mockRegistry.startDriver('mockDriver');
    expect(mockDriver.shutdown).toHaveBeenCalled();
    
    // Verify database connection was closed
    const mockDb = Database.getInstance();
    expect(mockDb.disconnect).toHaveBeenCalled();
  });
});
