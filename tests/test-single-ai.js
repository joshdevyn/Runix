// Simple isolated test for AI driver issue
const { spawn } = require('child_process');

console.log('Testing single AI driver action...');

// Just test one simple action
const testProcess = spawn('npx', ['jest', 'tests/unit/ai/aiDriver.test.ts', '--testNamePattern=completes basic agent task successfully', '--verbose'], {
  cwd: 'c:\\_Runix',
  stdio: 'inherit',
  shell: true
});

testProcess.on('close', (code) => {
  console.log(`Test process exited with code ${code}`);
});

testProcess.on('error', (err) => {
  console.error('Test process error:', err);
});
