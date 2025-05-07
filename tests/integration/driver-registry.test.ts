import * as path from 'path';
import { DriverRegistry, loadDriversFromDirectory } from '../../src/drivers/driverRegistry';

describe('Driver Registry Integration Tests', () => {
  beforeEach(async () => {
    // Reset before each test
    jest.resetModules();
    // Ensure clean registry for each test
    // This is a bit hacky, but needed since DriverRegistry uses a singleton pattern
    (DriverRegistry as any).instance = undefined;
  });
  
  test('can discover and register drivers', async () => {
    const registry = DriverRegistry.getInstance();
    
    // Load drivers from example directory
    await loadDriversFromDirectory(path.resolve(__dirname, '../../drivers'));
    
    // Should find the example driver
    const drivers = registry.getAllDrivers();
    expect(drivers.length).toBeGreaterThan(0);
    
    // Verify the example driver was loaded
    const exampleDriver = registry.getDriver('exampledriver');
    expect(exampleDriver).toBeDefined();
    expect(exampleDriver?.name).toBe('ExampleDriver');
  });
  
  test('can start and get driver instance', async () => {
    const registry = DriverRegistry.getInstance();
    
    // Load drivers
    await loadDriversFromDirectory(path.resolve(__dirname, '../../drivers'));
    
    // Start the example driver
    const driverId = 'exampledriver';
    const driverInstance = await registry.startDriver(driverId);
    
    // Check that the driver instance was created
    expect(driverInstance).toBeDefined();
    
    // Verify we can get the started instance
    const retrievedInstance = registry.getDriverInstance(driverId);
    expect(retrievedInstance).toBe(driverInstance);
    
    // Clean up
    await driverInstance.shutdown();
  });
});
