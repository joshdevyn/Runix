// This file runs before Jest tests are executed
import '@jest/globals';

// Increase timeout for all tests (useful for end-to-end tests)
jest.setTimeout(30000);

// Global setup code
console.log('Setting up test environment...');

// Clean up after all tests
afterAll(async () => {
  console.log('Cleaning up test environment...');
});
