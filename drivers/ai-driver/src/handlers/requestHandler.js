/**
 * Request Handler Module
 * Handles main request routing and core capabilities
 */

const fs = require('fs').promises;
const manifest = require('../../package.json');
const { handleExecute } = require('./executeHandler');
const { parseRunixFeatureFile } = require('../utils/featureFile');
const { getConfig, getSessionContext, updateSessionContext } = require('../config/config');

/**
 * Main request handler that routes different methods
 * @param {Object} request - The incoming request
 * @param {WebSocket} ws - WebSocket connection (for execute requests)
 * @param {Object} llmProvider - LLM provider instance (for execute requests)
 * @returns {Promise<Object>} Response object
 */
async function handleRequest(request, ws = null, llmProvider = null) {
  if (!request.id || !request.method) {
    return sendErrorResponse(request.id, 400, 'Invalid request');
  }

  const config = getConfig();

  try {
    switch (request.method) {
      case 'capabilities':
        return await handleCapabilities(request.id);

      case 'initialize':
        return handleInitialize(request.id, request.params?.config || {});

      case 'introspect':
        return handleIntrospect(request.id, request.params?.type || 'steps');

      case 'execute':
        // For execute requests, we need to handle them differently as they use WebSocket responses
        // This should not return a response object but instead send responses via WebSocket
        if (ws && llmProvider) {
          await handleExecute(ws, request.id, request.params || {}, config, llmProvider);
          return null; // No response object needed - WebSocket responses are sent directly
        } else {
          return sendErrorResponse(request.id, 500, 'Execute requests require WebSocket connection and LLM provider');
        }

      case 'health':
        return {
          id: request.id,
          type: 'response',
          result: { status: 'ok' }
        };

      case 'shutdown':
        return sendSuccessResponse(request.id, { shutdown: true });

      case 'replayFeatureFile':
        return await handleReplayFeatureFile(request.id, request.params);

      default:
        return sendErrorResponse(request.id, 404, `Unknown method: ${request.method}`);
    }
  } catch (error) {
    console.error(`Error handling request ${request.method}:`, error);
    return sendErrorResponse(request.id, 500, error.message);
  }
}

/**
 * Handles capabilities request
 * @param {string} id - Request ID
 * @returns {Promise<Object>} Capabilities response
 */
async function handleCapabilities(id) {
  try {
    const config = getConfig();
    
    return {
      id,
      type: 'response',
      result: {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        supportedActions: [
          'setMode', 'agent', 'ask', 'analyze',
          'startSession', 'verifyResponse', 'verifyResult', 'verifySuccess',
          'startEditorMode', 'stopEditorMode', 'recordUserAction', 'generateFeatureFromObservations'
        ],
        supportedFeatures: ["introspection", "feature-replay"],
        supportedModes: ['agent', 'ask', 'editor'],
        llmProvider: {
          type: config.llmProvider.type,
          model: config.llmProvider.model,
          maxTokens: config.llmProvider.maxTokens
        }
      }
    };
  } catch (error) {
    console.error('Error getting capabilities:', error);
    return sendErrorResponse(id, 500, `Error getting capabilities: ${error.message}`);
  }
}

/**
 * Handles initialization request
 * @param {string} id - Request ID
 * @param {Object} configUpdates - Configuration updates
 * @returns {Object} Initialize response
 */
function handleInitialize(id, configUpdates) {
  try {
    const sessionContext = getSessionContext();
    
    // Update session context with any provided updates
    if (configUpdates.sessionContext) {
      updateSessionContext(configUpdates.sessionContext);
    }
    
    console.log('Session initialized/updated with context:', sessionContext);
    
    return sendSuccessResponse(id, { 
      status: 'initialized', 
      sessionContext: sessionContext,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error initializing:', error);
    return sendErrorResponse(id, 500, `Error initializing: ${error.message}`);
  }
}

/**
 * Handles introspection request - works exactly like example-driver
 * @param {string} id - Request ID
 * @param {string} type - Type of introspection
 * @returns {Object} Introspection response
 */
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

/**
 * Handles feature file replay request
 * @param {string} id - Request ID
 * @param {Object} params - Request parameters
 * @returns {Promise<Object>} Replay response
 */
async function handleReplayFeatureFile(id, params) {
  const featureFilePath = params?.file;
  const replayOptions = params?.options || {};
  
  if (!featureFilePath) {
    return sendErrorResponse(id, 400, 'Missing feature file path');
  }
  
  console.log(`Replaying feature file: ${featureFilePath}`);
  
  try {
    const featureContent = await fs.readFile(featureFilePath, 'utf8');
    const parsedFeature = parseRunixFeatureFile(featureContent);
    
    // Start a new replay session
    const replaySessionId = `replay-${Date.now()}`;
    updateSessionContext({
      sessionId: replaySessionId,
      mode: 'replay',
      goal: parsedFeature.title || 'Feature file replay',
      executionHistory: [],
      status: 'replaying',
      replayOptions: replayOptions
    });
    
    // Execute each step in the feature file
    const results = [];
    for (const scenario of parsedFeature.scenarios) {
      console.log(`Executing scenario: ${scenario.title}`);
      
      for (const step of scenario.steps) {
        try {
          console.log(`Executing step: ${step.text}`);
          
          // Convert feature step to executable action
          const executeResult = await handleExecute(
            `replay-step-${results.length}`,
            step.action,
            step
          );
          
          results.push({
            step: step,
            result: executeResult,
            timestamp: new Date().toISOString()
          });
          
          // Add delay between steps if specified
          if (replayOptions.stepDelay) {
            await new Promise(resolve => setTimeout(resolve, replayOptions.stepDelay));
          }
          
        } catch (stepError) {
          console.error(`Error executing step: ${step.text}`, stepError);
          results.push({
            step: step,
            error: stepError.message,
            timestamp: new Date().toISOString()
          });
          
          if (!replayOptions.continueOnError) {
            break;
          }
        }
      }
    }
    
    // Update session with replay completion
    updateSessionContext({
      status: 'replay_completed',
      replayResults: results,
      endTime: new Date().toISOString()
    });
    
    return sendSuccessResponse(id, {
      status: 'replay_completed',
      sessionId: replaySessionId,
      stepsExecuted: results.length,
      results: results
    });
    
  } catch (error) {
    console.error('Error replaying feature file:', error);
    return sendErrorResponse(id, 500, `Error replaying feature file: ${error.message}`);
  }
}

/**
 * Sends a success response
 * @param {string} id - Request ID
 * @param {Object} data - Response data
 * @returns {Object} Formatted success response
 */
function sendSuccessResponse(id, data) {
  return {
    id,
    type: 'response',
    result: {
      success: true,
      data,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Sends an error response
 * @param {string} id - Request ID
 * @param {number} code - Error code
 * @param {string} message - Error message
 * @returns {Object} Formatted error response
 */
function sendErrorResponse(id, code, message) {
  return {
    id,
    type: 'response',
    error: {
      code,
      message,
      timestamp: new Date().toISOString()
    }
  };
}

module.exports = {
  handleRequest,
  handleCapabilities,
  handleInitialize,
  handleIntrospect,
  handleReplayFeatureFile,
  sendSuccessResponse,
  sendErrorResponse
};
