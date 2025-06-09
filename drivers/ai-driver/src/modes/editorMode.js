// c:\_Runix\drivers\ai-driver\src\modes\editorMode.js
const { sendSuccessResponse, sendErrorResponse } = require('../utils/responseHelpers');
const { generateComprehensiveFeatureFile, saveSessionArtifacts } = require('../utils/featureFile');
const { getLLMProvider } = require('../providers/llmProviders'); // If LLM is needed for feature generation

// Editor mode specific state if not already in main config.sessionContext.observedActions
// For this refactoring, we assume observedActions is managed in config.sessionContext

function startEditorMode(config, ws, id, params) {
    console.log('Starting editor mode...');
    config.currentMode = 'editor';
    config.sessionContext.mode = 'editor';
    if (!config.sessionContext.sessionId) {
        config.sessionContext.sessionId = `editor-${Date.now()}`;
    }
    config.sessionContext.observedActions = []; // Reset observed actions for a new session
    config.sessionContext.userInteractionHistory = []; // Can also be used for editor context

    sendSuccessResponse(ws, id, {
        status: 'editor_mode_started',
        sessionId: config.sessionContext.sessionId,
        message: 'Editor mode started. Ready to record actions.'
    });
}

function recordUserAction(config, ws, id, params) {
    if (config.currentMode !== 'editor') {
        return sendErrorResponse(ws, id, 'Not in editor mode. Cannot record action.');
    }
    if (!params || !params.action) {
        return sendErrorResponse(ws, id, 'No action provided to record.');
    }

    const observedAction = {
        ...params.action, // Expecting { type, details, timestamp, element, value, etc. }
        timestamp: params.action.timestamp || new Date().toISOString()
    };

    config.sessionContext.observedActions.push(observedAction);
    console.log('Recorded user action:', observedAction);

    sendSuccessResponse(ws, id, {
        status: 'action_recorded',
        action: observedAction,
        observationCount: config.sessionContext.observedActions.length
    });
}

async function generateFeatureFromObservations(config, ws, id, llmProvider) {
    if (config.currentMode !== 'editor') {
        return sendErrorResponse(ws, id, 'Not in editor mode. Cannot generate feature file.');
    }
    if (!config.sessionContext.observedActions || config.sessionContext.observedActions.length === 0) {
        return sendErrorResponse(ws, id, 'No observations recorded to generate a feature file from.');
    }

    console.log('Generating feature file from observations...');
    try {
        // Potentially use LLM to interpret observations and create a more descriptive feature file
        // For now, a direct generation based on observed actions structure
        const featureData = {
            task: 'User-driven session via editor mode',
            observations: config.sessionContext.observedActions,
            mode: 'editor',
            sessionId: config.sessionContext.sessionId
            // We might need to transform observations into a step-like format for generateComprehensiveFeatureFile
        };

        let featureFilePath = null;
        if (config.generateFeatures) {
            featureFilePath = await generateComprehensiveFeatureFile(
                config.sessionContext.sessionId,
                featureData, // This might need adjustment based on how generateComprehensiveFeatureFile expects data
                config,
                llmProvider // Pass LLM provider if it's used for generation enhancement
            );
            config.sessionContext.featureFile = featureFilePath;
        }

        await saveSessionArtifacts(config.sessionContext.sessionId, {
            observations: config.sessionContext.observedActions,
            featureFile: featureFilePath,
            mode: 'editor'
        }, config);

        sendSuccessResponse(ws, id, {
            status: 'feature_generated',
            featureFile: featureFilePath,
            observationCount: config.sessionContext.observedActions.length,
            artifactsPath: `${config.outputDir}/sessions/${config.sessionContext.sessionId}`
        });

    } catch (error) {
        console.error('Error generating feature file from observations:', error);
        sendErrorResponse(ws, id, `Failed to generate feature file: ${error.message}`);
    }
}

function stopEditorMode(config, ws, id) {
    if (config.currentMode !== 'editor') {
        // Idempotent: if not in editor mode, just confirm
        sendSuccessResponse(ws, id, { status: 'not_in_editor_mode', message: 'Editor mode was not active.' });
        return;
    }

    console.log('Stopping editor mode...');
    const observations = [...config.sessionContext.observedActions]; // Copy before reset
    const sessionId = config.sessionContext.sessionId;

    // Optionally, generate a feature file automatically on stop if observations exist
    // For now, explicit generation is handled by generateFeatureFromObservations

    config.currentMode = 'chat'; // Or a default mode
    config.sessionContext.mode = config.currentMode;
    // Decide whether to clear observedActions or keep them for later inspection
    // config.sessionContext.observedActions = []; 
    // config.sessionContext.sessionId = null; // Or keep for artifact association

    sendSuccessResponse(ws, id, {
        status: 'editor_mode_stopped',
        sessionId: sessionId,
        finalObservationCount: observations.length,
        message: 'Editor mode stopped. Observations (if any) are retained in session until cleared or new session starts.'
    });
}

module.exports = {
    startEditorMode,
    recordUserAction,
    generateFeatureFromObservations,
    stopEditorMode
};
