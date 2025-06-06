const { AIDriver } = require('./dist/ai/aiDriver');

async function testEnhancedAIDriver() {
  console.log('Testing Enhanced AI Driver v3.0.0...');
  
  try {
    // Test 1: Create driver instance
    const config = {
      providers: [
        {
          name: 'TestProvider',
          type: 'openai',
          apiKey: 'test-key',
          model: 'gpt-4o'
        }
      ],
      activeProvider: 'TestProvider'
    };
    
    console.log('Creating AIDriver instance...');
    const driver = new AIDriver();
    console.log('AIDriver created, initializing...');
    
    await driver.initialize(config);
    console.log('✓ Driver initialized successfully');
      // Test 2: Get driver info
    console.log('Testing getInfo...');
    const info = await driver.execute('getInfo', {});
    console.log('✓ Driver info result:', JSON.stringify(info, null, 2));
    
    // Test 3: Get available providers
    console.log('Testing getProviders...');
    const providers = await driver.execute('getProviders', {});
    console.log('✓ Available providers:', JSON.stringify(providers.data, null, 2));
    
    // Test 4: Get active provider
    console.log('Testing getActiveProvider...');
    const activeProvider = await driver.execute('getActiveProvider', {});
    console.log('✓ Active provider:', JSON.stringify(activeProvider.data, null, 2));
    
    // Test 5: Test callAI action (will use mock if no real API key)
    console.log('Testing callAI...');
    const aiResponse = await driver.execute('callAI', {
      messages: [{ role: 'user', content: 'Hello, test message' }]
    });
    console.log('✓ AI call response:', JSON.stringify(aiResponse.data, null, 2));
    
    console.log('\n🎉 All tests passed! Enhanced AI Driver is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Wrap in immediate async execution
(async () => {
  await testEnhancedAIDriver();
})().catch(console.error);
