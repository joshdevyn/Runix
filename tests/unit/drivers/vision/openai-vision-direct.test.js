// Direct test of OpenAI GPT-4o vision capabilities
const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');

// Load environment variables from .env file
const envPath = path.join(__dirname, '..', '..', '.env');

async function loadEnvVars() {
  try {
    const envContent = await fs.readFile(envPath, 'utf8');
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=');
          process.env[key] = value;
        }
      }
    }
    console.log('✓ Environment variables loaded from .env file');
  } catch (err) {
    console.error('✗ Could not load .env file:', err.message);
    process.exit(1);
  }
}

async function testOpenAIVision() {
  console.log('=== Testing OpenAI GPT-4o Vision Directly ===\n');
  
  // Load environment variables
  await loadEnvVars();
  
  // Check if API key is available
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('✗ OPENAI_API_KEY not found in environment variables');
    process.exit(1);
  }
  
  console.log('✓ OpenAI API key found');
  console.log(`   Key starts with: ${apiKey.substring(0, 10)}...`);
  
  // Initialize OpenAI client
  const openai = new OpenAI({
    apiKey: apiKey
  });
  console.log('✓ OpenAI client initialized');
  
  // Load test image
  const imagePath = path.join(__dirname, '..', '..', 'tests', 'Screenshot 2025-06-07 071247.png');
  let base64Image;
  
  try {
    const imageBuffer = await fs.readFile(imagePath);
    base64Image = imageBuffer.toString('base64');
    console.log(`✓ Test image loaded: ${imagePath}`);
    console.log(`   Image size: ${imageBuffer.length} bytes`);
    console.log(`   Base64 length: ${base64Image.length} characters`);
  } catch (err) {
    console.error('✗ Failed to load test image:', err.message);
    process.exit(1);
  }
  
  // Test 1: Basic GPT-4o vision with simple description
  console.log('\n--- Test 1: Basic Image Description with GPT-4o ---');
  try {
    const response1 = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Please describe what you see in this image in detail.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 1000,
      temperature: 0.1
    });
    
    console.log('✓ GPT-4o vision call successful!');
    console.log(`   Model used: ${response1.model}`);
    console.log(`   Usage: ${JSON.stringify(response1.usage)}`);
    console.log(`   Response: ${response1.choices[0].message.content}`);
    
  } catch (err) {
    console.error('✗ GPT-4o vision call failed:', err.message);
    if (err.response) {
      console.error('   API Response:', err.response.data);
    }
    return;
  }
  
  // Test 2: OCR-specific task
  console.log('\n--- Test 2: OCR Text Extraction ---');
  try {
    const response2 = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract all text visible in this image. Return the text in JSON format with the structure: {"fullText": "...", "textBlocks": [{"text": "...", "bounds": {"x": 0, "y": 0, "width": 100, "height": 20}}]}'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 1500,
      temperature: 0.1
    });
    
    console.log('✓ OCR extraction successful!');
    console.log(`   Model used: ${response2.model}`);
    console.log(`   Usage: ${JSON.stringify(response2.usage)}`);
    
    // Try to parse the JSON response
    try {
      const ocrResult = JSON.parse(response2.choices[0].message.content);
      console.log(`   Extracted text: "${ocrResult.fullText}"`);
      console.log(`   Text blocks found: ${ocrResult.textBlocks?.length || 0}`);
    } catch (parseErr) {
      console.log(`   Raw response: ${response2.choices[0].message.content}`);
    }
    
  } catch (err) {
    console.error('✗ OCR extraction failed:', err.message);
    return;
  }
  
  // Test 3: UI Element Detection
  console.log('\n--- Test 3: UI Element Detection ---');
  try {
    const response3 = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this screenshot and identify all interactive UI elements (buttons, input fields, links, etc.). Return the result in JSON format: {"elements": [{"type": "button", "label": "...", "bounds": {"x": 0, "y": 0, "width": 100, "height": 30}}], "totalElements": 5}'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 2000,
      temperature: 0.1
    });
    
    console.log('✓ UI element detection successful!');
    console.log(`   Model used: ${response3.model}`);
    console.log(`   Usage: ${JSON.stringify(response3.usage)}`);
    
    // Try to parse the JSON response
    try {
      const uiResult = JSON.parse(response3.choices[0].message.content);
      console.log(`   UI elements found: ${uiResult.totalElements || uiResult.elements?.length || 0}`);
      if (uiResult.elements) {
        uiResult.elements.slice(0, 3).forEach((el, i) => {
          console.log(`   Element ${i + 1}: ${el.type} - "${el.label}"`);
        });
      }
    } catch (parseErr) {
      console.log(`   Raw response: ${response3.choices[0].message.content}`);
    }
    
  } catch (err) {
    console.error('✗ UI element detection failed:', err.message);
    return;
  }
  
  console.log('\n=== All OpenAI GPT-4o Vision Tests Completed Successfully! ===');
  console.log('✓ The Vision Driver should now work with these capabilities.');
}

// Run the test
testOpenAIVision().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
