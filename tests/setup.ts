// This file runs before Jest tests are executed
import '@jest/globals';
import { Logger, LogLevel } from '../src/utils/logger';
import 'jest';

// Increase timeout for all tests (useful for end-to-end tests)
jest.setTimeout(30000);

// Global setup code
const logger = Logger.getInstance();
logger.info('Setting up test environment...');

// Keep track of engines created during tests for cleanup
const globalTestState = {
  engines: new Set<any>(),
  driverRegistries: new Set<any>(),
  cleanupPromise: null as Promise<void> | null
};

// Setup test environment
beforeAll(() => {
  // Configure logger for testing
  Logger.getInstance().setLevel(LogLevel.ERROR); // Reduce noise during testing
  
  // Set environment variables for testing
  process.env.NODE_ENV = 'test';
  process.env.RUNIX_DRIVER_PORT = '9999';
  process.env.RUNIX_TEST_MODE = 'true';
  process.env.LOG_LEVEL = '4'; // ERROR level for suppressing logs during tests
});

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Global test utilities
declare global {
  var testUtils: {
    mockDriver: (name: string, actions: string[]) => any;
    createFeatureFile: (content: string) => string;
    waitForCondition: (condition: () => boolean, timeout?: number) => Promise<void>;
    registerEngine: (engine: any) => void;
    registerDriverRegistry: (registry: any) => void;
  };
}

global.testUtils = {
  mockDriver: (name: string, actions: string[]) => ({
    name,
    version: '1.0.0',
    supportedActions: actions,
    execute: jest.fn(),
    initialize: jest.fn(),
    shutdown: jest.fn()
  }),
  
  createFeatureFile: (content: string) => {
    const fs = require('fs');
    const path = require('path');
    const tmpDir = path.join(__dirname, 'tmp');
    
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    
    const filename = `test-${Date.now()}.feature`;
    const filepath = path.join(tmpDir, filename);
    fs.writeFileSync(filepath, content);
    
    return filepath;
  },
  
  waitForCondition: async (condition: () => boolean, timeout = 5000) => {
    const start = Date.now();
    while (!condition() && Date.now() - start < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!condition()) {
      throw new Error('Condition not met within timeout');
    }
  },

  registerEngine: (engine: any) => {
    globalTestState.engines.add(engine);
  },

  registerDriverRegistry: (registry: any) => {
    globalTestState.driverRegistries.add(registry);
  }
};

// Clean up after each test to prevent resource leaks
afterEach(async () => {
  // Force cleanup of any hanging resources after each test
  try {
    // Give pending operations a moment to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  } catch (error) {
    // Ignore cleanup errors during individual test cleanup
  }
});

// Clean up after all tests
afterAll(async () => {
  logger.info('Starting comprehensive test environment cleanup...');
  
  // Prevent multiple cleanup attempts
  if (globalTestState.cleanupPromise) {
    await globalTestState.cleanupPromise;
    return;
  }

  globalTestState.cleanupPromise = (async () => {
    try {
      // 1. Shutdown all registered engines
      logger.info(`Shutting down ${globalTestState.engines.size} engines...`);
      for (const engine of globalTestState.engines) {
        try {
          if (engine && typeof engine.shutdown === 'function') {
            await Promise.race([
              engine.shutdown(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Engine shutdown timeout')), 5000)
              )
            ]);
          }        } catch (error) {
          logger.error('Error shutting down engine', { class: 'TestSetup', method: 'afterAll' }, error);
        }
      }
      globalTestState.engines.clear();

      // 2. Stop all driver registries
      logger.info(`Stopping ${globalTestState.driverRegistries.size} driver registries...`);
      for (const registry of globalTestState.driverRegistries) {
        try {
          if (registry && typeof registry.stopAllDrivers === 'function') {
            await Promise.race([
              registry.stopAllDrivers(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Registry cleanup timeout')), 5000)
              )
            ]);
          }        } catch (error) {
          logger.error('Error stopping driver registry', { class: 'TestSetup', method: 'afterAll' }, error);
        }
      }
      globalTestState.driverRegistries.clear();

      // 3. Force stop any remaining driver processes
      try {
        const { DriverProcessManager } = require('../src/drivers/management/DriverProcessManager');
        const processManager = DriverProcessManager.getInstance();
        await Promise.race([
          processManager.stopAllDrivers(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Process manager cleanup timeout')), 5000)
          )
        ]);      } catch (error) {
        logger.error('Error during process manager cleanup', { class: 'TestSetup', method: 'afterAll' }, error);
      }

      // 4. Clean up test files
      const fs = require('fs');
      const path = require('path');
      const tmpDir = path.join(__dirname, 'tmp');
      
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }

      // 5. Force close any remaining open handles with a short delay
      await new Promise(resolve => setTimeout(resolve, 500));

      logger.info('Test environment cleanup completed');    } catch (error) {
      logger.error('Error during test cleanup', { class: 'TestSetup', method: 'afterAll' }, error);
      // Continue cleanup even if some parts fail
    }
  })();

  await globalTestState.cleanupPromise;
});

// Force exit handler for Jest hanging
const forceExitHandler = () => {
  logger.warn('Force exit handler triggered - Jest may be hanging due to open handles');
  setTimeout(() => {
    logger.error('Forcing process exit due to hanging resources');
    process.exit(1);
  }, 10000); // Give 10 seconds for graceful shutdown
};

process.on('SIGTERM', forceExitHandler);
process.on('SIGINT', forceExitHandler);
