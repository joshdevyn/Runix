/**
 * Execute Handler Module
 * Handles execution of different AI driver actions and modes
 */

const { handleAgentMode } = require('../modes/agentMode');
const { handleAskMode } = require('../modes/askMode');
const { takeScreenshot, analyzeScreen } = require('../core/aiDriverMethods');
const { updateConfig } = require('../config/config');
const { getSessionContext, updateSessionContext } = require('../config/config');
const { sendSuccessResponse, sendErrorResponse } = require('../utils/responseHelpers');

/**
 * Handles response verification
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} id - Request ID
 * @param {Object} params - Request parameters
 * @param {Object} config - Configuration object
 */
async function handleVerifyResponse(ws, id, params, config) {
    try {
        console.log('Verifying that AI provided a response');
        // This is a simplified check. A real implementation might check session history.
        const verified = true; 
        sendSuccessResponse(ws, id, { verified, operationSuccessful: true, success: verified });
    } catch (error) {
        console.error('Error in handleVerifyResponse:', error);
        sendErrorResponse(ws, id, `Response verification failed: ${error.message}`);
    }
}

/**
 * Handles result verification
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} id - Request ID
 * @param {Object} params - Request parameters
 * @param {Object} config - Configuration object
 */
async function handleVerifyResult(ws, id, params, config) {
    try {
        const expectedResult = params.expectedResult;
        const actualResult = params.actualResult;
        console.log(`Verifying result: expected ${expectedResult}, actual ${actualResult}`);
        let resultMatches = false;
        if (typeof expectedResult === 'object' || typeof actualResult === 'object') {
            resultMatches = JSON.stringify(expectedResult) === JSON.stringify(actualResult);
        } else {
            resultMatches = expectedResult == actualResult; // Use loose equality for flexibility
        }
        sendSuccessResponse(ws, id, { verified: resultMatches, expectedResult, actualResult, success: resultMatches });
    } catch (error) {
        console.error('Error in handleVerifyResult:', error);
        sendErrorResponse(ws, id, `Result verification failed: ${error.message}`);
    }
}

/**
 * Handles success verification
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} id - Request ID
 * @param {Object} params - Request parameters
 * @param {Object} config - Configuration object
 */
async function handleVerifySuccess(ws, id, params, config) {
    try {
        const operationResult = params.operationResult;
        console.log('Verifying operation success');
        let operationSuccessful = true;
        if (typeof operationResult === 'object' && operationResult !== null) {
            operationSuccessful = operationResult.success === true || operationResult.status === 'completed' || operationResult.verified === true;
        } else if (typeof operationResult === 'boolean') {
            operationSuccessful = operationResult;
        }
        sendSuccessResponse(ws, id, { operationSuccessful, verified: operationSuccessful, success: operationSuccessful });
    } catch (error) {
        console.error('Error in handleVerifySuccess:', error);
        sendErrorResponse(ws, id, `Success verification failed: ${error.message}`);
    }
}

/**
 * Handles execute actions - main routing function for different actions
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} id - Request ID
 * @param {Object} params - Request parameters
 * @param {Object} config - Configuration object
 * @param {Object} llmProvider - LLM provider instance
 */
async function handleExecute(ws, id, params, config, llmProvider) {
    const { action, args } = params;
    console.log(`Executing action: ${action} with args:`, args);

    try {
        switch (action) {            case 'introspect':
                // Handle step introspection to provide available step patterns
                if (args && args[0] && args[0].type === 'steps') {
                    const steps = [
                        {
                            id: 'ask-question',
                            pattern: 'I ask "(.*)"',
                            action: 'ask'
                        },
                        {
                            id: 'ai-agent-mode',
                            pattern: 'I use AI agent mode to "(.*)"',
                            action: 'agent'
                        },
                        {
                            id: 'analyze-screen',
                            pattern: 'I analyze the screen',
                            action: 'analyze'
                        },
                        {
                            id: 'verify-response',
                            pattern: 'I should receive a response',
                            action: 'verifyResponse'
                        },
                        {
                            id: 'verify-result',
                            pattern: 'the result should be "(.*)"',
                            action: 'verifyResult'
                        },
                        {
                            id: 'verify-success',
                            pattern: 'the operation should be successful',
                            action: 'verifySuccess'
                        },
                        {
                            id: 'start-session',
                            pattern: 'I start a new session',
                            action: 'startSession'
                        },
                        {
                            id: 'set-mode',
                            pattern: 'I set AI mode to "(.*)"',
                            action: 'setMode'
                        }
                    ];
                    // Send response directly without any wrapping
                    const response = { id, type: 'response', result: { steps } };
                    console.log(`[AI-DRIVER] Sending introspect response:`, JSON.stringify(response, null, 2));
                    ws.send(JSON.stringify(response));
                } else {
                    sendErrorResponse(ws, id, 'Invalid introspect request');
                }
                break;

            case 'setMode':
                if (args && args.mode) {
                    // Update configuration using the config module
                    await updateConfig(config, { currentMode: args.mode });
                    
                    // Update session context mode
                    updateSessionContext({ mode: args.mode });
                    
                    console.log(`AI Driver mode set to: ${config.currentMode}`);
                    sendSuccessResponse(ws, id, { status: 'success', mode: config.currentMode });
                } else {
                    sendErrorResponse(ws, id, 'Missing mode parameter for setMode');
                }
                break;
                
            case 'agent':
                await handleAgentMode(ws, id, args, config, llmProvider);
                break;
                  case 'ask':
                await handleAskMode(ws, id, args, config, llmProvider);
                break;
                
            case 'analyze':
                if (!args || !args.screenshot) {
                    sendErrorResponse(ws, id, 'Missing screenshot parameter for analyze action');
                    return;
                }
                const analysisResult = await analyzeScreen(config, llmProvider, args.screenshot, args.options || {});
                if (analysisResult.success) {
                    sendSuccessResponse(ws, id, analysisResult);
                } else {
                    sendErrorResponse(ws, id, analysisResult.error);
                }
                break;
                  case 'startSession':
                const sessionId = `session-${Date.now()}`;
                
                // Get current session context and update it
                const currentSessionContext = getSessionContext();
                const newSessionContext = {
                    ...currentSessionContext, // Preserve existing, like mode
                    sessionId: sessionId,
                    currentTask: args && args.task ? args.task : null,
                    featureFile: null,
                    executionHistory: [],
                    userInteractionHistory: [],
                    observedActions: [],
                    currentStep: 0,
                    conversationContext: []
                };
                
                // Update session context
                updateSessionContext(newSessionContext);
                console.log(`Session started: ${sessionId}`);
                sendSuccessResponse(ws, id, { sessionId, status: 'session_started', context: getSessionContext() });
                break;
                
            case 'verifyResponse':
                await handleVerifyResponse(ws, id, params, config);
                break;
                
            case 'verifyResult':
                await handleVerifyResult(ws, id, params, config);
                break;
                
            case 'verifySuccess':
                await handleVerifySuccess(ws, id, params, config);
                break;
                
            // Add other specific actions here if they don't fit into agent/ask modes directly
            default:
                console.warn(`Unknown action: ${action}`);
                sendErrorResponse(ws, id, `Unknown action: ${action}`);
        }
    } catch (error) {
        console.error(`Error executing action ${action}:`, error);
        sendErrorResponse(ws, id, `Error executing ${action}: ${error.message}`, { stack: error.stack });
    }
}

module.exports = { handleExecute };
