const WebSocket = require('ws');
const http = require('http');
const url = require('url');
const path = require('path');

// Load .env from multiple possible locations
const possibleEnvPaths = [
  path.join(__dirname, '.env'),                    // Local .env in driver dir
  path.join(__dirname, '../../.env'),              // Original Runix root
  path.join(__dirname, '../../../.env'),           // From bin/drivers/example-driver to root
  path.join(process.cwd(), '.env'),                // Current working directory
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  try {
    const fs = require('fs');
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
      envLoaded = true;
      break;
    }
  } catch (err) {
    // Ignore errors and try next path
  }
}

// Get port from environment variable (assigned by engine) or use default for standalone
const port = parseInt(process.env.RUNIX_DRIVER_PORT || '9000', 10);
const manifest = require('./driver.json');

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
        try {
          const processedData = truncateBase64Content(data);
          dataStr = ` ${JSON.stringify(processedData)}`;
        } catch (e) {
          dataStr = ' [UnserializableObject]';
        }
      }
      console.log(`${timestamp} [INFO] [index.js::ExampleDriver::${caller}] ${message}${dataStr}`);
    },
    error: (message, data = {}) => {
      const caller = getCallerInfo();
      const timestamp = new Date().toISOString();
      let dataStr = '';
      if (Object.keys(data).length > 0) {
        try {
          const processedData = truncateBase64Content(data);
          dataStr = ` ${JSON.stringify(processedData)}`;
        } catch (e) {
          dataStr = ' [UnserializableObject]';
        }
      }
      console.error(`${timestamp} [ERROR] [index.js::ExampleDriver::${caller}] ${message}${dataStr}`);
    }
  };
}

const logger = createDriverLogger();

logger.log(`Example Driver starting on port ${port}`);

// Embedded Heartbeat Implementation for Example Driver
class DriverHeartbeat {
  constructor(options = {}) {
    this.driverName = options.driverName || 'Example';
    this.logger = options.logger || logger;
    this.server = options.server;
    this.wss = options.wss;
    
    // Configuration from environment or defaults
    this.heartbeatInterval = parseInt(process.env.RUNIX_DRIVER_HEARTBEAT_INTERVAL || '30000'); // 30 seconds
    this.autoShutdownTimeout = parseInt(process.env.RUNIX_DRIVER_AUTO_SHUTDOWN_TIMEOUT || '300000'); // 5 minutes
    this.heartbeatEnabled = process.env.RUNIX_DRIVER_HEARTBEAT_ENABLED !== 'false'; // Default to true
    this.autoShutdownEnabled = process.env.RUNIX_DRIVER_AUTO_SHUTDOWN_ENABLED !== 'false'; // Default to true
    
    // State
    this.lastHeartbeat = Date.now();
    this.heartbeatIntervalId = null;
    this.autoShutdownTimeoutId = null;
    this.isShuttingDown = false;
    
    this.setupSignalHandlers();
    this.start();
  }
  
  updateHeartbeat() {
    this.lastHeartbeat = Date.now();
    
    if (this.autoShutdownTimeoutId) {
      clearTimeout(this.autoShutdownTimeoutId);
    }
    
    if (this.autoShutdownEnabled && !this.isShuttingDown) {
      this.autoShutdownTimeoutId = setTimeout(() => {
        this.logger.log(`Auto-shutdown timeout reached, no engine communication detected`, {
          timeoutMs: this.autoShutdownTimeout,
          lastHeartbeat: new Date(this.lastHeartbeat).toISOString(),
          driverName: this.driverName
        });
        this.gracefulShutdown('auto-shutdown');
      }, this.autoShutdownTimeout);
    }
  }
  
  start() {
    if (!this.heartbeatEnabled) {
      this.logger.log('Heartbeat monitoring disabled', { driverName: this.driverName });
      return;
    }
    
    this.logger.log('Starting heartbeat monitoring', {
      heartbeatInterval: this.heartbeatInterval,
      autoShutdownTimeout: this.autoShutdownTimeout,
      heartbeatEnabled: this.heartbeatEnabled,
      autoShutdownEnabled: this.autoShutdownEnabled,
      driverName: this.driverName
    });
    
    this.heartbeatIntervalId = setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;
      this.logger.log('Heartbeat check', {
        timeSinceLastHeartbeat: timeSinceLastHeartbeat,
        lastHeartbeat: new Date(this.lastHeartbeat).toISOString(),
        status: timeSinceLastHeartbeat < this.autoShutdownTimeout ? 'healthy' : 'timeout-pending',
        driverName: this.driverName
      });
    }, this.heartbeatInterval);
    
    // Initialize heartbeat
    this.updateHeartbeat();
  }
  
  stop() {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
    if (this.autoShutdownTimeoutId) {
      clearTimeout(this.autoShutdownTimeoutId);
      this.autoShutdownTimeoutId = null;
    }
  }
  
  getStatus() {
    return {
      enabled: this.heartbeatEnabled,
      lastHeartbeat: this.lastHeartbeat ? new Date(this.lastHeartbeat).toISOString() : null,
      timeSinceLastHeartbeat: this.lastHeartbeat ? Date.now() - this.lastHeartbeat : null,
      autoShutdownEnabled: this.autoShutdownEnabled,
      autoShutdownTimeout: this.autoShutdownTimeout,
      nextAutoShutdown: this.lastHeartbeat ? new Date(this.lastHeartbeat + this.autoShutdownTimeout).toISOString() : null,
      driverName: this.driverName
    };
  }
  
  gracefulShutdown(reason = 'unknown') {
    if (this.isShuttingDown) {
      this.logger.log('Shutdown already in progress, ignoring', { reason, driverName: this.driverName });
      return;
    }
    
    this.isShuttingDown = true;
    this.logger.log(`Initiating graceful shutdown`, { reason, driverName: this.driverName });
    
    // Stop heartbeat monitoring
    this.stop();
    
    // Close WebSocket server
    if (this.wss) {
      this.wss.close(() => {
        this.logger.log('WebSocket server closed', { driverName: this.driverName });
      });
    }
    
    // Close HTTP server
    if (this.server) {
      this.server.close(() => {
        this.logger.log('HTTP server closed', { reason, driverName: this.driverName });
        process.exit(0);
      });
    } else {
      this.logger.log('No server to close, exiting directly', { reason, driverName: this.driverName });
      process.exit(0);
    }
    
    // Force exit after 5 seconds if graceful shutdown fails
    setTimeout(() => {
      this.logger.error('Forced shutdown after timeout', { reason, driverName: this.driverName });
      process.exit(1);
    }, 5000);
  }
  
  setupSignalHandlers() {
    process.on('SIGINT', () => {
      this.logger.log('Received SIGINT, shutting down gracefully', { driverName: this.driverName });
      this.gracefulShutdown('SIGINT');
    });

    process.on('SIGTERM', () => {
      this.logger.log('Received SIGTERM, shutting down gracefully', { driverName: this.driverName });
      this.gracefulShutdown('SIGTERM');
    });
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception, shutting down', { 
        error: error.message, 
        stack: error.stack,
        driverName: this.driverName 
      });
      this.gracefulShutdown('uncaughtException');
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled promise rejection, shutting down', { 
        reason: reason?.toString?.() || 'unknown',
        driverName: this.driverName 
      });
      this.gracefulShutdown('unhandledRejection');
    });
  }
  
  static handleCLICommands(driverName = 'unknown') {
    const args = process.argv.slice(2);
    const command = args[0];

    if (command) {
      switch (command) {
        case '--ping':
        case 'ping':
          console.log(`${driverName} Driver is responsive`);
          process.exit(0);
          break;
          
        case '--shutdown':
        case 'shutdown':
          console.log(`Shutting down ${driverName} Driver via CLI command`);
          process.exit(0);
          break;
          
        case '--health':
        case 'health':
          console.log(JSON.stringify({
            status: 'healthy',
            driverName: driverName,
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
${driverName} Driver CLI Commands:
  --ping, ping       Check if driver is responsive
  --shutdown        Shutdown the driver
  --health          Show driver health status
  --help            Show this help message
  --port=<port>     Set the port (can also use RUNIX_DRIVER_PORT env var)
  
Environment Variables:
  RUNIX_DRIVER_PORT                   Driver port
  RUNIX_DRIVER_HEARTBEAT_ENABLED      Enable heartbeat monitoring (default: true)
  RUNIX_DRIVER_HEARTBEAT_INTERVAL     Heartbeat interval in ms (default: 30000)
  RUNIX_DRIVER_AUTO_SHUTDOWN_ENABLED  Enable auto-shutdown (default: true)
  RUNIX_DRIVER_AUTO_SHUTDOWN_TIMEOUT  Auto-shutdown timeout in ms (default: 300000)
`);
          process.exit(0);
          break;
      }
    }
    
    // Parse port from command line if provided
    const portArg = args.find(arg => arg.startsWith('--port='));
    return portArg ? parseInt(portArg.split('=')[1], 10) : null;
  }
}

logger.log(`Example Driver starting on port ${port}`);

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
  logger.log('Client connected');
  
  ws.on('message', function incoming(message) {
    logger.log(`Received: ${message}`);
    handleMessage(ws, message);
  });
  
  ws.on('close', function() {
    logger.log('Client disconnected');
  });
});

server.listen(port, '127.0.0.1', () => {
  logger.log(`Example driver listening on 127.0.0.1:${port}`);
  logger.log(`WebSocket server ready for connections`);
});

// Initialize heartbeat system
let heartbeat = null;
try {
  // Handle CLI commands first
  DriverHeartbeat.handleCLICommands('Example');
  
  // Initialize heartbeat system
  heartbeat = new DriverHeartbeat({
    driverName: 'Example',
    logger: logger,
    server: server,
    wss: wss
  });
  
  logger.log('Heartbeat system initialized');
} catch (error) {
  logger.error('Failed to initialize heartbeat system:', error);
}

// Handle incoming messages
function handleMessage(ws, message) {
  try {
    const request = JSON.parse(message);
    
    // Update heartbeat on any engine communication
    if (heartbeat) {
      heartbeat.updateHeartbeat();
    }
    
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
            heartbeat: heartbeat ? heartbeat.getStatus() : null,
            timestamp: new Date().toISOString()
          }
        };

      case 'heartbeat':
        // Explicit heartbeat endpoint
        if (heartbeat) {
          heartbeat.updateHeartbeat();
        }
        return {
          id: request.id,
          type: 'response',
          result: { 
            heartbeat: 'updated',
            timestamp: new Date().toISOString(),
            ...(heartbeat ? heartbeat.getStatus() : {})
          }
        };

      case 'ping':
        return {
          id: request.id,
          type: 'response',
          result: { 
            ping: 'pong',
            timestamp: new Date().toISOString(),
            driverName: 'Example'
          }
        };

      case 'shutdown':
        if (heartbeat) {
          heartbeat.gracefulShutdown('shutdown-command');
        } else {
          process.exit(0);
        }
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
        logger.log(`Waiting for ${ms}ms`);
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
    case 'verifyResponse':
      // Mock verification - in real scenario would check last response
      const expectedText = args[0];
      const responseContains = true; // Mock success
      return {
        id,
        type: 'response',
        result: {
          success: responseContains,
          data: {
            verified: responseContains,
            expectedText: expectedText
          }
        }
      };
    case 'verifyResult':
      // Mock verification
      const expectedResult = Number(args[0]);
      const resultMatches = true; // Mock success
      return {
        id,
        type: 'response',
        result: {
          success: resultMatches,
          data: {
            verified: resultMatches,
            expectedResult: expectedResult
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
            operationSuccessful: true
          }
        }
      };
    case 'verifyAllSuccess':
      return {
        id,
        type: 'response',
        result: {
          success: true,
          data: {
            allOperationsSuccessful: true
          }
        }
      };
    case 'attemptInvalid':
      // Simulate an operation that fails gracefully
      return {
        id,
        type: 'response',
        result: {
          success: false,
          data: {
            error: "Invalid operation attempted",
            handledGracefully: true
          }
        }
      };
    case 'verifyErrorHandling':
      return {
        id,
        type: 'response',
        result: {
          success: true,
          data: {
            errorHandledProperly: true
          }
        }
      };
    case 'performMultipleOperations':
      // Mock handling of data table operations
      const operations = args[0] || [];
      logger.log(`Performing ${operations.length} operations`);
      return {
        id,
        type: 'response',
        result: {
          success: true,
          data: {
            operationsPerformed: operations.length,
            allCompleted: true
          }
        }
      };
    case 'verifyPerformance':
      return {
        id,
        type: 'response',
        result: {
          success: true,
          data: {
            performanceAcceptable: true,
            executionTime: '< 1000ms'
          }
        }
      };
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
            description: "Adds two numbers",
            action: "add",
            examples: ["add 2 and 3"],
            parameters: [
              {
                name: "num1",
                type: "number",
                description: "First number",
                required: true
              },
              {
                name: "num2",
                type: "number",
                description: "Second number",
                required: true
              }
            ]
          },
          {
            id: "wait-time",
            pattern: "wait for (\\d+) milliseconds?",
            description: "Waits for a specified time",
            action: "wait",
            examples: ["wait for 1000 milliseconds"],
            parameters: [
              {
                name: "duration",
                type: "number",
                description: "Duration in milliseconds",
                required: true
              }
            ]
          }
        ]
      }
    };
  }
  else if (type === 'actions') {
    return {
      id,
      type: 'response',
      result: {
        actions: manifest.actions
      }
    };
  }
  else {
    return sendErrorResponse(id, 400, `Unknown introspect type: ${type}`);
  }
}
