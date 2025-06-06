import { AIDriver, AIDriverConfig } from '../../../src/drivers/ai/AIDriver';
import { Logger } from '../../../src/utils/logger';
import { DriverRegistry } from '../../../src/drivers/driverRegistry';
import * as fs from 'fs/promises';

// Extend global type for mock driver registry
declare global {
  var MOCK_DRIVER_REGISTRY: any;
}

// Mock dependencies
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/drivers/driverRegistry');
jest.mock('fs/promises');

// Mock WebSocket for Node.js environment
const mockWebSocket = {
  send: jest.fn(),
  on: jest.fn(),
  close: jest.fn()
};

// @ts-ignore
global.WebSocket = jest.fn(() => mockWebSocket);

export interface TestSetup {
  aiDriver: AIDriver;
  mockLogger: jest.Mocked<Logger>;
  mockDriverRegistry: jest.Mocked<DriverRegistry>;
  mockWebDriver: any;
  mockVisionDriver: any;
  mockSystemDriver: any;
}

export function setupAIDriverTest(): TestSetup {
  // Clear all mocks
  jest.clearAllMocks();

  // Create mock drivers FIRST
  const mockWebDriver = {
    execute: jest.fn()
  };

  const mockVisionDriver = {
    execute: jest.fn().mockResolvedValue({
      success: true,
      data: {
        scene: {
          elements: [
            { type: 'button', text: 'Submit', selector: '[type="submit"]' },
            { type: 'input', placeholder: 'Email', selector: '[name="email"]' }
          ],
          layout: 'form'
        }
      }
    })
  };

  const mockSystemDriver = {
    execute: jest.fn().mockResolvedValue({
      success: true,
      data: { screenshot: 'mock-screenshot-data' }
    })
  };

  // Create mocked logger
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    createChildLogger: jest.fn().mockReturnThis(),
    getInstance: jest.fn()
  } as any;
  
  // Setup the static getInstance method to return the mock
  mockLogger.getInstance.mockReturnValue(mockLogger);

  // Create mock driver registry
  const mockDriverRegistry = {
    getInstance: jest.fn().mockReturnThis(),
    getDriver: jest.fn().mockImplementation((driverId: string) => {
      // Return false for missing drivers to test warning behavior
      if (driverId === 'vision-driver' || driverId === 'system-driver') {
        return false; // This will trigger warnings in some tests
      }
      return true;
    }),
    getDriverInstance: jest.fn().mockImplementation((driverId: string) => {
      if (driverId === 'web-driver') return Promise.resolve(mockWebDriver);
      if (driverId === 'vision-driver') return Promise.resolve(mockVisionDriver);
      if (driverId === 'system-driver') return Promise.resolve(mockSystemDriver);
      return Promise.resolve(null);
    })
  } as any;

  // Setup global mock registry
  global.MOCK_DRIVER_REGISTRY = {
    'web-driver': mockWebDriver,
    'vision-driver': mockVisionDriver,
    'system-driver': mockSystemDriver
  };

  // Mock the static methods BEFORE creating the AIDriver
  (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);
  (DriverRegistry.getInstance as jest.Mock).mockReturnValue(mockDriverRegistry);
  (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
  (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

  const aiDriver = new AIDriver();

  return {
    aiDriver,
    mockLogger,
    mockDriverRegistry,
    mockWebDriver,
    mockVisionDriver,
    mockSystemDriver
  };
}

export function cleanupAIDriverTest(): void {
  jest.clearAllMocks();
  delete global.MOCK_DRIVER_REGISTRY;
}
