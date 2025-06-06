"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIDriver = void 0;
const logger_1 = require("../utils/logger");
const driverRegistry_1 = require("../drivers/driverRegistry");
const fs_1 = require("fs");
const path = __importStar(require("path"));
class AIDriver {
    constructor() {
        this.activeTasks = new Map();
        this.actionHistory = [];
        this.logger = logger_1.Logger.getInstance().createChildLogger({ component: 'AIDriver' });
        this.config = {
            model: 'gpt-4-vision-preview',
            temperature: 0.7,
            maxTokens: 2000,
            confirmActions: true,
            outputDir: './ai-artifacts',
            visionDriver: 'VisionDriver',
            systemDriver: 'SystemDriver',
            webDriver: 'WebDriver'
        };
        this.driverRegistry = driverRegistry_1.DriverRegistry.getInstance();
    }
    getCapabilities() {
        return {
            name: 'AIDriver',
            version: '1.0.0',
            description: 'AI orchestration driver for autonomous task completion',
            supportedActions: [
                'agent', 'editor', 'ask', 'screenshot', 'analyze', 'plan', 'execute',
                'confirm', 'learn', 'generate', 'observe', 'interact'
            ],
            author: 'Runix Team'
        };
    }
    async initialize(config) {
        this.config = { ...this.config, ...config };
        this.logger.info('AI Driver initializing', { config: this.sanitizeConfig(config) });
        // Ensure output directory exists
        await fs_1.promises.mkdir(this.config.outputDir, { recursive: true });
        // Verify required drivers are available
        const requiredDrivers = [this.config.visionDriver, this.config.systemDriver, this.config.webDriver];
        for (const driverId of requiredDrivers) {
            if (!this.driverRegistry.getDriver(driverId)) {
                this.logger.warn(`Required driver not found: ${driverId}`);
            }
        }
        this.logger.info('AI Driver initialized successfully');
    }
    async execute(action, args) {
        this.logger.info(`Executing AI action: ${action}`, { args });
        try {
            switch (action) {
                case 'agent':
                    return await this.runAgentMode(args[0], args[1]);
                case 'editor':
                    return await this.runEditorMode(args[0]);
                case 'ask':
                    return await this.runAskMode(args[0]);
                case 'screenshot':
                    return await this.takeScreenshot();
                case 'analyze':
                    return await this.analyzeScreen(args[0]);
                case 'plan':
                    return await this.planTask(args[0]);
                case 'execute':
                    return await this.executeTask(args[0]);
                case 'confirm':
                    return await this.confirmActions(args[0], args[1]);
                case 'learn':
                    return await this.learnFromActions(args[0]);
                case 'generate':
                    return await this.generateFeature(args[0], args[1]);
                case 'observe':
                    return await this.observeUserActions(args[0]);
                case 'interact':
                    return await this.interactWithUser(args[0]);
                default:
                    throw new Error(`Unknown AI action: ${action}`);
            }
        }
        catch (error) {
            this.logger.error(`AI action failed: ${action}`, error instanceof Error ? { error: error.message } : { error: String(error) });
            return {
                success: false,
                error: { message: error instanceof Error ? error.message : String(error) }
            };
        }
    }
    async shutdown() {
        this.logger.info('AI Driver shutting down');
        // Clean up any active tasks
        for (const task of this.activeTasks.values()) {
            if (task.status === 'running') {
                task.status = 'failed';
                task.endTime = new Date();
            }
        }
    }
    // Agent Mode: Autonomous task completion
    async runAgentMode(taskDescription, options = {}) {
        const taskId = `agent-${Date.now()}`;
        const task = {
            id: taskId,
            description: taskDescription,
            mode: 'agent',
            status: 'pending',
            steps: [],
            artifacts: [],
            startTime: new Date()
        };
        this.activeTasks.set(taskId, task);
        this.logger.info(`Starting agent mode task: ${taskDescription}`, { taskId });
        try {
            // Step 1: Take screenshot to see current state
            const screenshot = await this.takeScreenshot();
            if (!screenshot.success)
                throw new Error('Failed to take initial screenshot');
            // Step 2: Analyze the screen
            const analysis = await this.analyzeScreen(screenshot.data);
            if (!analysis.success)
                throw new Error('Failed to analyze screen');
            // Step 3: Plan the task
            const plan = await this.planTask({
                description: taskDescription,
                currentState: analysis.data,
                options
            });
            if (!plan.success)
                throw new Error('Failed to plan task');
            task.steps = plan.data.steps;
            task.status = 'running';
            // Step 4: Execute the plan
            for (const step of task.steps) {
                if (this.config.confirmActions && step.action !== 'screenshot') {
                    const confirmation = await this.confirmActions(taskId, [step]);
                    if (!confirmation.success || !confirmation.data.approved) {
                        step.status = 'skipped';
                        continue;
                    }
                }
                const result = await this.executeStep(step);
                step.result = result;
                step.status = result.success ? 'completed' : 'failed';
                step.timestamp = new Date();
                if (!result.success && result.error?.message?.includes('stuck')) {
                    // AI is stuck, request user help
                    const userHelp = await this.requestUserHelp(step, task);
                    if (userHelp.success) {
                        step.status = 'completed';
                    }
                }
            }
            // Step 5: Generate feature file artifact
            const feature = await this.generateFeature(task, { includeScreenshots: true });
            if (feature.success) {
                task.artifacts.push(feature.data.filePath);
            }
            task.status = 'completed';
            task.endTime = new Date();
            return {
                success: true,
                data: {
                    taskId,
                    task,
                    completedSteps: task.steps.filter(s => s.status === 'completed').length,
                    totalSteps: task.steps.length,
                    artifacts: task.artifacts
                }
            };
        }
        catch (error) {
            task.status = 'failed';
            task.endTime = new Date();
            throw error;
        }
    }
    // Editor Mode: Learn from user actions
    async runEditorMode(sessionName) {
        const sessionId = `editor-${Date.now()}`;
        this.logger.info(`Starting editor mode session: ${sessionName}`, { sessionId });
        const session = {
            id: sessionId,
            name: sessionName,
            startTime: new Date(),
            actions: [],
            screenshots: []
        };
        // Start observing user actions
        const observation = await this.observeUserActions({
            sessionId,
            duration: 300000,
            captureInterval: 2000,
            detectChanges: true
        });
        if (!observation.success) {
            throw new Error('Failed to start user observation');
        }
        return {
            success: true,
            data: {
                sessionId,
                message: 'Editor mode started. Perform your actions and press Ctrl+Alt+S to stop recording.',
                observationId: observation.data.observationId
            }
        };
    }
    // Ask Mode: Answer user questions and perform helpful actions
    async runAskMode(question) {
        this.logger.info(`Processing ask mode question: ${question}`);
        // Take screenshot to understand context
        const screenshot = await this.takeScreenshot();
        if (!screenshot.success)
            throw new Error('Failed to take screenshot for context');
        // Analyze the question and current screen
        const analysis = await this.analyzeQuestion(question, screenshot.data);
        if (analysis.requiresAction) {
            // Execute the helpful action
            const action = await this.executeHelpfulAction(analysis);
            // Generate feature file for the action
            const feature = await this.generateFeature({
                description: `Ask mode: ${question}`,
                steps: action.steps,
                mode: 'ask'
            });
            return {
                success: true,
                data: {
                    answer: analysis.answer,
                    actionTaken: action.description,
                    featureFile: feature.success ? feature.data.filePath : null
                }
            };
        }
        else {
            // Just provide an answer
            return {
                success: true,
                data: {
                    answer: analysis.answer,
                    actionTaken: null
                }
            };
        }
    }
    async takeScreenshot() {
        const webDriver = await this.driverRegistry.getDriverInstance(this.config.webDriver);
        if (!webDriver) {
            throw new Error('Web driver not available for screenshot');
        }
        const result = await webDriver.executeStep('takeScreenshot', []);
        if (result.success) {
            this.currentScreenshot = result.data?.screenshot;
        }
        return result;
    }
    async analyzeScreen(screenshot) {
        const visionDriver = await this.driverRegistry.getDriverInstance(this.config.visionDriver);
        if (!visionDriver) {
            throw new Error('Vision driver not available');
        }
        const imageData = screenshot || this.currentScreenshot;
        if (!imageData) {
            throw new Error('No screenshot available for analysis');
        }
        // Use vision driver to analyze the scene
        const result = await visionDriver.executeStep('analyzeScene', [imageData]);
        if (result.success) {
            // Enhance analysis with AI understanding
            const aiAnalysis = await this.enhanceWithAI({
                scene: result.data.scene,
                context: 'screen_analysis'
            });
            return {
                success: true,
                data: {
                    ...result.data,
                    aiInsights: aiAnalysis
                }
            };
        }
        return result;
    }
    async planTask(taskInfo) {
        // Use AI to plan the task based on description and current state
        const prompt = this.buildPlanningPrompt(taskInfo);
        const aiResponse = await this.callAI(prompt);
        try {
            const plan = JSON.parse(aiResponse);
            const steps = plan.steps.map((step, index) => ({
                id: `step-${index + 1}`,
                description: step.description,
                action: step.action,
                driver: step.driver,
                args: step.args,
                status: 'pending'
            }));
            return {
                success: true,
                data: {
                    plan: plan.description,
                    steps,
                    confidence: plan.confidence || 0.8
                }
            };
        }
        catch (error) {
            throw new Error(`Failed to parse AI planning response: ${error}`);
        }
    }
    async executeStep(step) {
        const driverInstance = await this.driverRegistry.getDriverInstance(step.driver);
        if (!driverInstance) {
            return {
                success: false,
                error: { message: `Driver not available: ${step.driver}` }
            };
        }
        this.logger.info(`Executing step: ${step.description}`, { step });
        return await driverInstance.executeStep(step.action, step.args);
    }
    async generateFeature(task, options = {}) {
        const featureContent = this.buildFeatureContent(task, options);
        const fileName = `${task.mode || 'ai'}-${Date.now()}.feature`;
        const filePath = path.join(this.config.outputDir, fileName);
        await fs_1.promises.writeFile(filePath, featureContent, 'utf8');
        this.logger.info(`Generated feature file: ${filePath}`);
        return {
            success: true,
            data: {
                filePath,
                fileName,
                content: featureContent
            }
        };
    }
    // ...existing code... (helper methods)
    sanitizeConfig(config) {
        const sanitized = { ...config };
        if (sanitized.openaiApiKey) {
            sanitized.openaiApiKey = '***';
        }
        return sanitized;
    }
    buildPlanningPrompt(taskInfo) {
        return `
You are an AI assistant that creates automation plans. Given the task description and current screen state, create a detailed plan.

Task: ${taskInfo.description}
Current screen state: ${JSON.stringify(taskInfo.currentState, null, 2)}

Available drivers and their capabilities:
- VisionDriver: extractText, detectUI, analyzeScene
- SystemDriver: createFile, readFile, executeCommand
- WebDriver: click, enterText, navigate, screenshot

Create a JSON plan with this structure:
{
  "description": "High-level plan description",
  "confidence": 0.9,
  "steps": [
    {
      "description": "Human readable step description",
      "action": "specific_action_name",
      "driver": "DriverName", 
      "args": ["arg1", "arg2"]
    }
  ]
}

Focus on being precise with selectors and realistic about what's possible.
`;
    }
    async callAI(prompt) {
        if (!this.config.openaiApiKey) {
            // Mock AI response for development
            return this.generateMockAIResponse(prompt);
        }
        // TODO: Implement actual OpenAI API call
        // For now, return mock response
        return this.generateMockAIResponse(prompt);
    }
    generateMockAIResponse(prompt) {
        // Simple rule-based responses for common scenarios
        if (prompt.includes('login')) {
            return JSON.stringify({
                description: "Login to the application",
                confidence: 0.9,
                steps: [
                    {
                        description: "Take screenshot to see current state",
                        action: "takeScreenshot",
                        driver: "WebDriver",
                        args: []
                    },
                    {
                        description: "Find email field and enter credentials",
                        action: "enterText",
                        driver: "WebDriver",
                        args: ["email@example.com", "[name='email']"]
                    },
                    {
                        description: "Find password field and enter password",
                        action: "enterText",
                        driver: "WebDriver",
                        args: ["password", "[name='password']"]
                    },
                    {
                        description: "Click login button",
                        action: "click",
                        driver: "WebDriver",
                        args: ["[type='submit']"]
                    }
                ]
            });
        }
        return JSON.stringify({
            description: "Generic task execution",
            confidence: 0.7,
            steps: [
                {
                    description: "Take screenshot to understand current state",
                    action: "takeScreenshot",
                    driver: "WebDriver",
                    args: []
                },
                {
                    description: "Analyze the screen for interactive elements",
                    action: "analyzeScene",
                    driver: "VisionDriver",
                    args: ["current_screenshot"]
                }
            ]
        });
    }
    buildFeatureContent(task, options) {
        const timestamp = new Date().toISOString();
        const mode = task.mode || 'ai';
        let content = `# Generated by Runix AI - ${timestamp}
Feature: ${task.description || task.name || 'AI Generated Task'}
  As a user
  I want to automate this task
  So that I can be more efficient

  Background:
    Given the AI driver is available
    And the vision driver is available
    And the system driver is available

`;
        if (task.steps && Array.isArray(task.steps)) {
            content += `  Scenario: Execute ${mode} mode task
`;
            task.steps.forEach((step, index) => {
                const keyword = index === 0 ? 'Given' : (index === task.steps.length - 1 ? 'Then' : 'And');
                content += `    ${keyword} I ${step.description.toLowerCase()}
`;
            });
        }
        if (options.includeScreenshots && task.artifacts) {
            content += `
  # Artifacts generated during execution:
`;
            task.artifacts.forEach((artifact) => {
                content += `  # - ${artifact}
`;
            });
        }
        return content;
    }
    async enhanceWithAI(data) {
        // Placeholder for AI enhancement
        return {
            summary: "AI-enhanced analysis would go here",
            recommendations: [],
            confidence: 0.8
        };
    }
    async analyzeQuestion(question, screenshot) {
        // Analyze user question and determine if action is needed
        return {
            answer: "This would be an AI-generated answer to your question",
            requiresAction: question.toLowerCase().includes('click') || question.toLowerCase().includes('type'),
            confidence: 0.8
        };
    }
    async executeHelpfulAction(analysis) {
        return {
            description: "Helpful action performed",
            steps: []
        };
    }
    async confirmActions(taskId, steps) {
        // In a real implementation, this would present the actions to the user for confirmation
        this.logger.info(`Requesting confirmation for ${steps.length} actions`, { taskId });
        return {
            success: true,
            data: { approved: true }
        };
    }
    async requestUserHelp(step, task) {
        this.logger.info(`Requesting user help for step: ${step.description}`);
        return {
            success: true,
            data: { helpProvided: true }
        };
    }
    async observeUserActions(options) {
        this.logger.info('Starting user action observation', options);
        return {
            success: true,
            data: { observationId: `obs-${Date.now()}` }
        };
    }
    async executeTask(taskId) {
        const task = this.activeTasks.get(taskId);
        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }
        // Execute all pending steps in the task
        for (const step of task.steps.filter(s => s.status === 'pending')) {
            await this.executeStep(step);
        }
        return {
            success: true,
            data: { taskId, status: task.status }
        };
    }
    async learnFromActions(actions) {
        this.logger.info(`Learning from ${actions.length} actions`);
        return {
            success: true,
            data: { learned: true, patterns: actions.length }
        };
    }
    async interactWithUser(message) {
        this.logger.info(`User interaction: ${message}`);
        return {
            success: true,
            data: { message: "User interaction handled" }
        };
    }
}
exports.AIDriver = AIDriver;
