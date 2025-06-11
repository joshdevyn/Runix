// Request handler for unified web driver
const manifest = require('../../driver.json');
const { sendErrorResponse, sendSuccessResponse, validateRequest } = require('../utils/responses');

// Main request handler
async function handleRequest(request, automationEngine = null, config = {}, logger = console) {
  const validationErrors = validateRequest(request);
  if (validationErrors.length > 0) {
    return sendErrorResponse(request.id, 400, `Invalid request: ${validationErrors.join(', ')}`);
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
            supportedEngines: ['playwright', 'selenium'],
            currentEngine: config.engine
          }
        };

      case 'initialize':
        return handleInitialize(request.id, request.params?.config || {}, config, logger);

      case 'introspect':
        return handleIntrospect(request.id, request.params?.type || 'steps');

      case 'execute':
        return handleExecute(request.id, request.params?.action, request.params?.args || [], automationEngine, config, logger);
        
      case 'health':
        return {
          id: request.id,
          type: 'response',
          result: { 
            status: 'ok', 
            engine: config.engine, 
            initialized: !!automationEngine 
          }
        };

      case 'shutdown':
        await cleanup(automationEngine, logger);
        return sendSuccessResponse(request.id, { shutdown: true });

            default:
        return sendErrorResponse(request.id, 404, `Unknown method: ${request.method}`);
    }
  }
  catch (err) {
    logger.error('Request handling error:', err);
    return sendErrorResponse(request.id, 500, err.message);
  }
}

// Handle initialize requests
async function handleInitialize(id, driverConfig, config, logger) {
  try {
    // Merge with default config
    Object.assign(config, driverConfig);
    logger.log('Driver initialized with config', config);
    
    return sendSuccessResponse(id, { 
      initialized: true, 
      engine: config.engine,
      browserType: config.browserType 
    });
  } catch (err) {
    logger.error('Failed to initialize driver:', err);
    return sendErrorResponse(id, 500, `Initialization failed: ${err.message}`);
  }
}

// Handle execute requests
async function handleExecute(id, action, args, automationEngine, config, logger) {
  logger.log(`Executing action: ${action}`, args);
  
  try {
    // Ensure automation engine is available
    if (!automationEngine) {
      return sendErrorResponse(id, 500, 'Automation engine not initialized');
    }
    
    // Load action handlers
    const { executeAction } = require('./action-handlers');
    return await executeAction(id, action, args, automationEngine, config, logger);
    
  } catch (err) {
    logger.error('Execution error:', err);
    return sendErrorResponse(id, 500, `Execution failed: ${err.message}`);
  }
}

// Handle introspect requests
async function handleIntrospect(id, type) {
  try {
    if (type === 'steps') {
      const { getStepDefinitions } = require('./step-definitions');
      return {
        id,
        type: 'response',
        result: {
          steps: getStepDefinitions()
        }
      };
    } else {
      return {
        id,
        type: 'response',
        result: {
          actions: manifest.actions
        }
      };
    }
  } catch (err) {
    return sendErrorResponse(id, 500, `Introspection failed: ${err.message}`);
  }
}

// Cleanup function
async function cleanup(automationEngine, logger) {
  logger.log('Cleaning up automation engine...');
  
  if (automationEngine) {
    try {
      await automationEngine.close();
      logger.log('Automation engine cleaned up successfully');
    } catch (err) {
      logger.error('Error during cleanup:', err);
    }
  }
}

module.exports = {
  handleRequest,
  handleInitialize,
  handleExecute,
  handleIntrospect,
  cleanup
};
