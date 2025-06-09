/**
 * Unit tests for AI driver module loading
 */

describe('AI Driver Modules', () => {
  test('should load config module successfully', () => {
    expect(() => {
      const config = require('../../../../drivers/ai-driver/src/config/config');
      expect(config).toBeDefined();
    }).not.toThrow();
  });

  test('should load providers module successfully', () => {
    expect(() => {
      const providers = require('../../../../drivers/ai-driver/src/providers/llmProviders');
      expect(providers).toBeDefined();
    }).not.toThrow();
  });

  test('should load all core modules without errors', () => {
    const modules = [
      '../../../../drivers/ai-driver/src/config/config',
      '../../../../drivers/ai-driver/src/providers/llmProviders'
    ];

    modules.forEach(modulePath => {
      expect(() => {
        const module = require(modulePath);
        expect(module).toBeDefined();
      }).not.toThrow();
    });
  });
});
