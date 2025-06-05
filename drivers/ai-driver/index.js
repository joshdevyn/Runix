const WebSocket = require('ws');
const http = require('http');

// Get port from environment variable (assigned by engine) or use default for standalone
const port = parseInt(process.env.RUNIX_DRIVER_PORT || '9004', 10);
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
      console.log(`${timestamp} [INFO] [index.js::AIDriver::${caller}] ${message}${dataStr}`);
    },
    error: (message, data = {}) => {
      const caller = getCallerInfo();
      const timestamp = new Date().toISOString();
      const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      console.error(`${timestamp} [ERROR] [index.js::AIDriver::${caller}] ${message}${dataStr}`);
    }
  };
}

const logger = createDriverLogger();

logger.log(`AI Driver starting on port ${port}`);

// AI Driver configuration
let config = {
  openaiApiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 2000,
  knownDrivers: [], // Will be populated by introspection
  stepDefinitions: []
};

// Available drivers registry (populated by discovery)
const availableDrivers = new Map();

// Create HTTP server and WebSocket server
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('AI Driver Running\n');
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
  logger.log(`AI driver listening on 127.0.0.1:${port}`);
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
    logger.log('Driver initialized with config', { 
      hasOpenAI: !!config.openaiApiKey,
      model: config.model 
    });
    
    // Perform driver discovery
    await discoverDrivers();
    
    return sendSuccessResponse(id, { 
      initialized: true,
      discoveredDrivers: Array.from(availableDrivers.keys()),
      stepDefinitions: config.stepDefinitions.length
    });
  } catch (err) {
    logger.error('Failed to initialize driver:', err);
    return sendErrorResponse(id, 500, `Initialization failed: ${err.message}`);
  }
}

// Discover available drivers and their capabilities
async function discoverDrivers() {
  logger.log('Discovering available drivers...');
  
  // Mock driver discovery - in real implementation this would:
  // 1. Query the Runix engine for available drivers
  // 2. Connect to each driver to get their capabilities
  // 3. Collect all step definitions
  
  const mockDrivers = [
    {
      name: 'WebDriver',
      actions: ['open', 'click', 'enterText', 'assertVisible', 'assertText', 'screenshot'],
      steps: [
        { pattern: 'open the browser at "(.*)"', action: 'open' },
        { pattern: 'click the "(.*)" (button|element|link)', action: 'click' },
        { pattern: 'enter "(.*)" into the "(.*)" field', action: 'enterText' },
        { pattern: 'take a screenshot "(.*)"', action: 'screenshot' }
      ]
    },
    {
      name: 'SystemDriver',
      actions: ['createFile', 'readFile', 'writeFile', 'executeCommand'],
      steps: [
        { pattern: 'create file "(.*)" with content "(.*)"', action: 'createFile' },
        { pattern: 'read file "(.*)"', action: 'readFile' },
        { pattern: 'execute command "(.*)"', action: 'executeCommand' }
      ]
    },
    {
      name: 'VisionDriver',
      actions: ['extractText', 'detectUI', 'analyzeScene'],
      steps: [
        { pattern: 'extract text from screenshot', action: 'extractText' },
        { pattern: 'detect UI elements in screenshot', action: 'detectUI' },
        { pattern: 'analyze scene in screenshot', action: 'analyzeScene' }
      ]
    }
  ];
  
  mockDrivers.forEach(driver => {
    availableDrivers.set(driver.name, driver);
    config.stepDefinitions.push(...driver.steps);
  });
  
  logger.log(`Discovered ${availableDrivers.size} drivers with ${config.stepDefinitions.length} total steps`);
}

// Call OpenAI API (if available)
async function callOpenAI(prompt) {
  if (!config.openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }
  
  try {
    // In a real implementation, you would use the OpenAI SDK
    // const openai = new OpenAI({ apiKey: config.openaiApiKey });
    // const response = await openai.chat.completions.create({...});
    
    // Mock OpenAI response for now
    logger.log('Would call OpenAI API with prompt', { promptLength: prompt.length });
    return mockAIResponse(prompt);
  } catch (err) {
    logger.error('OpenAI API call failed:', err);
    throw err;
  }
}

// Mock AI response for testing
function mockAIResponse(prompt) {
  const intent = extractIntent(prompt);
  
  if (intent.includes('login')) {
    return {
      gherkin: `Feature: User Login
  As a user
  I want to log into the application
  So that I can access my account

Scenario: Successful login
  Given I am on the login page
  When I enter "user@example.com" into the "email" field
  And I enter "password123" into the "password" field
  And I click the "login" button
  Then I should see the dashboard page`,
      steps: [
        { step: 'Given I am on the login page', driver: 'WebDriver', action: 'open' },
        { step: 'When I enter "user@example.com" into the "email" field', driver: 'WebDriver', action: 'enterText' },
        { step: 'And I enter "password123" into the "password" field', driver: 'WebDriver', action: 'enterText' },
        { step: 'And I click the "login" button', driver: 'WebDriver', action: 'click' },
        { step: 'Then I should see the dashboard page', driver: 'WebDriver', action: 'assertVisible' }
      ]
    };
  } else if (intent.includes('file') || intent.includes('upload')) {
    return {
      gherkin: `Feature: File Upload
  As a user
  I want to upload a file
  So that I can share it with others

Scenario: Upload a document
  Given I have a file to upload
  When I click the "upload" button
  And I select the file from my computer
  Then the file should be uploaded successfully`,
      steps: [
        { step: 'Given I have a file to upload', driver: 'SystemDriver', action: 'createFile' },
        { step: 'When I click the "upload" button', driver: 'WebDriver', action: 'click' },
        { step: 'And I select the file from my computer', driver: 'WebDriver', action: 'enterText' },
        { step: 'Then the file should be uploaded successfully', driver: 'WebDriver', action: 'assertVisible' }
      ]
    };
  } else {
    return {
      gherkin: `Feature: Generic Task
  As a user
  I want to perform a task
  So that I can achieve my goal

Scenario: Perform the requested action
  Given I understand the user intent: "${intent}"
  When I analyze the current scene
  Then I should generate appropriate automation steps`,
      steps: [
        { step: 'Given I understand the user intent', driver: 'AIDriver', action: 'analyzeIntent' },
        { step: 'When I analyze the current scene', driver: 'VisionDriver', action: 'analyzeScene' },
        { step: 'Then I should generate appropriate automation steps', driver: 'AIDriver', action: 'generateSteps' }
      ]
    };
  }
}

// Extract intent from user input
function extractIntent(input) {
  const text = input.toLowerCase();
  
  if (text.includes('login') || text.includes('sign in')) return 'login';
  if (text.includes('upload') || text.includes('file')) return 'upload file';
  if (text.includes('submit') || text.includes('form')) return 'submit form';
  if (text.includes('search')) return 'search';
  if (text.includes('navigate') || text.includes('go to')) return 'navigate';
  
  return text; // fallback to original input
}

// Match intent to available driver steps
function matchIntentToSteps(intent, scene = []) {
  logger.log('Matching intent to available steps', { intent, sceneElements: scene.length });
  
  const relevantSteps = [];
  
  // Look for steps that match the intent
  config.stepDefinitions.forEach(step => {
    const pattern = step.pattern.toLowerCase();
    const intentLower = intent.toLowerCase();
    
    // Simple keyword matching
    if ((intentLower.includes('click') && pattern.includes('click')) ||
        (intentLower.includes('enter') && pattern.includes('enter')) ||
        (intentLower.includes('open') && pattern.includes('open')) ||
        (intentLower.includes('upload') && pattern.includes('file'))) {
      relevantSteps.push(step);
    }
  });
  
  // If we have scene information, try to match UI elements to steps
  if (scene.length > 0) {
    scene.forEach(element => {
      if (element.type === 'button' && intent.toLowerCase().includes('click')) {
        relevantSteps.push({
          pattern: `click the "${element.label}" button`,
          action: 'click',
          driver: 'WebDriver',
          confidence: element.confidence
        });
      } else if (element.type === 'input' && intent.toLowerCase().includes('enter')) {
        relevantSteps.push({
          pattern: `enter text into the "${element.label}" field`,
          action: 'enterText',
          driver: 'WebDriver',
          confidence: element.confidence
        });
      }
    });
  }
  
  logger.log(`Found ${relevantSteps.length} relevant steps for intent`);
  return relevantSteps;
}

// Handle execute requests
async function handleExecute(id, action, args) {
  logger.log(`Executing action: ${action}`, { argsLength: args.length });
  
  try {
    switch (action) {
      case 'generateFeature':
        const intent = args[0]; // User intent
        const scene = args[1] || []; // Scene data from vision driver
        
        if (!intent) {
          return sendErrorResponse(id, 400, 'User intent required');
        }
        
        logger.log('Generating feature for intent', { intent, sceneElements: scene.length });
        
        let gherkinResult;
        
        try {
          // Try to use OpenAI if available
          const prompt = `
Generate a Gherkin feature file for the following user intent: "${intent}"

Available scene elements: ${JSON.stringify(scene, null, 2)}

Available step patterns from drivers:
${config.stepDefinitions.map(step => `- ${step.pattern} (${step.action})`).join('\n')}

Please generate a complete Gherkin feature with realistic scenarios that use the available steps.
`;
          
          gherkinResult = await callOpenAI(prompt);
        } catch (err) {
          logger.log('OpenAI not available, using rule-based generation');
          gherkinResult = mockAIResponse(intent);
        }
        
        return sendSuccessResponse(id, {
          intent: intent,
          gherkin: gherkinResult.gherkin,
          steps: gherkinResult.steps,
          sceneAnalysis: scene,
          method: config.openaiApiKey ? 'openai' : 'rule-based'
        });

      case 'analyzeIntent':
        const userIntent = args[0];
        const extractedIntent = extractIntent(userIntent);
        const matchedSteps = matchIntentToSteps(extractedIntent);
        
        return sendSuccessResponse(id, {
          originalIntent: userIntent,
          extractedIntent: extractedIntent,
          matchedSteps: matchedSteps,
          confidence: matchedSteps.length > 0 ? 0.8 : 0.3
        });

      case 'discoverDrivers':
        await discoverDrivers();
        
        return sendSuccessResponse(id, {
          drivers: Array.from(availableDrivers.keys()),
          totalSteps: config.stepDefinitions.length,
          capabilities: Array.from(availableDrivers.values())
        });

      case 'generateSteps':
        const taskIntent = args[0];
        const sceneData = args[1] || [];
        
        const relevantSteps = matchIntentToSteps(taskIntent, sceneData);
        
        return sendSuccessResponse(id, {
          intent: taskIntent,
          generatedSteps: relevantSteps,
          stepCount: relevantSteps.length,
          confidence: relevantSteps.length > 0 ? 0.85 : 0.2
        });

      case 'orchestrate':
        const workflow = args[0]; // Array of steps to execute
        const context = args[1] || {}; // Execution context
        
        logger.log('Orchestrating workflow', { steps: workflow.length, context });
        
        // This would coordinate execution across multiple drivers
        const orchestrationPlan = workflow.map((step, index) => ({
          stepIndex: index,
          step: step.step,
          driver: step.driver,
          action: step.action,
          status: 'planned'
        }));
        
        return sendSuccessResponse(id, {
          workflow: workflow,
          orchestrationPlan: orchestrationPlan,
          totalSteps: workflow.length,
          status: 'planned'
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
            id: "generate-feature",
            pattern: "generate feature for intent \"(.*)\"",
            description: "Generates a Gherkin feature file from user intent and scene analysis",
            action: "generateFeature",
            examples: ["generate feature for intent \"login to application\""],
            parameters: [
              { name: "intent", type: "string", description: "User intent description", required: true },
              { name: "scene", type: "array", description: "Scene analysis data", required: false }
            ]
          },
          {
            id: "analyze-intent",
            pattern: "analyze intent \"(.*)\"",
            description: "Analyzes user intent and matches it to available driver capabilities",
            action: "analyzeIntent",
            examples: ["analyze intent \"I want to submit a form\""],
            parameters: [
              { name: "intent", type: "string", description: "User intent to analyze", required: true }
            ]
          },
          {
            id: "discover-drivers",
            pattern: "discover available drivers",
            description: "Discovers all available drivers and their capabilities",
            action: "discoverDrivers",
            examples: ["discover available drivers"],
            parameters: []
          },
          {
            id: "orchestrate-workflow",
            pattern: "orchestrate workflow",
            description: "Orchestrates execution across multiple drivers",
            action: "orchestrate",
            examples: ["orchestrate workflow"],
            parameters: [
              { name: "workflow", type: "array", description: "Array of steps to execute", required: true }
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
          name: 'AIDriver',
          version: '1.0.0',
          description: 'AI orchestration driver for intent analysis and workflow generation',
          author: 'Runix Team',
          supportedActions: ['generateFeature', 'analyzeIntent', 'discoverDrivers', 'generateSteps', 'orchestrate'],
          features: ['execute', 'introspection', 'ai-coordination']
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
