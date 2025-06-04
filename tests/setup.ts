// This file runs before Jest tests are executed
import '@jest/globals';
import { Logger } from '../src/utils/logger';

// Increase timeout for all tests (useful for end-to-end tests)
jest.setTimeout(30000);

// Global setup code
const logger = Logger.getInstance();
logger.info('Setting up test environment...');

// Clean up after all tests
afterAll(async () => {
  logger.info('Cleaning up test environment...');
});
