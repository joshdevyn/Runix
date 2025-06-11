// JSON-RPC response helpers

function sendErrorResponse(id, code, message) {
  return { 
    id, 
    type: 'response', 
    error: { 
      code, 
      message 
    } 
  };
}

function sendSuccessResponse(id, data) {
  return { 
    id, 
    type: 'response', 
    result: { 
      success: true, 
      data 
    } 
  };
}

function sendResponse(id, result) {
  return { 
    id, 
    type: 'response', 
    result 
  };
}

function validateRequest(request) {
  const errors = [];

  if (!request.id) {
    errors.push('Missing request ID');
  }

  if (!request.method) {
    errors.push('Missing request method');
  }

  if (request.method === 'execute' && !request.params?.action) {
    errors.push('Missing action parameter for execute method');
  }

  return errors;
}

module.exports = {
  sendErrorResponse,
  sendSuccessResponse,
  sendResponse,
  validateRequest
};
