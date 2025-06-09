const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');

const VISION_DRIVER_PORT = process.env.RUNIX_DRIVER_PORT || 9003;
const wsUrl = `ws://127.0.0.1:${VISION_DRIVER_PORT}`;
const TEST_IMAGE_PATH = path.join('c:\\\\_Runix', 'tests', 'Screenshot 2025-06-07 071247.png');

let requestId = 1;

function sendRequest(ws, method, params) {
    return new Promise((resolve, reject) => {
        const currentId = requestId++;
        const payload = JSON.stringify({
            jsonrpc: '2.0',
            id: currentId,
            method: method,
            params: params
        });

        console.log(`
[TEST] Sending request ${currentId}: ${method}`, params.action ? `action: ${params.action}` : '');

        ws.send(payload);

        const onMessage = (message) => {
            try {
                const response = JSON.parse(message);
                if (response.id === currentId) {
                    ws.off('message', onMessage); // Clean up listener
                    if (response.error) {
                        console.error(`[TEST] Error response ${currentId}:`, JSON.stringify(response.error, null, 2));
                        reject(new Error(response.error.message));
                    } else {
                        console.log(`[TEST] Success response ${currentId}:`, JSON.stringify(response.result, null, 2));
                        resolve(response.result);
                    }
                }
            } catch (e) {
                console.error('[TEST] Error parsing message or unexpected message format:', e);
                ws.off('message', onMessage);
                reject(e);
            }
        };
        ws.on('message', onMessage);

        // Timeout for the request
        setTimeout(() => {
            ws.off('message', onMessage);
            reject(new Error(`Request ${currentId} (${method}) timed out after 45 seconds`));
        }, 45000); // 45 seconds timeout for potentially slower OpenAI calls
    });
}

function validateBounds(element, elementName) {
    if (!element.bounds) {
        console.error(`[Validation Error] ${elementName} is missing 'bounds'.`);
        return false;
    }
    const { x, y, width, height } = element.bounds;
    let isValid = true;
    if (!Number.isInteger(x)) { console.error(`[Validation Error] ${elementName}.bounds.x ('${x}') is not an integer.`); isValid = false; }
    if (!Number.isInteger(y)) { console.error(`[Validation Error] ${elementName}.bounds.y ('${y}') is not an integer.`); isValid = false; }
    if (!Number.isInteger(width)) { console.error(`[Validation Error] ${elementName}.bounds.width ('${width}') is not an integer.`); isValid = false; }
    if (!Number.isInteger(height)) { console.error(`[Validation Error] ${elementName}.bounds.height ('${height}') is not an integer.`); isValid = false; }
    return isValid;
}

async function runGpt4oTests() {
    let ws;
    try {
        ws = new WebSocket(wsUrl);

        await new Promise((resolve, reject) => {
            ws.onopen = () => {
                console.log('[TEST] Connected to Vision Driver.');
                resolve();
            };
            ws.onerror = (err) => {
                console.error('[TEST] WebSocket connection error:', err);
                reject(err);
            };
        });

        // 0. Initialize (optional, but good practice if config needs to be set)
        // await sendRequest(ws, 'initialize', { config: { openai: { fallbackModel: 'gpt-4o' } } });


        // 1. Load the image
        console.log(`[TEST] Loading image from: ${TEST_IMAGE_PATH}`);
        const imageBuffer = await fs.readFile(TEST_IMAGE_PATH);
        const base64Image = imageBuffer.toString('base64');
        console.log(`[TEST] Image loaded, base64 length: ${base64Image.length}`);        // Test 1: 'analyzeScene' action with analysisType: 'ocr' (expected to use gpt-4o)
        console.log("\n--- Test Case 1: 'analyzeScene' action with analysisType: 'ocr' (GPT-4o) ---");
        try {
            const resultOcr = await sendRequest(ws, 'execute', {
                action: 'analyzeScene',
                args: [base64Image, 'ocr'],
                provider: 'openai' // Explicitly request openai
            });
            console.log('[TEST] Response for analyzeScene (ocr):', JSON.stringify(resultOcr, null, 2));

            if (!resultOcr || !resultOcr.success) {
                throw new Error("'analyzeScene' (ocr) action failed or returned no success.");
            }
            if (resultOcr.data.method !== 'openai') {
                console.error(`[Validation Error] Expected method 'openai', got '${resultOcr.data.method}'`);
            } else {
                console.log("[Validation OK] Method is 'openai'.");
            }

            const ocrData = resultOcr.data;
            if (!ocrData || typeof ocrData.fullText !== 'string' || !Array.isArray(ocrData.textBlocks)) {
                console.error('[Validation Error] Response structure for analyzeScene (ocr) is incorrect. Expected {fullText, textBlocks}. Got:', ocrData);
            } else {
                console.log("[Validation OK] 'analyzeScene (ocr)' response structure seems correct.");
                let allBoundsValid = true;
                ocrData.textBlocks.forEach((block, i) => {
                    if (!validateBounds(block, `ocr.textBlocks[${i}]`)) {
                        allBoundsValid = false;
                    }
                });
                if (allBoundsValid) console.log("[Validation OK] All textBlocks bounds in 'ocr' are integers.");
            }
            if (ocrData.usage) {
                console.log("[Validation Info] OpenAI Usage reported:", ocrData.usage);
            }        } catch (err) {
            console.error('[TEST] Error during analyzeScene (ocr) test:', err.message);
        }

        // Test 2: 'analyzeScene' action with analysisType: 'ui' (expected to use gpt-4o)
        console.log("\n--- Test Case 2: 'analyzeScene' action with analysisType: 'ui' (GPT-4o) ---");
        try {
            const resultUi = await sendRequest(ws, 'execute', {
                action: 'analyzeScene',
                args: [base64Image, 'ui'],
                provider: 'openai' // Explicitly request openai
            });
            console.log('[TEST] Response for analyzeScene (ui):', JSON.stringify(resultUi, null, 2));

            if (!resultUi || !resultUi.success) {
                throw new Error("'analyzeScene' (ui) action failed or returned no success.");
            }
            if (resultUi.data.method !== 'openai') {
                console.error(`[Validation Error] Expected method 'openai', got '${resultUi.data.method}'`);
            } else {
                console.log("[Validation OK] Method is 'openai'.");
            }

            const uiData = resultUi.data;
            if (!uiData || !Array.isArray(uiData.elements) || !Array.isArray(uiData.textBlocks) || !Number.isInteger(uiData.totalElements)) {
                console.error('[Validation Error] Response structure for analyzeScene (ui) is incorrect. Expected {elements, textBlocks, totalElements}. Got:', uiData);
            } else {
                console.log("[Validation OK] 'analyzeScene (ui)' response structure seems correct.");
                let allBoundsValid = true;
                uiData.elements.forEach((el, i) => {
                    if (!validateBounds(el, `ui.elements[${i}]`)) {
                        allBoundsValid = false;
                    }
                });
                uiData.textBlocks.forEach((block, i) => {
                    if (!validateBounds(block, `ui.textBlocks[${i}]`)) {
                        allBoundsValid = false;
                    }
                });
                if (allBoundsValid) console.log("[Validation OK] All element and textBlocks bounds in 'ui' are integers.");
            }
            if (uiData.usage) {
                console.log("[Validation Info] OpenAI Usage reported:", uiData.usage);
            }

        } catch (err) {
            console.error('[TEST] Error during analyzeScene (ui) test:', err.message);
        }

        // Test 3: 'analyzeScene' action with analysisType: 'general' (or default) (expected to use gpt-4o)
        console.log("\\n--- Test Case 3: 'analyzeScene' action with analysisType: 'general' (GPT-4o) ---");
        try {            const resultGeneral = await sendRequest(ws, 'execute', {
                action: 'analyzeScene',
                args: [base64Image, 'general'],
                provider: 'openai' // Explicitly request openai
            });
            console.log('[TEST] Response for analyzeScene (general):', JSON.stringify(resultGeneral, null, 2));

            if (!resultGeneral || !resultGeneral.success) {
                throw new Error("'analyzeScene' (general) action failed or returned no success.");
            }
            if (resultGeneral.data.method !== 'openai') {
                console.error(`[Validation Error] Expected method 'openai', got '${resultGeneral.data.method}'`);
            } else {
                console.log("[Validation OK] Method is 'openai'.");
            }

            const generalData = resultGeneral.data;
            // General analysis has a flexible structure, check for description and at least one of identified_objects or identified_text
            if (!generalData || typeof generalData.description !== 'string' || (!Array.isArray(generalData.identified_objects) && !Array.isArray(generalData.identified_text))) {
                console.error('[Validation Error] Response structure for analyzeScene (general) is incorrect. Expected {description, identified_objects?, identified_text?}. Got:', generalData);
            } else {
                console.log("[Validation OK] 'analyzeScene (general)' response structure seems correct.");
                let allBoundsValid = true;
                if (generalData.identified_objects) {
                    generalData.identified_objects.forEach((obj, i) => {
                        if (!validateBounds(obj, `general.identified_objects[${i}]`)) {
                            allBoundsValid = false;
                        }
                    });
                }
                if (generalData.identified_text) {
                    generalData.identified_text.forEach((txt, i) => {
                        if (!validateBounds(txt, `general.identified_text[${i}]`)) {
                            allBoundsValid = false;
                        }
                    });
                }
                if (allBoundsValid) console.log("[Validation OK] All identified element bounds in 'general' are integers (if present).");
            }
            if (generalData.usage) {
                console.log("[Validation Info] OpenAI Usage reported:", generalData.usage);
            }

        } catch (err) {
            console.error('[TEST] Error during analyzeScene (general) test:', err.message);
        }        // Test 4: 'extractText' action (should also use gpt-4o via analyzeScene -> ocr)
        console.log("\n--- Test Case 4: 'extractText' action (GPT-4o) ---");
        try {
            const resultExtractText = await sendRequest(ws, 'execute', {
                action: 'extractText',
                args: [base64Image],
                provider: 'openai' // Explicitly request openai
            });
            console.log('[TEST] Response for extractText:', JSON.stringify(resultExtractText, null, 2));

            if (!resultExtractText || !resultExtractText.success) {
                throw new Error("'extractText' action failed or returned no success.");
            }
            // extractText calls analyzeScene which calls analyzeWithOpenAI, which sets method to 'openai'
            if (resultExtractText.data.method !== 'openai') {
                console.error(`[Validation Error] Expected method 'openai', got '${resultExtractText.data.method}'`);
            } else {
                console.log("[Validation OK] Method is 'openai'.");
            }

            const extractTextData = resultExtractText.data;
            if (!extractTextData || typeof extractTextData.fullText !== 'string' || !Array.isArray(extractTextData.textBlocks)) {
                console.error('[Validation Error] Response structure for extractText is incorrect. Expected {fullText, textBlocks}. Got:', extractTextData);
            } else {
                console.log("[Validation OK] 'extractText' response structure seems correct.");
                let allBoundsValid = true;
                extractTextData.textBlocks.forEach((block, i) => {
                    if (!validateBounds(block, `extractText.textBlocks[${i}]`)) {
                        allBoundsValid = false;
                    }
                });
                if (allBoundsValid) console.log("[Validation OK] All textBlocks bounds in 'extractText' are integers.");
            }
             if (extractTextData.usage) {
                console.log("[Validation Info] OpenAI Usage reported:", extractTextData.usage);
            }

        } catch (err) {
            console.error('[TEST] Error during extractText test:', err.message);
        }        // Test 5: 'detectUI' action (should also use gpt-4o via analyzeScene -> ui)
        console.log("\n--- Test Case 5: 'detectUI' action (GPT-4o) ---");
        try {
            const resultDetectUI = await sendRequest(ws, 'execute', {
                action: 'detectUI',
                args: [base64Image],
                provider: 'openai' // Explicitly request openai
            });
            console.log('[TEST] Response for detectUI:', JSON.stringify(resultDetectUI, null, 2));

            if (!resultDetectUI || !resultDetectUI.success) {
                throw new Error("'detectUI' action failed or returned no success.");
            }
            // detectUI calls analyzeScene which calls analyzeWithOpenAI, which sets method to 'openai'
            if (resultDetectUI.data.method !== 'openai') {
                console.error(`[Validation Error] Expected method 'openai', got '${resultDetectUI.data.method}'`);
            } else {
                console.log("[Validation OK] Method is 'openai'.");
            }

            const detectUIData = resultDetectUI.data;
            // The detectUI action wraps the result from analyzeScene('ui')
            if (!detectUIData || !Array.isArray(detectUIData.elements) || !Array.isArray(detectUIData.textBlocks) || !Number.isInteger(detectUIData.totalElements)) {
                console.error('[Validation Error] Response structure for detectUI is incorrect. Expected {elements, textBlocks, totalElements}. Got:', detectUIData);
            } else {
                console.log("[Validation OK] 'detectUI' response structure seems correct.");
                let allBoundsValid = true;
                detectUIData.elements.forEach((el, i) => {
                    if (!validateBounds(el, `detectUI.elements[${i}]`)) {
                        allBoundsValid = false;
                    }
                });
                detectUIData.textBlocks.forEach((block, i) => {
                    if (!validateBounds(block, `detectUI.textBlocks[${i}]`)) {
                        allBoundsValid = false;
                    }
                });
                if (allBoundsValid) console.log("[Validation OK] All element and textBlocks bounds in 'detectUI' are integers.");
            }
            if (detectUIData.usage) {
                console.log("[Validation Info] OpenAI Usage reported:", detectUIData.usage);
            }

        } catch (err) {
            console.error('[TEST] Error during detectUI test:', err.message);
        }


    } catch (error) {
        console.error('[TEST] Main test execution error:', error);
    } finally {
        if (ws && ws.readyState === WebSocket.OPEN) {
            console.log('[TEST] Closing WebSocket connection.');
            ws.close();
        }
        console.log("\n[TEST] All GPT-4o specific tests finished.");
    }
}

runGpt4oTests();
