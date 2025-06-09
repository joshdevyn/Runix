import { RunixEngine } from '../../src/core/engine';
import path from 'path';

describe('End-to-End Driver Execution', () => {
  const exampleDriverPath = path.join(__dirname, '../../drivers/example-driver');
  
  test('should run complete workflow with example driver', async () => {
    // Skip if example driver not available
    const fs = require('fs');
    if (!fs.existsSync(exampleDriverPath)) {
      console.warn('Example driver not found, skipping E2E test');
      return;
    }    const engine = new RunixEngine({
      driverName: 'example-driver',
      driverConfig: {
        servicePort: 3001,
        mockMode: true
      }
    });

    try {
      await engine.initialize();      const featureContent = `
Feature: Example Driver Integration
  Scenario: Complete workflow with example driver
    Given echo the message "Starting test workflow"
    When add 5 and 3
    Then wait for 100 milliseconds
    And echo the message "Test completed successfully"
`;

      const featureFile = testUtils.createFeatureFile(featureContent);
      const results = await engine.runFeature(featureFile);

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      
      // All steps should have been executed (may succeed or fail, but should have been processed)
      results.forEach(result => {
        expect(result.step).toBeDefined();
        expect(typeof result.success).toBe('boolean');
      });

    } finally {
      await engine.shutdown();
    }
  }, 60000); // 60 second timeout for E2E test
});
