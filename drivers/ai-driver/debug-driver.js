#!/usr/bin/env node

// Add comprehensive error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

console.log('Debug driver starting...');
console.log('Process args:', process.argv);
console.log('Environment variables:', process.env);

try {
  console.log('About to require index.js...');
  require('./index.js');
  console.log('Successfully required index.js');
} catch (error) {
  console.error('Error requiring index.js:', error);
  process.exit(1);
}
