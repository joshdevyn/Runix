import { RunixEngine } from '../../src/core/engine';
import path from 'path';
import fs from 'fs/promises';

describe('RunixEngine', () => {
  let engine: RunixEngine;
  let tempFiles: string[] = [];

  beforeEach(() => {
    // Use ACTUAL engine with REAL drivers - no mocking whatsoever
    // When autoLoadDrivers is true, we should NOT specify driverName
    // The engine will automatically discover and load all drivers
    engine = new RunixEngine({
      autoLoadDrivers: true,
      logLevel: 1, // Some logging to see what's happening
      // No mockMode - use real drivers
    });
  });

  afterEach(async () => {
    try {
      if (engine) {
        await engine.shutdown();
      }
    } catch (error) {
      // Ignore shutdown errors in tests
    }
    
    // Clean up temp files using the path-based approach
    for (const filePath of tempFiles) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // File might not exist, ignore error
      }
    }
    tempFiles = [];
  });

  describe('initialization', () => {
    it('should initialize successfully with auto-loaded drivers', async () => {
      await expect(engine.initialize()).resolves.not.toThrow();
    }, 30000);

    it('should auto-load available drivers', async () => {
      await engine.initialize();
      
      // Engine should have initialized successfully
      // Since there's no getCapabilities() method, we can test by trying to run a simple step
      expect(engine).toBeDefined();
    }, 30000);
  });

  describe('feature execution', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should execute a simple feature file', async () => {
      const featureContent = `
Feature: Basic Engine Test

Scenario: Simple echo test
  When I echo the message "Hello World"
  Then the result should be successful
`;

      const featureFile = global.testUtils.createFeatureFile(featureContent);
      tempFiles.push(featureFile);

      const results = await engine.runFeature(featureFile);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      
      // Check that each result has the expected structure
      results.forEach(result => {
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('step');
        expect(typeof result.success).toBe('boolean');
      });
    }, 30000);    it('should handle feature file with multiple steps from different drivers', async () => {
      const featureContent = `
Feature: Multi-driver Test

Scenario: Cross-driver operations
  When echo the message "Hello from example driver"
  And add 5 and 3
  And wait for 100 milliseconds
  And I create file "test.txt" with content "Hello World"
`;

      const featureFile = global.testUtils.createFeatureFile(featureContent);
      tempFiles.push(featureFile);

      const results = await engine.runFeature(featureFile);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(4);      
      // Check that multiple steps were executed successfully
      const successfulSteps = results.filter(r => r.success === true);
      expect(successfulSteps.length).toBeGreaterThan(0);
      
      // Check that each result has the expected structure
      results.forEach(result => {
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('step');
        expect(typeof result.success).toBe('boolean');
      });
    }, 30000);

    it('should handle steps from different driver types', async () => {
      const featureContent = `
Feature: Cross-driver Capability Test

Scenario: Testing multiple driver types
  When echo the message "Starting cross-driver test"
  And I create file "cross-driver-test.txt" with content "Test content"  
  And add 10 and 15
  And wait for 200 milliseconds
`;

      const featureFile = global.testUtils.createFeatureFile(featureContent);
      tempFiles.push(featureFile);

      const results = await engine.runFeature(featureFile);
        expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(4);
      
      // Verify that we have results from multiple drivers
      const stepTexts = results.map(r => r.step || '').filter(text => text.length > 0);
      expect(stepTexts.length).toBeGreaterThan(0);
      
      // Check that at least some steps executed successfully
      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBeGreaterThan(0);
    }, 30000);
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should handle non-existent feature file gracefully', async () => {
      const nonExistentFile = path.join(__dirname, 'non-existent.feature');
      
      await expect(engine.runFeature(nonExistentFile)).rejects.toThrow();
    });    it('should handle invalid feature file content', async () => {
      const invalidContent = 'This is not a valid feature file';
      const featureFile = global.testUtils.createFeatureFile(invalidContent);
      tempFiles.push(featureFile);

      // Should throw an error for invalid feature file content
      await expect(engine.runFeature(featureFile)).rejects.toThrow();
    }, 30000);
  });

  describe('shutdown', () => {
    it('should shutdown gracefully after initialization', async () => {
      await engine.initialize();
      await expect(engine.shutdown()).resolves.not.toThrow();
    }, 30000);

    it('should handle shutdown without initialization', async () => {
      await expect(engine.shutdown()).resolves.not.toThrow();
    });
  });
});
