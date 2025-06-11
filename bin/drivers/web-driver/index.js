const WebSocket = require('ws');
const http = require('http');

// Import modular components
const { handleRequest } = require('./lib/handlers/request-handler');
const { createEngineFactory } = require('./lib/engine-factory');
const { loadConfig } = require('./lib/utils/config');
const { createLogger } = require('./lib/utils/logger');
const manifest = require('./driver.json');

// Initialize logger and configuration
const logger = createLogger('UnifiedWebDriver');
const config = loadConfig(manifest);

// Get port from environment variable or use default
const port = parseInt(process.env.RUNIX_DRIVER_PORT || '9001', 10);

// Global driver state
let automationEngine = null;

logger.log(`Starting unified web driver on port ${port} with engine: ${config.engine}`);

// Create HTTP server
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      engine: config.engine,
      initialized: !!automationEngine 
    }));
    return;
  }
  
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`Unified Web Driver Running (${config.engine})\n`);
});

// Create WebSocket server
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
  logger.log(`Unified web driver listening on 127.0.0.1:${port}`);
  logger.log(`WebSocket server ready for connections`);
});

// Handle incoming messages
async function handleMessage(ws, message) {
  try {
    const request = JSON.parse(message);
      // Initialize engine if needed
    if (!automationEngine && request.method !== 'capabilities') {
      try {
        const engineFactory = createEngineFactory(config, logger);
        automationEngine = await engineFactory.createEngine();
        logger.log(`Engine initialized: ${config.engine}`);
      } catch (err) {
        logger.error('Failed to initialize engine:', err);
        ws.send(JSON.stringify({
          id: request.id || '0',
          type: 'response',
          error: {
            code: 500,
            message: `Failed to initialize ${config.engine} engine: ${err.message}`
          }
        }));
        return;
      }
    }
    
    // Handle the request
    const response = await handleRequest(request, automationEngine, config, logger);
    ws.send(JSON.stringify(response));
    
  } catch (err) {
    logger.error('Error handling message:', err);
    
    try {
      const request = JSON.parse(message);
      ws.send(JSON.stringify({
        id: request.id || '0',
        type: 'response',
        error: {
          code: 500,
          message: err.message || 'Internal server error'
        }
      }));
    } catch (parseErr) {
      logger.error('Error parsing message for error response:', parseErr);
    }
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  logger.log('Received SIGINT, shutting down gracefully...');
  if (automationEngine && automationEngine.close) {
    await automationEngine.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.log('Received SIGTERM, shutting down gracefully...');
  if (automationEngine && automationEngine.close) {
    await automationEngine.close();
  }
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process - just log the error
  // process.exit(1);
});
