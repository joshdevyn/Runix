#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

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
      console.log(`${timestamp} [INFO] [lightweight-driver.js::WebDriverLite::${caller}] ${message}${dataStr}`);
    },
    error: (message, data = {}) => {
      const caller = getCallerInfo();
      const timestamp = new Date().toISOString();
      const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      console.error(`${timestamp} [ERROR] [lightweight-driver.js::WebDriverLite::${caller}] ${message}${dataStr}`);
    }
  };
}

const logger = createDriverLogger();

const port = process.env.RUNIX_DRIVER_PORT || 
  process.argv.find(arg => arg.startsWith('--port='))?.replace('--port=', '') || 
  process.argv[process.argv.indexOf('--port') + 1] || 
  8000;

const engine = 'selenium';
const timeout = 30000;

logger.log(`WebDriver (${engine}) server starting on port ${port}`);

// Start WebSocket server
const wss = new WebSocket.Server({ port: parseInt(port) });

let seleniumProcess = null;
let seleniumPort = 4444;
let driverConfig = { headless: true }; // Default config

// Start Selenium server if using selenium engine
if (engine === 'selenium') {
  // Try multiple locations for the JAR file
  const jarLocations = [
    path.join(__dirname, 'selenium-server.jar'),
    path.join(process.cwd(), 'selenium-server.jar'),
    path.join(process.cwd(), 'drivers', 'web-driver', 'selenium-server.jar'),
    path.join(process.cwd(), 'bin', 'drivers', 'web-driver', 'selenium-server.jar'),
    path.join(path.dirname(process.execPath), 'drivers', 'web-driver', 'selenium-server.jar'),
    path.join(path.dirname(process.execPath), 'selenium-server.jar')
  ];
  
  let seleniumJar = null;
  for (const jarPath of jarLocations) {
    if (fs.existsSync(jarPath)) {
      seleniumJar = jarPath;
      logger.log(`Found Selenium JAR at: ${jarPath}`);
      break;
    }
  }
  
  if (seleniumJar) {
    try {
      logger.log(`Starting Selenium server on port ${seleniumPort}`);
      seleniumProcess = spawn('java', ['-jar', seleniumJar, '-port', seleniumPort.toString()], {
        stdio: 'pipe'
      });
      
      seleniumProcess.on('error', (err) => {
        logger.error('Failed to start Selenium server:', err);
      });
      
      // Wait a moment for Selenium to start
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (err) {
      logger.error('Error starting Selenium server:', err);
      logger.log('Falling back to direct browser automation');
    }
  } else {
    logger.log('Selenium JAR not found, using direct browser automation');
  }
}

wss.on('connection', (ws) => {
  logger.log('Client connected');
  
  ws.on('message', async (data) => {
    try {
      const request = JSON.parse(data);
      const response = await handleRequest(request);
      ws.send(JSON.stringify(response));
    } catch (err) {
      logger.error('Error handling request:', err);
      ws.send(JSON.stringify({
        id: 'error',
        type: 'response',
        error: { code: 500, message: err.message }
      }));
    }
  });
});

async function handleRequest(request) {
  const { id, method, params } = request;
  
  switch (method) {
    case 'health':
      return {
        id,
        type: 'response',
        result: { status: 'ok' }
      };
      
    case 'capabilities':
      return {
        id,
        type: 'response',
        result: {
          name: 'WebDriver',
          version: '1.0.0',
          description: `Web driver using ${engine}`,
          supportedActions: ['goto', 'click', 'type', 'getTitle', 'screenshot', 'open'],
          author: 'Runix Team'
        }
      };
      
    case 'initialize':
      // Store the driver configuration
      driverConfig = { ...driverConfig, ...params };
      logger.log('Driver configured with:', JSON.stringify(driverConfig));
      
      return {
        id,
        type: 'response',
        result: { initialized: true, config: driverConfig }
      };
      
    case 'execute':
      const { action, args } = params;
      
      // Remove introspection handling - now centralized
      
    default:
      return sendErrorResponse(id, 404, `Unknown action: ${action}`);
  }
}

// Cleanup on exit
process.on('SIGINT', () => {
  if (seleniumProcess) {
    seleniumProcess.kill();
  }
  process.exit(0);
});

logger.log(`WebDriver server listening on port ${port}`);
