const path = require('path');
const fs = require('fs').promises;
const {
  takeScreenshot,
  analyzeScreen,
  initializeLLMProvider,
  setConfigForTesting
} = require('../../drivers/ai-driver/index.js'); // Adjust path as necessary

// Configuration for the ai-driver, including where other drivers might be running
// This would need to be adjusted based on your actual test environment setup
const TEST_DRIVER_CONFIG = {
  // Ensure paths to other drivers are resolvable or they are running
  knownDrivers: [
    {
      id: 'system-driver',
      name: 'system-driver',
      port: process.env.TEST_SYSTEM_DRIVER_PORT || 9001, // Example port
      capabilities: ['takeScreenshot']
    },
    {
      id: 'vision-driver',
      name: 'vision-driver',
      port: process.env.TEST_VISION_DRIVER_PORT || 9002, // Example port
      capabilities: ['analyzeScene']
    }
  ],
  // LLM provider config for tests (e.g., use a specific test key or local mock)
  llmProvider: process.env.TEST_LLM_PROVIDER || 'openai', // or 'local' if you have a local LLM for tests
  openaiApiKey: process.env.TEST_OPENAI_API_KEY || 'sk-test-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  localEndpoint: process.env.TEST_LOCAL_LLM_ENDPOINT || 'http://localhost:11434',
  // other necessary config for the ai-driver to function
  outputDir: path.join(__dirname, 'ai-driver-test-artifacts') // Store test artifacts separately
};

// Helper to ensure the artifact directory exists
async function ensureArtifactsDir() {
  try {
    await fs.mkdir(TEST_DRIVER_CONFIG.outputDir, { recursive: true });
  } catch (error) {
    console.error('Failed to create test artifact directory:', error);
  }
}

describe('AI Driver Integration Tests', () => {
  beforeAll(async () => {
    // Apply the test configuration to the ai-driver
    setConfigForTesting(TEST_DRIVER_CONFIG);
    // Initialize LLM provider based on the test config (if not done by setConfigForTesting)
    // initializeLLMProvider(); 
    // Ensure artifact directory exists
    await ensureArtifactsDir();
  });

  test('should successfully take a screenshot and analyze it', async () => {
    // This test assumes that system-driver and vision-driver are accessible
    // and operational as configured in TEST_DRIVER_CONFIG.

    const screenshotFileName = `test-screenshot-${Date.now()}.png`;
    const screenshotFilePath = path.join(TEST_DRIVER_CONFIG.outputDir, screenshotFileName);

    // 1. Take Screenshot
    let screenshotResult;
    try {
      screenshotResult = await takeScreenshot(screenshotFilePath);
    } catch (error) {
      console.error('takeScreenshot call failed during test:', error);
      screenshotResult = { success: false, error: { message: error.message } };
    }

    console.log('Screenshot Result:', JSON.stringify(screenshotResult, null, 2));
    expect(screenshotResult).toBeDefined();
    expect(screenshotResult.success).toBe(true);
    expect(screenshotResult.data).toBeDefined();
    // In a real scenario, system-driver would save the file to screenshotFilePath
    // For this test, we primarily care about the success and data object.
    // If it returns base64, that's also good.
    expect(screenshotResult.data.filePath || screenshotResult.data.base64 || screenshotResult.data.screenshot).toBeDefined();

    // 2. Analyze Screen
    // The screenshot data to pass to analyzeScreen might be the file path or base64 content
    // depending on what takeScreenshot and system-driver provide.
    // Let's assume takeScreenshot returns a structure like { success: true, data: { filePath: '...' } } or { data: { base64: '...'}}
    const screenshotDataForAnalysis = screenshotResult.data.base64 || screenshotResult.data.screenshot || screenshotResult.data.filePath;
    expect(screenshotDataForAnalysis).toBeDefined();

    let analysisResult;
    try {
      analysisResult = await analyzeScreen(screenshotDataForAnalysis);
    } catch (error) {
      console.error('analyzeScreen call failed during test:', error);
      analysisResult = { success: false, error: { message: error.message } };
    }
    
    console.log('Analysis Result:', JSON.stringify(analysisResult, null, 2));
    expect(analysisResult).toBeDefined();
    expect(analysisResult.success).toBe(true);
    expect(analysisResult.data).toBeDefined();
    expect(analysisResult.data.scene || analysisResult.data.analysisTimestamp).toBeDefined(); // Check for some expected analysis data

    // If AI enhancement is expected and an LLM is configured for tests:
    // expect(analysisResult.data.aiInsights).toBeDefined();
  }, 60000); // Increased timeout for integration tests involving multiple services

  // Add more integration tests here, e.g., for planTask, handleAskMode, etc.
});
