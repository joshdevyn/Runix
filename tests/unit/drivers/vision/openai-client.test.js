const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

async function testOpenAIClient() {
  console.log('🔬 Testing OpenAI Client Direct Connection\n');
  
  const ws = new WebSocket('ws://localhost:3007');
  
  await new Promise((resolve) => {
    ws.once('open', resolve);
  });
  
  console.log('🔗 Connected to Vision Driver');
  
  // Helper function to send requests
  async function sendRequest(request) {
    return new Promise((resolve) => {
      const listener = (data) => {
        const response = JSON.parse(data);
        if (response.id === request.id) {
          ws.removeListener('message', listener);
          resolve(response);
        }
      };
      ws.on('message', listener);
      ws.send(JSON.stringify(request));
    });
  }

  try {
    // Initialize with OpenAI support
    console.log('🚀 Initializing with OpenAI support...');
    const initResult = await sendRequest({
      id: 'init-test',
      method: 'initialize',
      params: {
        config: {
          providers: { primary: 'openai' },
          openai: { enabled: true }
        }
      }
    });
    
    console.log('📊 Init result:', JSON.stringify(initResult, null, 2));
    
    // Read test image
    const screenshotPath = path.join('c:', '_Runix', 'tests', 'Screenshot 2025-06-07 071247.png');
    const imageBuffer = fs.readFileSync(screenshotPath);
    const base64Image = imageBuffer.toString('base64');
    
    console.log('\n🔍 Testing OpenAI OCR with explicit provider...');
    
    // Test with explicit OpenAI provider
    const ocrResult = await sendRequest({
      id: 'ocr-test',
      method: 'execute',
      params: {
        action: 'extractText',
        args: [base64Image],
        provider: 'openai'  // Explicitly request OpenAI
      }
    });
    
    console.log('📋 OCR Result:');
    console.log(`   - Success: ${ocrResult.result?.success}`);
    console.log(`   - Method: ${ocrResult.result?.data?.method || 'unknown'}`);
    console.log(`   - Model: ${ocrResult.result?.data?.model || 'unknown'}`);
    console.log(`   - Text blocks: ${ocrResult.result?.data?.textBlocks?.length || 0}`);
    console.log(`   - Full response:`, JSON.stringify(ocrResult, null, 2));
    
    if (ocrResult.result?.data?.method?.includes('openai')) {
      console.log('✅ OpenAI Vision API is working correctly!');
    } else {
      console.log('❌ OpenAI Vision API not being used, falling back to:', ocrResult.result?.data?.method);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    ws.close();
  }
}

testOpenAIClient().catch(console.error);
