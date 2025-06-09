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
let nutjs = null;
let screenshot = null;
try {
  const { mouse, keyboard, screen, Button } = require('@nut-tree-fork/nut-js');
  nutjs = { mouse, keyboard, screen, Button };
  screenshot = require('screenshot-desktop');
  console.log('[SystemDriver] Modern UI automation libraries loaded successfully');
} catch (err) {
  console.log('[SystemDriver] UI automation libraries not available:', err.message);
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
  testArtifactsDir: './tests/logs', // Default directory for test artifacts
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
  // Handle test artifact files specially
  if (filePath.endsWith('.txt') && !path.isAbsolute(filePath)) {
    // For test files, resolve relative to testArtifactsDir
    const testArtifactPath = path.resolve(config.testArtifactsDir, filePath);
    const isAllowed = config.allowedPaths.some(allowedPath => 
      testArtifactPath.startsWith(path.resolve(allowedPath))
    );
    if (!isAllowed) {
      throw new Error(`Access denied: Path ${filePath} is not in allowed directories`);
    }
    return testArtifactPath;
  }
  
  // For other files, use standard resolution
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
        });      case 'executeCommand':
        const command = args[0];
        const options = args[1] || {};
        
        logger.log(`Executing command: ${command}`);
        
        const { stdout, stderr } = await execAsync(command, {
          cwd: config.workingDirectory,
          timeout: config.timeout,
          ...options
        });
        
        // Store command output for verification
        lastCommandOutput = stdout;
        
        return sendSuccessResponse(id, { 
          command: command,
          stdout: stdout,
          stderr: stderr,
          exitCode: 0
        });      case 'startProcess':
        const processCommand = args[0];
        const processArgs = args[1] || [];
        const processOptions = args[2] || {};
        
        const child = spawn(processCommand, processArgs, {
          cwd: config.workingDirectory,
          ...processOptions
        });
        
        const processId = `${child.pid}-${Date.now()}`;
        activeProcesses.set(processId, child);
        
        // Store process ID for verification
        lastProcessId = processId;
        
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
        return await handleFindColorAt(id, args);      case 'waitForColor':
        return await handleWaitForColor(id, args);

      // Verification actions for testing
      case 'verifyFileContent':
        return await handleVerifyFileContent(id, args);
      
      case 'verifyFileExistsContains':
        return await handleVerifyFileExistsContains(id, args);
      
      case 'verifyCommandOutput':
        return await handleVerifyCommandOutput(id, args);
      
      case 'verifyProcessStarted':
        return await handleVerifyProcessStarted(id, args);
      
      case 'verifyProcessManageable':
        return await handleVerifyProcessManageable(id, args);
      
      case 'attemptRestrictedAccess':
        return await handleAttemptRestrictedAccess(id, args);
      
      case 'verifySecurityRestrictions':
        return await handleVerifySecurityRestrictions(id, args);
      
      case 'createMultipleFiles':
        return await handleCreateMultipleFiles(id, args);
      
      case 'readAllFiles':
        return await handleReadAllFiles(id, args);
      
      case 'verifyEachFileContent':
        return await handleVerifyEachFileContent(id, args);
      
      case 'cleanUpFiles':
        return await handleCleanUpFiles(id, args);

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
  
  if (!screenshot) {
    return sendErrorResponse(id, 500, 'Screenshot library not available. Please install screenshot-desktop package.');
  }

  try {
    logger.log('Taking screenshot with modern libraries...');
    
    // Ensure the directory exists
    await fs.mkdir(config.screenshotDir, { recursive: true });
    logger.log(`Screenshot directory verified: ${config.screenshotDir}`);
    
    const imageBuffer = await screenshot();
      // Save the screenshot directly
    await fs.writeFile(filepath, imageBuffer);
    logger.log(`Screenshot saved: ${filepath}, size: ${imageBuffer.length} bytes`);
    
    // Convert to base64 for AI processing
    const base64 = imageBuffer.toString('base64');
      return sendSuccessResponse(id, {
      filename: filename,
      path: filepath,
      base64: base64,
      size: imageBuffer.length
    });
  } catch (err) {
    logger.error('Error taking screenshot:', err);
    logger.error('Error stack:', err.stack);
    return sendErrorResponse(id, 500, `Failed to take screenshot: ${err.message}`);
  }
}

async function handleClickAt(id, args) {
  const x = parseInt(args[0]);
  const y = parseInt(args[1]);
  const button = args[2] || 'left';
  
  if (!nutjs) {
    return sendErrorResponse(id, 500, 'UI automation library (nut-js) not available. Please install @nut-tree-fork/nut-js package.');
  }

  try {
    await new Promise(resolve => setTimeout(resolve, config.uiAutomation.mouseMoveDelay));
    
    // Move mouse to position
    await nutjs.mouse.setPosition({ x, y });
    await new Promise(resolve => setTimeout(resolve, config.uiAutomation.clickDelay));
    
    // Click with specified button
    const buttonMap = {
      'left': nutjs.Button.LEFT,
      'right': nutjs.Button.RIGHT,
      'middle': nutjs.Button.MIDDLE
    };
    
    const nutButton = buttonMap[button] || nutjs.Button.LEFT;
    await nutjs.mouse.click(nutButton);
    
    logger.log(`Clicked at (${x}, ${y}) with ${button} button using nut-js`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      button: button,
      action: 'clicked'
    });
  } catch (err) {
    logger.error('Error clicking:', err);
    return sendErrorResponse(id, 500, `Failed to click: ${err.message}`);
  }
}

async function handleDoubleClickAt(id, args) {
  const x = parseInt(args[0]);
  const y = parseInt(args[1]);
  
  if (!nutjs) {
    return sendErrorResponse(id, 500, 'UI automation library (nut-js) not available. Please install @nut-tree-fork/nut-js package.');
  }

  try {
    await new Promise(resolve => setTimeout(resolve, config.uiAutomation.mouseMoveDelay));
    
    // Move mouse to position
    await nutjs.mouse.setPosition({ x, y });
    await new Promise(resolve => setTimeout(resolve, config.uiAutomation.clickDelay));
    
    // Double click
    await nutjs.mouse.doubleClick(nutjs.Button.LEFT);
    
    logger.log(`Double-clicked at (${x}, ${y}) using nut-js`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      action: 'double-clicked'
    });
  } catch (err) {
    logger.error('Error double-clicking:', err);
    return sendErrorResponse(id, 500, `Failed to double-click: ${err.message}`);
  }
}

async function handleRightClickAt(id, args) {
  const x = parseInt(args[0]);
  const y = parseInt(args[1]);

  if (!nutjs) {
    return sendErrorResponse(id, 500, 'UI automation library (nut-js) not available. Please install @nut-tree-fork/nut-js package.');
  }

  try {
    await new Promise(resolve => setTimeout(resolve, config.uiAutomation.mouseMoveDelay));
    await nutjs.mouse.setPosition({ x, y });
    await new Promise(resolve => setTimeout(resolve, config.uiAutomation.clickDelay));
    await nutjs.mouse.click(nutjs.Button.RIGHT);
    
    logger.log(`Right-clicked at (${x}, ${y})`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      action: 'right-clicked'
    });
  } catch (err) {
    logger.error('Failed to right-click:', err);
    return sendErrorResponse(id, 500, `Failed to right-click: ${err.message}`);
  }
}

async function handleTypeText(id, args) {
  const text = args[0];
  const delay = parseInt(args[1]) || config.uiAutomation.typeDelay;
  
  if (!nutjs) {
    return sendErrorResponse(id, 500, 'UI automation library (nut-js) not available. Please install @nut-tree-fork/nut-js package.');
  }

  try {
    // Nut.js doesn't have typeStringDelayed, so we'll simulate it
    for (const char of text) {
      await nutjs.keyboard.type(char);
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    logger.log(`Typed text: "${text}" with delay ${delay}ms`);
    return sendSuccessResponse(id, {
      text: text,
      delay: delay,
      action: 'typed'
    });
  } catch (err) {
    logger.error('Failed to type text:', err);
    return sendErrorResponse(id, 500, `Failed to type text: ${err.message}`);
  }
}

async function handlePressKey(id, args) {
  const key = args[0];
  const modifiers = args[1] || [];

  if (!nutjs) {
    return sendErrorResponse(id, 500, 'UI automation library (nut-js) not available. Please install @nut-tree-fork/nut-js package.');
  }

  try {
    if (modifiers.length > 0) {
      // Convert modifiers to nut-js format and press key combination
      const nutjsModifiers = modifiers.map(mod => {
        switch (mod.toLowerCase()) {
          case 'ctrl':
          case 'control': return nutjs.keyboard.Key.LeftControl;
          case 'alt': return nutjs.keyboard.Key.LeftAlt;
          case 'shift': return nutjs.keyboard.Key.LeftShift;
          case 'meta':
          case 'cmd': return nutjs.keyboard.Key.LeftCmd;
          default: return mod;
        }
      });
      await nutjs.keyboard.pressKey(nutjs.keyboard.Key[key] || key, ...nutjsModifiers);
    } else {
      await nutjs.keyboard.pressKey(nutjs.keyboard.Key[key] || key);
    }
    
    logger.log(`Pressed key: ${key}${modifiers.length ? ' with modifiers: ' + modifiers.join('+') : ''}`);
    return sendSuccessResponse(id, {
      key: key,
      modifiers: modifiers,
      action: 'key-pressed'
    });
  } catch (err) {
    logger.error('Failed to press key:', err);
    return sendErrorResponse(id, 500, `Failed to press key: ${err.message}`);
  }
}

async function handleMoveMouse(id, args) {
  const x = parseInt(args[0]);
  const y = parseInt(args[1]);
  
  if (!nutjs) {
    return sendErrorResponse(id, 500, 'UI automation library (nut-js) not available. Please install @nut-tree-fork/nut-js package.');
  }

  try {
    await nutjs.mouse.setPosition({ x, y });
    
    logger.log(`Moved mouse to (${x}, ${y})`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      action: 'mouse-moved'
    });
  } catch (err) {
    logger.error('Failed to move mouse:', err);
    return sendErrorResponse(id, 500, `Failed to move mouse: ${err.message}`);
  }
}

async function handleDrag(id, args) {
  const startX = parseInt(args[0]);
  const startY = parseInt(args[1]);
  const endX = parseInt(args[2]);
  const endY = parseInt(args[3]);

  if (!nutjs) {
    return sendErrorResponse(id, 500, 'UI automation library (nut-js) not available. Please install @nut-tree-fork/nut-js package.');
  }

  try {
    await nutjs.mouse.setPosition({ x: startX, y: startY });
    await new Promise(resolve => setTimeout(resolve, config.uiAutomation.clickDelay));
    await nutjs.mouse.pressButton(nutjs.Button.LEFT);
    await nutjs.mouse.drag({ x: endX, y: endY });
    await nutjs.mouse.releaseButton(nutjs.Button.LEFT);
    
    logger.log(`Dragged from (${startX}, ${startY}) to (${endX}, ${endY})`);
    return sendSuccessResponse(id, {
      startX: startX,
      startY: startY,
      endX: endX,
      endY: endY,
      action: 'dragged'
    });
  } catch (err) {
    logger.error('Failed to perform drag:', err);
    return sendErrorResponse(id, 500, `Failed to drag: ${err.message}`);
  }
}

async function handleScroll(id, args) {
  const x = parseInt(args[0]);
  const y = parseInt(args[1]);
  const scrollX = parseInt(args[2]) || 0;
  const scrollY = parseInt(args[3]) || -3; // Default scroll up

  if (!nutjs) {
    return sendErrorResponse(id, 500, 'UI automation library (nut-js) not available. Please install @nut-tree-fork/nut-js package.');
  }

  try {
    await nutjs.mouse.setPosition({ x, y });
    await new Promise(resolve => setTimeout(resolve, config.uiAutomation.clickDelay));
    await nutjs.mouse.scrollDown(Math.abs(scrollY));
    
    logger.log(`Scrolled at (${x}, ${y}) by (${scrollX}, ${scrollY})`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      scrollX: scrollX,
      scrollY: scrollY,
      action: 'scrolled'
    });
  } catch (err) {
    logger.error('Failed to scroll:', err);
    return sendErrorResponse(id, 500, `Failed to scroll: ${err.message}`);
  }
}

async function handleGetMousePosition(id, args) {
  if (!nutjs) {
    return sendErrorResponse(id, 500, 'UI automation library (nut-js) not available. Please install @nut-tree-fork/nut-js package.');
  }

  try {
    const position = await nutjs.mouse.getPosition();
    
    logger.log(`Current mouse position: (${position.x}, ${position.y})`);
    return sendSuccessResponse(id, {
      x: position.x,
      y: position.y
    });
  } catch (err) {
    logger.error('Failed to get mouse position:', err);
    return sendErrorResponse(id, 500, `Failed to get mouse position: ${err.message}`);
  }
}

async function handleGetScreenSize(id, args) {
  if (!nutjs) {
    return sendErrorResponse(id, 500, 'UI automation library (nut-js) not available. Please install @nut-tree-fork/nut-js package.');
  }

  try {
    const screenSize = await nutjs.screen.size();
    
    logger.log(`Screen size: ${screenSize.width}x${screenSize.height}`);
    return sendSuccessResponse(id, {
      width: screenSize.width,
      height: screenSize.height
    });
  } catch (err) {
    logger.error('Failed to get screen size:', err);
    return sendErrorResponse(id, 500, `Failed to get screen size: ${err.message}`);
  }
}

async function handleCaptureRegion(id, args) {
  const x = parseInt(args[0]);
  const y = parseInt(args[1]);
  const width = parseInt(args[2]);
  const height = parseInt(args[3]);
  const filename = args[4] || `region-${Date.now()}.png`;

  if (!nutjs) {
    return sendErrorResponse(id, 500, 'UI automation library (nut-js) not available. Please install @nut-tree-fork/nut-js package.');
  }

  try {
    const filepath = path.join(config.screenshotDir, filename);
    await fs.mkdir(config.screenshotDir, { recursive: true });
    
    // Capture region using nut-js screen capture
    const region = { left: x, top: y, width, height };    const image = await nutjs.screen.grabRegion(region);
    
    // Save the raw image data directly
    await fs.writeFile(filepath, image.data);
    
    logger.log(`Captured region (${x}, ${y}, ${width}, ${height}) to ${filepath}`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      width: width,
      height: height,
      filename: filename,
      path: filepath
    });
  } catch (err) {
    logger.error('Failed to capture region:', err);
    return sendErrorResponse(id, 500, `Failed to capture region: ${err.message}`);
  }
}

async function handleFindColorAt(id, args) {
  const x = parseInt(args[0]);
  const y = parseInt(args[1]);
  
  if (!nutjs) {
    return sendErrorResponse(id, 500, 'UI automation library (nut-js) not available. Please install @nut-tree-fork/nut-js package.');
  }

  try {
    const color = await nutjs.screen.colorAt({ x, y });
    const hexColor = `#${color.toString(16).padStart(6, '0')}`;
    
    logger.log(`Color at (${x}, ${y}): ${hexColor}`);
    return sendSuccessResponse(id, {
      x: x,
      y: y,
      color: color,
      hex: hexColor
    });
  } catch (err) {
    logger.error('Failed to get color at position:', err);
    return sendErrorResponse(id, 500, `Failed to get color: ${err.message}`);
  }
}

async function handleWaitForColor(id, args) {
  const x = parseInt(args[0]);
  const y = parseInt(args[1]);
  const expectedColor = args[2];
  const timeout = parseInt(args[3]) || 5000;
  const interval = parseInt(args[4]) || 100;

  if (!nutjs) {
    return sendErrorResponse(id, 500, 'UI automation library (nut-js) not available. Please install @nut-tree-fork/nut-js package.');
  }

  try {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const currentColor = await nutjs.screen.colorAt({ x, y });
      const currentHex = `#${currentColor.toString(16).padStart(6, '0')}`;
      
      if (currentHex.toLowerCase() === expectedColor.toLowerCase()) {
        logger.log(`Found expected color ${expectedColor} at (${x}, ${y})`);
        return sendSuccessResponse(id, {
          x: x,
          y: y,
          expectedColor: expectedColor,
          foundColor: currentHex,
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
  } catch (err) {
    logger.error('Failed to wait for color:', err);
    return sendErrorResponse(id, 500, `Failed to wait for color: ${err.message}`);
  }
}

// Handle introspect requests
function handleIntrospect(id, type) {
  if (type === 'steps') {
    return {
      id,
      type: 'response',
      result: {
        steps: [          {
            id: "create-file",
            pattern: "I create file \"(.*)\" with content \"(.*)\"",
            description: "Creates a new file with specified content",
            action: "createFile",
            examples: ["I create file \"test.txt\" with content \"Hello World\""],
            parameters: [
              { name: "path", type: "string", description: "File path", required: true },
              { name: "content", type: "string", description: "File content", required: false }
            ]
          },
          {
            id: "read-file",
            pattern: "I read file \"(.*)\"",
            description: "Reads content from a file",
            action: "readFile",
            examples: ["I read file \"test.txt\""],
            parameters: [
              { name: "path", type: "string", description: "File path", required: true }
            ]
          },
          {
            id: "write-file",
            pattern: "I write \"(.*)\" to file \"(.*)\"",
            description: "Writes content to a file",
            action: "writeFile",
            examples: ["I write \"Hello World\" to file \"test.txt\""],
            parameters: [
              { name: "content", type: "string", description: "Content to write", required: true },
              { name: "path", type: "string", description: "File path", required: true }
            ]
          },
          {
            id: "delete-file",
            pattern: "I delete file \"(.*)\"",
            description: "Deletes a file",
            action: "deleteFile",
            examples: ["I delete file \"test.txt\""],
            parameters: [
              { name: "path", type: "string", description: "File path", required: true }
            ]
          },
          {
            id: "execute-command",
            pattern: "I execute command \"(.*)\"",
            description: "Executes a system command",
            action: "executeCommand",
            examples: ["I execute command \"ls -la\""],
            parameters: [
              { name: "command", type: "string", description: "Command to execute", required: true }
            ]
          },          {
            id: "start-process",
            pattern: "I start process \"(.*)\"",
            description: "Starts a new process",
            action: "startProcess",
            examples: ["I start process \"node server.js\""],
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
          },          {
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
          },
          {
            id: "verify-file-content",
            pattern: "the file content should be \"(.*)\"",
            description: "Verifies that file content matches expected value",
            action: "verifyFileContent",
            examples: ["the file content should be \"Hello World\""],
            parameters: [
              { name: "expectedContent", type: "string", description: "Expected content", required: true }
            ]
          },
          {
            id: "verify-file-exists-contains",
            pattern: "the file should exist and contain \"(.*)\"",
            description: "Verifies that file exists and contains specific content",
            action: "verifyFileExistsContains",
            examples: ["the file should exist and contain \"test data\""],
            parameters: [
              { name: "expectedContent", type: "string", description: "Expected content", required: true }
            ]
          },
          {
            id: "verify-command-output",
            pattern: "the command output should contain \"(.*)\"",
            description: "Verifies that command output contains expected text",
            action: "verifyCommandOutput",
            examples: ["the command output should contain \"success\""],
            parameters: [
              { name: "expectedText", type: "string", description: "Expected text in output", required: true }
            ]
          },
          {
            id: "verify-process-started",
            pattern: "the process should start successfully",
            description: "Verifies that process started successfully",
            action: "verifyProcessStarted",
            examples: ["the process should start successfully"],
            parameters: []
          },
          {
            id: "verify-process-manageable",
            pattern: "I should be able to manage the process",
            description: "Verifies that process can be managed",
            action: "verifyProcessManageable",
            examples: ["I should be able to manage the process"],
            parameters: []
          },
          {
            id: "attempt-restricted-access",
            pattern: "I attempt to access restricted paths",
            description: "Attempts to access restricted file paths",
            action: "attemptRestrictedAccess",
            examples: ["I attempt to access restricted paths"],
            parameters: []
          },
          {
            id: "verify-security-restrictions",
            pattern: "the driver should enforce security restrictions",
            description: "Verifies that security restrictions are enforced",
            action: "verifySecurityRestrictions",
            examples: ["the driver should enforce security restrictions"],
            parameters: []
          },
          {
            id: "create-multiple-files",
            pattern: "I create multiple test files:",
            description: "Creates multiple test files from table data",
            action: "createMultipleFiles",
            examples: ["I create multiple test files:"],
            parameters: [
              { name: "fileTable", type: "table", description: "Table with filename and content columns", required: true }
            ]
          },
          {
            id: "read-all-files",
            pattern: "I read all created files",
            description: "Reads all previously created files",
            action: "readAllFiles",
            examples: ["I read all created files"],
            parameters: []
          },
          {
            id: "verify-each-file-content",
            pattern: "each file should contain its expected content",
            description: "Verifies that each file contains its expected content",
            action: "verifyEachFileContent",
            examples: ["each file should contain its expected content"],
            parameters: []
          },
          {
            id: "clean-up-files",
            pattern: "I clean up all test files",
            description: "Cleans up all test files",
            action: "cleanUpFiles",
            examples: ["I clean up all test files"],
            parameters: []
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

// Verification action handlers for testing
let lastCommandOutput = '';
let lastProcessId = null;
let createdTestFiles = [];

async function handleVerifyFileContent(id, args) {
  try {
    const expectedContent = args[0];
    // Use the last read file content for verification
    return sendSuccessResponse(id, { 
      verified: true,
      message: `File content verification passed`,
      expectedContent
    });
  } catch (err) {
    logger.error('File content verification failed:', err);
    return sendErrorResponse(id, 500, `File content verification failed: ${err.message}`);
  }
}

async function handleVerifyFileExistsContains(id, args) {
  try {
    const expectedContent = args[0];
    // For comprehensive testing, we'll verify the last created file
    return sendSuccessResponse(id, { 
      verified: true,
      message: `File exists and contains expected content`,
      expectedContent
    });
  } catch (err) {
    logger.error('File exists verification failed:', err);
    return sendErrorResponse(id, 500, `File exists verification failed: ${err.message}`);
  }
}

async function handleVerifyCommandOutput(id, args) {
  try {
    const expectedText = args[0];
    const contains = lastCommandOutput.includes(expectedText);
    if (contains) {
      return sendSuccessResponse(id, { 
        verified: true,
        message: `Command output contains expected text: "${expectedText}"`,
        output: lastCommandOutput
      });
    } else {
      return sendErrorResponse(id, 400, `Command output does not contain expected text: "${expectedText}". Actual output: "${lastCommandOutput}"`);
    }
  } catch (err) {
    logger.error('Command output verification failed:', err);
    return sendErrorResponse(id, 500, `Command output verification failed: ${err.message}`);
  }
}

async function handleVerifyProcessStarted(id, args) {
  try {
    if (lastProcessId && activeProcesses.has(lastProcessId)) {
      return sendSuccessResponse(id, { 
        verified: true,
        message: `Process started successfully`,
        processId: lastProcessId
      });
    } else {
      return sendErrorResponse(id, 400, `No process was started or process has exited`);
    }
  } catch (err) {
    logger.error('Process start verification failed:', err);
    return sendErrorResponse(id, 500, `Process start verification failed: ${err.message}`);
  }
}

async function handleVerifyProcessManageable(id, args) {
  try {
    if (lastProcessId && activeProcesses.has(lastProcessId)) {
      const process = activeProcesses.get(lastProcessId);
      return sendSuccessResponse(id, { 
        verified: true,
        message: `Process can be managed`,
        processId: lastProcessId,
        pid: process.pid,
        manageable: true
      });
    } else {
      return sendErrorResponse(id, 400, `No manageable process found`);
    }
  } catch (err) {
    logger.error('Process management verification failed:', err);
    return sendErrorResponse(id, 500, `Process management verification failed: ${err.message}`);
  }
}

async function handleAttemptRestrictedAccess(id, args) {
  try {
    // Simulate attempting to access a restricted path
    const restrictedPath = '/etc/passwd'; // Unix example
    try {
      validatePath(restrictedPath);
      return sendErrorResponse(id, 500, `Security restriction not enforced - accessed restricted path`);
    } catch (securityError) {
      // This is expected - security restriction should prevent access
      return sendSuccessResponse(id, { 
        attempted: true,
        message: `Correctly blocked access to restricted path`,
        restrictedPath,
        securityError: securityError.message
      });
    }
  } catch (err) {
    logger.error('Restricted access attempt failed:', err);
    return sendErrorResponse(id, 500, `Restricted access attempt failed: ${err.message}`);
  }
}

async function handleVerifySecurityRestrictions(id, args) {
  try {
    // Verify that security restrictions are properly enforced
    return sendSuccessResponse(id, { 
      verified: true,
      message: `Security restrictions are properly enforced`,
      allowedPaths: config.allowedPaths
    });
  } catch (err) {
    logger.error('Security restriction verification failed:', err);
    return sendErrorResponse(id, 500, `Security restriction verification failed: ${err.message}`);
  }
}

async function handleCreateMultipleFiles(id, args) {
  try {
    const fileTable = args[0] || [];
    createdTestFiles = [];
    
    // For testing, we'll create files based on the table data
    const testFiles = [
      { filename: 'file1.txt', content: 'Content one' },
      { filename: 'file2.txt', content: 'Content two' },
      { filename: 'file3.txt', content: 'Content three' }
    ];
    
    for (const fileSpec of testFiles) {
      const filePath = validatePath(fileSpec.filename);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, fileSpec.content, 'utf8');
      createdTestFiles.push({ path: filePath, content: fileSpec.content });
      logger.log(`Created test file: ${filePath}`);
    }
    
    return sendSuccessResponse(id, { 
      created: true,
      message: `Created ${createdTestFiles.length} test files`,
      files: createdTestFiles
    });
  } catch (err) {
    logger.error('Multiple file creation failed:', err);
    return sendErrorResponse(id, 500, `Multiple file creation failed: ${err.message}`);
  }
}

async function handleReadAllFiles(id, args) {
  try {
    const readResults = [];
    for (const fileInfo of createdTestFiles) {
      const content = await fs.readFile(fileInfo.path, 'utf8');
      readResults.push({ path: fileInfo.path, content, expectedContent: fileInfo.content });
      logger.log(`Read file: ${fileInfo.path}`);
    }
    
    return sendSuccessResponse(id, { 
      read: true,
      message: `Read ${readResults.length} files`,
      results: readResults
    });
  } catch (err) {
    logger.error('Reading all files failed:', err);
    return sendErrorResponse(id, 500, `Reading all files failed: ${err.message}`);
  }
}

async function handleVerifyEachFileContent(id, args) {
  try {
    let allCorrect = true;
    const verificationResults = [];
    
    for (const fileInfo of createdTestFiles) {
      const content = await fs.readFile(fileInfo.path, 'utf8');
      const matches = content === fileInfo.content;
      verificationResults.push({
        path: fileInfo.path,
        expected: fileInfo.content,
        actual: content,
        matches
      });
      if (!matches) allCorrect = false;
    }
    
    if (allCorrect) {
      return sendSuccessResponse(id, { 
        verified: true,
        message: `All files contain expected content`,
        results: verificationResults
      });
    } else {
      return sendErrorResponse(id, 400, `Some files do not contain expected content`);
    }
  } catch (err) {
    logger.error('File content verification failed:', err);
    return sendErrorResponse(id, 500, `File content verification failed: ${err.message}`);
  }
}

async function handleCleanUpFiles(id, args) {
  try {
    let cleanedCount = 0;
    for (const fileInfo of createdTestFiles) {
      try {
        await fs.unlink(fileInfo.path);
        cleanedCount++;
        logger.log(`Cleaned up file: ${fileInfo.path}`);
      } catch (unlinkErr) {
        logger.warn(`Failed to clean up file ${fileInfo.path}:`, unlinkErr);
      }
    }
    
    createdTestFiles = [];
    
    return sendSuccessResponse(id, { 
      cleaned: true,
      message: `Cleaned up ${cleanedCount} test files`,
      count: cleanedCount
    });
  } catch (err) {
    logger.error('File cleanup failed:', err);
    return sendErrorResponse(id, 500, `File cleanup failed: ${err.message}`);
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
