import * as path from 'path';
import { RunixEngine } from '../../src/core/engine';

describe('Driver Execution End-to-End Tests', () => {
  let engine: RunixEngine;
  
  beforeEach(() => {
    // Create a fresh engine for each test
    engine = new RunixEngine({
      driverName: 'ExampleDriver',
      driverConfig: {},
    });
  });
  
  afterEach(async () => {
    // Clean up after each test
    await engine.shutdown();
  });
  
  test('can run basic scenario with example driver', async () => {
    // Initialize the engine
    await engine.initialize();
    
    // Run the example driver feature
    const results = await engine.runFeature(
      path.resolve(__dirname, '../../scenarios/example-driver.feature')
    );
    
    // Verify results
    expect(results).toHaveLength(9); // 9 steps in the example-driver.feature
    expect(results.every(result => result.success)).toBe(true);
  });
  
  test('can execute echo commands', async () => {
    // Initialize the engine
    await engine.initialize();
    
    // Run a feature with echo commands
    const results = await engine.runFeature(
      path.resolve(__dirname, '../fixtures/echo.feature')
    );
    
    // Verify echo results
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(result => result.success)).toBe(true);
    
    // Check that the echo data was returned
    const echoResult = results.find(r => r.step.includes('echo the message'));
    expect(echoResult?.data?.message).toBeDefined();
  });
});
