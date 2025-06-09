/**
 * Core AI Driver Methods Module
 * Contains the core functionality for analysis, planning, and step execution
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

/**
 * Takes a screenshot by delegating to system-driver
 * @param {Object} config - Configuration object
 * @param {string} filename - Optional filename for the screenshot
 * @returns {Promise<Object>} Result object with success status and screenshot data
 */
async function takeScreenshot(config, filename) {
  try {
    console.log('Requesting screenshot from system-driver...');
    
    // TODO: Implement WebSocket communication with system-driver
    // This should connect to system-driver and request a screenshot
    // For now, return a placeholder response indicating system-driver is needed
    
    return {
      success: false,
      error: 'Screenshot functionality requires system-driver. Please ensure system-driver is running and accessible.',
      requiresSystemDriver: true
    };
  } catch (error) {
    console.error('Error requesting screenshot from system-driver:', error);
    return {
      success: false,
      error: error.message,
      requiresSystemDriver: true
    };
  }
}

/**
 * Analyzes a screenshot using the configured LLM provider
 * @param {Object} config - Configuration object
 * @param {Object} llmProvider - LLM provider instance
 * @param {string} base64Image - Base64 encoded image
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Analysis result
 */
async function analyzeScreen(config, llmProvider, base64Image, options = {}) {
  if (!llmProvider) {
    throw new Error('LLM provider not initialized');
  }

  console.log('Analyzing screen with AI...');
  
  const context = options.context || options.mode || '';
  const prompt = context
    ? `Analyze this screenshot in the context of: ${context}. Describe what you see, identify interactive elements, and suggest possible actions.`
    : 'Analyze this screenshot. Describe what you see, identify all interactive elements (buttons, text fields, menus, etc.), and note their positions and states.';

  try {
    const analysis = await llmProvider.generateResponse(prompt, base64Image);
    console.log('Screen analysis completed');
    return {
      success: true,
      analysis: analysis
    };
  } catch (error) {
    console.error('Error analyzing screen:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Plans a task based on the goal and current screen analysis
 * @param {string} goal - The goal to achieve
 * @param {string} screenAnalysis - Current screen analysis
 * @param {Object} llmProvider - LLM provider instance
 * @returns {Promise<Array>} Array of planned steps
 */
async function planTask(goal, screenAnalysis, llmProvider) {
  if (!llmProvider) {
    throw new Error('LLM provider not initialized');
  }

  console.log(`Planning task: ${goal}`);
  
  const prompt = `
Goal: ${goal}

Current screen analysis:
${screenAnalysis}

Please create a detailed step-by-step plan to achieve this goal. Each step should be actionable and specific.
Format your response as a JSON array of steps, where each step has:
- action: the type of action (click, type, key, wait, etc.)
- description: human-readable description
- target: element to interact with (if applicable)
- value: value to input (if applicable)

Example format:
[
  {
    "action": "click",
    "description": "Click on the login button",
    "target": "login button",
    "coordinates": [100, 200]
  },
  {
    "action": "type",
    "description": "Enter username",
    "target": "username field",
    "value": "user@example.com"
  }
]
`;

  try {
    const planResponse = await llmProvider.generateResponse(prompt);
    
    // Try to parse the JSON response
    let steps;
    try {
      // Extract JSON from the response if it's wrapped in other text
      const jsonMatch = planResponse.match(/\[[\s\S]*\]/);
      const jsonString = jsonMatch ? jsonMatch[0] : planResponse;
      steps = JSON.parse(jsonString);
    } catch (parseError) {
      console.warn('Failed to parse plan as JSON, creating fallback plan');
      // Create a fallback plan if JSON parsing fails
      steps = [{
        action: 'analyze',
        description: 'Analyze current state and determine next action',
        target: 'screen',
        value: goal
      }];
    }
    
    console.log(`Task plan created with ${steps.length} steps`);
    return steps;
  } catch (error) {
    console.error('Error planning task:', error);
    throw error;
  }
}

/**
 * Executes a single step using the appropriate driver
 * @param {Object} step - Step to execute
 * @param {Function} getDriverInstance - Function to get driver instance
 * @returns {Promise<Object>} Execution result
 */
async function executeStep(step, getDriverInstance) {
  console.log(`Executing step: ${step.action} - ${step.description}`);
  
  try {
    // Determine which driver to use based on the action
    let driverId;
    switch (step.action) {
      case 'click':
      case 'type':
      case 'key':
      case 'scroll':
        driverId = 'ui-driver';
        break;
      case 'file':
      case 'folder':
        driverId = 'file-driver';
        break;
      case 'wait':
        // Handle wait locally
        const waitTime = step.value || 1000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return {
          success: true,
          message: `Waited ${waitTime}ms`,
          step: step
        };
      default:
        driverId = 'ui-driver'; // Default to UI driver
    }
    
    const driver = await getDriverInstance(driverId);
    if (!driver) {
      throw new Error(`Failed to get driver instance: ${driverId}`);
    }
    
    // Execute the step
    const result = await driver.executeStep(step.action, {
      target: step.target,
      value: step.value,
      coordinates: step.coordinates,
      ...step
    });
    
    console.log(`Step executed successfully: ${step.description}`);
    return {
      success: true,
      result: result,
      step: step
    };
  } catch (error) {
    console.error(`Error executing step: ${step.description}`, error);
    return {
      success: false,
      error: error.message,
      step: step
    };
  }
}

/**
 * Validates if a goal has been achieved by analyzing the current screen
 * @param {string} goal - Original goal
 * @param {string} screenAnalysis - Current screen analysis
 * @param {Object} llmProvider - LLM provider instance
 * @returns {Promise<Object>} Validation result with success boolean and explanation
 */
async function validateGoalAchievement(goal, screenAnalysis, llmProvider) {
  if (!llmProvider) {
    throw new Error('LLM provider not initialized');
  }

  console.log('Validating goal achievement...');
  
  const prompt = `
Original Goal: ${goal}

Current Screen Analysis:
${screenAnalysis}

Based on the current screen state, has the original goal been achieved?
Please respond with a JSON object containing:
- achieved: boolean (true if goal is achieved, false otherwise)
- confidence: number (0-1, confidence level)
- explanation: string (explanation of the assessment)
- nextAction: string (if not achieved, what should be done next)

Example:
{
  "achieved": true,
  "confidence": 0.9,
  "explanation": "The login was successful and the user dashboard is now visible",
  "nextAction": ""
}
`;

  try {
    const validationResponse = await llmProvider.generateResponse(prompt);
    
    // Try to parse the JSON response
    let validation;
    try {
      const jsonMatch = validationResponse.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : validationResponse;
      validation = JSON.parse(jsonString);
    } catch (parseError) {
      console.warn('Failed to parse validation as JSON, creating fallback validation');
      validation = {
        achieved: false,
        confidence: 0.5,
        explanation: 'Could not determine if goal was achieved due to parsing error',
        nextAction: 'Take another screenshot and reassess'
      };
    }
    
    console.log(`Goal validation completed: ${validation.achieved ? 'ACHIEVED' : 'NOT ACHIEVED'}`);
    return validation;
  } catch (error) {
    console.error('Error validating goal achievement:', error);
    throw error;
  }
}

/**
 * Extracts actions from AI response text
 * @param {string} response - AI response text
 * @param {Object} llmProvider - LLM provider instance
 * @returns {Promise<Array>} Array of extracted actions
 */
async function extractActionsFromResponse(response, llmProvider) {
  if (!llmProvider) {
    throw new Error('LLM provider not initialized');
  }

  console.log('Extracting actions from AI response...');
  
  const prompt = `
Analyze this AI response and extract any actionable steps or commands that should be executed:

AI Response:
${response}

Please identify any actions that should be performed and format them as a JSON array of action objects.
Each action should have:
- action: type of action (click, type, key, wait, screenshot, etc.)
- description: human-readable description
- target: element to interact with (if applicable)
- value: value to input (if applicable)

If no actions are found, return an empty array.

Example:
[
  {
    "action": "click",
    "description": "Click the submit button",
    "target": "submit button"
  }
]
`;

  try {
    const extractionResponse = await llmProvider.generateResponse(prompt);
    
    // Try to parse the JSON response
    let actions;
    try {
      const jsonMatch = extractionResponse.match(/\[[\s\S]*\]/);
      const jsonString = jsonMatch ? jsonMatch[0] : extractionResponse;
      actions = JSON.parse(jsonString);
    } catch (parseError) {
      console.warn('Failed to parse actions as JSON, returning empty array');
      actions = [];
    }
    
    console.log(`Extracted ${actions.length} actions from AI response`);
    return actions;
  } catch (error) {
    console.error('Error extracting actions from response:', error);
    return [];
  }
}

module.exports = {
  takeScreenshot,
  analyzeScreen,
  planTask,
  executeStep,
  validateGoalAchievement,
  extractActionsFromResponse
};
