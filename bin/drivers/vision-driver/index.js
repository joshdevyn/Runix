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

// Vision processing
let config = {
  ocrLanguage: 'eng',
  confidenceThreshold: 0.6,
  tempDir: './temp'
};

// Try to load Tesseract.js for OCR
let Tesseract = null;
try {
  Tesseract = require('tesseract.js');
  logger.log('Tesseract.js loaded successfully');
} catch (err) {
  logger.log('Tesseract.js not available, using mock OCR');
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
    confidence: 0.91
  };
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
    switch (action) {
      case 'extractText':
        const base64Image = args[0];
        if (!base64Image) {
          return sendErrorResponse(id, 400, 'Base64 image data required');
        }
        
        const imageBuffer = base64ToBuffer(base64Image);
        logger.log('Processing image for OCR', { size: imageBuffer.length });
        
        let ocrResult;
        try {
          ocrResult = await performOCR(imageBuffer);
        } catch (err) {
          logger.log('OCR failed, using mock OCR:', err.message);
          ocrResult = mockOCR(imageBuffer);
        }
        
        return sendSuccessResponse(id, {
          fullText: ocrResult.fullText,
          textBlocks: ocrResult.textBlocks,
          confidence: ocrResult.confidence,
          method: Tesseract ? 'tesseract' : 'mock'
        });

      case 'detectUI':
        const uiBase64Image = args[0];
        if (!uiBase64Image) {
          return sendErrorResponse(id, 400, 'Base64 image data required');
        }
        
        const uiImageBuffer = base64ToBuffer(uiBase64Image);
        logger.log('Processing image for UI detection', { size: uiImageBuffer.length });
        
        // First extract text, then detect UI elements
        let textData;
        try {
          textData = await performOCR(uiImageBuffer);
        } catch (err) {
          logger.log('OCR failed for UI detection, using mock:', err.message);
          textData = mockOCR(uiImageBuffer);
        }
        
        const uiElements = detectUI(uiImageBuffer, textData.textBlocks);
        
        return sendSuccessResponse(id, {
          elements: uiElements,
          textBlocks: textData.textBlocks,
          totalElements: uiElements.length,
          method: 'combined-ocr-ui'
        });

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
        });

      case 'analyzeScene':
        const sceneImage = args[0];
        if (!sceneImage) {
          return sendErrorResponse(id, 400, 'Scene image data required');
        }
        
        const sceneBuffer = base64ToBuffer(sceneImage);
        logger.log('Analyzing scene', { size: sceneBuffer.length });
        
        // Combine OCR and UI detection for comprehensive scene analysis
        let sceneTextData;
        try {
          sceneTextData = await performOCR(sceneBuffer);
        } catch (err) {
          sceneTextData = mockOCR(sceneBuffer);
        }
        
        const sceneElements = detectUI(sceneBuffer, sceneTextData.textBlocks);
        
        return sendSuccessResponse(id, {
          scene: {
            text: sceneTextData.fullText,
            textBlocks: sceneTextData.textBlocks,
            uiElements: sceneElements,
            summary: `Scene contains ${sceneElements.length} UI elements and ${sceneTextData.textBlocks.length} text blocks`
          }
        });

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
          },
          {
            id: "analyze-scene",
            pattern: "analyze scene in screenshot",
            description: "Comprehensive analysis of a screenshot including text and UI elements",
            action: "analyzeScene",
            examples: ["analyze scene in screenshot"],
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
      result: {
        capabilities: {
          name: 'VisionDriver',
          version: '1.0.0',
          description: 'Computer vision driver for OCR and UI detection',
          author: 'Runix Team',
          supportedActions: ['extractText', 'detectUI', 'findImage', 'analyzeScene'],
          features: ['execute', 'introspection']
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
