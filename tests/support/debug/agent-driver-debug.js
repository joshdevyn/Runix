/**
 * Debug Script: AgentDriver Debugging
 * 
 * Minimal debug test for AgentDriver functionality
 */
const { AgentDriver } = require('../../../dist/src/drivers/ai/AgentDriver');

async function debugTest() {
  console.log('🔍 Starting debug test...');
  
  const agentDriver = new AgentDriver({
    outputDir: './temp/debug-test',
    maxIterations: 1,
    iterationDelay: 100,
    logLevel: 2
  });

  try {
    console.log('1. Initializing AgentDriver...');
    await agentDriver.initialize();
    console.log('✅ Initialization successful');

    console.log('2. Testing direct screenshot...');
    const screenshotResult = await agentDriver.execute('takeScreenshot', []);
    console.log('Screenshot result:', {
      success: screenshotResult.success,
      hasData: !!screenshotResult.data,
      hasError: !!screenshotResult.error,
      errorMessage: screenshotResult.error?.message
    });

    if (screenshotResult.success && screenshotResult.data?.base64) {
      console.log('3. Testing vision analysis...');
      try {
        const analysisResult = await agentDriver.execute('analyzeScreen', [screenshotResult.data.base64]);
        console.log('Analysis result:', {
          success: analysisResult.success,
          hasData: !!analysisResult.data,
          hasError: !!analysisResult.error,
          errorMessage: analysisResult.error?.message
        });
      } catch (err) {
        console.error('❌ Vision analysis error:', err.message);
        console.error('Stack:', err.stack);
      }
    }    console.log('4. Cleanup...');
    await agentDriver.shutdown();
    console.log('✅ Debug test completed');

  } catch (error) {
    console.error('❌ Debug test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

debugTest()
  .then(() => {
    console.log('🎉 Debug test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Debug test failed:', error);
    process.exit(1);
  });
