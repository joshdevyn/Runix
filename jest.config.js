module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.test.json'
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // Load test environment variables
  setupFiles: ['<rootDir>/tests/env-setup.js'],
  testTimeout: 60000, // Increased timeout for AI operations
  forceExit: true, // Force Jest to exit after tests complete
  detectOpenHandles: true, // Help identify what's keeping the process alive
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Handle the duplicate package.json files by ignoring bin directory for haste
  haste: {
    enableSymlinks: false,
  },
  modulePathIgnorePatterns: [
    '<rootDir>/bin/',
    '<rootDir>/drivers/.*/node_modules/',
    '<rootDir>/bin/drivers/'
  ],
  // Add proper TypeScript module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
