import { setupAIDriverTest, cleanupAIDriverTest, TestSetup } from './aiDriver.testSetup';

describe('AIDriver - Capabilities', () => {
  let testSetup: TestSetup;

  beforeEach(() => {
    testSetup = setupAIDriverTest();
  });

  afterEach(() => {
    cleanupAIDriverTest();
  });

  describe('Driver Capabilities', () => {
    test('returns correct capabilities', () => {
      const { aiDriver } = testSetup;
      const capabilities = aiDriver.getCapabilities();

      expect(capabilities.name).toBe('AIDriver');
      expect(capabilities.version).toBe('2.0.0');
      expect(capabilities.description).toBe('Enhanced AI orchestration driver with vision analysis and system-level automation for application-agnostic interactions');
      expect(capabilities.author).toBe('Runix Team');
    });

    test('includes all required supported actions', () => {
      const { aiDriver } = testSetup;
      const capabilities = aiDriver.getCapabilities();

      const expectedActions = [
        'agent', 'editor', 'ask', 'screenshot', 'analyze', 'plan', 'execute',
        'confirm', 'learn', 'generate', 'observe', 'interact', 
        'generateFeature', 'analyzeIntent', 'orchestrate'
      ];

      expectedActions.forEach(action => {
        expect(capabilities.supportedActions).toContain(action);
      });
    });

    test('has consistent capability structure', () => {
      const { aiDriver } = testSetup;
      const capabilities = aiDriver.getCapabilities();

      expect(capabilities).toHaveProperty('name');
      expect(capabilities).toHaveProperty('version');
      expect(capabilities).toHaveProperty('description');
      expect(capabilities).toHaveProperty('supportedActions');
      expect(capabilities).toHaveProperty('author');

      expect(Array.isArray(capabilities.supportedActions)).toBe(true);
      expect(capabilities.supportedActions.length).toBeGreaterThan(0);
    });
  });
});
