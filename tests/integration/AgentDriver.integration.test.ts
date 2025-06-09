import { AgentDriver } from '../../src/drivers/ai/AgentDriver';
import { RunixEngine } from '../../src/core/engine';
import path from 'path';
import fs from 'fs/promises';

describe('AgentDriver - Integration Tests', () => {
  let agentDriver: AgentDriver;
  let engine: RunixEngine;
  let tempFiles: string[] = [];
  beforeAll(async () => {
    // Test integration with the full Runix engine
    engine = new RunixEngine({
      autoLoadDrivers: true,
      logLevel: 1
    });
    
    await engine.initialize();
    
    // Register engine for proper cleanup
    global.testUtils.registerEngine(engine);
    
    // Also create standalone AgentDriver for direct integration tests
    agentDriver = new AgentDriver({
      logLevel: 1,
      connectionTimeout: 5000,
      requestTimeout: 15000,
      outputDir: path.join(__dirname, '../temp/integration-tests')
    });
    
    await agentDriver.initialize();
  }, 45000);

  afterEach(async () => {
    // Reset engine state between tests to prevent pollution
    if (engine) {
      try {
        // Force stop any running driver processes
        const { DriverProcessManager } = require('../../src/drivers/management/DriverProcessManager');
        const processManager = DriverProcessManager.getInstance();
        await Promise.race([
          processManager.stopAllDrivers(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Driver stop timeout')), 3000))
        ]).catch(() => {}); // Ignore timeout errors
        
        // Give drivers time to fully stop
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        // Ignore cleanup errors between tests
      }
    }
  });

  afterAll(async () => {
    // Cleanup in reverse order
    const cleanupTasks = [];
    
    if (agentDriver) {
      cleanupTasks.push(
        Promise.race([
          agentDriver.shutdown(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('AgentDriver shutdown timeout')), 5000)
          )
        ]).catch(() => {}) // Ignore errors
      );
    }
    
    if (engine) {
      cleanupTasks.push(
        Promise.race([
          engine.shutdown(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Engine shutdown timeout')), 5000)
          )
        ]).catch(() => {}) // Ignore errors
      );
    }
    
    // Wait for all shutdowns to complete
    await Promise.all(cleanupTasks);
    
    // Clean up temp files
    for (const filePath of tempFiles) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // File might not exist, ignore error
      }
    }
    
    // Clean up temp directory
    try {
      const tempDir = path.join(__dirname, '../temp/integration-tests');
      await fs.rmdir(tempDir, { recursive: true });
    } catch (error) {
      // Directory might not exist, ignore error
    }
    
    // Give processes time to fully stop
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  describe('integration with ai-driver service', () => {
    it('should integrate with ai-driver service for ask operations', async () => {
      const result = await agentDriver.execute('ask', ['What is your current mode?']);
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      
      if (result.success) {
        expect(result.data).toBeDefined();
      } else if (result.error) {
        // Service might not be available, but error should be structured
        expect(result.error.message).toBeDefined();
        expect(typeof result.error.message).toBe('string');
      }
    }, 20000);

    it('should integrate with ai-driver service for mode switching', async () => {
      // Test switching to ask mode
      const askModeResult = await agentDriver.execute('setMode', ['ask']);
      
      expect(askModeResult).toBeDefined();
      expect(typeof askModeResult.success).toBe('boolean');
      
      // Test switching to agent mode
      const agentModeResult = await agentDriver.execute('setMode', ['agent']);
      
      expect(agentModeResult).toBeDefined();
      expect(typeof agentModeResult.success).toBe('boolean');
    }, 25000);

    it('should handle agent task execution through service', async () => {
      const result = await agentDriver.execute('agent', ['Help me create a simple test']);
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      
      if (result.success) {
        expect(result.data).toBeDefined();
      } else if (result.error) {
        expect(result.error.message).toBeDefined();
      }
    }, 30000);

    it('should handle feature generation through service', async () => {
      const result = await agentDriver.execute('generateFeature', [
        'Create a feature for testing login functionality'
      ]);
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      
      if (result.success) {
        expect(result.data).toBeDefined();
      } else if (result.error) {
        expect(result.error.message).toBeDefined();
      }
    }, 30000);
  });

  describe('integration with Runix engine', () => {
    it('should work within the Runix engine ecosystem', async () => {
      // Create a feature file that uses AI driver capabilities
      const featureContent = `
Feature: AI Driver Integration Test

Scenario: Basic AI interaction
  When I set AI mode to "ask"
  And I ask AI "What is the current time?"
  Then the AI should respond
`;

      const featureFile = global.testUtils.createFeatureFile(featureContent);
      tempFiles.push(featureFile);

      const results = await engine.runFeature(featureFile);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      
      // Check that steps were executed (even if they failed due to missing AI service)
      results.forEach(result => {
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('step');
        expect(typeof result.success).toBe('boolean');
      });
    }, 45000);
  });

  describe('service lifecycle integration', () => {
    it('should handle service startup and connection', async () => {
      const newDriver = new AgentDriver({
        connectionTimeout: 3000,
        requestTimeout: 10000
      });
      
      // Initialize should handle service startup
      await expect(newDriver.initialize()).resolves.not.toThrow();
      
      // Test basic operation
      const result = await newDriver.execute('ask', ['Integration test']);
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      
      await newDriver.shutdown();
    }, 20000);

    it('should handle multiple driver instances', async () => {
      const driver1 = new AgentDriver({ connectionTimeout: 2000 });
      const driver2 = new AgentDriver({ connectionTimeout: 2000 });
      
      await driver1.initialize();
      await driver2.initialize();
      
      // Both drivers should be able to communicate with the service
      const result1 = await driver1.execute('ask', ['Driver 1 test']);
      const result2 = await driver2.execute('ask', ['Driver 2 test']);
      
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(typeof result1.success).toBe('boolean');
      expect(typeof result2.success).toBe('boolean');
      
      await driver1.shutdown();
      await driver2.shutdown();
    }, 25000);
  });

  describe('error scenarios integration', () => {
    it('should handle service unavailable scenarios', async () => {
      // Create driver with very short timeout to simulate service unavailable
      const timeoutDriver = new AgentDriver({
        connectionTimeout: 100,
        requestTimeout: 500
      });
      
      await timeoutDriver.initialize();
      
      const result = await timeoutDriver.execute('ask', ['Timeout test']);
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      
      if (!result.success && result.error) {
        expect(result.error.message).toBeDefined();
      }
      
      await timeoutDriver.shutdown();
    }, 15000);

    it('should handle concurrent operations', async () => {
      const operations = [
        agentDriver.execute('ask', ['Concurrent test 1']),
        agentDriver.execute('ask', ['Concurrent test 2']),
        agentDriver.execute('setMode', ['ask']),
        agentDriver.execute('ask', ['Concurrent test 3'])
      ];
      
      const results = await Promise.all(operations);
      
      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        
        if (!result.success && result.error) {
          expect(result.error.message).toBeDefined();
        }
      });
    }, 30000);
  });
});
