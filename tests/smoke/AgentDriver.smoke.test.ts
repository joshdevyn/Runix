import { AgentDriver } from '../../src/drivers/ai/AgentDriver';
import path from 'path';

describe('AgentDriver - Smoke Tests', () => {
  let agentDriver: AgentDriver;

  beforeAll(() => {
    agentDriver = new AgentDriver({
      logLevel: 0, // Minimal logging for smoke tests
      connectionTimeout: 3000,
      requestTimeout: 8000
    });
  });

  afterAll(async () => {
    try {
      if (agentDriver) {
        await agentDriver.shutdown();
      }
    } catch (error) {
      // Ignore shutdown errors in smoke tests
    }
  });

  describe('basic functionality', () => {
    it('should create AgentDriver instance', () => {
      expect(agentDriver).toBeDefined();
      expect(agentDriver).toBeInstanceOf(AgentDriver);
    });

    it('should have required capabilities', () => {
      const capabilities = agentDriver.getCapabilities();
      
      expect(capabilities).toBeDefined();
      expect(capabilities.name).toBe('AgentDriver');
      expect(capabilities.supportedActions).toBeDefined();
      expect(Array.isArray(capabilities.supportedActions)).toBe(true);
      expect(capabilities.supportedActions.length).toBeGreaterThan(0);
    });

    it('should initialize without throwing', async () => {
      await expect(agentDriver.initialize()).resolves.not.toThrow();
    }, 15000);

    it('should handle basic ask action', async () => {
      const result = await agentDriver.execute('ask', ['Hello, can you hear me?']);
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      
      // Should either succeed or fail gracefully with proper error structure
      if (!result.success && result.error) {
        expect(result.error.message).toBeDefined();
      }
    }, 15000);

    it('should handle basic setMode action', async () => {
      const result = await agentDriver.execute('setMode', ['ask']);
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      
      if (!result.success && result.error) {
        expect(result.error.message).toBeDefined();
      }
    }, 15000);

    it('should shutdown gracefully', async () => {
      await expect(agentDriver.shutdown()).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle invalid action gracefully', async () => {
      const result = await agentDriver.execute('nonExistentAction', ['test']);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      if (result.error) {
        expect(result.error.message).toBeDefined();
      }
    }, 10000);

    it('should handle execution before initialization', async () => {
      const newDriver = new AgentDriver();
      
      const result = await newDriver.execute('ask', ['test']);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      if (result.error) {
        expect(result.error.message).toBeDefined();
      }
      
      await newDriver.shutdown();
    });
  });
});
