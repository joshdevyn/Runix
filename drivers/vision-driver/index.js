const WebSocket = require('ws');
const http = require('http');
const fs = require('fs').promises;

// Get port from environment variable (assigned by engine) or use default for standalone
const port = parseInt(process.env.RUNIX_DRIVER_PORT || '9003', 10);
const manifest = require('./driver.json');

// Create structured logger for driver processes
function createDriverLogger() {
  const getCallerInfo = () => {
    const stack = new Error().stack;
    if (!stack) return 'unknown';
    
    const lines = stack.split('\n');
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/at\s+(\w+)\s*\(/);
      if (match) return match[1];
    }
    return 'unknown';
  };

  return {
    log: (message, data = {}) => {
      const caller = getCallerInfo();
      const timestamp = new Date().toISOString();
      const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      console.log(`${timestamp} [INFO] [index.js::VisionDriver::${caller}] ${message}${dataStr}`);
    },
    error: (message, data = {}) => {
      const caller = getCallerInfo();
      const timestamp = new Date().toISOString();
      const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      console.error(`${timestamp} [ERROR] [index.js::VisionDriver::${caller}] ${message}${dataStr}`);
    }
  };
}

const logger = createDriverLogger();

logger.log(`Vision Driver starting on port ${port}`);

// Vision processing configuration
let config = {
  ocrLanguage: 'eng',
  confidenceThreshold: 0.6,
  tempDir: './temp',
  providers: {
    primary: 'tesseract',
    fallback: 'openai'
  },
  openai: {
    enabled: true,
    model: 'gpt-4o',
    maxTokens: 2000,
    temperature: 0.1
  }
};

// Try to load Tesseract.js for OCR
let Tesseract = null;
try {
  Tesseract = require('tesseract.js');
  logger.log('Tesseract.js loaded successfully');
} catch (err) {
  logger.log('Tesseract.js not available, using mock OCR');
}

// Try to load OpenAI for vision analysis
let OpenAI = null;
try {
  OpenAI = require('openai');
  logger.log('OpenAI library loaded successfully');
} catch (err) {
  logger.log('OpenAI library not available, using fallback');
}

// Load environment variables
try {
  require('dotenv').config();
} catch (err) {
  logger.log('dotenv not available, using system environment');
}

// Initialize OpenAI client if available
let openaiClient = null;
if (OpenAI && process.env.OPENAI_API_KEY) {
  openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  logger.log('OpenAI client initialized');
} else {
  logger.log('OpenAI not configured, using Tesseract only');
}

// Create HTTP server and WebSocket server
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Vision Driver Running\n');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', function connection(ws) {
  logger.log('Client connected');
  
  ws.on('message', function incoming(message) {
    logger.log(`Received: ${message.length} bytes`);
    handleMessage(ws, message);
  });
  
  ws.on('close', function() {
    logger.log('Client disconnected');
  });
});

server.listen(port, '127.0.0.1', () => {
  logger.log(`Vision driver listening on 127.0.0.1:${port}`);
  logger.log(`WebSocket server ready for connections`);
});

// Handle incoming messages
function handleMessage(ws, message) {
  try {
    const request = JSON.parse(message);
    handleRequest(request).then(response => {
      ws.send(JSON.stringify(response));
    }).catch(err => {
      logger.error('Error handling request:', err);
      ws.send(JSON.stringify({
        id: request.id || '0',
        type: 'response',
        error: {
          code: 500,
          message: err.message || 'Internal server error'
        }
      }));
    });
  } catch (err) {
    logger.error('Error parsing message:', err);
  }
}

// Define JSON-RPC helpers
function sendErrorResponse(id, code, message) {
  return { id, type: 'response', error: { code, message } };
}
function sendSuccessResponse(id, data) {
  return { id, type: 'response', result: { success: true, data } };
}

// Handle JSON-RPC requests
async function handleRequest(request) {
  if (!request.id || !request.method) {
    return sendErrorResponse(request.id, 400, 'Invalid request');
  }

  try {
    switch (request.method) {
      case 'capabilities':
        return {
          id: request.id,
          type: 'response',
          result: {
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            supportedActions: manifest.actions,
            supportedFeatures: ["introspection"]
          }
        };

      case 'initialize':
        return handleInitialize(request.id, request.params?.config || {});

      case 'introspect':
        return handleIntrospect(request.id, request.params?.type || 'steps');

      case 'execute':
        return handleExecute(request.id, request.params?.action, request.params?.args || []);

      case 'health':
        return {
          id: request.id,
          type: 'response',
          result: { status: 'ok' }
        };

      case 'shutdown':
        return sendSuccessResponse(request.id, { shutdown: true });

      default:
        return sendErrorResponse(request.id, 404, `Unknown method: ${request.method}`);
    }
  }
  catch (err) {
    return sendErrorResponse(request.id, 500, err.message);
  }
}

// Handle initialize requests
async function handleInitialize(id, driverConfig) {
  try {
    config = { ...config, ...driverConfig };
    logger.log('Driver initialized with config', config);
    
    // Ensure temp directory exists
    try {
      await fs.mkdir(config.tempDir, { recursive: true });
    } catch (err) {
      // Directory might already exist
    }
    
    return sendSuccessResponse(id, { initialized: true });
  } catch (err) {
    logger.error('Failed to initialize driver:', err);
    return sendErrorResponse(id, 500, `Initialization failed: ${err.message}`);
  }
}

// Base64 to Buffer helper
function base64ToBuffer(base64String) {
  // Remove data URL prefix if present
  const base64Data = base64String.replace(/^data:image\/[a-z]+;base64,/, '');
  return Buffer.from(base64Data, 'base64');
}

// Real OCR using Tesseract.js
async function performOCR(imageBuffer) {
  if (!Tesseract) {
    throw new Error('Tesseract.js not available. Install with: npm install tesseract.js');
  }

  logger.log('Starting OCR processing...');
  const worker = await Tesseract.createWorker();
  
  try {
    await worker.loadLanguage(config.ocrLanguage);
    await worker.initialize(config.ocrLanguage);
    
    const { data } = await worker.recognize(imageBuffer);
    
    // Extract text blocks with bounding boxes
    const textBlocks = data.words
      .filter(word => word.confidence > config.confidenceThreshold * 100)
      .map(word => ({
        text: word.text,
        confidence: word.confidence / 100,
        bounds: {
          x: word.bbox.x0,
          y: word.bbox.y0,
          width: word.bbox.x1 - word.bbox.x0,
          height: word.bbox.y1 - word.bbox.y0
        }
      }));

    logger.log(`OCR completed: found ${textBlocks.length} text blocks`);
    
    return {
      fullText: data.text,
      textBlocks: textBlocks,
      confidence: data.confidence / 100
    };
  } finally {
    await worker.terminate();
  }
}

// Mock OCR fallback
function mockOCR(imageBuffer) {
  logger.log('Using mock OCR (Tesseract.js not available)');
  
  // Simulate some detected text elements
  return {
    fullText: "Sample detected text\nButton Submit\nField Email\nField Password",
    textBlocks: [
      {
        text: "Submit",
        confidence: 0.95,
        bounds: { x: 150, y: 200, width: 80, height: 30 }
      },
      {
        text: "Email",
        confidence: 0.90,
        bounds: { x: 50, y: 100, width: 60, height: 20 }
      },
      {
        text: "Password",
        confidence: 0.88,
        bounds: { x: 50, y: 150, width: 80, height: 20 }
      }
    ],
    confidence: 0.91,
    method: 'mock-ocr'
  };
}

// OpenAI Vision analysis
async function analyzeWithOpenAI(base64Image, analysisType = 'general') {
  if (!openaiClient) {
    throw new Error('OpenAI not configured');
  }

  logger.log(`Starting OpenAI vision analysis: ${analysisType}`);

  let prompt;
  let expectedStructure;

  switch (analysisType) {
    case 'ocr':
      prompt = 'Extract all text visible in this image. Return the result in JSON format with the structure: {"fullText": "all text concatenated", "textBlocks": [{"text": "individual text", "bounds": {"x": 0, "y": 0, "width": 100, "height": 20}, "confidence": 0.95}]}';
      expectedStructure = { fullText: '', textBlocks: [] };
      break;
    
    case 'ui':
      prompt = 'Analyze this screenshot and identify all interactive UI elements (buttons, input fields, links, etc.). Also extract any visible text. Return the result in JSON format: {"elements": [{"type": "button", "label": "...", "bounds": {"x": 0, "y": 0, "width": 100, "height": 30}, "confidence": 0.95}], "textBlocks": [{"text": "...", "bounds": {"x": 0, "y": 0, "width": 100, "height": 20}, "confidence": 0.95}], "totalElements": 5}';
      expectedStructure = { elements: [], textBlocks: [], totalElements: 0 };
      break;

    case 'computer_use':
      prompt = 'Analyze this screenshot for computer automation. Identify all interactive elements and provide detailed information for automated actions. Return JSON: {"screen_analysis": "detailed description", "interactive_elements": [{"type": "button", "label": "...", "bounds": {"x": 0, "y": 0, "width": 100, "height": 30}, "action_hint": "click"}], "text_elements": [{"text": "...", "bounds": {"x": 0, "y": 0, "width": 100, "height": 20}}], "possible_actions": ["click button X", "type in field Y"]}';
      expectedStructure = { screen_analysis: '', interactive_elements: [], text_elements: [], possible_actions: [] };
      break;

    case 'general':
    default:
      prompt = 'Analyze this image and describe what you see. Identify any objects, text, or UI elements. Return JSON: {"description": "detailed description", "identified_objects": [{"name": "object", "bounds": {"x": 0, "y": 0, "width": 100, "height": 30}, "confidence": 0.95}], "identified_text": [{"text": "...", "bounds": {"x": 0, "y": 0, "width": 100, "height": 20}}]}';
      expectedStructure = { description: '', identified_objects: [], identified_text: [] };
      break;
  }

  try {
    const response = await openaiClient.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
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
      max_tokens: config.openai.maxTokens,
      temperature: config.openai.temperature
    });

    const content = response.choices[0]?.message?.content || '{}';
    
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      // Try to extract JSON from the response if parsing fails
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        logger.error('Failed to parse OpenAI response as JSON');
        result = expectedStructure;
        result.error = 'Failed to parse response';
        result.rawResponse = content;
      }
    }

    // Add metadata
    result.method = 'openai';
    result.model = response.model;
    result.usage = response.usage;

    logger.log(`OpenAI vision analysis completed: ${analysisType}`);
    return result;

  } catch (error) {
    logger.error('OpenAI vision analysis failed:', error);
    throw error;
  }
}

// Determine which provider to use for analysis
async function analyzeScene(base64Image, analysisType = 'general', preferredProvider = null) {
  const provider = preferredProvider || config.providers.primary;
  
  // Handle special computer use action
  if (analysisType === 'computer_use' || provider === 'openai') {
    if (openaiClient) {
      return await analyzeWithOpenAI(base64Image, analysisType);
    } else {
      throw new Error('OpenAI provider requested but not available');
    }
  }

  // For OCR, try Tesseract first, fallback to OpenAI
  if (analysisType === 'ocr') {
    try {
      if (Tesseract && provider === 'tesseract') {
        const buffer = base64ToBuffer(base64Image);
        const result = await performOCR(buffer);
        result.method = 'tesseract';
        return result;
      } else {
        throw new Error('Tesseract not available');
      }
    } catch (err) {
      logger.log('Tesseract OCR failed, trying OpenAI fallback');
      if (openaiClient) {
        return await analyzeWithOpenAI(base64Image, 'ocr');
      } else {
        logger.log('OpenAI not available, using mock OCR');
        const buffer = base64ToBuffer(base64Image);
        return mockOCR(buffer);
      }
    }
  }

  // For UI detection, prefer OpenAI if available
  if (analysisType === 'ui') {
    if (openaiClient && (provider === 'openai' || config.providers.primary === 'openai')) {
      return await analyzeWithOpenAI(base64Image, 'ui');
    } else {
      // Fallback to local UI detection with OCR
      const buffer = base64ToBuffer(base64Image);
      let textData;
      try {
        textData = await performOCR(buffer);
      } catch (err) {
        textData = mockOCR(buffer);
      }
      
      const elements = detectUI(buffer, textData.textBlocks);
      return {
        elements: elements,
        textBlocks: textData.textBlocks,
        totalElements: elements.length,
        method: 'local-ui-detection'
      };
    }
  }

  // For general analysis, prefer OpenAI
  if (openaiClient) {
    return await analyzeWithOpenAI(base64Image, analysisType);
  } else {
    // Basic fallback analysis
    const buffer = base64ToBuffer(base64Image);
    let textData;
    try {
      textData = await performOCR(buffer);
    } catch (err) {
      textData = mockOCR(buffer);
    }
    
    const elements = detectUI(buffer, textData.textBlocks);
    return {
      description: `Scene contains ${elements.length} UI elements and ${textData.textBlocks.length} text blocks`,
      identified_objects: elements.map(el => ({
        name: el.type,
        bounds: el.bounds,
        confidence: el.confidence
      })),
      identified_text: textData.textBlocks,
      method: 'local-analysis'
    };
  }
}

// Mock UI detection
function detectUI(imageBuffer, textBlocks = []) {
  logger.log('Performing UI element detection');
  
  // Simulate UI element detection based on text and common patterns
  const uiElements = [];
  
  // Convert text blocks to UI elements
  textBlocks.forEach(block => {
    const text = block.text.toLowerCase();
    let type = 'text';
    
    if (text.includes('submit') || text.includes('button') || text.includes('click')) {
      type = 'button';
    } else if (text.includes('email') || text.includes('password') || text.includes('field')) {
      type = 'input';
    } else if (text.includes('link') || text.includes('href')) {
      type = 'link';
    }
    
    uiElements.push({
      type: type,
      label: block.text,
      confidence: block.confidence,
      bounds: block.bounds
    });
  });
  
  // Add some mock UI elements for demonstration
  uiElements.push(
    {
      type: 'button',
      label: 'Login Button',
      confidence: 0.85,
      bounds: { x: 200, y: 300, width: 100, height: 40 }
    },
    {
      type: 'input',
      label: 'Email Field',
      confidence: 0.80,
      bounds: { x: 50, y: 120, width: 200, height: 30 }
    },
    {
      type: 'input',
      label: 'Password Field',
      confidence: 0.82,
      bounds: { x: 50, y: 170, width: 200, height: 30 }
    }
  );
  
  logger.log(`UI detection completed: found ${uiElements.length} elements`);
  return uiElements;
}

// Handle execute requests
async function handleExecute(id, action, args) {
  logger.log(`Executing action: ${action}`, { argsLength: args.length });
  
  try {
    switch (action) {      case 'extractText':
        const base64Image = args[0];
        if (!base64Image) {
          return sendErrorResponse(id, 400, 'Base64 image data required');
        }
        
        logger.log('Processing image for OCR');
        
        try {
          const ocrResult = await analyzeScene(base64Image, 'ocr');
          return sendSuccessResponse(id, {
            fullText: ocrResult.fullText,
            textBlocks: ocrResult.textBlocks,
            confidence: ocrResult.confidence || 0.8,
            method: ocrResult.method || 'unknown'
          });
        } catch (err) {
          logger.error('OCR analysis failed:', err);
          return sendErrorResponse(id, 500, `OCR analysis failed: ${err.message}`);
        }      case 'detectUI':
        const uiBase64Image = args[0];
        if (!uiBase64Image) {
          return sendErrorResponse(id, 400, 'Base64 image data required');
        }
        
        logger.log('Processing image for UI detection');
        
        try {
          const uiResult = await analyzeScene(uiBase64Image, 'ui');
          return sendSuccessResponse(id, {
            elements: uiResult.elements || [],
            textBlocks: uiResult.textBlocks || [],
            totalElements: uiResult.totalElements || (uiResult.elements ? uiResult.elements.length : 0),
            method: uiResult.method || 'unknown'
          });
        } catch (err) {
          logger.error('UI detection failed:', err);
          return sendErrorResponse(id, 500, `UI detection failed: ${err.message}`);
        }

      case 'findImage':
        const targetImage = args[0]; // Base64 of template image
        const sourceImage = args[1]; // Base64 of screenshot
        
        if (!targetImage || !sourceImage) {
          return sendErrorResponse(id, 400, 'Both target and source images required');
        }
        
        // Mock image matching - in real implementation would use OpenCV or similar
        logger.log('Performing image matching (mock implementation)');
        
        return sendSuccessResponse(id, {
          found: true,
          confidence: 0.75,
          location: { x: 150, y: 200, width: 80, height: 30 },
          method: 'mock-template-matching'
        });      case 'analyzeScene':
        const sceneImage = args[0];
        const analysisType = args[1] || 'general'; // Allow specifying analysis type
        if (!sceneImage) {
          return sendErrorResponse(id, 400, 'Scene image data required');
        }
        
        logger.log(`Analyzing scene with type: ${analysisType}`);
        
        try {
          const sceneResult = await analyzeScene(sceneImage, analysisType);
          
          // Normalize the response format based on analysis type
          let responseData;
          if (analysisType === 'computer_use') {
            responseData = {
              scene: {
                analysis: sceneResult.screen_analysis || sceneResult.description || 'Scene analyzed',
                interactive_elements: sceneResult.interactive_elements || [],
                text_elements: sceneResult.text_elements || sceneResult.textBlocks || [],
                possible_actions: sceneResult.possible_actions || [],
                method: sceneResult.method || 'unknown'
              }
            };
          } else {
            responseData = {
              scene: {
                description: sceneResult.description || sceneResult.screen_analysis || 'Scene analyzed',
                text: sceneResult.fullText || '',
                textBlocks: sceneResult.textBlocks || sceneResult.text_elements || [],
                uiElements: sceneResult.elements || sceneResult.interactive_elements || [],
                objects: sceneResult.identified_objects || [],
                summary: sceneResult.description || `Scene contains ${(sceneResult.elements || []).length} UI elements`,
                method: sceneResult.method || 'unknown'
              }
            };
          }
          
          return sendSuccessResponse(id, responseData);        } catch (err) {
          logger.error('Scene analysis failed:', err);
          return sendErrorResponse(id, 500, `Scene analysis failed: ${err.message}`);
        }

      case 'analyzeForComputerUse':
        const computerUseImage = args[0];
        if (!computerUseImage) {
          return sendErrorResponse(id, 400, 'Image data required for computer use analysis');
        }
        
        logger.log('Analyzing scene for computer automation');
        
        try {
          const computerUseResult = await analyzeScene(computerUseImage, 'computer_use');
          return sendSuccessResponse(id, {
            screen_analysis: computerUseResult.screen_analysis || 'Scene analyzed for automation',
            interactive_elements: computerUseResult.interactive_elements || [],
            text_elements: computerUseResult.text_elements || [],
            possible_actions: computerUseResult.possible_actions || [],
            method: computerUseResult.method || 'openai',
            model: computerUseResult.model || config.openai.model
          });
        } catch (err) {
          logger.error('Computer use analysis failed:', err);
          return sendErrorResponse(id, 500, `Computer use analysis failed: ${err.message}`);
        }

      case 'introspect':
        const introspectParams = args[0] || {};
        return handleIntrospect(id, introspectParams.type || 'steps');

      default:
        return sendErrorResponse(id, 400, `Unknown action: ${action}`);
    }
  } catch (err) {
    logger.error(`Error executing action ${action}:`, err);
    return sendErrorResponse(id, 500, err.message);
  }
}

// Handle introspect requests
function handleIntrospect(id, type) {
  if (type === 'steps') {
    return {
      id,
      type: 'response',
      result: {
        steps: [
          {
            id: "extract-text",
            pattern: "extract text from screenshot",
            description: "Performs OCR on a screenshot to extract text",
            action: "extractText",
            examples: ["extract text from screenshot"],
            parameters: [
              { name: "image", type: "base64", description: "Base64 encoded screenshot", required: true }
            ]
          },
          {
            id: "detect-ui",
            pattern: "detect UI elements in screenshot",
            description: "Detects UI elements like buttons, fields, and links",
            action: "detectUI",
            examples: ["detect UI elements in screenshot"],
            parameters: [
              { name: "image", type: "base64", description: "Base64 encoded screenshot", required: true }
            ]
          },
          {
            id: "find-image",
            pattern: "find image \"(.*)\" in screenshot",
            description: "Finds a template image within a screenshot",
            action: "findImage",
            examples: ["find image \"button.png\" in screenshot"],
            parameters: [
              { name: "template", type: "base64", description: "Template image to find", required: true },
              { name: "screenshot", type: "base64", description: "Screenshot to search in", required: true }
            ]
          },          {
            id: "analyze-scene",
            pattern: "analyze scene in screenshot",
            description: "Comprehensive analysis of a screenshot including text and UI elements",
            action: "analyzeScene",
            examples: ["analyze scene in screenshot", "analyze scene for ui detection"],
            parameters: [
              { name: "image", type: "base64", description: "Base64 encoded screenshot", required: true },
              { name: "analysisType", type: "string", description: "Type of analysis: general, ocr, ui, computer_use", required: false, default: "general" }
            ]
          },
          {
            id: "analyze-computer-use",
            pattern: "analyze scene for computer automation",
            description: "Specialized analysis for computer automation and agent interactions",
            action: "analyzeForComputerUse",
            examples: ["analyze scene for computer automation", "analyze for agent actions"],
            parameters: [
              { name: "image", type: "base64", description: "Base64 encoded screenshot", required: true }
            ]
          }
        ]
      }
    };
  } else {
    return {
      id,
      type: 'response',
      result: {        capabilities: {
          name: 'VisionDriver',
          version: '1.0.0',
          description: 'Computer vision driver for OCR and UI detection with GPT-4o support',
          author: 'Runix Team',
          supportedActions: ['extractText', 'detectUI', 'findImage', 'analyzeScene', 'analyzeForComputerUse'],
          features: ['execute', 'introspection', 'openai-vision', 'computer-use-analysis'],
          providers: ['tesseract', 'openai-gpt4o'],
          models: config.openai.enabled ? [config.openai.model] : []
        }
      }
    };
  }
}

// Handle process termination
process.on('SIGTERM', async () => {
  logger.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.log('Received SIGINT, shutting down gracefully');
  process.exit(0);
});
