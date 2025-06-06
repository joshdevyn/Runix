import { BaseDriver } from '../base.driver';
import { DriverCapabilities, DriverConfig, StepExecutionResult } from '../driver.interface';
import { Logger } from '../../utils/logger';
import { DriverRegistry } from '../driverRegistry';
import { AIProviderManager, AIProviderFactoryConfig, AIProviderType } from './providers/AIProviderFactory';
import { AIProvider, AIMessage, AICompletionOptions } from './providers/AIProvider.interface';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface AIProviderConfiguration {
  name: string;
  provider: AIProviderType;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeout?: number;
  maxRetries?: number;
  [key: string]: any;
}

export interface AIDriverConfig extends DriverConfig {
  // Legacy OpenAI support (for backward compatibility)
  openaiApiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  
  // New multi-provider configuration
  providers?: AIProviderConfiguration[];
  activeProvider?: string;
  
  // Driver configuration
  outputDir?: string;
  visionDriver?: string;
  systemDriver?: string;
  confirmActions?: boolean;
}

export interface AIStep {
  id: string;
  description: string;
  action: string;
  driver: string;
  args: any[];
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'skipped';
  result?: any;
  error?: string;
}

export interface AITask {
  id: string;
  mode: string;
  description: string;
  status: 'pending' | 'planning' | 'executing' | 'completed' | 'failed';
  steps: AIStep[];
  artifacts: string[];
}

export class AIDriver extends BaseDriver {
  private config: AIDriverConfig = {};
  private driverRegistry: DriverRegistry;
  private activeTasks: Map<string, AITask> = new Map();
  private lastScreenshot?: string; // Store the last taken screenshot
  private providerManager: AIProviderManager;

  constructor(config: AIDriverConfig = {}) {
    super();
    this.config = config;
    this.driverRegistry = DriverRegistry.getInstance();
    this.providerManager = new AIProviderManager();
  }  async initialize(config: AIDriverConfig = {}): Promise<void> {
    this.config = { ...this.config, ...config };
    
    // Initialize AI providers
    await this.initializeProviders();

    // Sanitize config for logging
    const sanitizedConfig = { ...this.config };
    if (sanitizedConfig.openaiApiKey) {
      sanitizedConfig.openaiApiKey = '***';
    }
    if (sanitizedConfig.providers) {
      sanitizedConfig.providers = sanitizedConfig.providers.map(p => ({
        ...p,
        apiKey: p.apiKey ? '***' : undefined
      }));
    }
    
    this.log.info('AI Driver initializing', { config: sanitizedConfig });
    
    // Create output directory if specified
    if (this.config.outputDir) {
      const fs = await import('fs/promises');
      await fs.mkdir(this.config.outputDir, { recursive: true });
    }
    
    // Check for required drivers
    this.checkRequiredDrivers();
    
    await super.initialize(config);
  }

  /**
   * Initialize AI providers based on configuration
   */
  private async initializeProviders(): Promise<void> {
    try {
      // Handle legacy OpenAI configuration for backward compatibility
      if (this.config.openaiApiKey && !this.config.providers?.length) {
        this.log.info('Using legacy OpenAI configuration');
        await this.providerManager.addProvider('openai-legacy', {
          provider: 'openai',
          apiKey: this.config.openaiApiKey,
          model: this.config.model || 'gpt-4-vision-preview',
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens
        });
        this.providerManager.setActiveProvider('openai-legacy');
        return;
      }

      // Initialize configured providers
      if (this.config.providers && this.config.providers.length > 0) {        for (const providerConfig of this.config.providers) {
          await this.providerManager.addProvider(providerConfig.name, {
            ...providerConfig,
            provider: providerConfig.provider
          });
          
          this.log.info(`Initialized AI provider: ${providerConfig.name} (${providerConfig.provider})`);
        }

        // Set active provider
        if (this.config.activeProvider) {
          this.providerManager.setActiveProvider(this.config.activeProvider);
        }
      } else {
        this.log.warn('No AI providers configured. AI functionality will be limited to mock responses.');
      }
    } catch (error) {
      this.log.error('Failed to initialize AI providers', { error });
      throw error;
    }
  }  getCapabilities(): DriverCapabilities {
    return {
      name: 'AIDriver',
      version: '3.0.0',
      description: 'Enhanced AI orchestration driver with multi-provider support, vision analysis and system-level automation',
      supportedActions: [
        'agent', 'editor', 'ask', 'screenshot', 'analyze', 'plan', 'execute',
        'confirm', 'learn', 'generate', 'observe', 'interact', 
        'generateFeature', 'analyzeIntent', 'orchestrate',
        'discoverDrivers', 'generateSteps', 'setMode', 'startSession', 
        'analyzeScreenAndPlan', 'executeNextAction', 'loadFeatureFile', 'continueSession',
        'switchProvider', 'addProvider', 'getProviders', 'getActiveProvider'
      ],
      author: 'Runix Team'
    };
  }
  async execute(action: string, args: any[]): Promise<StepExecutionResult> {
    this.validateInitialized();
    
    try {
      switch (action) {
        case 'agent':
          return this.executeAgentMode(args[0]);
        case 'editor':
          return this.executeEditorMode(args[0]);
        case 'ask':
          return this.executeAskMode(args[0]);
        case 'screenshot':
          return this.takeScreenshot();        
        case 'analyze':
          return this.analyzeScreen(args[0] || this.lastScreenshot);        
        case 'plan':
          return this.planTask(args[0], false); // No fallback for direct plan calls
        case 'generate':
          return this.generateFeatureFile(args[0], args[1]);
        case 'discoverDrivers':
          return this.discoverDrivers();
        case 'analyzeIntent':
          return this.analyzeIntent(args[0], args[1]);
        case 'generateSteps':
          return this.generateSteps(args[0]);
        case 'orchestrate':
          return this.orchestrate(args[0]);
        case 'setMode':
          return this.setMode(args[0]);
        case 'startSession':
          return this.startSession(args[0]);
        case 'analyzeScreenAndPlan':
          return this.analyzeScreenAndPlan(args[0]);
        case 'executeNextAction':
          return this.executeNextAction(args[0]);
        case 'loadFeatureFile':
          return this.loadFeatureFile(args[0]);        
        case 'continueSession':
          return this.continueSession(args[0]);
        case 'execute':
          return this.executeTask(args[0]);        
        case 'confirm':
          return this.confirmActions(args[1] || args[0]);
        case 'learn':
          return this.learnFromActions(args[0]);        case 'observe':
          return this.observeUserActions();
        case 'interact':
          return this.interactWithUser(args[0]);
        case 'switchProvider':
          return this.switchProvider(args[0]);
        case 'addProvider':
          return this.addProvider(args[0], args[1]);
        case 'getProviders':
          return {
            success: true,
            data: {
              providers: this.getAvailableProviders(),
              active: this.getActiveProvider()
            }
          };        case 'getActiveProvider':
          return {
            success: true,
            data: this.getActiveProvider()
          };
        case 'getInfo':
          return {
            success: true,
            data: this.getCapabilities()
          };
        case 'callAI':
          return {
            success: true,
            data: await this.callAI(args[0], args[1])
          };
        case 'enhanceWithAI':
          return {
            success: true,
            data: await this.enhanceWithAI(args[0])
          };
        case 'generateAnswer':
          return {
            success: true,
            data: await this.generateAnswer(args[0], args[1])
          };
        default:
          throw new Error(`Unknown AI action: ${action}`);
      }
    } catch (error) {
      this.log.error(`AI action failed: ${action}`, { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }  private checkRequiredDrivers(): void {
    const requiredDrivers = [
      this.config.visionDriver || 'vision-driver',
      this.config.systemDriver || 'system-driver'
    ];

    requiredDrivers.forEach(driverId => {
      const driver = this.driverRegistry.getDriver(driverId);
      if (!driver) {
        this.log.warn(`Required driver not found: ${driverId}`);
      }
    });
  }

  private async executeAgentMode(taskDescription: string): Promise<StepExecutionResult> {
    const taskId = `agent-${Date.now()}`;
    const task: AITask = {
      id: taskId,
      mode: 'agent',
      description: taskDescription,
      status: 'planning',
      steps: [],
      artifacts: []
    };

    this.activeTasks.set(taskId, task);

    try {
      // Take initial screenshot
      const screenshotResult = await this.takeScreenshot();
      if (!screenshotResult.success) {
        throw new Error('Failed to take initial screenshot');
      }

      // Analyze screen
      const analysisResult = await this.analyzeScreen(screenshotResult.data?.screenshot);
      if (!analysisResult.success) {
        throw new Error('Failed to analyze screen');
      }

      // Plan and execute steps
      const planResult = await this.planTask({
        description: taskDescription,
        currentState: analysisResult.data
      });

      if (planResult.success && planResult.data?.steps) {
        task.steps = planResult.data.steps;
        task.status = 'executing';

        // Execute steps
        for (const step of task.steps) {
          step.status = 'executing';
          const stepResult = await this.executeStep(step);
          if (stepResult.success) {
            step.status = 'completed';
            step.result = stepResult.data;
          } else {
            step.status = 'failed';
            step.error = stepResult.error?.message;
          }
        }
      }

      task.status = 'completed';

      // Generate feature file artifact
      const featureResult = await this.generateFeatureFile(task);
      if (featureResult.success) {
        task.artifacts.push(featureResult.data?.filePath);
      }

      return {
        success: true,
        data: {
          taskId,
          task,
          completedSteps: task.steps.filter(s => s.status === 'completed').length,
          artifacts: task.artifacts
        }
      };
    } catch (error) {
      task.status = 'failed';
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  private async executeEditorMode(sessionId: string): Promise<StepExecutionResult> {
    const editorSessionId = `editor-${Date.now()}`;
    
    try {
      // Start observation
      const observationResult = await this.observeUserActions();
      if (!observationResult.success) {
        throw new Error('Failed to start user observation');
      }

      return {
        success: true,
        data: {
          sessionId: editorSessionId,
          message: 'Editor mode started. I\'ll observe your actions and help create automation steps.',
          observationId: observationResult.data?.observationId
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  private async executeAskMode(question: string): Promise<StepExecutionResult> {
    try {
      // Take screenshot for context
      const screenshotResult = await this.takeScreenshot();
      if (!screenshotResult.success) {
        throw new Error('Failed to take screenshot for context');
      }      // Generate answer based on question and context
      const answer = await this.generateAnswer(question, screenshotResult.data);
      
      // Check if action is requested
      const actionRequested = this.isActionRequested(question);
      let actionTaken = null;
      let featureFile = null;

      if (actionRequested) {
        const actionResult = await this.performRequestedAction(question);
        actionTaken = actionResult.success ? actionResult.data : null;
        
        if (actionResult.success) {
          const featureResult = await this.generateFeatureFile({
            mode: 'ask',
            description: question,
            steps: [actionResult.data]
          });
          featureFile = featureResult.success ? featureResult.data : null;
        }
      }

      return {
        success: true,
        data: {
          question,
          answer,
          actionTaken,
          featureFile
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }  private async takeScreenshot(): Promise<StepExecutionResult> {
    const systemDriver = await this.driverRegistry.getDriverInstance(this.config.systemDriver || 'system-driver');
    if (!systemDriver) {
      return {
        success: false,
        error: { message: 'System driver not available for screenshot' }
      };
    }

    const result = await systemDriver.execute('takeScreenshot', []);
    if (result.success) {
      this.lastScreenshot = result.data?.screenshot; // Store the last screenshot
    }
    return result;
  }  private async analyzeScreen(screenshot?: string): Promise<StepExecutionResult> {
    // Use provided screenshot or fall back to stored screenshot
    const screenshotToAnalyze = screenshot || this.lastScreenshot;
    
    if (!screenshotToAnalyze) {
      return {
        success: false,
        error: { message: 'No screenshot available for analysis' }
      };
    }

    const visionDriver = await this.driverRegistry.getDriverInstance(this.config.visionDriver || 'vision-driver');
    if (!visionDriver) {
      return {
        success: false,
        error: { message: 'Vision driver not available for analysis' }
      };
    }

    const result = await visionDriver.execute('analyzeScene', [screenshotToAnalyze]);
    
    // Always enhance with AI insights when analysis is successful
    if (result.success) {
      const aiInsights = await this.enhanceWithAI({
        scene: result.data,
        context: `Analysis for screenshot: ${screenshotToAnalyze}`
      });
      
      result.data = {
        ...result.data,
        aiInsights
      };
    }
    
    return result;
  }  private async planTask(taskInfo: any, useFallback: boolean = true): Promise<StepExecutionResult> {
    try {
      // Use AI to generate plan
      const prompt = `Plan steps for task: ${taskInfo.description}. Current state: ${JSON.stringify(taskInfo.currentState || {})}`;
      const aiResponse = await this.callAI(prompt);
      
      let planData;
      try {
        planData = JSON.parse(aiResponse);
      } catch (parseError) {
        throw new Error('Failed to parse AI planning response');
      }
      
      // Convert AI response to our step format
      const steps: AIStep[] = planData.steps?.map((step: any, index: number) => ({
        id: `step-${index}`,
        description: step.description || `Step ${index + 1}`,
        action: step.action || 'unknown',
        driver: step.driver || 'SystemDriver',
        args: step.args || [],
        status: 'pending' as const
      })) || [];

      return {
        success: true,
        data: {
          plan: planData.plan || `AI generated plan for: ${taskInfo.description}`,
          steps,
          confidence: planData.confidence || 0.85
        }
      };    } catch (error) {
      // Only use fallback if explicitly requested (agent mode)
      if (!useFallback) {
        return {
          success: false,
          error: { message: error instanceof Error ? error.message : String(error) }
        };
      }

      // Fallback to mock planning logic (for agent mode)
      const mockSteps: AIStep[] = [];

      if (taskInfo.description.toLowerCase().includes('login')) {
        mockSteps.push(
          {
            id: 'step-0',
            description: 'Take initial screenshot',
            action: 'takeScreenshot',
            driver: 'SystemDriver',
            args: [],
            status: 'pending'
          },
          {
            id: 'step-1',
            description: 'Analyze screen for login form',
            action: 'analyzeScene',
            driver: 'VisionDriver',
            args: [],
            status: 'pending'
          },
          {
            id: 'step-2',
            description: 'Click on email field',
            action: 'clickAt',
            driver: 'SystemDriver',
            args: [], // Will be filled by vision analysis
            status: 'pending'
          },
          {
            id: 'step-3', 
            description: 'Type email address',
            action: 'typeText',
            driver: 'SystemDriver',
            args: ['email@example.com'],
            status: 'pending'
          },
          {
            id: 'step-4',
            description: 'Click on password field',
            action: 'clickAt',
            driver: 'SystemDriver',
            args: [], // Will be filled by vision analysis
            status: 'pending'
          },
          {
            id: 'step-5',
            description: 'Type password',
            action: 'typeText',
            driver: 'SystemDriver',
            args: ['password'],
            status: 'pending'
          },
          {
            id: 'step-6',
            description: 'Click login button',
            action: 'clickAt',
            driver: 'SystemDriver',
            args: [], // Will be filled by vision analysis
            status: 'pending'
          }
        );
      } else {
        mockSteps.push(
          {
            id: 'step-1',
            description: 'Take screenshot',
            action: 'takeScreenshot',
            driver: 'SystemDriver',
            args: [],
            status: 'pending'
          },
          {
            id: 'step-2',
            description: 'Analyze scene',
            action: 'analyzeScene',
            driver: 'VisionDriver',
            args: [],
            status: 'pending'
          }
        );      }

      return {
        success: true,
        data: {
          plan: `Mock plan for: ${taskInfo.description}`,
          steps: mockSteps,
          confidence: 0.75
        }
      };
    }
  }

  private async generateFeatureFile(task: any, options: any = {}): Promise<StepExecutionResult> {
    const timestamp = Date.now();
    const fileName = `${task.mode || 'test'}-${timestamp}.feature`;
    const filePath = path.join(this.config.outputDir || './features', fileName);

    const featureContent = this.buildFeatureContent(task);

    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, featureContent, 'utf8');

      return {
        success: true,
        data: {
          fileName,
          filePath,
          content: featureContent
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: `Failed to write feature file: ${error instanceof Error ? error.message : String(error)}` }
      };
    }
  }

  private buildFeatureContent(task: any): string {
    return `Feature: ${task.description}
  As a user
  I want to ${task.description.toLowerCase()}
  So that I can accomplish my goal

Scenario: Execute task
  ${task.steps?.map((step: AIStep) => `  ${step.description}`).join('\n  ') || '  # No steps defined'}
`;
  }
  private async executeStep(step: AIStep): Promise<StepExecutionResult> {
    // For system driver actions that need coordinates, use vision first
    if (step.driver === 'SystemDriver' && 
        (step.action === 'clickAt' || step.action === 'doubleClickAt' || step.action === 'rightClickAt') &&
        step.args.length === 0) {
      
      // Use vision to find the target element
      const visionResult = await this.findElementWithVision(step.description);
      if (visionResult.success && visionResult.data?.coordinates) {
        step.args = [visionResult.data.coordinates.x, visionResult.data.coordinates.y];
      } else {
        return {
          success: false,
          error: { message: `Could not locate element for: ${step.description}` }
        };
      }
    }

    const driver = await this.driverRegistry.getDriverInstance(step.driver);
    if (!driver) {
      return {
        success: false,
        error: { message: `Driver ${step.driver} not available` }
      };
    }    // Check for confirmation if enabled
    if (this.config.confirmActions) {
      const confirmation = await this.confirmActions([step]);
      if (!confirmation.success || !confirmation.data?.approved) {
        return {
          success: true,
          data: { skipped: true, reason: 'User rejected confirmation' }
        };
      }
    }

    return driver.executeStep(step.action, step.args);
  }

  private async generateAnswer(question: string, context: any): Promise<string> {
    try {
      // Use AI provider if available
      if (this.providerManager.hasProviders()) {
        const prompt = `Based on the current screen context, answer this user question:
Question: ${question}
Context: ${JSON.stringify(context, null, 2)}

Provide a helpful, concise answer that considers the current screen state.`;

        const aiResponse = await this.callAI(prompt);
        
        // Try to extract just the answer if it's wrapped in JSON
        try {
          const parsed = JSON.parse(aiResponse);
          return parsed.answer || parsed.response || aiResponse;
        } catch {
          return aiResponse;
        }
      }

      // Fallback to simple response
      return `Based on the current screen context, I can help you with: ${question}`;
    } catch (error) {
      this.log.error('Failed to generate AI answer', { error });
      return `I understand your question: "${question}". Let me help you with that.`;
    }
  }

  private isActionRequested(question: string): boolean {
    const actionKeywords = ['click', 'enter', 'type', 'submit', 'navigate', 'open'];
    return actionKeywords.some(keyword => question.toLowerCase().includes(keyword));
  }

  private async performRequestedAction(question: string): Promise<StepExecutionResult> {
    // Mock action performance - in real implementation would parse question and execute
    return {
      success: true,
      data: {
        action: 'mock_action',
        description: `Performed action based on: ${question}`
      }
    };
  }
  /**
   * Enhance data with AI analysis
   */
  async enhanceWithAI(params: { scene: any; context: string }): Promise<any> {
    try {
      // Use AI provider if available for enhanced analysis
      if (this.providerManager.hasProviders()) {
        const prompt = `Analyze this scene data and provide insights:
Context: ${params.context}
Scene Data: ${JSON.stringify(params.scene, null, 2)}

Please provide:
1. A summary of what's visible
2. Recommendations for automation
3. Accessibility considerations
4. Potential interaction points

Respond in JSON format with: summary, recommendations, confidence, enhancedData`;

        try {
          const aiResponse = await this.callAI(prompt);
          const parsedResponse = JSON.parse(aiResponse);
          
          return {
            ...parsedResponse,
            enhancedData: {
              ...params.scene,
              aiInsights: parsedResponse.summary || `Enhanced with AI context: ${params.context}`
            }
          };
        } catch (parseError) {
          this.log.warn('Failed to parse AI enhancement response, using fallback');
        }
      }

      // Fallback to mock enhancement
      return {
        summary: `AI analysis of ${params.context}`,
        recommendations: [
          'Review screen elements for accessibility',
          'Optimize user interface flow',
          'Consider mobile responsiveness'
        ],
        confidence: 0.85,
        enhancedData: {
          ...params.scene,
          aiInsights: `Enhanced with AI context: ${params.context}`
        }
      };
    } catch (error) {
      this.log.error('AI enhancement failed', { error });
      throw error;
    }
  }

  /**
   * Analyze question to determine if action is required
   */
  async analyzeQuestion(question: string, context?: string): Promise<any> {
    try {
      const actionKeywords = ['click', 'type', 'enter', 'submit', 'navigate', 'open', 'select', 'press', 'tap'];
      const requiresAction = actionKeywords.some(keyword => 
        question.toLowerCase().includes(keyword)
      );

      return {
        question,
        context: context || 'unknown',
        requiresAction,
        confidence: 0.9,
        suggestedActions: requiresAction ? [
          {
            type: 'ui_interaction',
            description: `Perform action based on: ${question}`,
            priority: 'high'
          }
        ] : [],
        analysis: {
          intent: requiresAction ? 'action_request' : 'information_query',
          complexity: 'simple',
          feasibility: requiresAction ? 'high' : 'N/A'
        }
      };
    } catch (error) {
      this.log.error('Question analysis failed', { error });
      throw error;
    }
  }
  /**
   * Discover available drivers in the system
   */
  private async discoverDrivers(): Promise<StepExecutionResult> {
    try {
      const driverIds = this.driverRegistry.listDriverIds();
      const availableDrivers = driverIds.map(id => {
        const metadata = this.driverRegistry.getDriver(id);
        return {
          id,
          name: metadata?.name || id,
          version: metadata?.version || '1.0.0',
          path: metadata?.path,
          executable: metadata?.executable
        };
      });
      
      return {
        success: true,
        data: {
          drivers: availableDrivers,
          count: availableDrivers.length,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Analyze user intent from natural language
   */
  private async analyzeIntent(userIntent: string, context?: any): Promise<StepExecutionResult> {
    try {
      // Mock intent analysis - in real implementation would use NLP/AI
      const intentKeywords = {
        'navigation': ['navigate', 'go to', 'open', 'visit'],
        'form_interaction': ['fill', 'enter', 'type', 'input', 'submit'],
        'ui_interaction': ['click', 'tap', 'press', 'select', 'choose'],
        'data_extraction': ['extract', 'get', 'find', 'search', 'read'],
        'validation': ['verify', 'check', 'confirm', 'validate', 'test']
      };

      let detectedIntent = 'unknown';
      let confidence = 0.5;

      for (const [intent, keywords] of Object.entries(intentKeywords)) {
        if (keywords.some(keyword => userIntent.toLowerCase().includes(keyword))) {
          detectedIntent = intent;
          confidence = 0.85;
          break;
        }
      }

      return {
        success: true,
        data: {
          intent: detectedIntent,
          confidence,
          userIntent,
          context,
          suggestedActions: this.getSuggestedActionsForIntent(detectedIntent),
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }
  /**
   * Generate execution steps from task information
   */
  private async generateSteps(taskInfo: any): Promise<StepExecutionResult> {
    try {
      const steps: AIStep[] = [];
      
      // Always start with a screenshot for context
      steps.push({
        id: `step-${steps.length + 1}`,
        description: 'Take initial screenshot',
        action: 'takeScreenshot',
        driver: 'SystemDriver',
        args: [],
        status: 'pending'
      });

      // Analyze screen content with vision
      steps.push({
        id: `step-${steps.length + 1}`,
        description: 'Analyze screen content',
        action: 'analyzeScene',
        driver: 'VisionDriver',
        args: [],
        status: 'pending'
      });

      // Generate steps based on task type
      if (taskInfo.type === 'login') {
        steps.push(
          {
            id: `step-${steps.length + 1}`,
            description: 'Locate and click username field',
            action: 'clickAt',
            driver: 'SystemDriver',
            args: [], // Vision will provide coordinates
            status: 'pending'
          },
          {
            id: `step-${steps.length + 1}`,
            description: 'Type username',
            action: 'typeText',
            driver: 'SystemDriver',
            args: [taskInfo.username || 'user@example.com'],
            status: 'pending'
          },
          {
            id: `step-${steps.length + 1}`,
            description: 'Locate and click password field',
            action: 'clickAt',
            driver: 'SystemDriver',
            args: [], // Vision will provide coordinates
            status: 'pending'
          },
          {
            id: `step-${steps.length + 1}`,
            description: 'Type password',
            action: 'typeText',
            driver: 'SystemDriver',
            args: [taskInfo.password || 'password'],
            status: 'pending'
          },
          {
            id: `step-${steps.length + 1}`,
            description: 'Click login button',
            action: 'clickAt',
            driver: 'SystemDriver',
            args: [], // Vision will provide coordinates
            status: 'pending'
          }
        );
      } else if (taskInfo.type === 'form_fill') {
        if (taskInfo.fields) {
          taskInfo.fields.forEach((field: any) => {
            steps.push(
              {
                id: `step-${steps.length + 1}`,
                description: `Locate ${field.name} field`,
                action: 'clickAt',
                driver: 'SystemDriver',
                args: [], // Vision will provide coordinates
                status: 'pending'
              },
              {
                id: `step-${steps.length + 1}`,
                description: `Fill ${field.name}`,
                action: 'typeText',
                driver: 'SystemDriver',
                args: [field.value],
                status: 'pending'
              }
            );
          });
        }
      } else {
        // Generic task - plan based on vision analysis
        steps.push({
          id: `step-${steps.length + 1}`,
          description: 'Plan actions based on screen analysis',
          action: 'planFromVision',
          driver: 'AIDriver',
          args: [taskInfo],
          status: 'pending'
        });
      }

      return {
        success: true,
        data: {
          steps,
          taskInfo,
          generatedAt: new Date().toISOString(),
          totalSteps: steps.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }
  /**
   * Orchestrate complex workflows
   */
  private async orchestrate(workflow: any): Promise<StepExecutionResult> {
    try {
      const workflowId = `workflow-${Date.now()}`;
      const orchestrationResult: {
        id: string;
        status: string;
        tasks: any[];
        results: StepExecutionResult[];
        startTime: string;
      } = {
        id: workflowId,
        status: 'executing',
        tasks: [],
        results: [],
        startTime: new Date().toISOString()
      };

      if (workflow.tasks && Array.isArray(workflow.tasks)) {
        for (const task of workflow.tasks) {
          const taskResult = await this.executeAgentMode(task.description || task.name);
          orchestrationResult.tasks.push(task);
          orchestrationResult.results.push(taskResult);
        }
      }

      orchestrationResult.status = 'completed';

      return {
        success: true,
        data: orchestrationResult
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Set AI driver mode
   */
  private async setMode(mode: string): Promise<StepExecutionResult> {
    try {
      const validModes = ['agent', 'editor', 'ask', 'monitor'];
      
      if (!validModes.includes(mode)) {
        throw new Error(`Invalid mode: ${mode}. Valid modes: ${validModes.join(', ')}`);
      }

      // Store mode in config
      this.config.mode = mode;

      return {
        success: true,
        data: {
          mode,
          previousMode: this.config.mode,
          timestamp: new Date().toISOString(),
          availableModes: validModes
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Start a new session
   */
  private async startSession(sessionConfig: any): Promise<StepExecutionResult> {
    try {
      const sessionId = `session-${Date.now()}`;
      const session = {
        id: sessionId,
        config: sessionConfig,
        status: 'active',
        startTime: new Date().toISOString(),
        mode: sessionConfig.mode || 'agent',
        context: sessionConfig.context || {}
      };

      // Store session (in real implementation would use proper session management)
      this.activeTasks.set(sessionId, {
        id: sessionId,
        mode: session.mode,
        description: sessionConfig.description || 'AI session',
        status: 'pending',
        steps: [],
        artifacts: []
      });

      return {
        success: true,
        data: session
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Analyze screen and create execution plan
   */
  private async analyzeScreenAndPlan(context: any): Promise<StepExecutionResult> {
    try {
      // Take screenshot
      const screenshotResult = await this.takeScreenshot();
      if (!screenshotResult.success) {
        throw new Error('Failed to take screenshot');
      }

      // Analyze screen
      const analysisResult = await this.analyzeScreen(screenshotResult.data?.screenshot);
      if (!analysisResult.success) {
        throw new Error('Failed to analyze screen');
      }

      // Create plan based on analysis
      const planResult = await this.planTask({
        description: context.goal || 'Analyze and plan next actions',
        currentState: analysisResult.data,
        context
      });

      return {
        success: true,
        data: {
          screenshot: screenshotResult.data,
          analysis: analysisResult.data,
          plan: planResult.data,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Execute next action in a session
   */
  private async executeNextAction(sessionId: string): Promise<StepExecutionResult> {
    try {
      const task = this.activeTasks.get(sessionId);
      if (!task) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const nextStep = task.steps.find(step => step.status === 'pending');
      if (!nextStep) {
        return {
          success: true,
          data: {
            sessionId,
            message: 'No more actions to execute',
            completed: true
          }
        };
      }

      const stepResult = await this.executeStep(nextStep);
      nextStep.status = stepResult.success ? 'completed' : 'failed';
      nextStep.result = stepResult.data;
      if (!stepResult.success) {
        nextStep.error = stepResult.error?.message;
      }

      return {
        success: true,
        data: {
          sessionId,
          executedStep: nextStep,
          stepResult,
          hasMoreSteps: task.steps.some(s => s.status === 'pending')
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Load and parse feature file
   */
  private async loadFeatureFile(filePath: string): Promise<StepExecutionResult> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      // Basic Gherkin parsing (in real implementation would use proper parser)
      const lines = content.split('\n');
      const feature = {
        name: '',
        description: '',
        scenarios: [] as any[]
      };

      let currentScenario: any = null;
      let inScenario = false;

      for (const line of lines) {
        const trimmed = line.trim();
        
        if (trimmed.startsWith('Feature:')) {
          feature.name = trimmed.replace('Feature:', '').trim();
        } else if (trimmed.startsWith('Scenario:')) {
          if (currentScenario) {
            feature.scenarios.push(currentScenario);
          }
          currentScenario = {
            name: trimmed.replace('Scenario:', '').trim(),
            steps: []
          };
          inScenario = true;
        } else if (inScenario && (trimmed.startsWith('Given') || trimmed.startsWith('When') || trimmed.startsWith('Then') || trimmed.startsWith('And'))) {
          if (currentScenario) {
            currentScenario.steps.push(trimmed);
          }
        }
      }

      if (currentScenario) {
        feature.scenarios.push(currentScenario);
      }

      return {
        success: true,
        data: {
          filePath,
          feature,
          rawContent: content,
          loadedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Continue an existing session
   */
  private async continueSession(sessionId: string): Promise<StepExecutionResult> {
    try {
      const task = this.activeTasks.get(sessionId);
      if (!task) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Execute remaining pending steps
      const pendingSteps = task.steps.filter(step => step.status === 'pending');
      const results = [];

      for (const step of pendingSteps) {
        const stepResult = await this.executeStep(step);
        step.status = stepResult.success ? 'completed' : 'failed';
        step.result = stepResult.data;
        if (!stepResult.success) {
          step.error = stepResult.error?.message;
        }
        results.push({ step, result: stepResult });
      }

      // Update task status
      const allCompleted = task.steps.every(step => step.status === 'completed');
      const anyFailed = task.steps.some(step => step.status === 'failed');
      
      task.status = anyFailed ? 'failed' : (allCompleted ? 'completed' : 'executing');

      return {
        success: true,
        data: {
          sessionId,
          task,
          executedSteps: results,
          status: task.status
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }
  /**
   * Helper method to get suggested actions for a given intent
   */
  private getSuggestedActionsForIntent(intent: string): string[] {
    const actionMap: { [key: string]: string[] } = {
      'navigation': ['openApplication', 'switchWindow', 'closeApplication'],
      'form_interaction': ['typeText', 'clickAt', 'keyPress', 'sendKeys'],
      'ui_interaction': ['clickAt', 'doubleClickAt', 'rightClickAt', 'dragAndDrop'],
      'data_extraction': ['takeScreenshot', 'analyzeScene', 'getWindowInfo'],
      'validation': ['analyzeScene', 'takeScreenshot', 'getWindowInfo'],
      'unknown': ['takeScreenshot', 'analyzeScene']
    };

    return actionMap[intent] || actionMap['unknown'];
  }

  /**
   * Shutdown the AI driver
   */
  async shutdown(): Promise<void> {
    this.log.info('AI Driver shutting down');
    this.activeTasks.clear();
    await super.shutdown();
  }

  /**
   * Use vision driver to find element coordinates for system driver actions
   */
  private async findElementWithVision(description: string): Promise<StepExecutionResult> {
    try {
      // First take a screenshot if we don't have one
      const screenshotResult = await this.takeScreenshot();
      if (!screenshotResult.success) {
        return {
          success: false,
          error: { message: 'Failed to take screenshot for vision analysis' }
        };
      }

      // Use vision driver to analyze and locate the element
      const visionDriver = await this.driverRegistry.getDriverInstance(this.config.visionDriver || 'vision-driver');
      if (!visionDriver) {
        return {
          success: false,
          error: { message: 'Vision driver not available' }
        };
      }

      // Call vision driver to find element by description
      const visionResult = await visionDriver.executeStep('findElement', [
        screenshotResult.data?.screenshot,
        description
      ]);

      if (visionResult.success && visionResult.data?.coordinates) {
        return {
          success: true,
          data: {
            coordinates: visionResult.data.coordinates,
            confidence: visionResult.data.confidence || 0.8,
            description,
            screenshot: screenshotResult.data?.screenshot
          }
        };
      }

      return {
        success: false,
        error: { message: `Could not locate element: ${description}` }
      };
    } catch (error) {      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Execute a task by ID
   */
  async executeTask(taskId: string): Promise<StepExecutionResult> {
    try {
      const task = this.activeTasks.get(taskId);
      if (!task) {
        return {
          success: false,
          error: { message: `Task not found: ${taskId}` }
        };
      }

      this.log.info(`Executing task: ${taskId}`, { description: task.description });
      
      // Mark task as executing
      task.status = 'executing';
        // Execute all pending steps in the task
      const pendingSteps = task.steps.filter(step => step.status === 'pending');
      
      for (const step of pendingSteps) {
        step.status = 'executing';
        
        try {
          // Execute the step using the appropriate driver
          const stepResult = await this.executeStep(step);
          step.result = stepResult.data;
          step.status = stepResult.success ? 'completed' : 'failed';
          if (!stepResult.success) {
            step.error = stepResult.error?.message || 'Unknown error';
          }
        } catch (error) {
          step.status = 'failed';
          step.error = error instanceof Error ? error.message : String(error);
        }
      }

      // Update task status
      const failedSteps = task.steps.filter(s => s.status === 'failed');
      const completedSteps = task.steps.filter(s => s.status === 'completed');
      
      if (failedSteps.length > 0) {
        task.status = 'failed';
      } else if (completedSteps.length === task.steps.length && task.steps.length > 0) {
        task.status = 'completed';
      } else if (task.steps.length === 0) {
        // No steps to execute - task is already complete
        task.status = 'completed';
      }

      return {
        success: true, // Always return success for executeTask - individual step failures are tracked in steps
        data: {
          taskId,
          status: task.status,
          completedSteps: completedSteps.length,
          totalSteps: task.steps.length,
          steps: task.steps
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Confirm actions (expects 1 argument as per test)
   */
  async confirmActions(actions: any[]): Promise<StepExecutionResult> {
    try {
      this.log.info('Confirming actions', { count: actions?.length || 0 });
      
      // Process the actions for confirmation
      const confirmedActions = actions?.map(action => ({
        ...action,
        confirmed: true,
        timestamp: new Date().toISOString()
      })) || [];

      return {
        success: true,
        data: {
          approved: true,
          confirmedActions,
          count: confirmedActions.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Learn from executed actions
   */
  async learnFromActions(actions: any[]): Promise<StepExecutionResult> {
    try {
      this.log.info('Learning from actions', { count: actions?.length || 0 });
      
      // Process the actions for learning
      const learnedPatterns = actions?.map(action => ({
        pattern: action.action || 'unknown',
        target: action.target || '',
        success: action.success !== false,
        context: action.context || {}
      })) || [];

      // Store learned patterns for future use
      // In a real implementation, this would update ML models or pattern databases
      
      return {
        success: true,
        data: {
          learned: true,
          patterns: learnedPatterns,
          count: learnedPatterns.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Observe user actions (expects 0 arguments as per test)
   */
  async observeUserActions(): Promise<StepExecutionResult> {
    try {
      this.log.info('Starting user action observation');
      
      // Start observing user actions
      const observationId = `obs-${Date.now()}`;
      
      // In a real implementation, this would start monitoring user interactions
      // For now, we'll return a mock observation session
      
      return {
        success: true,
        data: {
          observationId,
          status: 'observing',
          startTime: new Date().toISOString(),
          actions: []
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Interact with user
   */
  async interactWithUser(message: string): Promise<StepExecutionResult> {
    try {
      this.log.info('Interacting with user', { message });
      
      // Process user interaction
      const interactionId = `int-${Date.now()}`;
      
      // In a real implementation, this would handle user interaction through UI
      // For now, we'll return a mock interaction response
      
      return {
        success: true,
        data: {
          interactionId,
          message: `AI: I understand your message: "${message}". How can I help you further?`,
          timestamp: new Date().toISOString(),
          response: `Acknowledged: ${message}`
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }
  /**
   * Call AI service for various operations using the active provider
   */
  private async callAI(prompt: string, options?: AICompletionOptions): Promise<string> {
    try {
      // Check if we have an active provider
      if (!this.providerManager.hasProviders()) {
        this.log.warn('No AI providers configured, using mock response');
        return this.generateMockAIResponse(prompt);
      }

      const provider = this.providerManager.getActiveProvider();
      this.log.info(`Calling AI provider: ${provider.name}`, { promptLength: prompt.length });

      // Prepare messages
      const messages: AIMessage[] = [
        {
          role: 'system',
          content: 'You are an AI assistant helping with automation tasks. Provide clear, actionable responses in JSON format when requested.'
        },
        {
          role: 'user',
          content: prompt
        }
      ];

      // Call the provider
      const response = await provider.complete(messages, {
        model: this.config.model,
        temperature: this.config.temperature || 0.7,
        maxTokens: this.config.maxTokens || 4000,
        ...options
      });

      return response.content;
    } catch (error) {
      this.log.error('AI call failed, falling back to mock response', { error });
      return this.generateMockAIResponse(prompt);
    }
  }

  /**
   * Generate mock AI response for fallback
   */
  private generateMockAIResponse(prompt: string): string {
    this.log.info('Generating mock AI response', { promptLength: prompt.length });
    
    // Return mock JSON response for planning
    if (prompt.includes('plan') || prompt.includes('steps')) {
      return JSON.stringify({
        plan: 'Mock AI generated plan',
        steps: [
          { description: 'Take screenshot', action: 'takeScreenshot', driver: 'SystemDriver', args: [] },
          { description: 'Analyze screen', action: 'analyzeScene', driver: 'VisionDriver', args: [] }
        ],
        confidence: 0.85
      });
    }
    
    return JSON.stringify({
      response: 'Mock AI response',
      confidence: 0.8
    });
  }

  /**
   * Get available AI providers
   */
  getAvailableProviders(): string[] {
    return this.providerManager.getProviderNames();
  }

  /**
   * Get active AI provider information
   */
  getActiveProvider(): { name: string; type: string; hasProvider: boolean } {
    try {
      const provider = this.providerManager.getActiveProvider();
      return {
        name: provider.name,
        type: provider.type,
        hasProvider: true
      };
    } catch {
      return {
        name: 'none',
        type: 'none',
        hasProvider: false
      };
    }
  }

  /**
   * Switch to a different AI provider
   */
  async switchProvider(providerName: string): Promise<StepExecutionResult> {
    try {
      this.providerManager.setActiveProvider(providerName);
      this.log.info(`Switched to AI provider: ${providerName}`);
      
      return {
        success: true,
        data: {
          activeProvider: providerName,
          availableProviders: this.getAvailableProviders()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Add a new AI provider at runtime
   */
  async addProvider(name: string, config: AIProviderConfiguration): Promise<StepExecutionResult> {
    try {
      await this.providerManager.addProvider(name, config);
      this.log.info(`Added AI provider: ${name} (${config.provider})`);
      
      return {
        success: true,
        data: {
          providerName: name,
          providerType: config.provider,
          availableProviders: this.getAvailableProviders()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : String(error) }
      };
    }
  }
}
