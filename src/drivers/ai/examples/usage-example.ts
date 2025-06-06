// Example usage of AIDriver with multiple providers
import { AIDriver } from '../AIDriver';
import { exampleMultiProviderConfig, simpleOpenAIConfig, localOnlyConfig } from './multi-provider-config.example';

async function demonstrateMultiProviderUsage() {
  console.log('🤖 AIDriver Multi-Provider Example');
  
  // Initialize with multiple providers
  const aiDriver = new AIDriver(exampleMultiProviderConfig);
  await aiDriver.initialize();
  
  console.log('Available providers:', aiDriver.getAvailableProviders());
  console.log('Active provider:', aiDriver.getActiveProvider());
  
  // Test basic AI functionality
  const askResult = await aiDriver.execute('ask', ['What can you see on the screen?']);
  console.log('Ask result:', askResult);
  
  // Switch to a different provider
  const switchResult = await aiDriver.execute('switchProvider', ['anthropic-claude']);
  if (switchResult.success) {
    console.log('Switched to Anthropic Claude');
    
    // Test with different provider
    const askResult2 = await aiDriver.execute('ask', ['Analyze the current interface']);
    console.log('Ask result with Claude:', askResult2);
  }
  
  // Add a new provider at runtime
  const addResult = await aiDriver.execute('addProvider', [
    'runtime-ollama',
    {
      name: 'runtime-ollama',
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'mistral'
    }
  ]);
  console.log('Added provider result:', addResult);
  
  // Test agent mode with current provider
  const agentResult = await aiDriver.execute('agent', ['Take a screenshot and analyze it']);
  console.log('Agent mode result:', agentResult);
  
  await aiDriver.shutdown();
}

async function demonstrateSimpleUsage() {
  console.log('🤖 AIDriver Simple OpenAI Example');
  
  const aiDriver = new AIDriver(simpleOpenAIConfig);
  await aiDriver.initialize();
  
  // Test basic functionality
  const result = await aiDriver.execute('ask', ['What is visible on screen?']);
  console.log('Result:', result);
  
  await aiDriver.shutdown();
}

async function demonstrateLocalUsage() {
  console.log('🤖 AIDriver Local Ollama Example');
  
  const aiDriver = new AIDriver(localOnlyConfig);
  await aiDriver.initialize();
  
  // Test with local model
  const result = await aiDriver.execute('ask', ['Describe the current screen']);
  console.log('Local AI result:', result);
  
  await aiDriver.shutdown();
}

// Run examples
if (require.main === module) {
  (async () => {
    try {
      await demonstrateMultiProviderUsage();
      console.log('\n' + '='.repeat(50) + '\n');
      
      await demonstrateSimpleUsage();
      console.log('\n' + '='.repeat(50) + '\n');
      
      await demonstrateLocalUsage();
    } catch (error) {
      console.error('Example failed:', error);
    }
  })();
}

export {
  demonstrateMultiProviderUsage,
  demonstrateSimpleUsage,
  demonstrateLocalUsage
};
