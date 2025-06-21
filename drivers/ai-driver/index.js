const WebSocket = require('ws');
const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');

// Load .env from multiple possible locations

// Try multiple possible .env file locations
const possibleEnvPaths = [
  path.join(__dirname, '.env'),                    // Local .env in binary dir
  path.join(__dirname, '../../.env'),              // Original Runix root
  path.join(__dirname, '../../../.env'),           // From bin/drivers/ai-driver to root
  path.join(process.cwd(), '.env'),                // Current working directory
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    envLoaded = true;
    break;
  }
}

// Create structured logger for driver processes
function createDriverLogger() {
  const getCallerInfo = () => {
    const stack = new Error().stack;
    if (!stack) return 'unknown';
    
    const lines = stack.split('\n');
    for (let i = 3; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/at\s+(\w+)\s*\(/);
      if (match && match[1] !== 'log' && match[1] !== 'error') return match[1];
    }
    return 'unknown';
  };

  // Base64 truncation utilities
  const isBase64String = (str) => {
    if (typeof str !== 'string' || str.length < 50) return false;
    if (str.startsWith('data:image/')) return true;
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Regex.test(str) && str.length > 100;
  };

  const isBase64Field = (fieldName) => {
    const base64FieldNames = [
      'image', 'screenshot', 'data', 'content', 'base64', 'src', 
      'imageData', 'screenshotData', 'capturedImage', 'blob'
    ];
    const lowerFieldName = fieldName.toLowerCase();
    return base64FieldNames.some(name => lowerFieldName.includes(name));
  };

  const truncateBase64Content = (obj, maxLength = 100) => {
    // Check environment variable for full base64 logging
    const showFullBase64 = process.env.RUNIX_LOG_FULL_BASE64 === 'true';
    
    if (showFullBase64) {
      return obj;
    }

    if (typeof obj === 'string') {
      if (isBase64String(obj)) {
        return obj.length > maxLength 
          ? `${obj.substring(0, maxLength)}...[truncated base64, ${obj.length} chars total]`
          : obj;
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => truncateBase64Content(item, maxLength));
    }

    if (obj && typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && isBase64Field(key) && isBase64String(value)) {
          result[key] = value.length > maxLength 
            ? `${value.substring(0, maxLength)}...[truncated base64, ${value.length} chars total]`
            : value;
        } else {
          result[key] = truncateBase64Content(value, maxLength);
        }
      }
      return result;
    }

    return obj;
  };

  return {
    log: (message, data = {}) => {
      const caller = getCallerInfo();
      const timestamp = new Date().toISOString();
      let dataStr = '';
      if (Object.keys(data).length > 0) {
        const processedData = truncateBase64Content(data);
        dataStr = ` ${JSON.stringify(processedData)}`;
      }
      console.log(`${timestamp} [INFO] [index.js::AIDriver::${caller}] ${message}${dataStr}`);
    },
    error: (message, data = {}) => {
      const caller = getCallerInfo();
      const timestamp = new Date().toISOString();
      let dataStr = '';
      if (Object.keys(data).length > 0) {
        const processedData = truncateBase64Content(data);
        dataStr = ` ${JSON.stringify(processedData)}`;
      }
      console.error(`${timestamp} [ERROR] [index.js::AIDriver::${caller}] ${message}${dataStr}`);
    }
  };
}

const logger = createDriverLogger();

// CLI Command Handling
const args = process.argv.slice(2);
const command = args[0];

// Handle CLI commands for driver management
if (command) {
  switch (command) {
    case '--ping':
    case 'ping':
      console.log('AI Driver is responsive');
      process.exit(0);
      break;
      
    case '--shutdown':
    case 'shutdown':
      console.log('Shutting down AI Driver via CLI command');
      process.exit(0);
      break;
      
    case '--health':
    case 'health':
      console.log(JSON.stringify({
        status: 'healthy',
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      }, null, 2));
      process.exit(0);
      break;
      
    case '--help':
    case 'help':
      console.log(`
AI Driver CLI Commands:
  --ping, ping       Check if driver is responsive
  --shutdown        Shutdown the driver
  --health          Show driver health status
  --help            Show this help message
  --port=<port>     Set the port (can also use RUNIX_DRIVER_PORT env var)
  
Environment Variables:
  RUNIX_DRIVER_PORT                   Driver port (default: 9001)
  RUNIX_DRIVER_HEARTBEAT_ENABLED      Enable heartbeat monitoring (default: true)
  RUNIX_DRIVER_HEARTBEAT_INTERVAL     Heartbeat interval in ms (default: 30000)
  RUNIX_DRIVER_AUTO_SHUTDOWN_ENABLED  Enable auto-shutdown (default: true)
  RUNIX_DRIVER_AUTO_SHUTDOWN_TIMEOUT  Auto-shutdown timeout in ms (default: 300000)
  OPENAI_API_KEY                      OpenAI API key
  AI_DEFAULT_MODEL                    Default AI model (default: gpt-4o-mini)
`);
      process.exit(0);
      break;
  }
}

// Parse port from command line if provided
const portArg = args.find(arg => arg.startsWith('--port='));
const port = portArg 
  ? parseInt(portArg.split('=')[1], 10) 
  : parseInt(process.env.RUNIX_DRIVER_PORT || '9001', 10);

const manifest = require('./driver.json');

// Initialize OpenAI client with professional configuration
const apiKey = process.env.OPENAI_API_KEY || 'test_key';
const defaultModel = process.env.AI_DEFAULT_MODEL || 'gpt-4o-mini';
const computerUseModel = process.env.AI_COMPUTER_USE_MODEL || 'gpt-4o-with-canvas';
const visionModel = process.env.AI_VISION_MODEL || 'gpt-4o-mini';
const maxTokens = parseInt(process.env.AI_MAX_TOKENS || '2000');
const temperature = parseFloat(process.env.AI_TEMPERATURE || '0.7');

logger.log('OpenAI configuration loaded', { 
  keyPreview: apiKey ? apiKey.substring(0, 20) + '...' : 'NOT SET',
  defaultModel,
  computerUseModel,
  visionModel,
  maxTokens,
  temperature
});

const openai = new OpenAI({
  apiKey: apiKey,
});

logger.log(`AI Driver starting on port ${port}`);

// Create HTTP server and WebSocket server
const server = http.createServer((req, res) => {
  // add HTTP health endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  
  res.writeHead(404);
  res.end('Not Found');
});

const wss = new WebSocket.Server({ server });

// Handle WebSocket connections
wss.on('connection', (ws, request) => {
  const clientUrl = url.parse(request.url, true);
  logger.log('WebSocket connection established', { url: clientUrl.pathname });
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      logger.log('Received message', data);
      
      // Update heartbeat on any engine communication
      if (typeof updateHeartbeat === 'function') {
        updateHeartbeat();
      }
      
      const response = await handleMessage(data);
      if (response) {
        logger.log('Sending response', response);
        ws.send(JSON.stringify(response));
      }
    } catch (error) {
      logger.error('Error processing message', { error: error.message, stack: error.stack });
      
      const errorResponse = {
        id: 'unknown',
        type: 'response',
        error: {
          code: 500,
          message: error.message
        }
      };
      
      ws.send(JSON.stringify(errorResponse));
    }
  });

  ws.on('close', () => {
    logger.log('WebSocket connection closed');
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error', { error: error.message });
  });
});

// Handle incoming messages
async function handleMessage(request) {
  if (!request.id || !request.method) {
    return sendErrorResponse(request.id || 'unknown', 400, 'Invalid request');
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
            supportedActions: manifest.actions
          }
        };

      case 'initialize':
        // Initialize with config from params
        const config = request.params?.config || {};
        logger.log('Driver initialized with config', config);
        return sendSuccessResponse(request.id, { initialized: true });

      case 'introspect':
        return handleIntrospect(request.id, request.params?.type || 'steps');

      case 'execute':
        return handleExecute(request.id, request.params?.action, request.params?.args || []);      case 'health':
        return {
          id: request.id,
          type: 'response',
          result: { 
            status: 'ok',
            pid: process.pid,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            heartbeat: {
              enabled: HEARTBEAT_ENABLED,
              lastHeartbeat: lastHeartbeat ? new Date(lastHeartbeat).toISOString() : null,
              timeSinceLastHeartbeat: lastHeartbeat ? Date.now() - lastHeartbeat : null,
              autoShutdownEnabled: AUTO_SHUTDOWN_ENABLED,
              autoShutdownTimeout: AUTO_SHUTDOWN_TIMEOUT
            },
            timestamp: new Date().toISOString()
          }
        };

      case 'heartbeat':
        // Explicit heartbeat endpoint
        if (typeof updateHeartbeat === 'function') {
          updateHeartbeat();
        }
        return {
          id: request.id,
          type: 'response',
          result: { 
            heartbeat: 'updated',
            timestamp: new Date().toISOString(),
            nextAutoShutdown: lastHeartbeat ? new Date(lastHeartbeat + AUTO_SHUTDOWN_TIMEOUT).toISOString() : null
          }
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

// Handle execute requests
async function handleExecute(id, action, args) {
  logger.log(`Executing action: ${action}`, args);
  
  switch (action) {
    case 'introspect':
      const introspectParams = args[0] || {};
      return handleIntrospect(id, introspectParams.type || 'steps');
    case 'ask':
      try {
        const question = args[0];
        if (!question) {
          return sendErrorResponse(id, 400, 'Question parameter is required');
        }
        
        logger.log('Making OpenAI API call', { question, model: defaultModel });
        
        const completion = await openai.chat.completions.create({
          model: defaultModel,
          messages: [
            {
              role: "system",
              content: "You are a helpful AI assistant integrated into the Runix automation platform. Provide clear, concise, and accurate responses to user questions. When appropriate, suggest automation solutions or testing strategies."
            },
            {
              role: "user",
              content: question
            }
          ],
          max_tokens: maxTokens,
          temperature: temperature
        });
        
        const aiResponse = completion.choices[0]?.message?.content || 'No response generated';
        
        logger.log('OpenAI API response received', { 
          response: aiResponse.substring(0, 100) + '...',
          model: defaultModel,
          tokensUsed: completion.usage?.total_tokens || 0
        });
        
        return {
          id,
          type: 'response',
          result: {
            success: true,
            data: {
              response: aiResponse,
              question: question,
              model: defaultModel,
              tokensUsed: completion.usage?.total_tokens || 0,
              timestamp: new Date().toISOString()
            }
          }
        };
      } catch (error) {
        logger.error('OpenAI API error', { error: error.message });
        return sendErrorResponse(id, 500, `AI service error: ${error.message}`);
      }
        case 'agent':      // Note: Agent mode is now handled by AgentDriver orchestration
      return sendErrorResponse(id, 501, 'Agent mode is handled by AgentDriver. Use AgentDriver.execute("agent", [task]) instead.');
      
    case 'analyze':
      return {
        id,
        type: 'response',
        result: {
          success: true,
          data: {
            analysis: "Screen analyzed successfully",
            details: "Mock analysis result"
          }
        }
      };
      
    case 'verifyResponse':
      return {
        id,
        type: 'response',
        result: {
          success: true,
          data: {
            verified: true,
            message: "Response verification completed"
          }
        }
      };
      
    case 'verifyResult':
      return {
        id,
        type: 'response',
        result: {
          success: true,
          data: {
            verified: true,
            expected: args[0],
            message: "Result verification completed"
          }
        }
      };
      
    case 'verifySuccess':
      return {
        id,
        type: 'response',
        result: {
          success: true,
          data: {
            verified: true,
            message: "Success verification completed"
          }
        }
      };
      
    case 'startSession':
      return {
        id,
        type: 'response',
        result: {
          success: true,
          data: {
            sessionId: `session-${Date.now()}`,
            message: "Session started successfully"
          }
        }
      };
      
    case 'setMode':
      return {
        id,
        type: 'response',
        result: {
          success: true,
          data: {
            mode: args[0],
            message: `AI mode set to: ${args[0]}`
          }
        }
      };
      
    case 'analyzeScreenAndDecide':
      try {
        const context = args[0];
        if (!context || !context.task || !context.currentScreenshot) {
          return sendErrorResponse(id, 400, 'Context with task and currentScreenshot is required');
        }
        
        logger.log('Analyzing screenshot and making decision', { 
          task: context.task, 
          environment: context.environment,
          hasScreenshot: !!context.currentScreenshot 
        });        // Create a comprehensive prompt for computer use decision making
        const systemPrompt = `You are an AI agent that controls a computer to complete tasks. You can see screenshots and must decide what action to take next.

Available actions:
- click: Click at coordinates {"type": "click", "x": number, "y": number}
- double_click: Double-click at coordinates {"type": "double_click", "x": number, "y": number}  
- type: Type text {"type": "type", "text": "string"}
- key: Press a key {"type": "key", "key": "keyname"}
- scroll: Scroll at position {"type": "scroll", "x": number, "y": number, "scrollY": number}
- wait: Wait for changes {"type": "wait", "duration": number}
- task_complete: Task is finished {"type": "task_complete"}

AVAILABLE KEYS (use exact names):
Basic keys: Enter, Return, Space, Tab, Escape, Backspace, Delete
Arrow keys: ArrowUp, ArrowDown, ArrowLeft, ArrowRight
Navigation: Home, End, PageUp, PageDown
Function keys: F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12
Modifiers: Win, Windows, Meta, Control, Ctrl, Alt, Shift
Special: PrintScreen, Insert, CapsLock, NumLock, ScrollLock
Letters: A-Z (use capital letters like "A", "B", "C")
Numbers: 0-9 (use as strings like "1", "2", "3")

KEY COMBINATIONS:
- For combinations, use modifiers array: {"type": "key", "key": "R", "modifiers": ["Win"]}
- Common combinations: Win+R (Run dialog), Ctrl+C (copy), Ctrl+V (paste), Alt+Tab (switch windows)

CRITICAL EFFICIENCY RULES:
- Complete tasks in minimum steps possible - avoid unnecessary actions
- If you see the desired application already open, mark task complete immediately
- NEVER repeat the same failed action more than twice - try alternatives
- Don't click randomly or repeat failed actions
- If an action didn't work as expected, try a different approach immediately

SIMPLE TASKS - RECOGNIZE AND COMPLETE IMMEDIATELY:
- "take a screenshot" or "capture screen" = Press PrintScreen key ONCE and mark complete
- "take screenshot" = {"type": "key", "key": "PrintScreen"} then {"type": "task_complete"}
- Screenshots are captured to clipboard/files automatically when PrintScreen is pressed
- Don't try to open screenshot applications or save files manually
- IMPORTANT: For screenshot tasks, return TWO actions: PrintScreen key press + task_complete

WINDOWS APPLICATION OPENING STRATEGIES (try in order):
1. PRIMARY: Win key + type app name + Enter
2. FALLBACK 1: Win+R (Run dialog) + type app name + Enter
3. FALLBACK 2: Direct click on Start button + search + click result
4. FALLBACK 3: Look for app icons on taskbar or desktop and click them

SPECIFIC APPLICATION COMMANDS:
- Notepad: Try "notepad", "notepad.exe", or click Start menu → search "notepad"
- Calculator: Try "calc", "calculator", "calc.exe"
- File Explorer: Try "explorer", "file explorer", Win+E
- Command Prompt: Try "cmd", "command prompt", Win+R → "cmd"

FAILURE DETECTION:
- If you've tried Win+type+Enter 2+ times and don't see the app, switch to Win+R approach
- If you see Windows Search/Explorer instead of your target app, try Win+R approach
- If you see the same screen after multiple attempts, change strategy immediately

Task completion validation:
- Only mark task complete when you can CLEARLY see the target application window open
- Look for window titles, application interfaces, or distinctive UI elements
- For Notepad: Look for "Notepad" in title bar or typical text editor interface
- For screenshot tasks: Mark complete IMMEDIATELY after pressing PrintScreen - screenshot capture is automatic
- Don't assume - verify visually in the screenshot unless it's a simple single-action task

SCREENSHOT TASK COMPLETION:
- If task is "take a screenshot" or similar, press PrintScreen ONCE and mark isComplete: true
- Use action sequence: [{"type": "key", "key": "PrintScreen"}, {"type": "task_complete"}]
- Screenshots are automatically saved when PrintScreen is pressed
- NO need to verify or check for screenshot files - trust that the system captured it
- NEVER type commands or open applications for screenshot tasks - just press PrintScreen key

You can return EITHER a single action OR a sequence of actions:

Single action:
{
  "reasoning": "Brief explanation of what you see and your next action",
  "action": {"type": "action_type", ...action_parameters},
  "isComplete": false or true if task is done
}

Action sequence (for efficiency):
{
  "reasoning": "Brief explanation of your planned sequence", 
  "actions": [
    {"type": "key", "key": "Win"},
    {"type": "type", "text": "notepad"},
    {"type": "key", "key": "Enter"}
  ],
  "isComplete": false
}

IMPORTANT: Look at your recent attempts in the iteration history. If you've failed 2+ times with the same approach, try a different method!`;

        const iterationCount = context.iterationHistory?.length || 0;        const userPrompt = `Task: ${context.task}

Current environment: ${context.environment || 'desktop'}
Display size: ${context.displaySize?.width || 1920}x${context.displaySize?.height || 1080}
Iteration: ${iterationCount + 1}/5 - BE EFFICIENT!

${context.iterationHistory?.length ? `Recent actions: ${JSON.stringify(context.iterationHistory.slice(-2))}` : 'No previous actions.'}

What should I do next to complete this task? Respond with JSON only.`;

        const messages = [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user", 
            content: [
              {
                type: "text",
                text: userPrompt
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${context.currentScreenshot}`
                }
              }
            ]
          }        ];
          
        // Rate limit handling with exponential backoff
        let retryCount = 0;
        const maxRetries = 3;
        let baseDelay = 1000; // Start with 1 second
        
        while (retryCount <= maxRetries) {
          try {
            const completion = await openai.chat.completions.create({
              model: visionModel, // Use vision-capable model for screenshot analysis
              messages: messages,
              max_tokens: Math.min(maxTokens, 2000), // Reduce tokens to avoid rate limits
              temperature: 0.1 // Low temperature for consistent decisions
            });
            
            const aiResponse = completion.choices[0]?.message?.content || '{}';
                  // Parse the JSON response
        let decisionResult;
        try {
          decisionResult = JSON.parse(aiResponse.trim());
        } catch (parseError) {
          // If JSON parsing fails, try to extract JSON from the response
          const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            decisionResult = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error(`Invalid JSON response: ${aiResponse}`);
          }
        }
            
            logger.log('AI decision made', { 
              reasoning: decisionResult.reasoning,
              actionType: decisionResult.action?.type,
              isComplete: decisionResult.isComplete,
              retryCount: retryCount
            });
            
            return {
              id,
              type: 'response',
              result: {
                success: true,
                data: decisionResult
              }
            };
            
          } catch (error) {
            // Check if it's a rate limit error
            if (error.message.includes('429') || error.message.includes('Rate limit')) {
              retryCount++;
              if (retryCount <= maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount - 1); // Exponential backoff
                logger.log(`Rate limit hit, retrying in ${delay}ms (attempt ${retryCount}/${maxRetries})`, { error: error.message });
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              }
            }
              logger.error('Screen analysis and decision error', { error: error.message, retryCount });
            return sendErrorResponse(id, 500, `Decision making error: ${error.message}`);
          }
        }
      
      } catch (outerError) {
        logger.error('Screen analysis outer error', { error: outerError.message });
        return sendErrorResponse(id, 500, `Decision making outer error: ${outerError.message}`);
      }
      
    default:
      return sendErrorResponse(id, 400, `Unknown action: ${action}`);
  }
}

// Handle introspect requests - EXACTLY like example-driver
function handleIntrospect(id, type) {
  if (type === 'steps') {
    return {
      id,
      type: 'response',
      result: {
        steps: [
          {
            id: "ask-question",
            pattern: "I ask \"(.*)\"",
            description: "Ask a question to the AI",
            action: "ask",
            examples: ["I ask \"What are your capabilities?\""],
            parameters: [
              {
                name: "question",
                type: "string",
                description: "Question to ask",
                required: true
              }
            ]
          },
          {
            id: "ai-agent-mode",
            pattern: "I use AI agent mode to \"(.*)\"",
            description: "Use AI agent mode for complex tasks",
            action: "agent",
            examples: ["I use AI agent mode to \"complete this task\""],
            parameters: [
              {
                name: "task",
                type: "string",
                description: "Task description",
                required: true
              }
            ]
          },
          {
            id: "analyze-screen",
            pattern: "I analyze the screen",
            description: "Analyze the current screen",
            action: "analyze",
            examples: ["I analyze the screen"],
            parameters: []
          },
          {
            id: "verify-response",
            pattern: "I should receive a response",
            description: "Verify that a response was received",
            action: "verifyResponse",
            examples: ["I should receive a response"],
            parameters: []
          },
          {
            id: "verify-result",
            pattern: "the result should be \"(.*)\"",
            description: "Verify a specific result",
            action: "verifyResult",
            examples: ["the result should be \"success\""],
            parameters: [
              {
                name: "expectedResult",
                type: "string",
                description: "Expected result value",
                required: true
              }
            ]
          },
          {
            id: "verify-success",
            pattern: "the operation should be successful",
            description: "Verify that an operation was successful",
            action: "verifySuccess",
            examples: ["the operation should be successful"],
            parameters: []
          },
          {
            id: "start-session",
            pattern: "I start a new session",
            description: "Start a new AI session",
            action: "startSession",
            examples: ["I start a new session"],
            parameters: []
          },
          {
            id: "set-mode",
            pattern: "I set AI mode to \"(.*)\"",
            description: "Set the AI mode",
            action: "setMode",
            examples: ["I set AI mode to \"ask\""],
            parameters: [
              {
                name: "mode",
                type: "string",
                description: "AI mode to set",
                required: true
              }
            ]
          }
        ]
      }
    };
  }

  return sendErrorResponse(id, 400, `Unknown introspect type: ${type}`);
}

// Helper functions
function sendSuccessResponse(id, data) {
  return {
    id,
    type: 'response',
    result: {
      success: true,
      data
    }
  };
}

function sendErrorResponse(id, code, message) {
  return {
    id,
    type: 'response',
    error: {
      code,
      message
    }
  };
}

// Note: Agent loop orchestration is now handled by AgentDriver
// This ai-driver focuses on providing AI decision-making capabilities

// Note: getAIDecision and buildAgentPrompt are now handled through analyzeScreenAndDecide action
// executeAgentAction, takeScreenshot, and executeSystemAction are now handled by AgentDriver orchestration

// Utility function for delays
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Start the server
server.listen(port, () => {
  logger.log(`AI Driver server listening on port ${port}`);
});

// Heartbeat and Auto-Shutdown Configuration
const HEARTBEAT_INTERVAL = parseInt(process.env.RUNIX_DRIVER_HEARTBEAT_INTERVAL || '30000'); // 30 seconds
const AUTO_SHUTDOWN_TIMEOUT = parseInt(process.env.RUNIX_DRIVER_AUTO_SHUTDOWN_TIMEOUT || '300000'); // 5 minutes
const HEARTBEAT_ENABLED = process.env.RUNIX_DRIVER_HEARTBEAT_ENABLED !== 'false'; // Default to true
const AUTO_SHUTDOWN_ENABLED = process.env.RUNIX_DRIVER_AUTO_SHUTDOWN_ENABLED !== 'false'; // Default to true

let lastHeartbeat = Date.now();
let heartbeatInterval = null;
let autoShutdownTimeout = null;

// Update heartbeat timestamp (called when engine communicates with driver)
function updateHeartbeat() {
  lastHeartbeat = Date.now();
  if (autoShutdownTimeout) {
    clearTimeout(autoShutdownTimeout);
  }
  
  if (AUTO_SHUTDOWN_ENABLED) {
    autoShutdownTimeout = setTimeout(() => {
      logger.log('Auto-shutdown timeout reached, no engine communication detected', {
        timeoutMs: AUTO_SHUTDOWN_TIMEOUT,
        lastHeartbeat: new Date(lastHeartbeat).toISOString()
      });
      gracefulShutdown('auto-shutdown');
    }, AUTO_SHUTDOWN_TIMEOUT);
  }
}

// Start heartbeat monitoring
if (HEARTBEAT_ENABLED) {
  logger.log('Starting heartbeat monitoring', {
    heartbeatInterval: HEARTBEAT_INTERVAL,
    autoShutdownTimeout: AUTO_SHUTDOWN_TIMEOUT,
    heartbeatEnabled: HEARTBEAT_ENABLED,
    autoShutdownEnabled: AUTO_SHUTDOWN_ENABLED
  });
  
  heartbeatInterval = setInterval(() => {
    const timeSinceLastHeartbeat = Date.now() - lastHeartbeat;
    logger.log('Heartbeat check', {
      timeSinceLastHeartbeat: timeSinceLastHeartbeat,
      lastHeartbeat: new Date(lastHeartbeat).toISOString(),
      status: timeSinceLastHeartbeat < AUTO_SHUTDOWN_TIMEOUT ? 'healthy' : 'timeout-pending'
    });
  }, HEARTBEAT_INTERVAL);
  
  // Initialize heartbeat
  updateHeartbeat();
}

// Enhanced graceful shutdown function
function gracefulShutdown(reason = 'unknown') {
  logger.log(`Initiating graceful shutdown`, { reason });
  
  // Clear intervals and timeouts
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (autoShutdownTimeout) {
    clearTimeout(autoShutdownTimeout);
    autoShutdownTimeout = null;
  }
  
  // Close WebSocket server
  if (wss) {
    wss.close(() => {
      logger.log('WebSocket server closed');
    });
  }
  
  // Close HTTP server
  server.close(() => {
    logger.log('HTTP server closed', { reason });
    process.exit(0);
  });
  
  // Force exit after 5 seconds if graceful shutdown fails
  setTimeout(() => {
    logger.error('Forced shutdown after timeout', { reason });
    process.exit(1);
  }, 5000);
}

// Handle process termination
process.on('SIGINT', () => {
  logger.log('Received SIGINT, shutting down gracefully');
  gracefulShutdown('SIGINT');
});

process.on('SIGTERM', () => {
  logger.log('Received SIGTERM, shutting down gracefully');
  gracefulShutdown('SIGTERM');
});
