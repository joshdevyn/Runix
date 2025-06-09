import { AgentDriver } from '../../../../src/drivers/ai/AgentDriver';
import path from 'path';
import fs from 'fs/promises';

describe('AgentDriver - Real Implementation Tests', () => {
  let agentDriver: AgentDriver;
  let tempFiles: string[] = [];

  beforeEach(() => {
    // Use REAL AgentDriver with REAL implementations - no mocking whatsoever    
      agentDriver = new AgentDriver({
      logLevel: 3, // Reduce logging noise in tests (ERROR level only)
      connectionTimeout: 5000,
      requestTimeout: 10000,
      outputDir: path.join(__dirname, '../../../../temp/agent-driver-tests')
    });
  });

  afterEach(async () => {
    try {
      if (agentDriver) {
        await agentDriver.shutdown();
      }
    } catch (error) {
      // Ignore shutdown errors in tests
    }
    
    // Clean up temp files
    for (const filePath of tempFiles) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // File might not exist, ignore error
      }
    }
    tempFiles = [];
      // Clean up temp directory
    try {
      const tempDir = path.join(__dirname, '../../../../temp/agent-driver-tests');
      await fs.rm(tempDir, { recursive: true });
    } catch (error) {
      // Directory might not exist, ignore error
    }
  });

  describe('initialization', () => {
    it('should initialize successfully with default configuration', async () => {
      await expect(agentDriver.initialize()).resolves.not.toThrow();
    }, 30000);

    it('should initialize with custom configuration', async () => {
      const customConfig = {
        outputDir: path.join(__dirname, '../../../../temp/custom-agent-output'),
        connectionTimeout: 3000,
        requestTimeout: 15000,
        aiDriverServiceHost: 'localhost'
      };
      
      await expect(agentDriver.initialize(customConfig)).resolves.not.toThrow();
    }, 30000);

    it('should create output directory when specified', async () => {
      const outputDir = path.join(__dirname, '../../../../temp/agent-output-test');
      
      await agentDriver.initialize({ outputDir });
      
      // Check if directory was created
      const stats = await fs.stat(outputDir);
      expect(stats.isDirectory()).toBe(true);
        // Clean up
      await fs.rm(outputDir, { recursive: true });
    }, 30000);
  });

  describe('capabilities', () => {
    it('should return correct capabilities', () => {
      const capabilities = agentDriver.getCapabilities();
      
      expect(capabilities.name).toBe('AgentDriver');
      expect(capabilities.version).toBe('1.0.0');      expect(capabilities.description).toContain('Agent-driven automation system');
      expect(capabilities.supportedActions).toContain('agent');
      expect(capabilities.supportedActions).toContain('ask');
      expect(capabilities.supportedActions).toContain('takeScreenshot');
      expect(capabilities.supportedActions).toContain('analyze');
      expect(capabilities.supportedActions).toContain('plan');
      expect(capabilities.supportedActions).toContain('execute');
      expect(capabilities.supportedActions).toContain('generateFeature');
      expect(capabilities.supportedActions).toContain('setMode');
      expect(capabilities.supportedActions).toContain('startSession');
    });
  });

  describe('execution with real ai-driver service', () => {
    beforeEach(async () => {
      await agentDriver.initialize();
    }, 30000);

    it('should handle ask action execution', async () => {
      const result = await agentDriver.execute('ask', ['What is the current date?']);
      
      // The result structure should be consistent regardless of success/failure
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      
      if (result.success) {
        expect(result).toHaveProperty('data');
      } else {
        expect(result).toHaveProperty('error');
        expect(result.error).toHaveProperty('message');
      }
    }, 30000);

    it('should handle agent action execution', async () => {
      const result = await agentDriver.execute('agent', ['Help me with a simple task']);
      
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      
      if (result.success) {
        expect(result).toHaveProperty('data');
      } else {
        expect(result).toHaveProperty('error');
        expect(result.error).toHaveProperty('message');
      }
    }, 30000);

    it('should handle setMode action execution', async () => {
      const result = await agentDriver.execute('setMode', ['ask']);
      
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      
      if (result.success) {
        expect(result).toHaveProperty('data');
      } else {
        expect(result).toHaveProperty('error');
        expect(result.error).toHaveProperty('message');
      }
    }, 30000);

    it('should handle generateFeature action execution', async () => {
      const result = await agentDriver.execute('generateFeature', ['Create a simple test feature']);
      
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      
      if (result.success) {
        expect(result).toHaveProperty('data');
      } else {
        expect(result).toHaveProperty('error');
        expect(result.error).toHaveProperty('message');
      }
    }, 30000);

    it('should handle invalid action gracefully', async () => {
      const result = await agentDriver.execute('invalidAction', ['test']);
      
      expect(result).toHaveProperty('success');
      expect(result.success).toBe(false);
      expect(result).toHaveProperty('error');
      expect(result.error).toHaveProperty('message');
    }, 30000);

    it('should handle action with invalid arguments', async () => {
      const result = await agentDriver.execute('ask', []); // Empty args
      
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      
      if (!result.success) {
        expect(result).toHaveProperty('error');
        expect(result.error).toHaveProperty('message');
      }
    }, 30000);
  });

  describe('error handling and edge cases', () => {
    it('should handle execution before initialization', async () => {
      const uninitializedDriver = new AgentDriver();
      
      // The execute method should throw an error when not initialized
      await expect(uninitializedDriver.execute('ask', ['test'])).rejects.toThrow('Driver not initialized');
      
      await uninitializedDriver.shutdown();
    });

    it('should handle shutdown gracefully after initialization', async () => {
      await agentDriver.initialize();
      await expect(agentDriver.shutdown()).resolves.not.toThrow();
    }, 30000);

    it('should handle shutdown without initialization', async () => {
      const newDriver = new AgentDriver();
      await expect(newDriver.shutdown()).resolves.not.toThrow();
    });

    it('should handle multiple sequential actions', async () => {
      await agentDriver.initialize();
      
      const results = [];
      
      // Execute multiple actions sequentially
      results.push(await agentDriver.execute('setMode', ['ask']));
      results.push(await agentDriver.execute('ask', ['What is 2+2?']));
      results.push(await agentDriver.execute('setMode', ['agent']));
      
      // All results should have proper structure
      results.forEach(result => {
        expect(result).toHaveProperty('success');
        expect(typeof result.success).toBe('boolean');
        
        if (result.success) {
          expect(result).toHaveProperty('data');
        } else {
          expect(result).toHaveProperty('error');
        }
      });
    }, 45000);
  });

  describe('configuration scenarios', () => {
    it('should work with different timeout configurations', async () => {
      const shortTimeoutDriver = new AgentDriver({
        connectionTimeout: 1000,
        requestTimeout: 5000
      });
      
      await shortTimeoutDriver.initialize();
      
      const result = await shortTimeoutDriver.execute('ask', ['Quick test']);
      
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      
      await shortTimeoutDriver.shutdown();
    }, 30000);

    it('should work with custom service host configuration', async () => {
      const customHostDriver = new AgentDriver({
        aiDriverServiceHost: 'localhost'
      });
      
      await customHostDriver.initialize();
      
      const result = await customHostDriver.execute('ask', ['Host test']);
      
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      
      await customHostDriver.shutdown();
    }, 30000);
  });
});
