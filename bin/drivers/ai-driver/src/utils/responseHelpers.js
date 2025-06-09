/**
 * Response Helper Utilities
 * Provides WebSocket response helper functions to avoid circular dependencies
 */

/**
 * Sends a success response via WebSocket
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} id - Request ID
 * @param {Object} data - Response data
 */
function sendSuccessResponse(ws, id, data) {
    const successResponse = { id, type: 'response', result: { success: true, data } };
    console.log(`[WS-SUCCESS-RESPONSE] Sending:`, JSON.stringify(successResponse, null, 2));
    ws.send(JSON.stringify(successResponse));
}

/**
 * Sends an error response via WebSocket
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} id - Request ID
 * @param {string} message - Error message
 * @param {Object} extra - Additional error data
 */
function sendErrorResponse(ws, id, message, extra = {}) {
    const errorResponse = { 
        id, 
        type: 'response', 
        error: { 
            code: 500, 
            message,
            ...extra
        } 
    };
    console.log(`[WS-ERROR-RESPONSE] Sending:`, JSON.stringify(errorResponse, null, 2));
    ws.send(JSON.stringify(errorResponse));
}

module.exports = {
    sendSuccessResponse,
    sendErrorResponse
};
