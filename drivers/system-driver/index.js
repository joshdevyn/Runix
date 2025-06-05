const WebSocket = require('ws');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Get port from environment variable (assigned by engine) or use default for standalone
const port = parseInt(process.env.RUNIX_DRIVER_PORT || '9002', 10);
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
      console.log(`${timestamp} [INFO] [index.js::SystemDriver::${caller}] ${message}${dataStr}`);
    },
    error: (message, data = {}) => {
      const caller = getCallerInfo();
      const timestamp = new Date().toISOString();
      const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      console.error(`${timestamp} [ERROR] [index.js::SystemDriver::${caller}] ${message}${dataStr}`);
    }
  };
}

const logger = createDriverLogger();

logger.log(`System Driver starting on port ${port}`);

// Process management
const activeProcesses = new Map();
let config = {
  workingDirectory: process.cwd(),
  allowedPaths: [process.cwd()], // Security: restrict file operations to allowed paths
  timeout: 30000
};

// Create HTTP server and WebSocket server
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('System Driver Running\n');
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
  logger.log(`System driver listening on 127.0.0.1:${port}`);
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
        await cleanup();
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
    return sendSuccessResponse(id, { initialized: true });
  } catch (err) {
    logger.error('Failed to initialize driver:', err);
    return sendErrorResponse(id, 500, `Initialization failed: ${err.message}`);
  }
}

// Security helper: validate file path
function validatePath(filePath) {
  const resolvedPath = path.resolve(filePath);
  const isAllowed = config.allowedPaths.some(allowedPath => 
    resolvedPath.startsWith(path.resolve(allowedPath))
  );
  if (!isAllowed) {
    throw new Error(`Access denied: Path ${filePath} is not in allowed directories`);
  }
  return resolvedPath;
}

// Handle execute requests
async function handleExecute(id, action, args) {
  logger.log(`Executing action: ${action}`, args);
  
  try {
    switch (action) {
      case 'createFile':
        const createPath = validatePath(args[0]);
        const createContent = args[1] || '';
        
        // Ensure directory exists
        await fs.mkdir(path.dirname(createPath), { recursive: true });
        await fs.writeFile(createPath, createContent, 'utf8');
        
        logger.log(`Created file: ${createPath}`);
        return sendSuccessResponse(id, { 
          path: createPath,
          size: createContent.length
        });

      case 'readFile':
        const readPath = validatePath(args[0]);
        const content = await fs.readFile(readPath, 'utf8');
        
        logger.log(`Read file: ${readPath}, size: ${content.length}`);
        return sendSuccessResponse(id, { 
          path: readPath,
          content: content,
          size: content.length
        });

      case 'writeFile':
        const writePath = validatePath(args[0]);
        const writeContent = args[1];
        
        await fs.writeFile(writePath, writeContent, 'utf8');
        
        logger.log(`Wrote file: ${writePath}`);
        return sendSuccessResponse(id, { 
          path: writePath,
          size: writeContent.length
        });

      case 'deleteFile':
        const deletePath = validatePath(args[0]);
        await fs.unlink(deletePath);
        
        logger.log(`Deleted file: ${deletePath}`);
        return sendSuccessResponse(id, { 
          path: deletePath,
          deleted: true
        });

      case 'executeCommand':
        const command = args[0];
        const options = args[1] || {};
        
        logger.log(`Executing command: ${command}`);
        
        const { stdout, stderr } = await execAsync(command, {
          cwd: config.workingDirectory,
          timeout: config.timeout,
          ...options
        });
        
        return sendSuccessResponse(id, { 
          command: command,
          stdout: stdout,
          stderr: stderr,
          exitCode: 0
        });

      case 'startProcess':
        const processCommand = args[0];
        const processArgs = args[1] || [];
        const processOptions = args[2] || {};
        
        const child = spawn(processCommand, processArgs, {
          cwd: config.workingDirectory,
          ...processOptions
        });
        
        const processId = `${child.pid}-${Date.now()}`;
        activeProcesses.set(processId, child);
        
        logger.log(`Started process: ${processCommand}`, { pid: child.pid, processId });
        
        return sendSuccessResponse(id, { 
          processId: processId,
          pid: child.pid,
          command: processCommand,
          args: processArgs
        });

      case 'killProcess':
        const killProcessId = args[0];
        const signal = args[1] || 'SIGTERM';
        
        const process = activeProcesses.get(killProcessId);
        if (!process) {
          return sendErrorResponse(id, 404, `Process not found: ${killProcessId}`);
        }
        
        process.kill(signal);
        activeProcesses.delete(killProcessId);
        
        logger.log(`Killed process: ${killProcessId}`, { signal });
        
        return sendSuccessResponse(id, { 
          processId: killProcessId,
          killed: true,
          signal: signal
        });

      case 'listProcesses':
        const processes = Array.from(activeProcesses.entries()).map(([id, proc]) => ({
          processId: id,
          pid: proc.pid,
          killed: proc.killed || false
        }));
        
        return sendSuccessResponse(id, { 
          processes: processes,
          count: processes.length
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
            id: "create-file",
            pattern: "create file \"(.*)\" with content \"(.*)\"",
            description: "Creates a new file with specified content",
            action: "createFile",
            examples: ["create file \"test.txt\" with content \"Hello World\""],
            parameters: [
              { name: "path", type: "string", description: "File path", required: true },
              { name: "content", type: "string", description: "File content", required: false }
            ]
          },
          {
            id: "read-file",
            pattern: "read file \"(.*)\"",
            description: "Reads content from a file",
            action: "readFile",
            examples: ["read file \"test.txt\""],
            parameters: [
              { name: "path", type: "string", description: "File path", required: true }
            ]
          },
          {
            id: "write-file",
            pattern: "write \"(.*)\" to file \"(.*)\"",
            description: "Writes content to a file",
            action: "writeFile",
            examples: ["write \"Hello World\" to file \"test.txt\""],
            parameters: [
              { name: "content", type: "string", description: "Content to write", required: true },
              { name: "path", type: "string", description: "File path", required: true }
            ]
          },
          {
            id: "delete-file",
            pattern: "delete file \"(.*)\"",
            description: "Deletes a file",
            action: "deleteFile",
            examples: ["delete file \"test.txt\""],
            parameters: [
              { name: "path", type: "string", description: "File path", required: true }
            ]
          },
          {
            id: "execute-command",
            pattern: "execute command \"(.*)\"",
            description: "Executes a system command",
            action: "executeCommand",
            examples: ["execute command \"ls -la\""],
            parameters: [
              { name: "command", type: "string", description: "Command to execute", required: true }
            ]
          },
          {
            id: "start-process",
            pattern: "start process \"(.*)\"",
            description: "Starts a new process",
            action: "startProcess",
            examples: ["start process \"node server.js\""],
            parameters: [
              { name: "command", type: "string", description: "Command to start", required: true }
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
          name: 'SystemDriver',
          version: '1.0.0',
          description: 'System-level operations driver',
          author: 'Runix Team',
          supportedActions: ['createFile', 'readFile', 'writeFile', 'deleteFile', 'executeCommand', 'startProcess', 'killProcess'],
          features: ['execute', 'introspection']
        }
      }
    };
  }
}

// Cleanup function
async function cleanup() {
  try {
    // Kill all active processes
    for (const [processId, process] of activeProcesses) {
      if (!process.killed) {
        logger.log(`Cleaning up process: ${processId}`);
        process.kill('SIGTERM');
      }
    }
    activeProcesses.clear();
    logger.log('System driver cleanup completed');
  } catch (err) {
    logger.error('Error during cleanup:', err);
  }
}

// Handle process termination
process.on('SIGTERM', async () => {
  logger.log('Received SIGTERM, shutting down gracefully');
  await cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.log('Received SIGINT, shutting down gracefully');
  await cleanup();
  process.exit(0);
});
