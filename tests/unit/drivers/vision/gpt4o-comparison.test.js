// GPT-4o Vision vs Tesseract OCR Comparison Test
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Connect to the vision driver
const ws = new WebSocket('ws://localhost:9003');

let requestId = 1;

function sendRequest(method, params = {}) {
  const request = {
    id: requestId++,
    type: 'request',
    method: method,
    params: params
  };
  
  console.log(`\n🚀 Testing: ${method}`);
  ws.send(JSON.stringify(request));
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Request timeout after 60 seconds for ${method}`));
    }, 60000); // 60 second timeout for OpenAI API calls
    
    const listener = (data) => {
      const response = JSON.parse(data.toString());
      if (response.id === request.id) {
        clearTimeout(timeout);
        ws.removeListener('message', listener);
        resolve(response);
      }
    };
    ws.on('message', listener);
  });
}

async function runVisionComparison() {
  console.log('🥊 GPT-4o Vision vs Tesseract OCR Comparison\n');
  console.log('📸 Using: tests\\Screenshot 2025-06-07 071247.png\n');
  
  // Read the real screenshot
  const screenshotPath = path.join('c:', '_Runix', 'tests', 'Screenshot 2025-06-07 071247.png');
  
  if (!fs.existsSync(screenshotPath)) {
    console.error('❌ Screenshot not found:', screenshotPath);
    process.exit(1);
  }
  
  const imageBuffer = fs.readFileSync(screenshotPath);
  const base64Image = imageBuffer.toString('base64');
  
  console.log(`📊 Image info:`);
  console.log(`   - Size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
  console.log(`   - Base64 length: ${base64Image.length} characters`);
  
  const results = {
    tesseract: { passed: 0, failed: 0, tests: [] },
    openai: { passed: 0, failed: 0, tests: [] }
  };
  
  async function test(provider, name, testFn) {
    try {
      console.log(`\n📋 [${provider.toUpperCase()}] Test: ${name}`);
      const startTime = Date.now();
      const result = await testFn();
      const duration = Date.now() - startTime;
      console.log(`✅ [${provider.toUpperCase()}] ${name}: PASSED (${duration}ms)`);
      results[provider].passed++;
      results[provider].tests.push({ name, status: 'PASSED', duration, result });
      return result;
    } catch (error) {
      console.log(`❌ [${provider.toUpperCase()}] ${name}: FAILED - ${error.message}`);
      results[provider].failed++;
      results[provider].tests.push({ name, status: 'FAILED', error: error.message });
      return null;
    }
  }
  
  try {
    // Initialize with OpenAI enabled
    console.log('\n🔧 Initializing Vision Driver with OpenAI Support...');
    await sendRequest('initialize', { 
      config: {
        ocrLanguage: 'eng',
        confidenceThreshold: 0.6,
        providers: { primary: 'tesseract', fallback: 'openai' },
        openai: { 
          enabled: true,
          model: 'gpt-4o',
          maxTokens: 2000
        }
      }
    });
    
    console.log('\n=== TESSERACT OCR TESTS ===');
    
    const tesseractResult = await test('tesseract', 'OCR Text Extraction', async () => {
      const result = await sendRequest('execute', { 
        action: 'extractText', 
        args: [base64Image],
        provider: 'tesseract' // Force Tesseract
      });
      
      if (!result.result?.data) {
        throw new Error('OCR failed');
      }
      
      const data = result.result.data;
      console.log(`   🔍 Tesseract Results:`);
      console.log(`   - Method: ${data.method}`);
      console.log(`   - Text blocks: ${data.textBlocks?.length || 0}`);
      console.log(`   - Success: ${data.success}`);
      
      if (data.textBlocks && data.textBlocks.length > 0) {
        console.log(`   📝 Top 5 text blocks:`);
        data.textBlocks.slice(0, 5).forEach((block, i) => {
          const text = block.text?.trim();
          if (text && text.length > 0) {
            console.log(`      ${i + 1}. "${text}" (conf: ${(block.confidence || 0).toFixed(2)})`);
          }
        });
      }
      
      return data;
    });
    
    await test('tesseract', 'UI Element Detection', async () => {
      const result = await sendRequest('execute', { 
        action: 'detectUI', 
        args: [base64Image],
        provider: 'tesseract'
      });
      
      const data = result.result.data;
      console.log(`   🎯 Tesseract UI Detection:`);
      console.log(`   - Total elements: ${data.totalElements || 0}`);
      console.log(`   - Element types: ${JSON.stringify(data.elementTypes || {})}`);
      
      return data;
    });
    
    console.log('\n=== GPT-4O VISION TESTS ===');
    
    const openaiResult = await test('openai', 'Vision Analysis', async () => {
      const result = await sendRequest('execute', { 
        action: 'extractText', 
        args: [base64Image],
        provider: 'openai' // Force OpenAI
      });
      
      if (!result.result?.data) {
        throw new Error('OpenAI Vision failed');
      }
      
      const data = result.result.data;
      console.log(`   🔍 GPT-4o Vision Results:`);
      console.log(`   - Method: ${data.method}`);
      console.log(`   - Text blocks: ${data.textBlocks?.length || 0}`);
      console.log(`   - Success: ${data.success}`);
      
      if (data.textBlocks && data.textBlocks.length > 0) {
        console.log(`   📝 GPT-4o detected text:`);
        data.textBlocks.slice(0, 5).forEach((block, i) => {
          const text = block.text?.trim();
          if (text && text.length > 0) {
            console.log(`      ${i + 1}. "${text}" (conf: ${(block.confidence || 1.0).toFixed(2)})`);
          }
        });
      }
      
      if (data.description) {
        console.log(`   📋 Scene Description: ${data.description}`);
      }
      
      return data;
    });
    
    await test('openai', 'Advanced Scene Analysis', async () => {
      const result = await sendRequest('execute', { 
        action: 'analyzeScene', 
        args: [base64Image],
        provider: 'openai'
      });
      
      const data = result.result.data;
      const scene = data.scene;
      console.log(`   🎬 GPT-4o Scene Analysis:`);
      console.log(`   - Scene type: ${scene.type || 'unknown'}`);
      console.log(`   - UI Elements: ${scene.uiElements?.length || 0}`);
      console.log(`   - Text blocks: ${scene.textBlocks?.length || 0}`);
      
      if (scene.description) {
        console.log(`   📋 Detailed Description: ${scene.description}`);
      }
      
      if (scene.insights) {
        console.log(`   💡 AI Insights: ${scene.insights}`);
      }
      
      return data;
    });
    
    console.log('\n=== PERFORMANCE COMPARISON ===');
    
    // Compare results
    console.log('\n📊 Results Summary:');
    console.log(`🔍 Tesseract OCR:`);
    console.log(`   ✅ Passed: ${results.tesseract.passed}`);
    console.log(`   ❌ Failed: ${results.tesseract.failed}`);
    console.log(`   📈 Success Rate: ${Math.round((results.tesseract.passed / (results.tesseract.passed + results.tesseract.failed)) * 100)}%`);
    
    console.log(`\n🤖 GPT-4o Vision:`);
    console.log(`   ✅ Passed: ${results.openai.passed}`);
    console.log(`   ❌ Failed: ${results.openai.failed}`);
    console.log(`   📈 Success Rate: ${Math.round((results.openai.passed / (results.openai.passed + results.openai.failed)) * 100)}%`);
    
    console.log('\n⏱️  Performance Metrics:');
    results.tesseract.tests.forEach(test => {
      if (test.status === 'PASSED' && test.duration) {
        console.log(`   🔍 Tesseract ${test.name}: ${test.duration}ms`);
      }
    });
    
    results.openai.tests.forEach(test => {
      if (test.status === 'PASSED' && test.duration) {
        console.log(`   🤖 GPT-4o ${test.name}: ${test.duration}ms`);
      }
    });
    
    console.log('\n🏆 Comparison Analysis:');
    
    if (tesseractResult && openaiResult) {
      const tesseractTextCount = tesseractResult.textBlocks?.length || 0;
      const openaiTextCount = openaiResult.textBlocks?.length || 0;
      
      console.log(`📝 Text Detection:`);
      console.log(`   - Tesseract: ${tesseractTextCount} text blocks`);
      console.log(`   - GPT-4o: ${openaiTextCount} text blocks`);
      
      if (tesseractTextCount > openaiTextCount) {
        console.log(`   🏆 Winner: Tesseract (more detailed text extraction)`);
      } else if (openaiTextCount > tesseractTextCount) {
        console.log(`   🏆 Winner: GPT-4o (better text understanding)`);
      } else {
        console.log(`   🤝 Tie: Similar text detection capabilities`);
      }
    }
    
    console.log('\n💡 Key Insights:');
    console.log('   🔍 Tesseract: Fast, detailed OCR with character-level precision');
    console.log('   🤖 GPT-4o: Contextual understanding, semantic analysis, scene description');
    console.log('   🎯 Best Use: Combine both for comprehensive vision analysis!');
    
    const totalPassed = results.tesseract.passed + results.openai.passed;
    const totalTests = (results.tesseract.passed + results.tesseract.failed) + (results.openai.passed + results.openai.failed);
    
    if (totalPassed === totalTests) {
      console.log('\n🌟 Both vision providers working perfectly! Enhanced vision driver ready for production! 🚀');
    }
    
  } catch (error) {
    console.error('❌ Vision comparison failed:', error.message);
  } finally {
    ws.close();
    process.exit(0);
  }
}

ws.on('open', () => {
  console.log('🔗 Connected to Vision Driver');
  runVisionComparison();
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  process.exit(1);
});
