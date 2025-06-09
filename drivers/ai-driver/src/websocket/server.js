/**
 * WebSocket Server Module
 * Handles WebSocket server creation, connection management, and message routing
 */

const http = require('http');
const WebSocket = require('ws');
const { handleRequest } = require('../handlers/requestHandler');
const { getLLMProvider } = require('../providers/llmProviders');

/**
 * Creates and configures the WebSocket server
 * @param {Object} config - Configuration object
 * @returns {Object} HTTP server and WebSocket server instances
 */
function createWebSocketServer(config) {
  // Create HTTP server
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('AI Driver Running\n');
  });

  // Create WebSocket server
  const wss = new WebSocket.Server({ server });

  wss.on('connection', function connection(ws) {
    console.log(`[WS-SERVER] Client connected from ${ws._socket?.remoteAddress || 'unknown'}`);
    console.log('Client connected');
    
    ws.on('message', function incoming(message) {
      console.log(`[WS-SERVER] Received message: ${message.length} bytes`);
      console.log(`Received: ${message.length} bytes`);
      handleMessage(ws, message);
    });
    
    ws.on('close', function() {
      console.log(`[WS-SERVER] Client disconnected`);
      console.log('Client disconnected');
    });
    
    ws.on('error', function(error) {
      console.error(`[WS-SERVER] WebSocket error:`, error);
      console.error('WebSocket error:', error);
    });
  });

  // Start the server
  server.listen(config.port, config.host, () => {
    console.log(`AI driver listening on ${config.host}:${config.port}`);
    console.log(`WebSocket server ready for connections`);
  });

  return { server, wss };
}

/**
 * Handles incoming WebSocket messages
 * @param {WebSocket} ws - WebSocket connection
 * @param {Buffer} message - Raw message data
 */
function handleMessage(ws, message) {
  try {
    console.log(`[WS-MESSAGE] Raw message received: ${message.toString().substring(0, 200)}...`);
    const request = JSON.parse(message);
    console.log(`[WS-MESSAGE] Parsed request:`, { id: request.id, method: request.method, params: request.params });
    
    // For execute requests, pass WebSocket and LLM provider
    const llmProvider = getLLMProvider();
    
    handleRequest(request, ws, llmProvider).then(response => {
      // Only send response if one was returned (non-execute requests)
      if (response) {
        console.log(`[WS-MESSAGE] Sending response:`, { id: response.id, type: response.type, hasError: !!response.error });
        console.log(`[WS-MESSAGE] Full response object:`, JSON.stringify(response, null, 2));
        ws.send(JSON.stringify(response));
      }
    }).catch(err => {
      console.error(`[WS-MESSAGE] Error handling request:`, err);
      console.error('Error handling request:', err);
      const errorResponse = {
        id: request.id || '0',
        type: 'response',
        error: {
          code: 500,
          message: err.message || 'Internal server error'
        }
      };
      console.log(`[WS-MESSAGE] Sending error response:`, errorResponse);
      ws.send(JSON.stringify(errorResponse));
    });
  } catch (err) {
    console.error(`[WS-MESSAGE] Error parsing message:`, err);
    console.error('Error parsing message:', err);
  }
}

/**
 * Sends a success response
 * @param {string} id - Request ID
 * @param {Object} data - Response data
 * @returns {Object} Formatted success response
 */
function sendSuccessResponse(id, data) {
  const successResponse = { id, type: 'response', result: { success: true, data } };
  console.log(`[WS-SUCCESS-RESPONSE] Preparing success response:`, JSON.stringify(successResponse, null, 2));
  return successResponse;
}

/**
 * Sends an error response
 * @param {string} id - Request ID
 * @param {number} code - Error code
 * @param {string} message - Error message
 * @returns {Object} Formatted error response
 */
function sendErrorResponse(id, code, message) {
  const errorResponse = { id, type: 'response', error: { code, message } };
  console.log(`[WS-ERROR-RESPONSE] Preparing error response:`, JSON.stringify(errorResponse, null, 2));
  return errorResponse;
}

module.exports = {
  createWebSocketServer,
  sendSuccessResponse,
  sendErrorResponse
};
