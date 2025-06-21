// c:\_Runix\drivers\ai-driver\src\modes\agentMode.js
const { takeScreenshot, analyzeScreen, planTask, executeStep } = require('../core/aiDriverMethods');
const { generateComprehensiveFeatureFile, saveSessionArtifacts } = require('../utils/featureFile');
const { sendSuccessResponse, sendErrorResponse } = require('../utils/responseHelpers');
const { getSessionContext, updateSessionContext } = require('../config/config');

/**
 * Agent Mode - Autonomous task completion with AI planning and execution
 */
async function handleAgentMode(ws, id, args, config, llmProvider) {
    const task = args.task || (Array.isArray(args) && args.length > 0 ? args[0] : null);
    const options = args.options || (Array.isArray(args) && args.length > 1 ? args[1] : {});

    if (!task) {
        return sendErrorResponse(ws, id, 'Task description not provided for agent mode');
    }

    console.log(`🤖 Agent Mode: Starting autonomous execution of task: ${task}`);
    config.currentMode = 'agent';
    
    // Initialize or update session context
    let sessionContext = getSessionContext();
    if (!sessionContext.sessionId) {
        sessionContext = updateSessionContext({ sessionId: `agent-${Date.now()}` });
    }
    
    const agentSession = updateSessionContext({ 
        currentTask: task,
        mode: 'agent',
        options: {
            confirmActions: options.confirmActions !== false, // Default to true
            dryRun: options.dryRun || false,
            maxSteps: options.maxSteps || 10,
            outputDir: options.outputDir || './ai-artifacts'
        },
        executionHistory: [],
        currentStep: 0,
        startTime: new Date().toISOString()
    });

    try {
        // Agent execution flow
        const agentResult = await executeAgentTask(task, options, config, llmProvider, sessionContext);
        
        // Save session artifacts
        await saveAgentSession(agentSession, agentResult);
        
        sendSuccessResponse(ws, id, 'Agent task completed', {
            sessionId: agentSession.sessionId,
            task: task,
            steps: agentResult.steps,
            success: agentResult.success,
            totalSteps: agentResult.totalSteps,
            executionTime: agentResult.executionTime,
            artifacts: agentResult.artifacts
        });
        
    } catch (error) {
        console.error('🚨 Agent mode execution failed:', error);
        
        // Save failed session for analysis
        await saveAgentSession(agentSession, { 
            success: false, 
            error: error.message,
            steps: agentSession.executionHistory || []
        });
        
        sendErrorResponse(ws, id, `Agent mode failed: ${error.message}`, {
            sessionId: agentSession.sessionId,
            error: error.message,
            steps: agentSession.executionHistory || []
        });
    }
}

/**
 * Execute the agent task with AI planning and execution
 */
async function executeAgentTask(task, options, config, llmProvider, sessionContext) {
    const startTime = Date.now();
    const maxSteps = options.maxSteps || 10;
    const confirmActions = options.confirmActions !== false;
    const dryRun = options.dryRun || false;
    
    console.log(`🎯 Agent Task: ${task}`);
    console.log(`⚙️  Options: confirmActions=${confirmActions}, dryRun=${dryRun}, maxSteps=${maxSteps}`);
    
    // Step 1: Initial Analysis
    console.log('📊 Step 1: Analyzing current state...');
    const initialAnalysis = await analyzeCurrentState(config, llmProvider);
    
    // Step 2: Create Task Plan
    console.log('📋 Step 2: Creating execution plan...');
    const taskPlan = await planTask(task, initialAnalysis, llmProvider);
    
    if (dryRun) {
        console.log('🏃‍♂️ Dry run mode: Showing planned actions without execution');
        return {
            success: true,
            dryRun: true,
            plan: taskPlan,
            steps: [],
            totalSteps: taskPlan.length,
            executionTime: Date.now() - startTime,
            artifacts: []
        };
    }
    
    // Step 3: Execute Plan
    console.log(`⚡ Step 3: Executing plan with ${taskPlan.length} steps...`);
    const executionResult = await executePlanWithMonitoring(
        taskPlan, 
        config, 
        llmProvider, 
        sessionContext,
        { confirmActions, maxSteps }
    );
    
    return {
        success: executionResult.success,
        steps: executionResult.steps,
        totalSteps: taskPlan.length,
        executionTime: Date.now() - startTime,
        artifacts: executionResult.artifacts,
        plan: taskPlan
    };
}

/**
 * Analyze current state (screen, system, context)
 */
async function analyzeCurrentState(config, llmProvider) {
    console.log('🔍 Analyzing current system state...');
    
    try {
        // Try to get screenshot for visual analysis
        const screenshotResult = await takeScreenshot(config);
        
        if (screenshotResult.success && screenshotResult.base64Image) {
            const screenAnalysis = await analyzeScreen(config, llmProvider, screenshotResult.base64Image, {
                context: 'agent_initial_analysis'
            });
            
            return `Visual Analysis: ${screenAnalysis.analysis}`;
        } else {
            // Fallback to text-based analysis
            console.log('📝 Visual analysis unavailable, using text-based analysis');
            
            const textAnalysis = await llmProvider.generateResponse(
                'Analyze the current system state and context for task execution. What information do you need to proceed with automated task completion?'
            );
            
            return `System Analysis: ${textAnalysis}`;
        }
    } catch (error) {
        console.warn('⚠️  Analysis failed, using minimal context:', error.message);
        return `Minimal Context: Starting agent execution in current environment. ${error.message}`;
    }
}

/**
 * Execute plan with monitoring and adaptive behavior
 */
async function executePlanWithMonitoring(plan, config, llmProvider, sessionContext, options) {
    const { confirmActions, maxSteps } = options;
    const executedSteps = [];
    const artifacts = [];
    let currentStep = 0;
    
    for (const step of plan.slice(0, maxSteps)) {
        currentStep++;
        console.log(`\n🔄 Executing Step ${currentStep}/${Math.min(plan.length, maxSteps)}: ${step.description}`);
        
        // Confirmation check
        if (confirmActions && !step.auto) {
            const confirmation = await requestConfirmation(step);
            if (!confirmation) {
                console.log('❌ User cancelled execution');
                break;
            }
        }
        
        try {
            // Execute the step
            const stepResult = await executeAgentStep(step, config, llmProvider);
            
            executedSteps.push({
                step: currentStep,
                action: step,
                result: stepResult,
                timestamp: new Date().toISOString(),
                success: stepResult.success
            });
            
            // Update session context
            updateSessionContext({
                currentStep: currentStep,
                executionHistory: executedSteps
            });
            
            // Collect artifacts
            if (stepResult.artifacts) {
                artifacts.push(...stepResult.artifacts);
            }
            
            console.log(`✅ Step ${currentStep} completed: ${stepResult.success ? 'Success' : 'Failed'}`);
            
            // Adaptive behavior: Re-analyze if step failed
            if (!stepResult.success) {
                console.log('🔄 Step failed, attempting adaptive recovery...');
                const recoveryAction = await planRecovery(step, stepResult, config, llmProvider);
                
                if (recoveryAction) {
                    const recoveryResult = await executeAgentStep(recoveryAction, config, llmProvider);
                    executedSteps.push({
                        step: `${currentStep}_recovery`,
                        action: recoveryAction,
                        result: recoveryResult,
                        timestamp: new Date().toISOString(),
                        success: recoveryResult.success
                    });
                }
            }
            
        } catch (error) {
            console.error(`❌ Step ${currentStep} execution error:`, error);
            
            executedSteps.push({
                step: currentStep,
                action: step,
                result: { success: false, error: error.message },
                timestamp: new Date().toISOString(),
                success: false
            });
        }
        
        // Brief pause between steps
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const successCount = executedSteps.filter(s => s.success).length;
    const success = successCount > 0 && successCount >= executedSteps.length * 0.7; // 70% success rate
    
    return {
        success,
        steps: executedSteps,
        artifacts,
        successRate: successCount / executedSteps.length
    };
}

/**
 * Execute a single agent step with appropriate method
 */
async function executeAgentStep(step, config, llmProvider) {
    console.log(`🎬 Executing: ${step.action} - ${step.description}`);
    
    try {
        switch (step.action) {
            case 'analyze':
                return await performAnalysis(step, config, llmProvider);
            case 'click':
            case 'type':
            case 'key':
                return await performUIAction(step, config);
            case 'wait':
                return await performWait(step);
            case 'search':
                return await performSearch(step, llmProvider);
            case 'generate':
                return await performGeneration(step, llmProvider);
            default:
                // Generic execution using LLM guidance
                return await performGenericAction(step, config, llmProvider);
        }
    } catch (error) {
        return {
            success: false,
            error: error.message,
            step: step
        };
    }
}

/**
 * Perform analysis action
 */
async function performAnalysis(step, config, llmProvider) {
    const analysis = await llmProvider.generateResponse(
        `Analyze: ${step.description}. Target: ${step.target || 'current context'}. Provide detailed insights.`
    );
    
    return {
        success: true,
        analysis,
        artifacts: [{
            type: 'analysis',
            content: analysis,
            timestamp: new Date().toISOString()
        }]
    };
}

/**
 * Perform UI action (delegated to system driver eventually)
 */
async function performUIAction(step, config) {
    // TODO: Integrate with system-driver for actual UI actions
    console.log(`🖱️  UI Action: ${step.action} on ${step.target}`);
    
    return {
        success: true,
        message: `Simulated ${step.action} action on ${step.target}`,
        note: 'UI actions require system-driver integration'
    };
}

/**
 * Perform wait action
 */
async function performWait(step) {
    const waitTime = step.value || step.duration || 2000;
    console.log(`⏳ Waiting ${waitTime}ms...`);
    
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    return {
        success: true,
        message: `Waited ${waitTime}ms`
    };
}

/**
 * Perform search action
 */
async function performSearch(step, llmProvider) {
    const searchQuery = step.value || step.query || step.description;
    console.log(`🔍 Searching: ${searchQuery}`);
    
    const searchGuidance = await llmProvider.generateResponse(
        `Provide search guidance for: ${searchQuery}. Include search strategies, relevant keywords, and expected results.`
    );
    
    return {
        success: true,
        searchGuidance,
        artifacts: [{
            type: 'search_guidance',
            query: searchQuery,
            content: searchGuidance,
            timestamp: new Date().toISOString()
        }]
    };
}

/**
 * Perform content generation
 */
async function performGeneration(step, llmProvider) {
    const generateRequest = step.value || step.content || step.description;
    console.log(`✨ Generating: ${generateRequest}`);
    
    const generatedContent = await llmProvider.generateResponse(
        `Generate content for: ${generateRequest}. Provide high-quality, relevant content.`
    );
    
    return {
        success: true,
        content: generatedContent,
        artifacts: [{
            type: 'generated_content',
            request: generateRequest,
            content: generatedContent,
            timestamp: new Date().toISOString()
        }]
    };
}

/**
 * Perform generic action with LLM guidance
 */
async function performGenericAction(step, config, llmProvider) {
    console.log(`🎯 Generic action: ${step.action}`);
    
    const actionGuidance = await llmProvider.generateResponse(
        `Provide guidance for executing this action: ${JSON.stringify(step)}. Include specific steps and considerations.`
    );
    
    return {
        success: true,
        guidance: actionGuidance,
        artifacts: [{
            type: 'action_guidance',
            action: step,
            content: actionGuidance,
            timestamp: new Date().toISOString()
        }]
    };
}

/**
 * Plan recovery action when a step fails
 */
async function planRecovery(failedStep, stepResult, config, llmProvider) {
    console.log('🔧 Planning recovery action...');
    
    try {
        const recoveryPrompt = `
A step failed during agent execution:
Failed Step: ${JSON.stringify(failedStep)}
Error: ${stepResult.error || 'Unknown error'}

Please suggest a recovery action to handle this failure. Provide a JSON object with:
- action: type of recovery action
- description: what this recovery does
- target: what to target for recovery
- value: any values needed

If recovery is not possible, return null.`;

        const recoveryResponse = await llmProvider.generateResponse(recoveryPrompt);
        
        try {
            const recovery = JSON.parse(recoveryResponse);
            return recovery;
        } catch {
            // If JSON parsing fails, create a generic retry
            return {
                action: 'wait',
                description: 'Wait before retry',
                value: 2000
            };
        }
    } catch (error) {
        console.warn('Recovery planning failed:', error);
        return null;
    }
}

/**
 * Request user confirmation for an action
 */
async function requestConfirmation(step) {
    // TODO: Implement actual user confirmation mechanism
    // For now, auto-approve non-destructive actions
    const destructiveActions = ['delete', 'remove', 'clear', 'reset'];
    const isDestructive = destructiveActions.some(action => 
        step.action.includes(action) || step.description.toLowerCase().includes(action)
    );
    
    if (isDestructive) {
        console.log(`⚠️  Destructive action detected: ${step.description}`);
        console.log('🔒 User confirmation required (auto-denied for safety)');
        return false;
    }
    
    console.log(`✅ Auto-approved action: ${step.description}`);
    return true;
}

/**
 * Save agent session artifacts
 */
async function saveAgentSession(sessionContext, result) {
    try {
        const outputDir = sessionContext.options?.outputDir || './ai-artifacts';
        await saveSessionArtifacts(sessionContext.sessionId, {
            task: sessionContext.currentTask,
            result,
            session: sessionContext
        }, outputDir);
        
        console.log(`💾 Agent session saved: ${sessionContext.sessionId}`);
    } catch (error) {
        console.warn('Failed to save agent session:', error);
    }
}

module.exports = { handleAgentMode };
