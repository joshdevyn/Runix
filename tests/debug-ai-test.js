// Simple standalone test to debug AI driver response format issue
const { AIDriver } = require('./src/drivers/ai/AIDriver');

async function testBasicAgentTask() {
  console.log('Starting basic AI driver test...');
  
  // Create a simple AIDriver instance
  const aiDriver = new AIDriver({
    model: 'gpt-4',
    temperature: 0.7
  });

  try {
    // Initialize the driver
    await aiDriver.initialize();
    console.log('✓ Driver initialized');

    // Execute a simple agent task
    const result = await aiDriver.execute('agent', ['Take a screenshot and analyze the screen']);
    
    console.log('Raw result:', JSON.stringify(result, null, 2));
    console.log('result.success:', result.success);
    console.log('typeof result.success:', typeof result.success);
    console.log('result.data:', result.data);
    
    // Check what the test expects
    if (result.success === true) {
      console.log('✓ SUCCESS: result.success is true');
    } else {
      console.log('✗ FAIL: result.success is', result.success, 'but expected true');
    }

    await aiDriver.shutdown();
    
  } catch (error) {
    console.error('Error during test:', error);
  }
}

testBasicAgentTask();
