const WebSocket = require('ws');
const http = require('http');
const url = require('url');

// Get port from environment variable (assigned by engine) or use default for standalone
const port = parseInt(process.env.RUNIX_DRIVER_PORT || '9000', 10);
const manifest = require('./driver.json');

// Simple logger for driver processes
function log(message, ...args) {
  const timestamp = new Date().toISOString();
  const argsStr = args.length > 0 ? ` ${JSON.stringify(args)}` : '';
  console.log(`${timestamp} [INFO] [index.js::ExampleDriver::handleMessage] ${message}${argsStr}`);
}

function logError(message, ...args) {
  const timestamp = new Date().toISOString();
  const argsStr = args.length > 0 ? ` ${JSON.stringify(args)}` : '';
  console.error(`${timestamp} [ERROR] [index.js::ExampleDriver::handleMessage] ${message}${argsStr}`);
}

log(`Example Driver starting on port ${port}`);

// Create HTTP server and WebSocket server
const server = http.createServer((req, res) => {
  // add HTTP health endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Example Driver Running\n');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', function connection(ws) {
  log('Client connected');
  
  ws.on('message', function incoming(message) {
    log(`Received: ${message}`);
    handleMessage(ws, message);
  });
  
  ws.on('close', function() {
    log('Client disconnected');
  });
});

server.listen(port, '127.0.0.1', () => {
  log(`Example driver listening on 127.0.0.1:${port}`);
  log(`WebSocket server ready for connections`);
});

// Handle incoming messages
function handleMessage(ws, message) {
  try {
    const request = JSON.parse(message);
    handleRequest(request).then(response => {
      ws.send(JSON.stringify(response));
    }).catch(err => {
      logError('Error handling request:', err);
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
    logError('Error parsing message:', err);
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
            supportedActions: manifest.actions
          }
        };

      case 'initialize':
        // Initialize with config from params
        const config = request.params?.config || {};
        log('Driver initialized with config', config);
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
  log(`Executing action: ${action}`, args);
  
  switch (action) {
    case 'introspect':
      const introspectParams = args[0] || {};
      return handleIntrospect(id, introspectParams.type || 'steps');
    case 'echo':
      return {
        id,
        type: 'response',
        result: {
          success: true,
          data: {
            message: args[0]
          }
        }
      };
    case 'add':
      const sum = Number(args[0]) + Number(args[1]);
      return {
        id,
        type: 'response',
        result: {
          success: true,
          data: {
            sum: sum,
            result: sum
          }
        }
      };
    case 'wait':
      return new Promise((resolve) => {
        const ms = Number(args[0]);
        log(`Waiting for ${ms}ms`);
        setTimeout(() => {
          resolve({
            id,
            type: 'response',
            result: {
              success: true,
              data: {
                waitedFor: ms
              }
            }
          });
        }, ms);
      });
    default:
      return {
        id,
        type: 'response',
        error: {
          code: 400,
          message: `Unknown action: ${action}`
        }
      };
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
            id: "echo-message",
            pattern: "echo the message \"(.*)\"",
            description: "Echoes a message back",
            action: "echo",
            examples: ["echo the message \"hello world\""],
            parameters: [
              {
                name: "message",
                type: "string",
                description: "Message to echo",
                required: true
              }
            ]
          },
          {
            id: "add-numbers",
            pattern: "add (\\d+) and (\\d+)",
            description: "Adds two numbers together",
            action: "add",
            examples: ["add 2 and 3"],
            parameters: [
              {
                name: "a",
                type: "number",
                description: "First number",
                required: true
              },
              {
                name: "b",
                type: "number",
                description: "Second number",
                required: true
              }
            ]
          },
          {
            id: "wait-for",
            pattern: "wait for (\\d+) milliseconds",
            description: "Waits for the specified number of milliseconds",
            action: "wait",
            examples: ["wait for 1000 milliseconds"],
            parameters: [
              {
                name: "milliseconds",
                type: "number",
                description: "Time to wait in milliseconds",
                required: true
              }
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
          name: 'ExampleDriver',
          version: '1.0.0',
          description: 'Example driver for testing',
          author: 'Runix Team',
          supportedActions: ['echo', 'add', 'wait'],
          features: ['execute', 'introspection']
        }
      }
    };
  }
}
