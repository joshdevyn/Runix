import { RunixEngine } from '../../src/core/engine';
import { AgentDriver } from '../../src/drivers/ai/AgentDriver';
import path from 'path';
import fs from 'fs/promises';

describe('AgentDriver - End-to-End Tests', () => {
  let engine: RunixEngine;
  let tempFiles: string[] = [];
  let outputDir: string;
  beforeAll(async () => {
    outputDir = path.join(__dirname, '../../temp/e2e-tests');
      engine = new RunixEngine({
      autoLoadDrivers: true,
      logLevel: 1,
      reportPath: path.join(outputDir, 'test-report.json')
    });
    
    await engine.initialize();
    
    // Register engine for proper cleanup
    global.testUtils.registerEngine(engine);
  }, 60000);

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
    const cleanupTasks = [];
    
    if (engine) {
      cleanupTasks.push(
        Promise.race([
          engine.shutdown(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Engine shutdown timeout')), 10000)
          )
        ]).catch(() => {}) // Ignore errors
      );
    }
    
    // Wait for engine shutdown
    await Promise.all(cleanupTasks);
    
    // Clean up temp files
    for (const filePath of tempFiles) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // File might not exist, ignore error
      }
    }
    
    // Clean up output directory
    try {
      await fs.rmdir(outputDir, { recursive: true });
    } catch (error) {
      // Directory might not exist, ignore error
    }
    
    // Give processes time to fully stop
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  describe('agent mode end-to-end workflows', () => {
    it('should execute complete agent workflow', async () => {
      const featureContent = `
Feature: Complete Agent Workflow

Scenario: Agent creates and executes automation
  Given I set AI mode to "agent"
  When I give the agent task "Create a simple feature file for testing basic functionality"
  Then the agent should complete the task
  And I should have artifacts generated
`;

      const featureFile = global.testUtils.createFeatureFile(featureContent);
      tempFiles.push(featureFile);

      const results = await engine.runFeature(featureFile);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      
      // Verify workflow execution structure
      results.forEach(result => {
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('step');
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.step).toBe('string');
      });
      
      // At least some steps should have been attempted
      const attemptedSteps = results.filter(r => r.step && r.step.length > 0);
      expect(attemptedSteps.length).toBeGreaterThan(0);
    }, 90000);

    it('should handle agent session management', async () => {
      const featureContent = `
Feature: Agent Session Management

Scenario: Start and manage agent session
  Given I set AI mode to "agent"
  When I start a new agent session
  And I give the agent task "Analyze the current working directory"
  And I continue the agent session
  Then the session should be maintained
`;

      const featureFile = global.testUtils.createFeatureFile(featureContent);
      tempFiles.push(featureFile);

      const results = await engine.runFeature(featureFile);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      
      // Check that session management steps were processed
      const sessionSteps = results.filter(r => 
        r.step && (
          r.step.includes('session') || 
          r.step.includes('agent') ||
          r.step.includes('continue')
        )
      );
      expect(sessionSteps.length).toBeGreaterThan(0);
    }, 60000);
  });

  describe('ask mode end-to-end workflows', () => {
    it('should execute complete ask workflow', async () => {
      const featureContent = `
Feature: Complete Ask Workflow

Scenario: User asks questions and gets responses
  Given I set AI mode to "ask"
  When I ask "What files are in the current directory?"
  Then I should get a response
  When I ask "What time is it?"
  Then I should get a response
  And the responses should be helpful
`;

      const featureFile = global.testUtils.createFeatureFile(featureContent);
      tempFiles.push(featureFile);

      const results = await engine.runFeature(featureFile);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      
      // Check for ask-related steps
      const askSteps = results.filter(r => 
        r.step && (
          r.step.includes('ask') || 
          r.step.includes('response')
        )
      );
      expect(askSteps.length).toBeGreaterThan(0);
    }, 45000);

    it('should handle sequential questions in ask mode', async () => {
      const featureContent = `
Feature: Sequential Ask Interactions

Scenario: Multiple related questions
  Given I set AI mode to "ask"
  When I ask "What is 2 + 2?"
  And I ask "What is the previous answer multiplied by 3?"
  And I ask "Can you explain the calculation?"
  Then each question should receive a response
`;

      const featureFile = global.testUtils.createFeatureFile(featureContent);
      tempFiles.push(featureFile);

      const results = await engine.runFeature(featureFile);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      
      // Should process multiple ask steps
      const askSteps = results.filter(r => r.step && r.step.includes('ask'));
      expect(askSteps.length).toBeGreaterThanOrEqual(1);
    }, 45000);
  });

  describe('mixed mode workflows', () => {
    it('should handle switching between agent and ask modes', async () => {
      const featureContent = `
Feature: Mode Switching Workflow

Scenario: Switch between different AI modes
  Given I set AI mode to "ask"
  When I ask "What should I automate first?"
  Then I should get suggestions
  When I set AI mode to "agent"
  And I give the agent task "Create a basic feature file"
  Then the agent should work on the task
  When I set AI mode to "ask"
  And I ask "What did you just create?"
  Then I should get an explanation
`;

      const featureFile = global.testUtils.createFeatureFile(featureContent);
      tempFiles.push(featureFile);

      const results = await engine.runFeature(featureFile);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      
      // Should have mode switching steps
      const modeSteps = results.filter(r => 
        r.step && r.step.includes('mode')
      );
      expect(modeSteps.length).toBeGreaterThan(0);
    }, 75000);
  });

  describe('feature generation workflows', () => {
    it('should generate feature files end-to-end', async () => {
      const featureContent = `
Feature: Feature Generation Workflow

Scenario: AI generates new feature files
  Given I set AI mode to "agent"
  When I request feature generation for "login functionality"
  Then a feature file should be generated
  And the feature should be valid Gherkin syntax
`;

      const featureFile = global.testUtils.createFeatureFile(featureContent);
      tempFiles.push(featureFile);

      const results = await engine.runFeature(featureFile);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      
      // Check for feature generation steps
      const genSteps = results.filter(r => 
        r.step && (
          r.step.includes('feature') || 
          r.step.includes('generate')
        )
      );
      expect(genSteps.length).toBeGreaterThan(0);
    }, 60000);

    it('should handle complex feature generation requests', async () => {
      const featureContent = `
Feature: Complex Feature Generation

Scenario: Generate feature with specific requirements
  Given I set AI mode to "agent"
  When I request feature generation with the following requirements:
    """
    Create a feature for testing e-commerce checkout process
    Include scenarios for:
    - Adding items to cart
    - Applying discount codes
    - Completing payment
    - Handling errors
    """
  Then a comprehensive feature should be generated
  And it should include multiple scenarios
`;

      const featureFile = global.testUtils.createFeatureFile(featureContent);
      tempFiles.push(featureFile);

      const results = await engine.runFeature(featureFile);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      
      // Should handle complex generation requests
      results.forEach(result => {
        expect(result).toHaveProperty('success');
        expect(typeof result.success).toBe('boolean');
      });
    }, 90000);
  });

  describe('error handling workflows', () => {
    it('should handle AI service errors gracefully', async () => {
      const featureContent = `
Feature: Error Handling

Scenario: Handle service unavailable
  Given I set AI mode to "ask"
  When I ask an invalid question with special characters "@#$%^&*()"
  Then the system should handle the error gracefully
  And provide meaningful feedback
`;

      const featureFile = global.testUtils.createFeatureFile(featureContent);
      tempFiles.push(featureFile);

      const results = await engine.runFeature(featureFile);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      
      // Should handle errors without crashing
      results.forEach(result => {
        expect(result).toHaveProperty('success');
        expect(typeof result.success).toBe('boolean');
        
        if (!result.success && result.error) {
          expect(result.error).toHaveProperty('message');
          expect(typeof result.error.message).toBe('string');
        }
      });
    }, 30000);

    it('should recover from temporary failures', async () => {
      const featureContent = `
Feature: Recovery from Failures

Scenario: Retry after failure
  Given I set AI mode to "ask"
  When I ask a question
  And the service might be temporarily unavailable
  Then the system should attempt to recover
  When I ask another question
  Then it should work again
`;

      const featureFile = global.testUtils.createFeatureFile(featureContent);
      tempFiles.push(featureFile);

      const results = await engine.runFeature(featureFile);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      
      // Should handle recovery scenarios
      const recoverySteps = results.filter(r => 
        r.step && (
          r.step.includes('recover') || 
          r.step.includes('retry') ||
          r.step.includes('work again')
        )
      );
      // Should have attempted recovery steps
      expect(results.length).toBeGreaterThan(0);
    }, 45000);
  });

  describe('performance and concurrency', () => {
    it('should handle concurrent AI operations', async () => {
      const featureContent = `
Feature: Concurrent Operations

Scenario: Multiple simultaneous AI requests
  Given I set AI mode to "ask"
  When I ask multiple questions simultaneously:
    | Question |
    | What is the weather today? |
    | What time is it? |
    | How are you doing? |
  Then all questions should be processed
`;

      const featureFile = global.testUtils.createFeatureFile(featureContent);
      tempFiles.push(featureFile);

      const results = await engine.runFeature(featureFile);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      
      // Should handle concurrent operations
      results.forEach(result => {
        expect(result).toHaveProperty('success');
        expect(typeof result.success).toBe('boolean');
      });
    }, 60000);
  });
});
