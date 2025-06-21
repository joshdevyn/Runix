const WebSocket = require('ws');
const http = require('http');
const path = require('path');

// Load .env from multiple possible locations
const possibleEnvPaths = [
  path.join(__dirname, '.env'),                    // Local .env in driver dir
  path.join(__dirname, '../../.env'),              // Original Runix root
  path.join(__dirname, '../../../.env'),           // From bin/drivers/web-driver to root
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

// Embedded Heartbeat Implementation for Web Driver
class DriverHeartbeat {
  constructor(options = {}) {
    this.driverName = options.driverName || 'Web';
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

// Initialize HTTP server
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

// Initialize heartbeat system
let heartbeat = null;
try {
  // Handle CLI commands first
  DriverHeartbeat.handleCLICommands('Web');
  
  // Initialize heartbeat system
  heartbeat = new DriverHeartbeat({
    driverName: 'Web',
    logger: logger,
    server: server,
    wss: wss
  });
  
  logger.log('Heartbeat system initialized');
} catch (error) {
  logger.error('Failed to initialize heartbeat system:', error);
}

// Handle incoming messages
async function handleMessage(ws, message) {
  try {
    const request = JSON.parse(message);
    
    // Update heartbeat on any engine communication
    if (heartbeat) {
      heartbeat.updateHeartbeat();
    }
    
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
      }    }
    
    // Handle heartbeat endpoints before delegating to main handler
    if (request.method === 'health') {
      ws.send(JSON.stringify({
        id: request.id,
        type: 'response',
        result: { 
          status: 'ok',
          engine: config.engine,
          initialized: !!automationEngine,
          pid: process.pid,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          heartbeat: heartbeat ? heartbeat.getStatus() : null,
          timestamp: new Date().toISOString()
        }
      }));
      return;
    }
    
    if (request.method === 'heartbeat') {
      if (heartbeat) {
        heartbeat.updateHeartbeat();
      }
      ws.send(JSON.stringify({
        id: request.id,
        type: 'response',
        result: { 
          heartbeat: 'updated',
          timestamp: new Date().toISOString(),
          ...(heartbeat ? heartbeat.getStatus() : {})
        }
      }));
      return;
    }
    
    if (request.method === 'ping') {
      ws.send(JSON.stringify({
        id: request.id,
        type: 'response',
        result: { 
          ping: 'pong',
          timestamp: new Date().toISOString(),
          driverName: 'Web'
        }
      }));
      return;
    }
    
    if (request.method === 'shutdown') {
      if (heartbeat) {
        heartbeat.gracefulShutdown('shutdown-command');
      } else {
        process.exit(0);
      }
      ws.send(JSON.stringify({
        id: request.id,
        type: 'response',
        result: { success: true, shutdown: true }
      }));
      return;
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
