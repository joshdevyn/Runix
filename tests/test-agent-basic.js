// Isolated test for debugging AI driver agent mode
const { spawn } = require('child_process');
const WebSocket = require('ws');

// Test configuration
const AI_DRIVER_PORT = 9002;
const timeout = 30000;

function createMessage(id, method, params) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: id,
    method: method,
    params: params
  });
}

function setupMocks() {
  // Setup global mocks for the AI driver
  global.MOCK_DRIVER_REGISTRY = {
    getDriverInstance: (driverId) => {
      console.log(`Mock registry: Getting driver instance for ${driverId}`);
      
      if (driverId === 'system-driver') {
        return Promise.resolve({
          executeStep: (action, args) => {
            console.log(`Mock SystemDriver.executeStep: ${action}`, args);
            return Promise.resolve({
              success: true,
              data: {
                screenshot: 'data:image/png;base64,mockScreenshotData',
                filename: 'test-screenshot.png',
                path: '/screenshots/test-screenshot.png'
              }
            });
          }
        });
      }
      
      if (driverId === 'vision-driver') {
        return Promise.resolve({
          executeStep: (action, args) => {
            console.log(`Mock VisionDriver.executeStep: ${action}`, args);
            return Promise.resolve({
              success: true,
              data: {
                scene: {
                  elements: [
                    { type: 'button', label: 'Submit', bounds: { x: 100, y: 200, width: 80, height: 30 } }
                  ],
                  text: 'Sample screen content'
                },
                confidence: 0.95
              }
            });
          }
        });
      }
      
      console.log(`Mock registry: No driver found for ${driverId}`);
      return Promise.resolve(null);
    }
  };
}

async function testAgentBasic() {
  console.log('Starting isolated agent test...');
  
  // Setup mocks
  setupMocks();
  
  // Start AI driver
  const driverProcess = spawn('node', ['drivers/ai-driver/index.js'], {
    cwd: 'c:\\_Runix',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'test' }
  });
  
  // Log driver output
  driverProcess.stdout.on('data', (data) => {
    console.log(`AI-Driver: ${data.toString().trim()}`);
  });
  
  driverProcess.stderr.on('data', (data) => {
    console.error(`AI-Driver Error: ${data.toString().trim()}`);
  });
  
  // Wait for driver to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      driverProcess.kill();
      reject(new Error('Test timeout'));
    }, timeout);
    
    // Connect to AI driver
    const ws = new WebSocket(`ws://127.0.0.1:${AI_DRIVER_PORT}`);
    
    ws.on('open', async () => {
      console.log('Connected to AI driver');
      
      try {
        // Initialize
        console.log('Sending initialize...');
        ws.send(createMessage(1, 'initialize', { 
          workingDirectory: 'c:\\_Runix',
          openaiApiKey: null 
        }));
        
        // Wait for initialize response
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Test agent mode
        console.log('Testing agent mode with: "Take a screenshot and analyze the screen"');
        ws.send(createMessage(2, 'execute', ['agent', ['Take a screenshot and analyze the screen']]));
        
      } catch (error) {
        clearTimeout(timeoutId);
        driverProcess.kill();
        reject(error);
      }
    });
    
    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());
        console.log('Received response:', JSON.stringify(response, null, 2));
        
        if (response.id === 2) { // Agent response
          clearTimeout(timeoutId);
          driverProcess.kill();
          
          // Check test expectations
          console.log('\n=== TEST RESULTS ===');
          console.log('success:', response.result?.success);
          console.log('taskId:', response.result?.data?.taskId);
          console.log('mode:', response.result?.data?.task?.mode);
          console.log('status:', response.result?.data?.task?.status);
          console.log('completedSteps:', response.result?.data?.completedSteps);
          console.log('artifacts length:', response.result?.data?.artifacts?.length);
          
          const success = response.result?.success === true;
          const hasTaskId = /^agent-\d+$/.test(response.result?.data?.taskId || '');
          const isAgentMode = response.result?.data?.task?.mode === 'agent';
          const isCompleted = response.result?.data?.task?.status === 'completed';
          const hasCompletedSteps = (response.result?.data?.completedSteps || 0) > 0;
          const hasArtifacts = (response.result?.data?.artifacts?.length || 0) === 1;
          
          console.log('\n=== ASSERTIONS ===');
          console.log('✓ success === true:', success);
          console.log('✓ taskId matches pattern:', hasTaskId);
          console.log('✓ mode === "agent":', isAgentMode);
          console.log('✓ status === "completed":', isCompleted);
          console.log('✓ completedSteps > 0:', hasCompletedSteps);
          console.log('✓ artifacts.length === 1:', hasArtifacts);
          
          const allPassed = success && hasTaskId && isAgentMode && isCompleted && hasCompletedSteps && hasArtifacts;
          
          if (allPassed) {
            console.log('\n🎉 TEST PASSED!');
            resolve(true);
          } else {
            console.log('\n❌ TEST FAILED!');
            console.log('Response data:', JSON.stringify(response.result?.data, null, 2));
            resolve(false);
          }
        }
      } catch (error) {
        console.error('Error parsing response:', error);
        clearTimeout(timeoutId);
        driverProcess.kill();
        reject(error);
      }
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clearTimeout(timeoutId);
      driverProcess.kill();
      reject(error);
    });
  });
}

// Run the test
testAgentBasic()
  .then(result => {
    console.log('Test completed:', result ? 'PASSED' : 'FAILED');
    process.exit(result ? 0 : 1);
  })
  .catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });
