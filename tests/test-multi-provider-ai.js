#!/usr/bin/env node

/**
 * Test script for the enhanced multi-provider AI Driver
 * This tests the new functionality including provider management and real AI calls
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Testing Multi-Provider AI Driver...\n');

// Test configurations
const testConfigs = [
  {
    name: 'Basic Driver Info',
    feature: `
Feature: AI Driver Multi-Provider Test
  Scenario: Get driver information
    When I call AI driver with action "getInfo"
    Then I should get driver name "Enhanced AI Driver"
    And I should get driver version "3.0.0"
`
  },
  {
    name: 'Provider Management',
    feature: `
Feature: AI Driver Provider Management
  Scenario: List available providers
    When I call AI driver with action "getProviders"
    Then I should get a list of available providers
    
  Scenario: Get active provider
    When I call AI driver with action "getActiveProvider"
    Then I should get the current active provider
`
  },
  {
    name: 'AI Enhancement without Config',
    feature: `
Feature: AI Driver Enhancement Test
  Scenario: Test AI enhancement with default settings
    When I call AI driver with action "enhanceWithAI"
    And I provide data "This is a test scenario for AI enhancement"
    Then I should get enhanced analysis
`
  }
];

// Configuration for providers (using mock/local only to avoid API costs in testing)
const driverConfig = {
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 1000,
  providers: [
    {
      name: 'ollama',
      type: 'local',
      config: {
        baseUrl: 'http://localhost:11434',
        model: 'llama2'
      }
    }
  ],
  activeProvider: 'ollama'
};

async function runTest(testConfig) {
  return new Promise((resolve) => {
    console.log(`📋 Testing: ${testConfig.name}`);
    
    // Create temporary feature file
    const featureFile = path.join(__dirname, 'temp-test.feature');
    fs.writeFileSync(featureFile, testConfig.feature);
    
    // Create temporary config file
    const configFile = path.join(__dirname, 'temp-driver-config.json');
    fs.writeFileSync(configFile, JSON.stringify(driverConfig, null, 2));
    
    const runix = spawn('node', [
      path.join(__dirname, 'dist', 'index.js'),
      'run',
      featureFile,
      '--driver-config', configFile
    ], {
      stdio: 'pipe',
      cwd: __dirname
    });
    
    let output = '';
    let error = '';
    
    runix.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    runix.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    runix.on('close', (code) => {
      // Clean up temp files
      try {
        fs.unlinkSync(featureFile);
        fs.unlinkSync(configFile);
      } catch (e) {
        // Ignore cleanup errors
      }
      
      const success = code === 0;
      console.log(`${success ? '✅' : '❌'} ${testConfig.name}: ${success ? 'PASSED' : 'FAILED'}`);
      
      if (!success || output.includes('error') || error) {
        console.log('📄 Output:', output.substring(0, 500) + (output.length > 500 ? '...' : ''));
        if (error) {
          console.log('🚨 Error:', error.substring(0, 300) + (error.length > 300 ? '...' : ''));
        }
      } else {
        console.log('📄 Summary:', output.split('\n').slice(-5).join('\n'));
      }
      
      console.log('');
      resolve({ name: testConfig.name, success, output, error, code });
    });
    
    // Set timeout
    setTimeout(() => {
      runix.kill();
      console.log(`⏰ ${testConfig.name}: TIMEOUT`);
      resolve({ name: testConfig.name, success: false, output, error, code: -1 });
    }, 30000);
  });
}

async function main() {
  const results = [];
  
  for (const testConfig of testConfigs) {
    const result = await runTest(testConfig);
    results.push(result);
  }
  
  console.log('📊 Test Summary:');
  console.log('================');
  
  const passed = results.filter(r => r.success).length;
  const total = results.length;
  
  results.forEach(result => {
    console.log(`${result.success ? '✅' : '❌'} ${result.name}`);
  });
  
  console.log(`\n🎯 Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! Multi-provider AI Driver is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.');
  }
  
  // Additional manual test suggestions
  console.log('\n📝 Manual Testing Suggestions:');
  console.log('================================');
  console.log('1. Test with real API keys by updating the driver config');
  console.log('2. Test provider switching: switchProvider action');
  console.log('3. Test with different models and temperatures');
  console.log('4. Test vision capabilities with image data');
  console.log('5. Test streaming responses');
  
  process.exit(passed === total ? 0 : 1);
}

main().catch(console.error);
