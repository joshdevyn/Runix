const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');

const VISION_DRIVER_URL = 'ws://127.0.0.1:9003'; // Default port for vision-driver
const TEST_IMAGE_PATH = path.join('c:', '_Runix', 'tests', 'Screenshot 2025-06-07 071247.png');

let requestId = 0;

function sendRequest(ws, method, params) {
  return new Promise((resolve, reject) => {
    const currentId = ++requestId;
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id: currentId,
      method: method,
      params: params
    });

    console.log(`\n[Test Script] Sending request (ID: ${currentId}): ${method}`, params.action ? `action: ${params.action}` : '');

    ws.send(payload);

    const onMessage = (message) => {
      try {
        const response = JSON.parse(message);
        if (response.id === currentId) {
          ws.off('message', onMessage); // Clean up listener
          if (response.error) {
            console.error(`[Test Script] Received error for ID ${currentId}:`, response.error);
            reject(new Error(response.error.message));
          } else {
            console.log(`[Test Script] Received response for ID ${currentId}`);
            resolve(response.result);
          }
        }
      } catch (e) {
        ws.off('message', onMessage);
        console.error('[Test Script] Error parsing response JSON:', e);
        reject(e);
      }
    };
    ws.on('message', onMessage);

    // Timeout for the request
    setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error(`Request ${currentId} (${method}) timed out after 30 seconds`));
    }, 30000); // 30 seconds timeout
  });
}

function validateBounds(element, elementName) {
  if (!element.bounds) {
    console.error(`[Validation Error] ${elementName} is missing 'bounds'.`);
    return false;
  }
  const { x, y, width, height } = element.bounds;
  let isValid = true;
  if (!Number.isInteger(x)) { console.error(`[Validation Error] ${elementName}.bounds.x is not an integer: ${x}`); isValid = false; }
  if (!Number.isInteger(y)) { console.error(`[Validation Error] ${elementName}.bounds.y is not an integer: ${y}`); isValid = false; }
  if (!Number.isInteger(width)) { console.error(`[Validation Error] ${elementName}.bounds.width is not an integer: ${width}`); isValid = false; }
  if (!Number.isInteger(height)) { console.error(`[Validation Error] ${elementName}.bounds.height is not an integer: ${height}`); isValid = false; }
  return isValid;
}

async function runComputerUseTests() {
  let ws;
  try {
    ws = new WebSocket(VISION_DRIVER_URL);
    await new Promise((resolve, reject) => {
      ws.onopen = () => {
        console.log('[Test Script] Connected to Vision Driver.');
        resolve();
      };
      ws.onerror = (err) => {
        console.error('[Test Script] WebSocket connection error:', err);
        reject(err);
      };
    });

    const imageBuffer = await fs.readFile(TEST_IMAGE_PATH);
    const base64Image = imageBuffer.toString('base64');    // Test 1: 'computerUse' action (expected to use analyzeWithComputerUse -> computer-use-preview model)
    console.log("\\n--- Test Case 1: 'computerUse' action ---");
    try {
      const resultComputerUse = await sendRequest(ws, 'execute', {
        action: 'computerUse',
        args: [base64Image], // Fixed: use array format instead of object
        provider: 'openai' // Explicitly request openai
      });
      console.log('[Test Script] Response for computerUse:', JSON.stringify(resultComputerUse, null, 2));

      if (!resultComputerUse || !resultComputerUse.success) {
        throw new Error("'computerUse' action failed or returned no success.");
      }
      if (resultComputerUse.data.method !== 'computer-use-preview') {
        console.error(`[Validation Error] Expected method 'computer-use-preview', got '${resultComputerUse.data.method}'`);
      } else {
        console.log("[Validation OK] Method is 'computer-use-preview'.");
      }

      const { data } = resultComputerUse.data; // This is the nested data from analyzeWithComputerUse
      if (!data || typeof data.text !== 'string' || !Array.isArray(data.elements) || typeof data.description !== 'string' || !Array.isArray(data.actions)) {
        console.error('[Validation Error] Response structure for computerUse is incorrect. Expected {text, elements, description, actions}. Got:', data);
      } else {
        console.log("[Validation OK] 'computerUse' response structure seems correct.");
        let allBoundsValid = true;        data.elements.forEach((el, i) => {
          if (!validateBounds(el, `computerUse.elements[${i}]`)) {
            allBoundsValid = false;
          }
        });
        if (allBoundsValid) console.log("[Validation OK] All element bounds in 'computerUse' are integers.");
      }
       if (resultComputerUse.data.usage) {
        console.log("[Validation Info] OpenAI Usage reported:", resultComputerUse.data.usage);
      }


    } catch (err) {
      console.error('[Test Script] Error during computerUse test:', err.message);
    }

    // Test 2: 'analyzeScene' action with analysisType: 'computer_use' (expected to use analyzeWithOpenAI -> computer-use-preview model)
    console.log("\\n--- Test Case 2: 'analyzeScene' action with analysisType: 'computer_use' ---");    try {
      const resultAnalyzeSceneCU = await sendRequest(ws, 'execute', {
        action: 'analyzeScene',
        args: [base64Image, 'computer_use'], // Fixed: use array format instead of object
        provider: 'openai' // Explicitly request openai
      });
      console.log('[Test Script] Response for analyzeScene (computer_use):', JSON.stringify(resultAnalyzeSceneCU, null, 2));

      if (!resultAnalyzeSceneCU || !resultAnalyzeSceneCU.success) {
        throw new Error("'analyzeScene' (computer_use) action failed or returned no success.");
      }
      // analyzeWithOpenAI sets method to 'openai'
      if (resultAnalyzeSceneCU.data.method !== 'openai') {
        console.error(`[Validation Error] Expected method 'openai', got '${resultAnalyzeSceneCU.data.method}'`);
      } else {
        console.log("[Validation OK] Method is 'openai'.");
      }

      const sceneData = resultAnalyzeSceneCU.data;
      if (!sceneData || typeof sceneData.screen_analysis !== 'string' || !Array.isArray(sceneData.interactive_elements) || !Array.isArray(sceneData.text_elements) || !Array.isArray(sceneData.possible_actions)) {
        console.error('[Validation Error] Response structure for analyzeScene (computer_use) is incorrect. Expected {screen_analysis, interactive_elements, text_elements, possible_actions}. Got:', sceneData);
      } else {
        console.log("[Validation OK] 'analyzeScene (computer_use)' response structure seems correct.");
        let allBoundsValid = true;        sceneData.interactive_elements.forEach((el, i) => {
          if (!validateBounds(el, `analyzeScene.interactive_elements[${i}]`)) {
            allBoundsValid = false;
          }
        });
        sceneData.text_elements.forEach((el, i) => {
          if (!validateBounds(el, `analyzeScene.text_elements[${i}]`)) {
            allBoundsValid = false;
          }
        });
        if (allBoundsValid) console.log("[Validation OK] All element bounds in 'analyzeScene (computer_use)' are integers.");
      }
      if (sceneData.usage) {
        console.log("[Validation Info] OpenAI Usage reported:", sceneData.usage);
      }

    } catch (err) {
      console.error('[Test Script] Error during analyzeScene (computer_use) test:', err.message);
    }

  } catch (error) {
    console.error('[Test Script] Main test execution error:', error);
  } finally {
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('[Test Script] Closing WebSocket connection.');
      ws.close();
    }
    console.log("\\n[Test Script] All computer-use specific tests finished.");
  }
}

runComputerUseTests();
