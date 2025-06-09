/**
 * Mode Helpers Module
 * Contains utility functions and helpers for different operational modes
 */

/**
 * Session context management helpers
 */
const sessionHelpers = {
  /**
   * Creates a new session context
   * @param {string} mode - The mode (agent, ask, editor)
   * @param {string} goal - The session goal
   * @returns {Object} New session context
   */
  createSession(mode, goal = '') {
    return {
      sessionId: `${mode}-${Date.now()}`,
      mode: mode,
      goal: goal,
      startTime: new Date().toISOString(),
      executionHistory: [],
      observations: [],
      currentStep: 0,
      status: 'active',
      lastScreenshot: null,
      lastAnalysis: null,
      context: {}
    };
  },

  /**
   * Updates session context with new information
   * @param {Object} sessionContext - Current session context
   * @param {Object} updates - Updates to apply
   * @returns {Object} Updated session context
   */
  updateSession(sessionContext, updates) {
    return {
      ...sessionContext,
      ...updates,
      lastUpdated: new Date().toISOString()
    };
  },

  /**
   * Adds an execution step to the session history
   * @param {Object} sessionContext - Current session context
   * @param {Object} step - Step to add
   * @returns {Object} Updated session context
   */
  addExecutionStep(sessionContext, step) {
    const executionHistory = [...(sessionContext.executionHistory || [])];
    executionHistory.push({
      ...step,
      timestamp: new Date().toISOString(),
      stepNumber: executionHistory.length + 1
    });

    return {
      ...sessionContext,
      executionHistory,
      currentStep: executionHistory.length,
      lastUpdated: new Date().toISOString()
    };
  },

  /**
   * Adds an observation to the session
   * @param {Object} sessionContext - Current session context
   * @param {Object} observation - Observation to add
   * @returns {Object} Updated session context
   */
  addObservation(sessionContext, observation) {
    const observations = [...(sessionContext.observations || [])];
    observations.push({
      ...observation,
      timestamp: new Date().toISOString(),
      observationNumber: observations.length + 1
    });

    return {
      ...sessionContext,
      observations,
      lastUpdated: new Date().toISOString()
    };
  },

  /**
   * Marks a session as completed
   * @param {Object} sessionContext - Current session context
   * @param {boolean} success - Whether the session was successful
   * @param {string} reason - Reason for completion
   * @returns {Object} Updated session context
   */
  completeSession(sessionContext, success = true, reason = '') {
    return {
      ...sessionContext,
      status: success ? 'completed' : 'failed',
      endTime: new Date().toISOString(),
      completionReason: reason,
      executionTime: Date.now() - new Date(sessionContext.startTime).getTime(),
      lastUpdated: new Date().toISOString()
    };
  }
};

/**
 * Response formatting helpers
 */
const responseHelpers = {
  /**
   * Creates a success response
   * @param {string} id - Request ID
   * @param {Object} data - Response data
   * @param {string} message - Success message
   * @returns {Object} Formatted success response
   */
  createSuccessResponse(id, data, message = 'Operation completed successfully') {
    return {
      id,
      type: 'response',
      result: {
        success: true,
        message,
        data,
        timestamp: new Date().toISOString()
      }
    };
  },

  /**
   * Creates an error response
   * @param {string} id - Request ID
   * @param {number} code - Error code
   * @param {string} message - Error message
   * @param {Object} details - Additional error details
   * @returns {Object} Formatted error response
   */
  createErrorResponse(id, code, message, details = null) {
    return {
      id,
      type: 'response',
      error: {
        code,
        message,
        details,
        timestamp: new Date().toISOString()
      }
    };
  },

  /**
   * Creates a progress response for long-running operations
   * @param {string} id - Request ID
   * @param {number} progress - Progress percentage (0-100)
   * @param {string} status - Current status
   * @param {Object} data - Additional progress data
   * @returns {Object} Formatted progress response
   */
  createProgressResponse(id, progress, status, data = null) {
    return {
      id,
      type: 'progress',
      result: {
        progress,
        status,
        data,
        timestamp: new Date().toISOString()
      }
    };
  }
};

/**
 * Validation helpers
 */
const validationHelpers = {
  /**
   * Validates required parameters for different modes
   * @param {string} mode - The mode to validate for
   * @param {Object} params - Parameters to validate
   * @returns {Object} Validation result
   */
  validateModeParams(mode, params) {
    const validationRules = {
      agent: {
        required: ['goal'],
        optional: ['context', 'maxSteps', 'timeout']
      },
      ask: {
        required: ['question'],
        optional: ['context', 'includeScreenshot']
      },
      editor: {
        required: [],
        optional: ['sessionId', 'autoGenerate']
      }
    };

    const rules = validationRules[mode];
    if (!rules) {
      return {
        valid: false,
        error: `Unknown mode: ${mode}`
      };
    }

    const missing = [];
    for (const field of rules.required) {
      if (!params[field]) {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      return {
        valid: false,
        error: `Missing required parameters: ${missing.join(', ')}`
      };
    }

    return { valid: true };
  },

  /**
   * Validates action parameters
   * @param {string} action - Action to validate
   * @param {Object} args - Action arguments
   * @returns {Object} Validation result
   */
  validateActionParams(action, args) {
    const actionRules = {
      click: {
        required: ['target'],
        optional: ['coordinates', 'button']
      },
      type: {
        required: ['target', 'value'],
        optional: ['clear', 'delay']
      },
      key: {
        required: ['value'],
        optional: ['modifiers']      },
      scroll: {
        required: [],
        optional: ['direction', 'amount', 'target']
      },
      wait: {
        required: ['value'],
        optional: []
      }
    };

    const rules = actionRules[action];
    if (!rules) {
      return {
        valid: false,
        error: `Unknown action: ${action}`
      };
    }

    const missing = [];
    for (const field of rules.required) {
      if (args[field] === undefined || args[field] === null) {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      return {
        valid: false,
        error: `Missing required parameters for action '${action}': ${missing.join(', ')}`
      };
    }

    return { valid: true };
  }
};

/**
 * Logging helpers for different modes
 */
const loggingHelpers = {
  /**
   * Logs a mode start event
   * @param {string} mode - Mode name
   * @param {Object} params - Mode parameters
   * @param {string} sessionId - Session ID
   */
  logModeStart(mode, params, sessionId) {
    console.log(`[${mode.toUpperCase()}-MODE] Starting session ${sessionId}`);
    console.log(`[${mode.toUpperCase()}-MODE] Parameters:`, JSON.stringify(params, null, 2));
  },

  /**
   * Logs a mode step
   * @param {string} mode - Mode name
   * @param {string} sessionId - Session ID
   * @param {string} step - Step description
   * @param {Object} details - Step details
   */
  logModeStep(mode, sessionId, step, details = {}) {
    console.log(`[${mode.toUpperCase()}-MODE] [${sessionId}] ${step}`);
    if (Object.keys(details).length > 0) {
      console.log(`[${mode.toUpperCase()}-MODE] [${sessionId}] Details:`, details);
    }
  },

  /**
   * Logs a mode completion event
   * @param {string} mode - Mode name
   * @param {string} sessionId - Session ID
   * @param {boolean} success - Whether the mode completed successfully
   * @param {string} reason - Completion reason
   */
  logModeComplete(mode, sessionId, success, reason = '') {
    const status = success ? 'COMPLETED' : 'FAILED';
    console.log(`[${mode.toUpperCase()}-MODE] [${sessionId}] ${status}: ${reason}`);
  },

  /**
   * Logs an error in a mode
   * @param {string} mode - Mode name
   * @param {string} sessionId - Session ID
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   */
  logModeError(mode, sessionId, error, context = {}) {
    console.error(`[${mode.toUpperCase()}-MODE] [${sessionId}] ERROR: ${error.message}`);
    if (error.stack) {
      console.error(`[${mode.toUpperCase()}-MODE] [${sessionId}] Stack:`, error.stack);
    }
    if (Object.keys(context).length > 0) {
      console.error(`[${mode.toUpperCase()}-MODE] [${sessionId}] Context:`, context);
    }
  }
};

/**
 * Timeout and retry helpers
 */
const retryHelpers = {
  /**
   * Executes a function with retry logic
   * @param {Function} fn - Function to execute
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} delay - Delay between retries in ms
   * @param {Function} shouldRetry - Function to determine if retry should happen
   * @returns {Promise<any>} Function result
   */
  async withRetry(fn, maxRetries = 3, delay = 1000, shouldRetry = null) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt > maxRetries) {
          throw error;
        }
        
        if (shouldRetry && !shouldRetry(error, attempt)) {
          throw error;
        }
        
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  },

  /**
   * Executes a function with timeout
   * @param {Function} fn - Function to execute
   * @param {number} timeout - Timeout in ms
   * @param {string} timeoutMessage - Timeout error message
   * @returns {Promise<any>} Function result
   */
  async withTimeout(fn, timeout = 30000, timeoutMessage = 'Operation timed out') {
    return Promise.race([
      fn(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(timeoutMessage)), timeout)
      )
    ]);
  }
};

/**
 * Context management helpers
 */
const contextHelpers = {
  /**
   * Merges context objects
   * @param {Object} baseContext - Base context
   * @param {Object} newContext - New context to merge
   * @returns {Object} Merged context
   */
  mergeContext(baseContext, newContext) {
    return {
      ...baseContext,
      ...newContext,
      mergedAt: new Date().toISOString()
    };
  },

  /**
   * Extracts relevant context for a specific operation
   * @param {Object} fullContext - Full context object
   * @param {Array} keys - Keys to extract
   * @returns {Object} Filtered context
   */
  extractContext(fullContext, keys) {
    const extracted = {};
    for (const key of keys) {
      if (fullContext[key] !== undefined) {
        extracted[key] = fullContext[key];
      }
    }
    return extracted;
  },

  /**
   * Sanitizes context for logging (removes sensitive data)
   * @param {Object} context - Context to sanitize
   * @returns {Object} Sanitized context
   */
  sanitizeContext(context) {
    const sensitiveKeys = ['password', 'token', 'key', 'secret', 'credential'];
    const sanitized = { ...context };
    
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }
};

module.exports = {
  sessionHelpers,
  responseHelpers,
  validationHelpers,
  loggingHelpers,
  retryHelpers,
  contextHelpers
};
