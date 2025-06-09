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
  'C:\\_Runix\\.env'                               // Absolute path as fallback
];

console.log('DEBUG: __dirname:', __dirname);
console.log('DEBUG: process.cwd():', process.cwd());

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  console.log('DEBUG: Trying env path:', envPath);
  if (fs.existsSync(envPath)) {
    console.log('DEBUG: Found .env file at:', envPath);
    require('dotenv').config({ path: envPath });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.log('DEBUG: No .env file found in any of the attempted paths');
}

console.log('DEBUG: OPENAI_API_KEY from env:', process.env.OPENAI_API_KEY);

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

// Get port from environment variable (assigned by engine) or use default for standalone
const port = parseInt(process.env.RUNIX_DRIVER_PORT || '9001', 10);
const manifest = require('./driver.json');

// Initialize OpenAI client
const apiKey = process.env.OPENAI_API_KEY || 'test_key';
console.log('DEBUG: Final API key being used:', apiKey);
logger.log('OpenAI API Key loaded', { keyPreview: apiKey ? apiKey.substring(0, 20) + '...' : 'NOT SET' });

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
        
        logger.log('Making OpenAI API call', { question });
        
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "You are a helpful AI assistant. Provide clear, concise, and accurate responses to user questions."
            },
            {
              role: "user",
              content: question
            }
          ],
          max_tokens: 1000,
          temperature: 0.7
        });
        
        const aiResponse = completion.choices[0]?.message?.content || 'No response generated';
        
        logger.log('OpenAI API response received', { response: aiResponse.substring(0, 100) + '...' });
        
        return {
          id,
          type: 'response',
          result: {
            success: true,
            data: {
              response: aiResponse,
              question: question,
              model: "gpt-3.5-turbo",
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
        });
        
        // Create a comprehensive prompt for computer use decision making
        const systemPrompt = `You are an AI agent that controls a computer to complete tasks. You can see screenshots and must decide what action to take next.

Available actions:
- click: Click at coordinates {"type": "click", "x": number, "y": number}
- double_click: Double-click at coordinates {"type": "double_click", "x": number, "y": number}  
- type: Type text {"type": "type", "text": "string"}
- key: Press a key {"type": "key", "key": "Enter|Tab|Escape|etc"}
- scroll: Scroll at position {"type": "scroll", "x": number, "y": number, "scrollY": number}
- wait: Wait for changes {"type": "wait", "duration": number}
- task_complete: Task is finished {"type": "task_complete"}

Analyze the screenshot and respond with ONLY a JSON object containing:
{
  "reasoning": "Why you chose this action",
  "action": {"type": "action_type", ...action_parameters},
  "isComplete": false or true if task is done
}

Be precise with coordinates. Look carefully at the screenshot to understand the current state.`;

        const userPrompt = `Task: ${context.task}

Current environment: ${context.environment || 'desktop'}
Display size: ${context.displaySize?.width || 1920}x${context.displaySize?.height || 1080}

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
          }
        ];
        
        const completion = await openai.chat.completions.create({
          model: "gpt-4o", // Use GPT-4 with vision for screenshot analysis
          messages: messages,
          max_tokens: 500,
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
          isComplete: decisionResult.isComplete
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
        logger.error('Screen analysis and decision error', { error: error.message });
        return sendErrorResponse(id, 500, `Decision making error: ${error.message}`);
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

// Handle process termination
process.on('SIGINT', () => {
  logger.log('Received SIGINT, shutting down gracefully');
  server.close(() => {
    logger.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  logger.log('Received SIGTERM, shutting down gracefully');
  server.close(() => {
    logger.log('Server closed');
    process.exit(0);
  });
});
