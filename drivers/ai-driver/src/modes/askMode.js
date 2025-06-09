// c:\_Runix\drivers\ai-driver\src\modes\askMode.js
const { takeScreenshot, analyzeScreen } = require('../core/aiDriverMethods');
const { generateComprehensiveFeatureFile, saveSessionArtifacts } = require('../utils/featureFile');
const { sendSuccessResponse, sendErrorResponse } = require('../utils/responseHelpers');
const { getHelpfulActionFunctions, extractActionsFromResponse, executeHelpfulAction, createAskModePrompt } = require('../utils/modeHelpers');
const { getSessionContext, updateSessionContext } = require('../config/config');

async function handleAskMode(ws, id, args, config, llmProvider) {
    const question = args.question || (Array.isArray(args) && args.length > 0 ? args[0] : null);
    const context = args.context || (Array.isArray(args) && args.length > 1 ? args[1] : {});

    if (!question) {
        return sendErrorResponse(ws, id, 'Question not provided for ask mode');
    }

    console.log(`[ASK-MODE] Processing question: "${question}"`);
    config.currentMode = 'ask';
    
    // Get and update session context
    let sessionContext = getSessionContext();
    if (!sessionContext.sessionId) {
        sessionContext = updateSessionContext({ sessionId: `ask-${Date.now()}` });
    }
    sessionContext = updateSessionContext({ mode: 'ask' });
    
    // Ensure userInteractionHistory is initialized
    if (!sessionContext.userInteractionHistory) {
        sessionContext = updateSessionContext({ userInteractionHistory: [] });
    }

    try {
        if (!llmProvider) {
            console.error('[ASK-MODE] LLM provider is not initialized.');
            throw new Error('LLM provider not initialized. Cannot proceed in ask mode.');
        }        // Note: Screenshot functionality moved to system-driver
        // Ask mode will work without screenshots for now
        let screenAnalysis = null;
        let screenshotFilename = null;
        
        console.log('[ASK-MODE] Screenshot functionality delegated to system-driver, proceeding without screen context...');

        const prompt = createAskModePrompt(question, screenAnalysis, context, config);
        
        console.log('[ASK-MODE] Generating response from LLM...');
        const response = await llmProvider.generateResponse(prompt, {
            mode: 'ask',
            functions: getHelpfulActionFunctions(config) // Pass config to helper if it needs it
        });

        const aiResponseMessage = response.choices && response.choices[0] && response.choices[0].message 
                                ? response.choices[0].message 
                                : (response.content && Array.isArray(response.content) && response.content[0] 
                                    ? { role: 'assistant', content: response.content[0].text } 
                                    : { role: 'assistant', content: 'No response content found.'});
        
        const answer = aiResponseMessage.content;
        const toolCalls = aiResponseMessage.tool_calls || (response.tool_calls ? response.tool_calls : []);

        const actions = extractActionsFromResponse(response, toolCalls, config);
        const actionResults = [];

        if (actions && actions.length > 0) {
            console.log(`[ASK-MODE] Extracted ${actions.length} actions to perform.`);
            for (const action of actions) {
                console.log(`[ASK-MODE] Executing helpful action: ${action.type || action.name}`);
                const actionResult = await executeHelpfulAction(action, config, llmProvider, ws, id);
                actionResults.push(actionResult);
            }
        }        const interaction = {
            type: 'ask_interaction',
            question: question,
            prompt: prompt, // Save the actual prompt sent to LLM
            answer: answer,
            actions: actionResults,
            screenAnalysis: screenAnalysis,
            screenshotFile: screenshotFilename,
            timestamp: new Date().toISOString()
        };
        
        // Get current session context and update history
        sessionContext = getSessionContext();
        const currentHistory = sessionContext.userInteractionHistory || [];
        currentHistory.push(interaction);
        sessionContext = updateSessionContext({ userInteractionHistory: currentHistory });        let featureFilePath = null;
        if (config.generateFeatures && (actionResults.length > 0 || screenAnalysis)) {
            console.log('[ASK-MODE] Generating feature file for interaction...');
            featureFilePath = await generateComprehensiveFeatureFile(sessionContext.sessionId, {
                interactions: [interaction], // Pass as an array of interactions
                mode: 'ask'
            }, config);
            sessionContext = updateSessionContext({ featureFile: featureFilePath }); // Update session with the latest feature file
        }

        const successResult = {
            question: question,
            answer: answer,
            actions: actionResults,
            screenAnalysis: screenAnalysis,
            screenshotFile: screenshotFilename,
            mode: 'ask',
            sessionId: sessionContext.sessionId,
            featureFile: featureFilePath
        };

        sendSuccessResponse(ws, id, successResult);    } catch (error) {
        console.error('[ASK-MODE] Ask mode execution failed:', error);
        
        // Get current session context and update history with error
        let sessionContext = getSessionContext();
        const currentHistory = sessionContext.userInteractionHistory || [];
        currentHistory.push({
            type: 'error',
            question: question,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        sessionContext = updateSessionContext({ userInteractionHistory: currentHistory });
        
        // Optionally save artifacts on error too
        await saveSessionArtifacts(sessionContext.sessionId, {
            question,
            error: error.message,
            history: sessionContext.userInteractionHistory
        }, config).catch(e => console.error('Failed to save error artifacts for ask mode:', e));

        sendErrorResponse(ws, id, `Ask mode failed: ${error.message}`, { stack: error.stack });
    }
}

module.exports = { handleAskMode };
