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

// Try to load system automation libraries
let robot = null;
let screenshot = null;
try {
  robot = require('robotjs');
  screenshot = require('screenshot-desktop');
  console.log('[SystemDriver] UI automation libraries loaded successfully');
} catch (err) {
  console.log('[SystemDriver] UI automation libraries not available, using mock implementation');
}

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
  timeout: 30000,
  screenshotDir: './screenshots',
  uiAutomation: {
    mouseMoveDelay: 100,
    clickDelay: 50,
    typeDelay: 10,
    doubleClickSpeed: 300
  }
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

      // UI Automation Actions
      case 'takeScreenshot':
        return await handleTakeScreenshot(id, args);

      case 'clickAt':
        return await handleClickAt(id, args);

      case 'doubleClickAt':
        return await handleDoubleClickAt(id, args);

      case 'rightClickAt':
        return await handleRightClickAt(id, args);

      case 'typeText':
        return await handleTypeText(id, args);

      case 'pressKey':
        return await handlePressKey(id, args);

      case 'moveMouse':
        return await handleMoveMouse(id, args);

      case 'drag':
        return await handleDrag(id, args);

      case 'scroll':
        return await handleScroll(id, args);

      case 'getMousePosition':
        return await handleGetMousePosition(id, args);

      case 'getScreenSize':
        return await handleGetScreenSize(id, args);

      case 'captureRegion':
        return await handleCaptureRegion(id, args);

      case 'findColorAt':
        return await handleFindColorAt(id, args);

      case 'waitForColor':
        return await handleWaitForColor(id, args);

      default:
        return sendErrorResponse(id, 400, `Unknown action: ${action}`);
    }
  } catch (err) {
    logger.error(`Error executing action ${action}:`, err);
    return sendErrorResponse(id, 500, err.message);
  }
}

// UI Automation Implementation
async function handleTakeScreenshot(id, args) {
  const filename = args[0] || `screenshot-${Date.now()}.png`;
  const filepath = path.join(config.screenshotDir, filename);

  if (screenshot) {
    try {
      const imageBuffer = await screenshot();
      await fs.mkdir(config.screenshotDir, { recursive: true });
      await fs.writeFile(filepath, imageBuffer);
      
      // Convert to base64 for AI processing
      const base64 = imageBuffer.toString('base64');
      
      logger.log(`Screenshot saved: ${filepath}`);
      return sendSuccessResponse(id, {
        filename: filename,
        path: filepath,
        base64: base64,
        size: imageBuffer.length
      });
    } catch (err) {
      throw new Error(`Screenshot failed: ${err.message}`);
    }
  } else {
    // Mock implementation
    logger.log('Using mock screenshot implementation');
    const mockBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    return sendSuccessResponse(id, {
      filename: filename,
      path: filepath,
      base64: mockBase64,
      mock: true
    });
  }
}

async function handleClickAt(id, args) {
  const x = parseInt(args[0]);
  const y = parseInt(args[1]);
  const button = args[2] || 'left';

  if (robot) {
    await new Promise(resolve => setTimeout(resolve, config.uiAutomation.mouseMoveDelay));
    robot.moveMouse(x, y);
    await new Promise(resolve => setTimeout(resolve, config.uiAutomation.clickDelay));
    robot.mouseClick(button);
    
    logger.log(`Clicked at (${x}, ${y}) with ${button} button`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      button: button,
      action: 'clicked'
    });
  } else {
    logger.log(`Mock click at (${x}, ${y}) with ${button} button`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      button: button,
      action: 'clicked',
      mock: true
    });
  }
}

async function handleDoubleClickAt(id, args) {
  const x = parseInt(args[0]);
  const y = parseInt(args[1]);

  if (robot) {
    await new Promise(resolve => setTimeout(resolve, config.uiAutomation.mouseMoveDelay));
    robot.moveMouse(x, y);
    await new Promise(resolve => setTimeout(resolve, config.uiAutomation.clickDelay));
    robot.mouseClick('left', true); // double click
    
    logger.log(`Double-clicked at (${x}, ${y})`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      action: 'double-clicked'
    });
  } else {
    logger.log(`Mock double-click at (${x}, ${y})`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      action: 'double-clicked',
      mock: true
    });
  }
}

async function handleRightClickAt(id, args) {
  const x = parseInt(args[0]);
  const y = parseInt(args[1]);

  if (robot) {
    await new Promise(resolve => setTimeout(resolve, config.uiAutomation.mouseMoveDelay));
    robot.moveMouse(x, y);
    await new Promise(resolve => setTimeout(resolve, config.uiAutomation.clickDelay));
    robot.mouseClick('right');
    
    logger.log(`Right-clicked at (${x}, ${y})`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      action: 'right-clicked'
    });
  } else {
    logger.log(`Mock right-click at (${x}, ${y})`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      action: 'right-clicked',
      mock: true
    });
  }
}

async function handleTypeText(id, args) {
  const text = args[0];
  const delay = parseInt(args[1]) || config.uiAutomation.typeDelay;

  if (robot) {
    robot.typeStringDelayed(text, delay);
    
    logger.log(`Typed text: "${text}" with delay ${delay}ms`);
    return sendSuccessResponse(id, {
      text: text,
      delay: delay,
      action: 'typed'
    });
  } else {
    logger.log(`Mock type text: "${text}"`);
    return sendSuccessResponse(id, {
      text: text,
      delay: delay,
      action: 'typed',
      mock: true
    });
  }
}

async function handlePressKey(id, args) {
  const key = args[0];
  const modifiers = args[1] || [];

  if (robot) {
    if (modifiers.length > 0) {
      robot.keyTap(key, modifiers);
    } else {
      robot.keyTap(key);
    }
    
    logger.log(`Pressed key: ${key}${modifiers.length ? ' with modifiers: ' + modifiers.join('+') : ''}`);
    return sendSuccessResponse(id, {
      key: key,
      modifiers: modifiers,
      action: 'key-pressed'
    });
  } else {
    logger.log(`Mock key press: ${key}`);
    return sendSuccessResponse(id, {
      key: key,
      modifiers: modifiers,
      action: 'key-pressed',
      mock: true
    });
  }
}

async function handleMoveMouse(id, args) {
  const x = parseInt(args[0]);
  const y = parseInt(args[1]);

  if (robot) {
    robot.moveMouse(x, y);
    
    logger.log(`Moved mouse to (${x}, ${y})`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      action: 'mouse-moved'
    });
  } else {
    logger.log(`Mock move mouse to (${x}, ${y})`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      action: 'mouse-moved',
      mock: true
    });
  }
}

async function handleDrag(id, args) {
  const startX = parseInt(args[0]);
  const startY = parseInt(args[1]);
  const endX = parseInt(args[2]);
  const endY = parseInt(args[3]);

  if (robot) {
    robot.moveMouse(startX, startY);
    await new Promise(resolve => setTimeout(resolve, config.uiAutomation.clickDelay));
    robot.mouseToggle('down');
    robot.dragMouse(endX, endY);
    robot.mouseToggle('up');
    
    logger.log(`Dragged from (${startX}, ${startY}) to (${endX}, ${endY})`);
    return sendSuccessResponse(id, {
      startX: startX,
      startY: startY,
      endX: endX,
      endY: endY,
      action: 'dragged'
    });
  } else {
    logger.log(`Mock drag from (${startX}, ${startY}) to (${endX}, ${endY})`);
    return sendSuccessResponse(id, {
      startX: startX,
      startY: startY,
      endX: endX,
      endY: endY,
      action: 'dragged',
      mock: true
    });
  }
}

async function handleScroll(id, args) {
  const x = parseInt(args[0]);
  const y = parseInt(args[1]);
  const scrollX = parseInt(args[2]) || 0;
  const scrollY = parseInt(args[3]) || -3; // Default scroll up

  if (robot) {
    robot.moveMouse(x, y);
    await new Promise(resolve => setTimeout(resolve, config.uiAutomation.clickDelay));
    robot.scrollMouse(scrollX, scrollY);
    
    logger.log(`Scrolled at (${x}, ${y}) by (${scrollX}, ${scrollY})`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      scrollX: scrollX,
      scrollY: scrollY,
      action: 'scrolled'
    });
  } else {
    logger.log(`Mock scroll at (${x}, ${y}) by (${scrollX}, ${scrollY})`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      scrollX: scrollX,
      scrollY: scrollY,
      action: 'scrolled',
      mock: true
    });
  }
}

async function handleGetMousePosition(id, args) {
  if (robot) {
    const mouse = robot.getMousePos();
    
    logger.log(`Current mouse position: (${mouse.x}, ${mouse.y})`);
    return sendSuccessResponse(id, {
      x: mouse.x,
      y: mouse.y
    });
  } else {
    logger.log('Mock mouse position: (500, 300)');
    return sendSuccessResponse(id, {
      x: 500,
      y: 300,
      mock: true
    });
  }
}

async function handleGetScreenSize(id, args) {
  if (robot) {
    const screenSize = robot.getScreenSize();
    
    logger.log(`Screen size: ${screenSize.width}x${screenSize.height}`);
    return sendSuccessResponse(id, {
      width: screenSize.width,
      height: screenSize.height
    });
  } else {
    logger.log('Mock screen size: 1920x1080');
    return sendSuccessResponse(id, {
      width: 1920,
      height: 1080,
      mock: true
    });
  }
}

async function handleCaptureRegion(id, args) {
  const x = parseInt(args[0]);
  const y = parseInt(args[1]);
  const width = parseInt(args[2]);
  const height = parseInt(args[3]);
  const filename = args[4] || `region-${Date.now()}.png`;

  if (robot) {
    const bitmap = robot.screen.capture(x, y, width, height);
    const filepath = path.join(config.screenshotDir, filename);
    
    await fs.mkdir(config.screenshotDir, { recursive: true });
    
    // Convert bitmap to PNG buffer (simplified - would need image library in real implementation)
    const imageBuffer = Buffer.from(bitmap.image, 'binary');
    await fs.writeFile(filepath, imageBuffer);
    
    logger.log(`Captured region (${x}, ${y}, ${width}, ${height}) to ${filepath}`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      width: width,
      height: height,
      filename: filename,
      path: filepath
    });
  } else {
    logger.log(`Mock capture region (${x}, ${y}, ${width}, ${height})`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      width: width,
      height: height,
      filename: filename,
      mock: true
    });
  }
}

async function handleFindColorAt(id, args) {
  const x = parseInt(args[0]);
  const y = parseInt(args[1]);

  if (robot) {
    const color = robot.getPixelColor(x, y);
    
    logger.log(`Color at (${x}, ${y}): ${color}`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      color: color,
      hex: color
    });
  } else {
    logger.log(`Mock color at (${x}, ${y}): ffffff`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      color: 'ffffff',
      hex: 'ffffff',
      mock: true
    });
  }
}

async function handleWaitForColor(id, args) {
  const x = parseInt(args[0]);
  const y = parseInt(args[1]);
  const expectedColor = args[2];
  const timeout = parseInt(args[3]) || 5000;
  const interval = parseInt(args[4]) || 100;

  if (robot) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const currentColor = robot.getPixelColor(x, y);
      if (currentColor.toLowerCase() === expectedColor.toLowerCase()) {
        logger.log(`Found expected color ${expectedColor} at (${x}, ${y})`);
        return sendSuccessResponse(id, {
          x: x,
          y: y,
          expectedColor: expectedColor,
          foundColor: currentColor,
          found: true,
          waitTime: Date.now() - startTime
        });
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    logger.log(`Timeout waiting for color ${expectedColor} at (${x}, ${y})`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      expectedColor: expectedColor,
      found: false,
      timeout: true,
      waitTime: timeout
    });
  } else {
    logger.log(`Mock wait for color ${expectedColor} at (${x}, ${y})`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      expectedColor: expectedColor,
      found: true,
      mock: true
    });
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
          },
          {
            id: "take-screenshot",
            pattern: "take a screenshot \"(.*)\"",
            description: "Takes a screenshot of the entire screen",
            action: "takeScreenshot",
            examples: ["take a screenshot \"desktop.png\""],
            parameters: [
              { name: "filename", type: "string", description: "Screenshot filename", required: false }
            ]
          },
          {
            id: "click-at-coordinates",
            pattern: "click at coordinates (\\d+), (\\d+)",
            description: "Clicks at specific screen coordinates",
            action: "clickAt",
            examples: ["click at coordinates 500, 300"],
            parameters: [
              { name: "x", type: "number", description: "X coordinate", required: true },
              { name: "y", type: "number", description: "Y coordinate", required: true },
              { name: "button", type: "string", description: "Mouse button (left/right/middle)", required: false }
            ]
          },
          {
            id: "double-click-at-coordinates",
            pattern: "double click at coordinates (\\d+), (\\d+)",
            description: "Double-clicks at specific screen coordinates",
            action: "doubleClickAt",
            examples: ["double click at coordinates 500, 300"],
            parameters: [
              { name: "x", type: "number", description: "X coordinate", required: true },
              { name: "y", type: "number", description: "Y coordinate", required: true }
            ]
          },
          {
            id: "right-click-at-coordinates",
            pattern: "right click at coordinates (\\d+), (\\d+)",
            description: "Right-clicks at specific screen coordinates",
            action: "rightClickAt",
            examples: ["right click at coordinates 500, 300"],
            parameters: [
              { name: "x", type: "number", description: "X coordinate", required: true },
              { name: "y", type: "number", description: "Y coordinate", required: true }
            ]
          },
          {
            id: "type-text",
            pattern: "type text \"(.*)\"",
            description: "Types text at current cursor position",
            action: "typeText",
            examples: ["type text \"Hello World\""],
            parameters: [
              { name: "text", type: "string", description: "Text to type", required: true },
              { name: "delay", type: "number", description: "Delay between characters in ms", required: false }
            ]
          },
          {
            id: "press-key",
            pattern: "press key \"(.*)\"",
            description: "Presses a keyboard key",
            action: "pressKey",
            examples: ["press key \"enter\"", "press key \"a\" with modifiers [\"ctrl\"]"],
            parameters: [
              { name: "key", type: "string", description: "Key to press", required: true },
              { name: "modifiers", type: "array", description: "Modifier keys (ctrl, alt, shift)", required: false }
            ]
          },
          {
            id: "move-mouse",
            pattern: "move mouse to coordinates (\\d+), (\\d+)",
            description: "Moves mouse cursor to specific coordinates",
            action: "moveMouse",
            examples: ["move mouse to coordinates 500, 300"],
            parameters: [
              { name: "x", type: "number", description: "X coordinate", required: true },
              { name: "y", type: "number", description: "Y coordinate", required: true }
            ]
          },
          {
            id: "drag-from-to",
            pattern: "drag from coordinates (\\d+), (\\d+) to (\\d+), (\\d+)",
            description: "Drags from one coordinate to another",
            action: "drag",
            examples: ["drag from coordinates 100, 100 to 200, 200"],
            parameters: [
              { name: "startX", type: "number", description: "Start X coordinate", required: true },
              { name: "startY", type: "number", description: "Start Y coordinate", required: true },
              { name: "endX", type: "number", description: "End X coordinate", required: true },
              { name: "endY", type: "number", description: "End Y coordinate", required: true }
            ]
          },
          {
            id: "scroll-at-coordinates",
            pattern: "scroll at coordinates (\\d+), (\\d+) by ([-]?\\d+), ([-]?\\d+)",
            description: "Scrolls at specific coordinates",
            action: "scroll",
            examples: ["scroll at coordinates 500, 300 by 0, -3"],
            parameters: [
              { name: "x", type: "number", description: "X coordinate", required: true },
              { name: "y", type: "number", description: "Y coordinate", required: true },
              { name: "scrollX", type: "number", description: "Horizontal scroll amount", required: false },
              { name: "scrollY", type: "number", description: "Vertical scroll amount", required: false }
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
          version: '2.0.0',
          description: 'Enhanced system driver with UI automation capabilities',
          author: 'Runix Team',
          supportedActions: [
            'createFile', 'readFile', 'writeFile', 'deleteFile', 'executeCommand', 'startProcess', 'killProcess',
            'takeScreenshot', 'clickAt', 'doubleClickAt', 'rightClickAt', 'typeText', 'pressKey', 'moveMouse',
            'drag', 'scroll', 'getMousePosition', 'getScreenSize', 'captureRegion', 'findColorAt', 'waitForColor'
          ],
          features: ['execute', 'introspection', 'ui-automation']
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
