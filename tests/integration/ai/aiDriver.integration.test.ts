import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import WebSocket from 'ws';
import { spawn, ChildProcess } from 'child_process';
import { DriverRegistry } from '../../../src/drivers/driverRegistry';
import { RunixEngine } from '../../../src/core/engine';
import { Logger } from '../../../src/utils/logger';

interface TestResult {
  success: boolean;
  data?: any;
  error?: string;
}

interface DriverResponse {
  id: string;
  type: 'response';
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

describe('AI Driver Integration Tests', () => {
  let aiDriverProcess: ChildProcess | null = null;
  let aiDriverPort: number;
  let logger: Logger;
  let registry: DriverRegistry;
  
  beforeAll(async () => {
    logger = Logger.getInstance();
    registry = DriverRegistry.getInstance();
    
    // Initialize registry
    await registry.initialize();
    
    // Clean up any existing test artifacts
    const testDir = path.join(__dirname, 'test-artifacts');
    try {
      await fs.rm(testDir, { recursive: true });
    } catch (error) {
      // Directory doesn't exist, that's fine
    }
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    if (aiDriverProcess) {
      aiDriverProcess.kill('SIGTERM');
      aiDriverProcess = null;
    }
    
    // Clean up test artifacts
    const testDir = path.join(__dirname, 'test-artifacts');
    try {
      await fs.rm(testDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Find available port for AI driver
    aiDriverPort = await findAvailablePort(9004);
    
    // Start AI driver process
    aiDriverProcess = await startAIDriver(aiDriverPort);
    
    // Wait for driver to be ready
    await waitForDriverReady(aiDriverPort);
  });

  afterEach(async () => {
    if (aiDriverProcess) {
      aiDriverProcess.kill('SIGTERM');
      aiDriverProcess = null;
    }
  });

  test('should start AI driver successfully', async () => {
    expect(aiDriverProcess).toBeTruthy();
    expect(aiDriverProcess?.pid).toBeDefined();
    
    // Test health endpoint
    const health = await sendDriverMessage(aiDriverPort, {
      id: 'health-1',
      type: 'request',
      method: 'health',
      params: {}
    });
    
    expect(health.result).toEqual({ status: 'ok' });
  });

  test('should return AI driver capabilities', async () => {
    const response = await sendDriverMessage(aiDriverPort, {
      id: 'cap-1',
      type: 'request',
      method: 'capabilities',
      params: {}
    });

    expect(response.result).toBeDefined();
    expect(response.result.name).toBe('AIDriver');
    expect(response.result.supportedActions).toContain('generateFeature');
    expect(response.result.supportedActions).toContain('analyzeIntent');
  });

  test('should initialize with configuration', async () => {
    const config = {
      openaiApiKey: 'test-key',
      model: 'gpt-4-vision-preview',
      temperature: 0.7
    };

    const response = await sendDriverMessage(aiDriverPort, {
      id: 'init-1',
      type: 'request',
      method: 'initialize',
      params: { config }
    });

    expect(response.result).toBeDefined();
    expect(response.result.data.initialized).toBe(true);
  });

  test('should discover available drivers', async () => {
    const response = await sendDriverMessage(aiDriverPort, {
      id: 'discover-1',
      type: 'request',
      method: 'execute',
      params: {
        action: 'discoverDrivers',
        args: []
      }
    });

    expect(response.result).toBeDefined();
    expect(response.result.data.drivers).toBeDefined();
    expect(Array.isArray(response.result.data.drivers)).toBe(true);
  });

  test('should analyze user intent', async () => {
    const userIntent = 'I want to login to the application';
    
    const response = await sendDriverMessage(aiDriverPort, {
      id: 'intent-1',
      type: 'request',
      method: 'execute',
      params: {
        action: 'analyzeIntent',
        args: [userIntent]
      }
    });

    expect(response.result).toBeDefined();
    expect(response.result.data.originalIntent).toBe(userIntent);
    expect(response.result.data.extractedIntent).toBeDefined();
    expect(response.result.data.matchedSteps).toBeDefined();
  });

  test('should generate feature from intent', async () => {
    const userIntent = 'login to application';
    const sceneData = [
      { type: 'input', label: 'Username', bounds: { x: 400, y: 200, width: 200, height: 30 } },
      { type: 'input', label: 'Password', bounds: { x: 400, y: 250, width: 200, height: 30 } },
      { type: 'button', label: 'Login', bounds: { x: 450, y: 300, width: 100, height: 35 } }
    ];

    const response = await sendDriverMessage(aiDriverPort, {
      id: 'feature-1',
      type: 'request',
      method: 'execute',
      params: {
        action: 'generateFeature',
        args: [userIntent, sceneData]
      }
    });

    expect(response.result).toBeDefined();
    expect(response.result.data.intent).toBe(userIntent);
    expect(response.result.data.gherkin).toBeDefined();
    expect(response.result.data.steps).toBeDefined();
    expect(Array.isArray(response.result.data.steps)).toBe(true);
  });

  test('should support introspection', async () => {
    const response = await sendDriverMessage(aiDriverPort, {
      id: 'intro-1',
      type: 'request',
      method: 'introspect',
      params: { type: 'steps' }
    });

    expect(response.result).toBeDefined();
    expect(response.result.steps).toBeDefined();
    expect(Array.isArray(response.result.steps)).toBe(true);
    
    // Check for expected step definitions
    const steps = response.result.steps;
    const generateFeatureStep = steps.find((step: any) => step.id === 'generate-feature');
    expect(generateFeatureStep).toBeDefined();
    expect(generateFeatureStep.action).toBe('generateFeature');
  });

  test('should integrate with Runix engine', async () => {
    // Create a test feature file
    const testFeature = `Feature: AI Integration Test
  As a tester
  I want to test AI driver integration
  So that I can verify it works with the engine

Scenario: Generate feature from intent
  Given I have the AI driver loaded
  When I analyze intent "login to application"
  Then I should get a structured response`;

    const featureFile = path.join(__dirname, 'test-artifacts', 'ai-test.feature');
    await fs.writeFile(featureFile, testFeature, 'utf8');

    // Test with RunixEngine
    const engine = new RunixEngine({
      driverName: 'ai-driver',
      driverConfig: {
        openaiApiKey: 'test-key',
        model: 'gpt-4'
      },
      reportPath: path.join(__dirname, 'test-artifacts', 'report.json'),
      logLevel: 1,
      logFilePath: path.join(__dirname, 'test-artifacts', 'test.log')
    });

    try {
      await engine.initialize();
      
      // Verify AI driver is available
      const drivers = registry.listDriverIds();
      expect(drivers).toContain('ai-driver');
      
      // Test if we can get the AI driver metadata
      const aiDriverMeta = registry.getDriver('ai-driver');
      expect(aiDriverMeta).toBeDefined();
      expect(aiDriverMeta?.name).toBe('AIDriver');
      
    } finally {
      await engine.shutdown();
    }
  });

  test('should handle errors gracefully', async () => {
    // Test with invalid action
    const response = await sendDriverMessage(aiDriverPort, {
      id: 'error-1',
      type: 'request',
      method: 'execute',
      params: {
        action: 'invalidAction',
        args: []
      }
    });

    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(400);
    expect(response.error?.message).toContain('Unknown action');
  });

  test('should generate steps for workflow', async () => {
    const taskIntent = 'submit a form with user details';
    const sceneData = [
      { type: 'input', label: 'Name', confidence: 0.9 },
      { type: 'input', label: 'Email', confidence: 0.85 },
      { type: 'button', label: 'Submit', confidence: 0.95 }
    ];

    const response = await sendDriverMessage(aiDriverPort, {
      id: 'steps-1',
      type: 'request',
      method: 'execute',
      params: {
        action: 'generateSteps',
        args: [taskIntent, sceneData]
      }
    });

    expect(response.result).toBeDefined();
    expect(response.result.data.intent).toBe(taskIntent);
    expect(response.result.data.generatedSteps).toBeDefined();
    expect(Array.isArray(response.result.data.generatedSteps)).toBe(true);
  });

  test('should orchestrate workflow execution', async () => {
    const workflow = [
      { step: 'Given I open the browser', driver: 'WebDriver', action: 'open' },
      { step: 'When I enter text into field', driver: 'WebDriver', action: 'enterText' },
      { step: 'Then I should see success', driver: 'WebDriver', action: 'assertVisible' }
    ];

    const response = await sendDriverMessage(aiDriverPort, {
      id: 'orchestrate-1',
      type: 'request',
      method: 'execute',
      params: {
        action: 'orchestrate',
        args: [workflow, { sessionId: 'test-session' }]
      }
    });

    expect(response.result).toBeDefined();
    expect(response.result.data.workflow).toEqual(workflow);
    expect(response.result.data.orchestrationPlan).toBeDefined();
    expect(response.result.data.totalSteps).toBe(3);
  });
});

// Helper functions
async function findAvailablePort(startPort: number): Promise<number> {
  const net = await import('net');
  
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      const port = (server.address() as any)?.port || startPort;
      server.close(() => resolve(port));
    });
  });
}

async function startAIDriver(port: number): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const driverPath = path.join(__dirname, '../../../drivers/ai-driver');
    const childProcess = spawn('node', ['index.js'], {
      cwd: driverPath,
      env: {
        ...process.env,
        RUNIX_DRIVER_PORT: port.toString()
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    childProcess.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
      if (output.includes(`AI driver listening on 127.0.0.1:${port}`)) {
        resolve(childProcess);
      }
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      console.error('AI Driver stderr:', data.toString());
    });

    childProcess.on('error', reject);
    
    // Timeout after 10 seconds
    setTimeout(() => {
      reject(new Error('AI driver failed to start within timeout'));
    }, 10000);
  });
}

async function waitForDriverReady(port: number, maxAttempts: number = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await sendDriverMessage(port, {
        id: 'ready-check',
        type: 'request',
        method: 'health',
        params: {}
      });
      return; // Driver is ready
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error('Driver failed to become ready');
}

async function sendDriverMessage(port: number, message: any): Promise<DriverResponse> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    
    ws.on('open', () => {
      ws.send(JSON.stringify(message));
    });

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString()) as DriverResponse;
        ws.close();
        resolve(response);
      } catch (error) {
        ws.close();
        reject(error);
      }
    });

    ws.on('error', (error) => {
      reject(error);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      ws.close();
      reject(new Error('Driver message timeout'));
    }, 5000);
  });
}
