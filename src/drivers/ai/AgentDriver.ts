import { BaseDriver } from '../base.driver';
import { DriverCapabilities, DriverConfig, StepExecutionResult } from '../driver.interface';
import { DriverProcessManager } from '../management/DriverProcessManager';
import { DriverRegistry } from '../driverRegistry';
import * as net from 'net';
import { Logger } from '../../utils/logger';
import { globalShutdownRequested } from '../../index';
import { ResultLogger, StepResult } from '../../report/resultLogger';
import { VoiceController, VoiceEvent } from '../../voice/VoiceController';

export interface AgentDriverConfig extends DriverConfig {
  outputDir?: string;
  aiDriverServicePort?: number;
  aiDriverServiceHost?: string;
  connectionTimeout?: number;
  requestTimeout?: number;
  maxIterations?: number;
  iterationDelay?: number;
}

export interface OrchestrationState {
  goal: string;
  currentIteration: number;
  maxIterations: number;
  isComplete: boolean;
  error?: string;
  history: Array<{
    iteration: number;
    screenshot?: string;
    analysis?: any;
    plan?: any[];
    actions?: any[];
    results?: any[];
    actionResult?: any;
    timestamp: number;
    duration?: number;
  }>;
}

/**
 * AgentDriver - Orchestration layer for autonomous task completion
 * 
 * This driver coordinates vision-driver, system-driver, and ai-driver to automatically 
 * complete tasks by:
 * 1. Taking screenshots using system-driver
 * 2. Analyzing the screen using vision-driver  
 * 3. Making decisions using ai-driver
 * 4. Executing actions using system-driver
 * 5. Continuing until the task is complete
 * 
 * The drivers are standalone services and don't communicate directly - 
 * all coordination happens through this AgentDriver.
 */
export class AgentDriver extends BaseDriver {
  private config: AgentDriverConfig = {};
  private servicePort: number | null = null; // Port of the ai-driver service
  private serviceHost: string = '127.0.0.1'; // Host of the ai-driver service
  private connectionTimeout: number = 5000;
  private requestTimeout: number = 30000; // General request timeout
  private aiDriverInstance: any = null; // Stores the WebSocketDriverInstance from the registry
  // Agent control state
  private agentState: 'running' | 'paused' | 'stopped';
  private pauseUntil: number = 0; // Timestamp until which agent should remain paused
  private keyboardMonitor: any = null; // For monitoring escape key and user input
  private resultLogger: ResultLogger; // For generating reports
  private voiceController: VoiceController; // For voice announcements
    constructor(config: AgentDriverConfig = {}) {
    super();
    this.config = config;
    this.agentState = 'stopped'; // Initialize agent state
    // Initialize logger in constructor
    this.log = Logger.getInstance().createChildLogger({ component: 'AgentDriver' }); 
    // Initialize result logger for report generation
    this.resultLogger = new ResultLogger();
    
    // Initialize voice controller with explicit config from environment
    const voiceConfig = {
      enabled: process.env.RUNIX_VOICE_ENABLED === 'true',
      speechRate: parseFloat(process.env.RUNIX_VOICE_RATE || '1.0'),
      speechPitch: parseFloat(process.env.RUNIX_VOICE_PITCH || '1.0'),
      speechVolume: parseFloat(process.env.RUNIX_VOICE_VOLUME || '1.0'),
      language: process.env.RUNIX_VOICE_LANGUAGE || 'en-US'
    };
      // Debug voice configuration
    this.log.debug('Voice control configuration', {
      envVars: {
        RUNIX_VOICE_ENABLED: process.env.RUNIX_VOICE_ENABLED || 'UNDEFINED',
        RUNIX_VOICE_RATE: process.env.RUNIX_VOICE_RATE || 'UNDEFINED',
        RUNIX_VOICE_PITCH: process.env.RUNIX_VOICE_PITCH || 'UNDEFINED',
        RUNIX_VOICE_VOLUME: process.env.RUNIX_VOICE_VOLUME || 'UNDEFINED',
        RUNIX_VOICE_LANGUAGE: process.env.RUNIX_VOICE_LANGUAGE || 'UNDEFINED'
      },
      parsedConfig: voiceConfig
    });
    
    this.voiceController = new VoiceController(voiceConfig);
  }
  async initialize(config: AgentDriverConfig = {}): Promise<void> {
    this.config = { ...this.config, ...config };
    
    this.serviceHost = this.config.aiDriverServiceHost || '127.0.0.1';
    this.connectionTimeout = this.config.connectionTimeout || 5000;
    this.requestTimeout = this.config.requestTimeout || 30000;
    
    this.log.info('Agent Driver initializing', { 
      outputDir: this.config.outputDir,
      serviceHost: this.serviceHost,
      connectionTimeout: this.connectionTimeout,
      requestTimeout: this.requestTimeout
    });
    
    if (this.config.outputDir) {
      const fs = await import('fs/promises');
      await fs.mkdir(this.config.outputDir, { recursive: true });
    }

    try {
      await this.ensureAiDriverService();
      this.log.info('Agent Driver initialized successfully - ai-driver service is accessible');
    } catch (error) {
      this.log.error('Agent Driver failed to initialize - ai-driver service is not accessible', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
      // Initialize keyboard monitoring for agent control
    await this.initializeKeyboardMonitoring();
    
    await super.initialize(config);
  }

  private async ensureAiDriverService(): Promise<void> {
    const processManager = DriverProcessManager.getInstance();
    const existingProcess = processManager.getProcessInfo('ai-driver');
    
    this.log.debug('Checking for existing ai-driver process', { 
      hasExistingProcess: !!existingProcess,
      processInfo: existingProcess ? { pid: existingProcess.pid, port: existingProcess.port } : null
    });
    
    if (existingProcess && this.aiDriverInstance) {
        this.log.debug('AI driver instance already exists and process is running.');
        if (typeof this.aiDriverInstance.getCapabilities === 'function') {
            try {
                await this.aiDriverInstance.getCapabilities(); 
                this.log.debug('Existing AI driver instance is responsive.');
                this.servicePort = existingProcess.port; 
                return;
            } catch (e) {
                this.log.warn('Existing AI driver instance is not responsive, will attempt to restart.', { error: e });
                this.aiDriverInstance = null; 
            }
        } else {
             this.log.warn('Existing AI driver instance does not have getCapabilities method, cannot verify responsiveness.');
        }
    } else if (existingProcess && !this.aiDriverInstance) {
        this.log.debug('AI driver process is running, but no instance stored. Will try to use it or restart if needed.');
    }

    const registry = DriverRegistry.getInstance();
    this.log.debug('Initializing driver registry');
    // Accessing private member for check, consider adding a public getter to DriverRegistry
    if (!(registry as any).initialized) { 
        await registry.initialize();
    }
    
    const aiDriverMeta = registry.getDriver('ai-driver');
    this.log.debug('Retrieved ai-driver metadata', { 
      found: !!aiDriverMeta,
      metadata: aiDriverMeta ? { id: aiDriverMeta.id, name: aiDriverMeta.name, path: aiDriverMeta.path, executable: aiDriverMeta.executable } : null
    });
    
    if (!aiDriverMeta) {
      throw new Error('AI Driver service not found in registry. Ensure ai-driver is properly installed.');
    }
    
    this.log.debug('Starting ai-driver service via registry', { driverId: aiDriverMeta.id });
    
    try {
      this.aiDriverInstance = await registry.startDriver('ai-driver'); 
      this.log.debug('Registry startDriver returned', { 
        success: !!this.aiDriverInstance,
        instanceType: this.aiDriverInstance ? this.aiDriverInstance.constructor.name : 'null'
      });

      if (!this.aiDriverInstance || typeof this.aiDriverInstance.callMethod !== 'function') {
        this.log.error('Failed to get a valid WebSocketDriverInstance from registry.', { instance: this.aiDriverInstance });
        throw new Error('Failed to start ai-driver service: Did not receive a valid driver instance from registry.');
      }
      
      const processInfo = processManager.getProcessInfo('ai-driver');
      this.log.debug('Retrieved process info after start', { 
        found: !!processInfo,
        processInfo: processInfo ? { pid: processInfo.pid, port: processInfo.port, driverId: processInfo.driverId } : null
      });
      
      if (!processInfo || !processInfo.port) {
        throw new Error('Failed to start ai-driver service - no process information or port available after registry start.');
      }
      this.servicePort = processInfo.port; 
      this.log.info('AI Driver service started and instance created successfully', { 
        port: this.servicePort, 
        pid: processInfo.pid 
      });
      
      try {
        this.log.debug('Testing connection to AI driver service via instance');
        const capabilities = await this.aiDriverInstance.getCapabilities(); 
        this.log.debug('AI driver service connection test via instance passed', { capabilities });
      } catch (testError) {
        this.log.error('AI driver service connection test via instance failed', { 
          error: testError instanceof Error ? testError.message : String(testError)
        });
        throw new Error('AI Driver service started but is not responsive.'); 
      }
      
    } catch (startError) {
      this.log.error('Failed to start or connect to ai-driver service via registry', { 
        error: startError instanceof Error ? startError.message : String(startError),
        stack: startError instanceof Error ? startError.stack : undefined
      });
      this.aiDriverInstance = null; 
      throw startError;
    }
  }  getCapabilities(): DriverCapabilities {
    return {
      name: 'AgentDriver',
      version: '1.0.0',
      description: 'Agent-driven automation system that orchestrates vision-driver, system-driver, and ai-driver for autonomous task completion using OpenAI Computer Use Architecture patterns',
      supportedActions: [
        'agent', 'ask', 'analyze', 'plan', 'execute',
        'generateFeature', 'setMode', 'startSession', 
        'analyzeScreenAndPlan', 'executeNextAction', 'loadFeatureFile', 'continueSession',
        'orchestrate', 'takeScreenshot', 'analyzeScreen', 'planActions', 'executeActions'
      ],
      author: 'Runix Team'
    };
  }async execute(action: string, args: any[]): Promise<StepExecutionResult> {
    this.validateInitialized();
    
    // Handle orchestration actions directly
    if (action === 'orchestrate') {
      try {
        const goal = args[0]?.goal || args[0];
        const options = args[0]?.options || args[1] || {};
        const result = await this.orchestrate(goal, options);
        return {
          success: result.isComplete,
          data: result,
          error: result.error ? { message: result.error } : undefined
        };
      } catch (error) {
        return {
          success: false,
          error: { message: error instanceof Error ? error.message : String(error) }
        };
      }
    }
    
    // Handle agent mode - CUA-style continuous loop
    if (action === 'agent') {
      try {
        const task = args[0]?.task || args[0];
        const options = args[0]?.options || args[1] || {};
        const result = await this.runAgentLoop(task, options);
        return {
          success: result.isComplete,
          data: result,
          error: result.error ? { message: result.error } : undefined
        };
      } catch (error) {
        return {
          success: false,
          error: { message: error instanceof Error ? error.message : String(error) }
        };
      }
    }
    
    if (action === 'takeScreenshot') {
      try {
        const result = await this.coordinateScreenshot();
        return {
          success: true,
          data: { path: result }
        };
      } catch (error) {
        return {
          success: false,
          error: { message: error instanceof Error ? error.message : String(error) }
        };
      }
    }
    
    if (action === 'analyzeScreen') {
      try {
        const screenshotPath = args[0]?.path || args[0];
        const result = await this.coordinateScreenAnalysis(screenshotPath);
        return {
          success: true,
          data: result
        };
      } catch (error) {
        return {
          success: false,
          error: { message: error instanceof Error ? error.message : String(error) }
        };
      }
    }
    
    if (action === 'planActions') {
      try {
        const goal = args[0]?.goal || args[0];
        const screenAnalysis = args[0]?.screenAnalysis || args[1];
        const history = args[0]?.history || args[2] || [];
        const result = await this.coordinateDecisionMaking(goal, screenAnalysis, history);
        return {
          success: true,
          data: result
        };
      } catch (error) {
        return {
          success: false,
          error: { message: error instanceof Error ? error.message : String(error) }
        };
      }
    }
    
    if (action === 'executeActions') {
      try {
        const actions = args[0]?.actions || args[0];
        const result = await this.coordinateActionExecution(actions);
        return {
          success: true,
          data: result
        };
      } catch (error) {
        return {
          success: false,
          error: { message: error instanceof Error ? error.message : String(error) }
        };
      }
    }
    
    // For non-orchestration actions, delegate to AI driver
    if (!this.aiDriverInstance) {
      this.log.error('AI Driver instance is not available for execute action.', { action });
      await this.ensureAiDriverService(); 
      if (!this.aiDriverInstance) {
        return {
            success: false,
            error: { message: 'AI Driver service is not available after attempting to reconnect.' }
        };
      }
    }
      try {
      this.log.info(`AgentDriver executing action via instance: ${action}`, { argsLength: args.length, action });
      
      // Add enhanced logging to capture WebSocket communication
      this.log.info(`[WEBSOCKET-DEBUG] About to call aiDriverInstance.callMethod`, {
        action,
        args,
        instanceType: this.aiDriverInstance?.constructor?.name,
        hasCallMethod: typeof this.aiDriverInstance?.callMethod === 'function'
      });
      
      const result = await this.aiDriverInstance.callMethod('execute', { action, args });
      
      this.log.info(`AgentDriver action via instance completed: ${action}`, { 
        success: true, 
        hasData: result !== undefined && result !== null, 
        responseData: result 
      });
      
      return {
        success: true,
        data: result 
      };
    } catch (error) {
      // Enhanced error logging to capture WebSocket response details
      this.log.error(`[WEBSOCKET-DEBUG] AgentDriver callMethod failed`, { 
        action,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        // Try to extract any additional error properties
        errorCode: error instanceof Error && 'code' in error ? (error as any).code : undefined,
        errorDetails: error instanceof Error && 'details' in error ? (error as any).details : undefined,
        originalError: error instanceof Error && 'originalError' in error ? (error as any).originalError : undefined
      });
      
      this.log.error(`AgentDriver action via instance failed: ${action}`, { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      return {
        success: false,
        error: { 
          message: `Agent action failed: ${error instanceof Error ? error.message : String(error)}`,
          details: error instanceof Error ? error.stack : undefined
        }
      };
    }
  }

  /**
   * Main orchestration method - coordinates all drivers to complete a task
   */  async orchestrate(goal: string, options: { maxIterations?: number; iterationDelay?: number } = {}): Promise<OrchestrationState> {
    const state: OrchestrationState = {
      goal,
      currentIteration: 0,
      maxIterations: options.maxIterations || this.config.maxIterations || 10,
      isComplete: false,
      history: []
    };

    this.log.info('Starting orchestration', { goal, maxIterations: state.maxIterations });
    
    // Voice announcement: goal set
    await this.announceGoal(goal);

    try {
      while (!state.isComplete && state.currentIteration < state.maxIterations) {
        state.currentIteration++;
        this.log.info(`Orchestration iteration ${state.currentIteration}/${state.maxIterations}`);

        const iterationStart = Date.now();
        const iterationData: any = {
          iteration: state.currentIteration,
          timestamp: iterationStart
        };

        try {          
          // Step 1: Take screenshot
          await this.announceThinking('I need to see the current state of the screen. Taking a screenshot for analysis');
          const screenshotResult = await this.coordinateScreenshot();
          iterationData.screenshot = screenshotResult;

          // Step 2: Analyze screen
          await this.announceThinking('Now I will analyze what I can see on the screen to understand the current situation');
          const analysisResult = await this.coordinateScreenAnalysis(screenshotResult);
          iterationData.analysis = analysisResult;

          // Step 3: Make decisions and plan actions
          await this.announceThinking('Based on what I can see, I will plan the next actions to achieve the goal');
          const planResult = await this.coordinateDecisionMaking(goal, analysisResult, state.history);
          iterationData.plan = planResult;          // Check if goal is achieved
          if (planResult.goalAchieved) {
            state.isComplete = true;
            this.log.info('Goal achieved!', { iteration: state.currentIteration });
            await this.voiceController.speak(`Excellent! I have successfully achieved the goal: ${goal}. The task is now complete.`);
            break;
          }

          // Step 4: Execute actions if provided and goal not achieved
          if (planResult.actions && planResult.actions.length > 0) {
            const executionResults = await this.coordinateActionExecution(planResult.actions);
            iterationData.actions = planResult.actions;
            iterationData.results = executionResults;

            // Check if any action indicates task completion
            const hasTaskCompletion = executionResults.some(result => 
              result.action?.type === 'task_complete' || 
              result.result?.isComplete === true ||
              (result.success && result.action?.originalAction?.type === 'task_complete')
            );            if (hasTaskCompletion) {
              state.isComplete = true;
              this.log.info('Task completed by action execution!', { iteration: state.currentIteration });
              await this.voiceController.speak(`Perfect! The task has been completed successfully. All required actions have been executed and the goal has been achieved.`);
              break;
            }          } else {
            // No actions to execute - check if AI thinks task is complete
            if (planResult.isComplete || planResult.taskComplete || planResult.completed) {
              state.isComplete = true;
              this.log.info('AI indicated task is complete without further actions!', { iteration: state.currentIteration });
              await this.voiceController.speak(`Great! I have determined that the task is already complete. No further actions are needed to achieve the goal.`);
              break;
            }
          }

          // Step 5: Wait before next iteration if configured
          if (options.iterationDelay || this.config.iterationDelay) {
            const delay = options.iterationDelay || this.config.iterationDelay || 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
          }

        } catch (iterationError) {
          this.log.error(`Error in iteration ${state.currentIteration}`, { error: iterationError });
          iterationData.error = iterationError instanceof Error ? iterationError.message : String(iterationError);
          await this.announceError(`iteration ${state.currentIteration} failed`);
        }

        state.history.push(iterationData);
      }

      if (!state.isComplete) {
        state.error = `Task not completed within ${state.maxIterations} iterations`;
        this.log.warn('Orchestration incomplete', { maxIterations: state.maxIterations });
        await this.announceError('task not completed within maximum iterations');
      }

    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      this.log.error('Orchestration failed', { error: state.error });
      await this.announceError('orchestration failed');
    }    this.log.info('Orchestration completed', { 
      success: state.isComplete, 
      iterations: state.currentIteration,
      error: state.error 
    });

    // Add final thank you message for completed agent runs
    if (this.voiceController.isEnabled()) {
      await this.voiceController.speak("Thank you for using Runix!");
      this.log.debug('Final thank you message announced');
    }

    return state;
  }
  /**
   * Coordinate taking a screenshot via system-driver
   */
  private async coordinateScreenshot(): Promise<string> {
    this.log.debug('Taking screenshot via system-driver');
    
    const registry = DriverRegistry.getInstance();
    const systemDriver = await registry.startDriver('system-driver');
    
    if (!systemDriver || typeof systemDriver.callMethod !== 'function') {
      throw new Error('System driver not available for screenshot');
    }

    // Generate filename - system-driver expects a filename string as first argument
    const filename = `screenshot_${Date.now()}.png`;

    const result = await systemDriver.callMethod('execute', { 
      action: 'takeScreenshot', 
      args: [filename] 
    });

    if (!result || !result.success) {
      throw new Error(`Screenshot failed: ${result?.error?.message || 'Unknown error'}`);
    }

    return result.data?.path || result.data?.screenshot || 'screenshot.png';
  }

  /**
   * Coordinate screen analysis via vision-driver
   */
  private async coordinateScreenAnalysis(screenshotPath: string): Promise<any> {
    this.log.debug('Analyzing screen via vision-driver', { screenshotPath });
    
    const registry = DriverRegistry.getInstance();
    const visionDriver = await registry.startDriver('vision-driver');
    
    if (!visionDriver || typeof visionDriver.callMethod !== 'function') {
      throw new Error('Vision driver not available for screen analysis');
    }

    // Use analyzeScene for comprehensive screen analysis
    const result = await visionDriver.callMethod('execute', { 
      action: 'analyzeScene', 
      args: [{ imagePath: screenshotPath }] 
    });

    if (!result || !result.success) {
      throw new Error(`Screen analysis failed: ${result?.error?.message || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Coordinate decision making via ai-driver
   */
  private async coordinateDecisionMaking(goal: string, screenAnalysis: any, history: any[]): Promise<any> {
    this.log.debug('Making decisions via ai-driver', { goal });
    
    if (!this.aiDriverInstance) {
      await this.ensureAiDriverService();
    }

    if (!this.aiDriverInstance || typeof this.aiDriverInstance.callMethod !== 'function') {
      throw new Error('AI driver not available for decision making');
    }

    // Use AI driver to analyze the current situation and plan next actions
    const planResult = await this.aiDriverInstance.callMethod('execute', { 
      action: 'planTask', 
      args: [{
        goal,
        currentState: screenAnalysis,
        history: history.slice(-3) // Only send last 3 iterations to avoid overwhelming context
      }] 
    });

    if (!planResult || !planResult.success) {
      throw new Error(`Decision making failed: ${planResult?.error?.message || 'Unknown error'}`);
    }

    // Also check if goal is achieved
    const goalCheckResult = await this.aiDriverInstance.callMethod('execute', { 
      action: 'validateGoalAchievement', 
      args: [{ goal, currentState: screenAnalysis }] 
    });

    return {
      ...planResult.data,
      goalAchieved: goalCheckResult?.success && goalCheckResult?.data?.achieved
    };
  }
  /**
   * Coordinate action execution via system-driver
   */  private async coordinateActionExecution(actions: any[]): Promise<any[]> {
    this.log.debug('Executing actions via system-driver', { actionCount: actions?.length || 0 });
    
    if (!actions || actions.length === 0) {
      return [];
    }

    const registry = DriverRegistry.getInstance();
    const systemDriver = await registry.startDriver('system-driver');
    
    if (!systemDriver || typeof systemDriver.callMethod !== 'function') {
      throw new Error('System driver not available for action execution');
    }

    const results = [];
    
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const nextAction = i < actions.length - 1 ? actions[i + 1] : null;
      
      try {
        const actionType = action.type || action.action;
        this.log.debug('Executing action', { action: actionType });
        
        // Voice announcement: action start
        await this.announceActionStart(actionType, action);
        
        const result = await systemDriver.callMethod('execute', { 
          action: actionType, 
          args: action.args || [action] 
        });
        
        const actionResult = {
          action,
          success: result?.success || false,
          result: result?.data,
          error: result?.error
        };
        
        results.push(actionResult);

        // Voice announcement: action complete
        await this.announceActionComplete(actionType, actionResult);

        // Determine delay based on current and next action
        let delayMs = 100; // Default delay
        
        const currentActionType = actionType;
        const nextActionType = nextAction?.type || nextAction?.action;
        
        // Longer delay after Windows key press, especially if followed by typing
        if (currentActionType === 'pressKey') {
          const key = action.args?.[0] || action.key;
          if (key === 'Win' || key === 'Windows' || key === 'Meta') {
            if (nextActionType === 'typeText' || nextActionType === 'type') {
              delayMs = 1200; // Extra long delay when Win key is followed by typing
              this.log.debug('Using extended delay after Windows key before typing', { delayMs });
            } else {
              delayMs = 800; // Longer delay for other actions after Windows key
              this.log.debug('Using longer delay after Windows key', { delayMs });
            }
          }
        }
        
        // Special delay for Ctrl+Esc combinations
        if (currentActionType === 'pressKey') {
          const modifiers = action.args?.[1] || action.modifiers || [];
          if (modifiers.includes('Ctrl') && (action.args?.[0] === 'Escape' || action.key === 'Escape')) {
            delayMs = 600; // Delay for Ctrl+Esc
            this.log.debug('Using delay after Ctrl+Esc', { delayMs });
          }
        }

        // Apply the delay between actions
        if (i < actions.length - 1) { // Don't delay after the last action
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
      } catch (error) {
        this.log.error('Action execution failed', { action, error });
        results.push({
          action,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return results;
  }  async shutdown(): Promise<void> {
    this.log.info('Agent Driver shutting down');
    
    // Stop agent if running
    this.agentState = 'stopped';
    
    // Clean up keyboard monitoring
    await this.cleanupKeyboardMonitoring();
    
    // Shutdown voice controller
    this.voiceController.shutdown();
    
    if (this.aiDriverInstance && typeof this.aiDriverInstance.stop === 'function') {
      try {
        await this.aiDriverInstance.stop();
        this.log.debug('AI Driver instance stopped.');
      } catch (error) {
        this.log.error('Error stopping AI Driver instance', { error });
      }
    }
    this.aiDriverInstance = null;
    await super.shutdown();
  }
  /**
   * Initialize keyboard monitoring for agent control (Escape key to stop, any key to pause)
   */
  private async initializeKeyboardMonitoring(): Promise<void> {
    try {
      // Use system driver to monitor keyboard input
      const registry = DriverRegistry.getInstance();
      const systemDriver = await registry.startDriver('system-driver');
      
      if (!systemDriver) {
        this.log.warn('System driver not available for keyboard monitoring');
        return;
      }

      this.keyboardMonitor = {
        systemDriver,
        isMonitoring: true,
        lastInputTime: 0
      };
      
      this.log.info('Keyboard monitoring initialized - Press ESC to stop agent, any other key to pause for 10 seconds');
      
    } catch (error) {
      this.log.error('Failed to initialize keyboard monitoring', { error });
    }
  }
  /**
   * Clean up keyboard monitoring resources
   */
  private async cleanupKeyboardMonitoring(): Promise<void> {
    if (this.keyboardMonitor) {
      try {
        // Mark monitoring as stopped
        this.keyboardMonitor.isMonitoring = false;
        this.keyboardMonitor = null;
        this.log.debug('Keyboard monitoring cleaned up');
      } catch (error) {
        this.log.error('Error cleaning up keyboard monitoring', { error });
      }
    }
  }
  /**
   * Check if user has pressed escape key to stop agent
   */
  private async checkForEscapeKey(): Promise<boolean> {
    if (!this.keyboardMonitor || !this.keyboardMonitor.isMonitoring) return false;
    
    try {
      // Check if ESC key was pressed using system driver
      const result = await this.keyboardMonitor.systemDriver.callMethod('execute', {
        action: 'checkKeyPressed',
        args: ['Escape']
      });
      
      if (result?.success && result?.data?.pressed) {
        this.log.info('ESC key detected - stopping agent');
        return true;
      }
      
      return false;
    } catch (error) {
      this.log.debug('Error checking for escape key', { error });
      return false;
    }
  }
  /**
   * Check for any user input and pause agent if detected
   */
  private async checkForUserInput(): Promise<void> {
    if (!this.keyboardMonitor || !this.keyboardMonitor.isMonitoring) return;
    
    try {
      // Check if any keys (other than ESC) were pressed
      const result = await this.keyboardMonitor.systemDriver.callMethod('execute', {
        action: 'checkAnyKeyPressed',
        args: []
      });
      
      if (result?.success && result?.data?.pressed && result?.data?.key !== 'Escape') {
        const currentTime = Date.now();
        
        // If a key was pressed and it's different from last input time, pause agent
        if (result.data.timestamp > this.keyboardMonitor.lastInputTime) {
          this.keyboardMonitor.lastInputTime = result.data.timestamp;
          this.pauseAgent(10000); // Pause for 10 seconds
          this.log.info(`User input detected (${result.data.key}) - pausing agent for 10 seconds`);
          return;
        }
      }
    } catch (error) {
      // If system driver doesn't support key monitoring, silently continue
      this.log.debug('Key monitoring not available in system driver', { error });
    }
      // Check if pause period has ended
    const currentTime = Date.now();
    if (this.pauseUntil > 0 && currentTime >= this.pauseUntil) {
      this.agentState = 'running';
      this.pauseUntil = 0;
      this.log.info('Agent pause period ended - resuming operation');
      this.provideUserFeedback('resume', 'Agent resuming operation');
    } else if (this.pauseUntil > currentTime) {
      const remainingPause = Math.ceil((this.pauseUntil - currentTime) / 1000);
      if (remainingPause % 5 === 0) { // Log every 5 seconds to avoid spam
        this.log.info(`Agent paused - resuming in ${remainingPause} seconds`);
      }
      this.agentState = 'paused';
    }
  }
  /**
   * Pause agent for specified duration (in milliseconds)
   */
  private pauseAgent(durationMs: number = 10000): void {
    this.pauseUntil = Date.now() + durationMs;
    this.agentState = 'paused';
    this.log.info(`🛑 Agent paused for ${durationMs / 1000} seconds due to user activity`);
    
    // Provide audio/visual feedback if possible
    this.provideUserFeedback('pause', `Agent paused for ${durationMs / 1000} seconds`);
  }
  /**
   * Stop the agent immediately
   */
  private stopAgent(): void {
    this.agentState = 'stopped';
    this.log.info('🚫 Agent stopped by user request');
    
    // Provide audio/visual feedback if possible
    this.provideUserFeedback('stop', 'Agent stopped by user request');
  }
  /**
   * CUA-style agent loop - follows OpenAI Computer Use Architecture pattern
   * Continuously takes screenshots, analyzes screen, gets AI decisions, and executes actions
   * Now includes safety controls: ESC to stop, user input detection for auto-pause
   */
  async runAgentLoop(task: string, options: { 
    maxIterations?: number; 
    iterationDelay?: number;
    environment?: 'browser' | 'desktop' | 'windows' | 'mac' | 'ubuntu';
    displayWidth?: number;
    displayHeight?: number;
  } = {}): Promise<OrchestrationState> {
    
    const state: OrchestrationState = {
      goal: task,
      currentIteration: 0,
      maxIterations: options.maxIterations || this.config.maxIterations || 5,
      isComplete: false,
      history: []
    };

    // Initialize agent state
    this.agentState = 'running';
    this.pauseUntil = 0;    this.log.info('🚀 Starting CUA-style agent loop with safety controls', { 
      task, 
      maxIterations: state.maxIterations,
      environment: options.environment || 'desktop',
      safetyControls: {
        escapeToStop: true,
        userInputPause: true,
        pauseDuration: '10 seconds'
      }
    });

    console.log('\n🤖 AGENT MODE ACTIVATED');
    console.log('🔧 Safety Controls:');
    console.log('   • Press ESC to stop agent immediately');
    console.log('   • Any other key input will pause agent for 10 seconds');
    console.log('   • Agent will auto-stop after maximum iterations');
    console.log(`📋 Task: ${task}`);
    console.log(`🎯 Max Iterations: ${state.maxIterations}\n`);

    try {
      // Take initial screenshot to provide context
      let currentScreenshot = await this.coordinateScreenshot();
      let screenshotBase64 = await this.convertScreenshotToBase64(currentScreenshot);
        // Start the continuous loop with safety controls
      while (!state.isComplete && state.currentIteration < state.maxIterations && (this.agentState as string) !== 'stopped') {
          // Check for global shutdown (Ctrl+C)
        if (globalShutdownRequested) {
          this.stopAgent();
          state.error = 'Agent stopped by user (Ctrl+C)';
          break;
        }

        // Check for user escape key
        if (await this.checkForEscapeKey()) {
          this.stopAgent();
          state.error = 'Agent stopped by user (ESC key)';
          break;
        }

        // Check for user input and handle pausing
        await this.checkForUserInput();
          // If paused, wait and continue checking
        if ((this.agentState as string) === 'paused') {
          this.log.info('Agent is paused - waiting for pause period to end...');
          await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second
          continue;
        }        state.currentIteration++;
        this.log.info(`🔄 Agent iteration ${state.currentIteration}/${state.maxIterations} - State: ${this.agentState}`);

        const iterationStart = Date.now();
        const iterationData: any = {
          iteration: state.currentIteration,
          timestamp: iterationStart,
          screenshot: currentScreenshot,
          agentState: this.agentState
        };

        try {          // Step 1: Get AI decision based on current screenshot and task
          this.log.info('🤖 Requesting AI decision...', {
            iteration: state.currentIteration,
            environment: options.environment || 'desktop',
            historyLength: state.history.length
          });
          
          const aiDecision = await this.getAIDecision(task, screenshotBase64, state.history, {
            environment: options.environment || 'desktop',
            displayWidth: options.displayWidth || 1920,
            displayHeight: options.displayHeight || 1080
          });
          
          this.log.info('🧠 AI decision received', {
            iteration: state.currentIteration,
            hasReasoning: !!aiDecision.reasoning,
            isComplete: aiDecision.isComplete,
            actionType: aiDecision.action?.type || 'none',
            actionsCount: aiDecision.actions?.length || 0,
            reasoning: aiDecision.reasoning ? aiDecision.reasoning.substring(0, 200) + '...' : 'No reasoning provided'
          });
          
          // Announce AI reasoning via voice (if available)
          if (aiDecision.reasoning) {
            this.log.debug('🗣️ Announcing AI reasoning via voice', {
              reasoningLength: aiDecision.reasoning.length,
              voiceEnabled: this.voiceController.isEnabled()
            });
            
            try {
              await this.voiceController.speak(aiDecision.reasoning);
              this.log.debug('✅ Voice announcement completed successfully');
            } catch (voiceError) {
              this.log.warn('⚠️ Voice announcement failed', { error: voiceError });
            }
          } else {
            this.log.debug('📝 No AI reasoning to announce');
          }
          
          iterationData.aiDecision = aiDecision;          // Step 2: Check if task is complete
          if (aiDecision.isComplete || aiDecision.action?.type === 'task_complete') {
            state.isComplete = true;
            this.log.info('✅ Task completed by AI decision!', { iteration: state.currentIteration });
            console.log(`\n✅ TASK COMPLETED! (Iteration ${state.currentIteration})\n`);
            break;
          }          // Step 3: Execute the AI-suggested action(s) (if agent is still running)
          if ((aiDecision.action || aiDecision.actions) && (this.agentState as string) === 'running') {
            this.log.info('About to execute AI action(s) - checking for user interruption first...', { 
              actionType: aiDecision.action?.type || 'sequence',
              sequenceLength: aiDecision.actions?.length || 1
            });
              // Double-check for user input before executing potentially disruptive actions
            await this.checkForUserInput();
            if ((this.agentState as string) !== 'running') {
              this.log.info('Action execution skipped due to agent state change', { 
                state: this.agentState 
              });
              continue;
            }

            let actionResult;
            
            // Handle action sequences
            if (aiDecision.actions && Array.isArray(aiDecision.actions)) {
              this.log.info(`Executing action sequence of ${aiDecision.actions.length} actions`);
              const results = [];
              
              for (let i = 0; i < aiDecision.actions.length; i++) {
                const action = aiDecision.actions[i];
                this.log.debug(`Executing action ${i + 1}/${aiDecision.actions.length}`, { actionType: action.type });
                
                const singleResult = await this.executeAIAction(action);                results.push(singleResult);
                  // Human-like delay between actions in sequence (configurable via env)
                if (i < aiDecision.actions.length - 1) {
                  const sequenceDelay = parseInt(process.env.RUNIX_AGENT_SEQUENCE_DELAY || '2000');
                  await new Promise(resolve => setTimeout(resolve, sequenceDelay));
                }
              }
              
              actionResult = {
                success: true,
                sequenceResults: results,
                action: 'sequence'
              };
            } else if (aiDecision.action) {
              // Handle single action
              actionResult = await this.executeAIAction(aiDecision.action);
            }
            
            iterationData.actionResult = actionResult;            
            // Wait for action to take effect (configurable via env)
            const postActionDelay = parseInt(process.env.RUNIX_AGENT_POST_ACTION_DELAY || '3000');
            await new Promise(resolve => setTimeout(resolve, postActionDelay));
            
            // Step 4: Take new screenshot after action
            currentScreenshot = await this.coordinateScreenshot();
            screenshotBase64 = await this.convertScreenshotToBase64(currentScreenshot);} else if (!aiDecision.action && !aiDecision.actions) {
            this.log.warn('No action or actions suggested by AI', { iteration: state.currentIteration });
          }          // Step 5: Wait before next iteration if configured
          if (options.iterationDelay || this.config.iterationDelay) {
            const delay = options.iterationDelay || this.config.iterationDelay || parseInt(process.env.RUNIX_AGENT_ACTION_DELAY || '2000');
            await new Promise(resolve => setTimeout(resolve, delay));
          }

        } catch (iterationError) {
          this.log.error(`Error in agent loop iteration ${state.currentIteration}`, { error: iterationError });
          iterationData.error = iterationError instanceof Error ? iterationError.message : String(iterationError);
          
          // Take screenshot even if there was an error, for debugging
          try {
            currentScreenshot = await this.coordinateScreenshot();
            screenshotBase64 = await this.convertScreenshotToBase64(currentScreenshot);          } catch (screenshotError) {
            this.log.error('Failed to take error recovery screenshot', { error: screenshotError });
          }
        }

        state.history.push(iterationData);
        
        // Log this iteration as a step result for report generation
        const stepResult: StepResult = {
          success: !iterationData.error && (iterationData.actionResult?.success !== false),
          step: `Agent Iteration ${state.currentIteration}: ${task}`,
          data: {
            iteration: state.currentIteration,
            analysis: iterationData.analysis,
            plan: iterationData.plan,
            actions: iterationData.actions,
            actionResult: iterationData.actionResult,
            screenshot: iterationData.screenshot
          },
          error: iterationData.error ? new Error(iterationData.error) : undefined,
          timestamp: new Date(iterationData.timestamp),
          duration: iterationData.duration
        };
        this.resultLogger.addResult(stepResult);
      }// Set completion status and error messages
      if ((this.agentState as string) === 'stopped') {
        state.error = 'Agent stopped by user request';
        this.log.info('Agent loop stopped by user');
      } else if (!state.isComplete) {
        state.error = `Agent task not completed within ${state.maxIterations} iterations`;
        this.log.warn('Agent loop incomplete', { maxIterations: state.maxIterations });
      }

    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      this.log.error('Agent loop failed', { error: state.error });
    } finally {
      // Reset agent state
      this.agentState = 'stopped';
    }    this.log.info('🏁 Agent loop completed', { 
      success: state.isComplete, 
      iterations: state.currentIteration,
      finalState: this.agentState,
      error: state.error 
    });    // Final status display
    console.log('\n' + '='.repeat(50));
    console.log('🏁 AGENT EXECUTION COMPLETE');
    console.log(`✅ Success: ${state.isComplete ? 'YES' : 'NO'}`);
    console.log(`🔄 Iterations: ${state.currentIteration}/${state.maxIterations}`);
    console.log(`📊 Final State: ${this.agentState}`);
    if (state.error) {
      console.log(`❌ Error: ${state.error}`);
    }
    console.log('='.repeat(50) + '\n');    // Generate reports for AI agent execution
    try {
      this.log.info('Generating agent execution reports');
      
      // Ensure reports directory exists
      const fs = await import('fs/promises');
      const reportsDir = 'reports';
      await fs.mkdir(reportsDir, { recursive: true });
      
      // Generate reports in the reports directory
      const reportPath = `${reportsDir}/runix-report.json`;
      this.resultLogger.writeReport(reportPath);
      console.log('📄 Agent execution reports generated in reports/ directory');
    } catch (reportError) {
      this.log.error('Failed to generate agent execution reports', { error: reportError });
      console.log('⚠️  Warning: Failed to generate execution reports');
    }

    // Generate .feature file for replay capability
    try {
      await this.generateFeatureFile(task, state);
      console.log('📝 Replay feature file generated: ai-recorded-workflow.feature');
    } catch (featureError) {
      this.log.error('Failed to generate feature file', { error: featureError });
      console.log('⚠️  Warning: Failed to generate replay feature file');
    }

    return state;
  }

  /**
   * Get AI decision based on current screenshot and task context
   * This follows the OpenAI Computer Use pattern for decision making
   */
  private async getAIDecision(task: string, screenshotBase64: string, history: any[], context: {
    environment: string;
    displayWidth: number;
    displayHeight: number;
  }): Promise<any> {
    
    if (!this.aiDriverInstance) {
      throw new Error('AI Driver instance not available for decision making');
    }

    // Prepare the context for AI decision making
    const decisionContext = {
      task,
      currentScreenshot: screenshotBase64,
      environment: context.environment,
      displaySize: { width: context.displayWidth, height: context.displayHeight },
      iterationHistory: history.slice(-3), // Last 3 iterations for context
      timestamp: new Date().toISOString()
    };

    this.log.debug('Getting AI decision', { task, historyLength: history.length });

    // Call AI driver to make a decision based on screenshot
    const result = await this.aiDriverInstance.callMethod('execute', { 
      action: 'analyzeScreenAndDecide', 
      args: [decisionContext] 
    });

    if (!result || !result.success) {
      throw new Error(`AI decision failed: ${result?.error?.message || 'Unknown error'}`);
    }

    return result.data || result;
  }
  /**
   * Execute an AI-suggested action using the appropriate driver
   */  private async executeAIAction(action: any): Promise<any> {
    this.log.debug('Executing AI-suggested action', { actionType: action.type });

    // Voice announcement: action start
    await this.announceActionStart(action.type, action);

    const registry = DriverRegistry.getInstance();
    
    try {
      switch (action.type) {        case 'click':
          const systemDriver = await registry.startDriver('system-driver');
          const clickResult = await systemDriver.callMethod('execute', {
            action: 'clickAt',
            args: [action.x, action.y]
          });
          // Add action context for feature file generation
          const clickActionResult = {
            ...clickResult,
            driver: 'system-driver',
            action: 'clickAt',
            args: [action.x, action.y],
            originalAction: action
          };
          
          // Voice announcement: action completion
          await this.announceActionComplete(action.type, clickActionResult);
          return clickActionResult;        case 'double_click':
          const systemDriver2 = await registry.startDriver('system-driver');
          const doubleClickResult = await systemDriver2.callMethod('execute', {
            action: 'doubleClickAt',
            args: [action.x, action.y]
          });
          const doubleClickActionResult = {
            ...doubleClickResult,
            driver: 'system-driver',
            action: 'doubleClickAt',
            args: [action.x, action.y],
            originalAction: action
          };
          
          // Voice announcement: action completion
          await this.announceActionComplete(action.type, doubleClickActionResult);
          return doubleClickActionResult;        case 'type':
          const systemDriver3 = await registry.startDriver('system-driver');
          const typeResult = await systemDriver3.callMethod('execute', {
            action: 'typeText',
            args: [action.text]
          });
          const typeActionResult = {
            ...typeResult,
            driver: 'system-driver',
            action: 'typeText',
            args: [action.text],
            originalAction: action
          };
          
          // Voice announcement: action completion
          await this.announceActionComplete(action.type, typeActionResult);
          return typeActionResult;case 'key':
        case 'keypress':
          const systemDriver4 = await registry.startDriver('system-driver');
          const keyResult = await systemDriver4.callMethod('execute', {
            action: 'pressKey',
            args: [action.key || action.keys?.[0]]
          });
          const keyActionResult = {
            ...keyResult,
            driver: 'system-driver',
            action: 'pressKey',
            args: [action.key || action.keys?.[0]],
            originalAction: action
          };
          
          // Voice announcement: action completion
          await this.announceActionComplete(action.type, keyActionResult);
          return keyActionResult;        case 'scroll':
          const systemDriver5 = await registry.startDriver('system-driver');
          const scrollResult = await systemDriver5.callMethod('execute', {
            action: 'scroll',
            args: [action.x, action.y, action.scrollX || 0, action.scrollY || action.scroll_y || -3]
          });
          const scrollActionResult = {
            ...scrollResult,
            driver: 'system-driver',
            action: 'scroll',
            args: [action.x, action.y, action.scrollX || 0, action.scrollY || action.scroll_y || -3],
            originalAction: action
          };
          
          // Voice announcement: action completion
          await this.announceActionComplete(action.type, scrollActionResult);
          return scrollActionResult;        case 'wait':
          this.log.debug('Waiting as requested by AI', { duration: action.duration || 2000 });
          await new Promise(resolve => setTimeout(resolve, action.duration || 2000));
          const waitResult = { 
            success: true, 
            action: 'wait',
            driver: 'built-in',
            args: [action.duration || 2000],
            originalAction: action
          };
          
          // Voice announcement: action completion
          await this.announceActionComplete(action.type, waitResult);
          return waitResult;        case 'screenshot':
          // Screenshot will be taken automatically in the main loop
          const screenshotResult = { 
            success: true, 
            action: 'screenshot',
            driver: 'built-in',
            args: [],
            originalAction: action
          };
          
          // Voice announcement: action completion
          await this.announceActionComplete(action.type, screenshotResult);
          return screenshotResult;case 'task_complete':
          this.log.info('AI indicated task is complete');
          const completeResult = { 
            success: true, 
            action: 'task_complete', 
            isComplete: true,
            driver: 'built-in',
            args: [],
            originalAction: action
          };
          
          // Voice announcement: action completion
          await this.announceActionComplete(action.type, completeResult);
          return completeResult;default:
          this.log.warn('Unknown action type from AI', { actionType: action.type });
          const unknownResult = { 
            success: false, 
            error: `Unknown action type: ${action.type}`,
            driver: 'unknown',
            action: action.type,
            args: [],
            originalAction: action
          };
          
          // Voice announcement: action completion (error case)
          await this.announceActionComplete(action.type, unknownResult);
          return unknownResult;
      }
    } catch (error) {
      this.log.error('Failed to execute AI action', { action, error });
      const errorResult = { 
        success: false, 
        error: error instanceof Error ? error.message : String(error),
        driver: 'system-driver',
        action: action.type,
        args: [],
        originalAction: action
      };
      
      // Voice announcement: action completion (error case)
      await this.announceActionComplete(action.type, errorResult);
      return errorResult;
    }
  }

  /**
   * Convert screenshot file to base64 for AI processing
   */
  private async convertScreenshotToBase64(screenshotPath: string): Promise<string> {
    try {
      const fs = await import('fs/promises');
      const imageBuffer = await fs.readFile(screenshotPath);
      return imageBuffer.toString('base64');
    } catch (error) {
      this.log.error('Failed to convert screenshot to base64', { screenshotPath, error });
      throw error;
    }
  }

  /**
   * Provide user feedback for agent state changes
   */
  private provideUserFeedback(type: 'pause' | 'stop' | 'resume', message: string): void {
    try {
      // Enhanced console output with emojis and formatting
      const timestamp = new Date().toLocaleTimeString();
      const formattedMessage = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
      
      if (type === 'stop') {
        console.log(`\n🚫 ${formattedMessage}\n`);
      } else if (type === 'pause') {
        console.log(`\n🛑 ${formattedMessage}\n`);
      } else if (type === 'resume') {
        console.log(`\n▶️  ${formattedMessage}\n`);
      }
        // Could potentially add system notifications or beeps here
      // For Windows: this.playSystemSound(type);
      
    } catch (error) {
      this.log.debug('Error providing user feedback', { error });
    }
  }

  /**
   * Generate a .feature file from the agent execution for replay capability
   */
  private async generateFeatureFile(task: string, state: OrchestrationState): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Create templates directory if it doesn't exist
      const templatesDir = 'templates';
      await fs.mkdir(templatesDir, { recursive: true });
      
      // Generate sanitized filename from task
      const sanitizedTask = task.replace(/[^a-z0-9]/gi, '-').toLowerCase();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `ai-recorded-${sanitizedTask}-${timestamp}.feature`;
      const filePath = path.join(templatesDir, filename);
      
      // Generate feature content
      const featureContent = this.generateFeatureContent(task, state);
      
      // Write the feature file
      await fs.writeFile(filePath, featureContent, 'utf8');
      
      // Also create a generic "latest" version for easy access
      const latestPath = path.join(templatesDir, 'ai-recorded-workflow.feature');
      await fs.writeFile(latestPath, featureContent, 'utf8');
      
      this.log.info('Generated replay feature file', { 
        filePath, 
        latestPath, 
        task, 
        iterations: state.currentIteration 
      });
      
    } catch (error) {
      this.log.error('Failed to generate feature file', { error, task });
      throw error;
    }
  }

  /**
   * Generate Gherkin feature content from agent execution history
   */
  private generateFeatureContent(task: string, state: OrchestrationState): string {
    const timestamp = new Date().toISOString();
    
    let featureContent = `# Auto-generated by Runix AI Agent
# Task: ${task}
# Generated: ${timestamp}
# Success: ${state.isComplete ? 'YES' : 'NO'}
# Iterations: ${state.currentIteration}/${state.maxIterations}

Feature: AI Agent Recorded Workflow - ${task}
  As an automation engineer
  I want to replay the AI agent's recorded actions
  So that I can reproduce the same workflow consistently

  @ai-recorded @replay
  Scenario: Replay AI Agent Task - ${task}
    # Original AI task: ${task}
    # Execution completed: ${state.isComplete ? 'Successfully' : 'Incomplete'}
    
`;

    // Add steps based on the agent's actions
    let stepNumber = 1;
    
    for (const iteration of state.history) {
      featureContent += `    # === Iteration ${iteration.iteration} ===\n`;
      
      // Add screenshot step if available
      if (iteration.screenshot) {
        featureContent += `    When I take a screenshot "iteration-${iteration.iteration}-start.png"\n`;
      }
      
      // Convert AI actions to Gherkin steps
      if (iteration.actionResult?.sequenceResults) {
        // Handle action sequences
        for (const actionResult of iteration.actionResult.sequenceResults) {
          const step = this.convertActionToGherkinStep(actionResult.data, stepNumber++);
          if (step) {
            featureContent += `    ${step}\n`;
          }
        }
      } else if (iteration.actionResult) {
        // Handle single actions
        const step = this.convertActionToGherkinStep(iteration.actionResult, stepNumber++);
        if (step) {
          featureContent += `    ${step}\n`;
        }
      }
      
      featureContent += `    And I wait for 2 seconds  # Post-action delay\n`;
      
      if (iteration.screenshot) {
        featureContent += `    And I take a screenshot "iteration-${iteration.iteration}-end.png"\n`;
      }
      
      featureContent += '\n';
    }
    
    // Add verification steps
    featureContent += `    # === Verification ===\n`;
    featureContent += `    Then the workflow should be completed\n`;
    
    if (state.isComplete) {
      featureContent += `    And the task "${task}" should be successful\n`;
    } else {
      featureContent += `    # Note: Original AI task was not completed within ${state.maxIterations} iterations\n`;
      featureContent += `    # Manual verification may be required\n`;
    }
    
    return featureContent;
  }  /**
   * Convert an AI action result to a Gherkin step
   */
  private convertActionToGherkinStep(actionData: any, stepNumber: number): string | null {
    if (!actionData) return null;
    
    try {
      // Handle system-driver actions
      if (actionData.driver === 'system-driver' || actionData.action) {
        const action = actionData.action || actionData.type;
        const args = actionData.args || actionData.arguments || [];

        switch (action) {
          // File operations
          case 'createFile':
            return `And I create file "${args[0]}" with content "${args[1] || ''}"`;
          
          case 'readFile':
            return `And I read file "${args[0]}"`;
          
          case 'writeFile':
            return `And I write to file "${args[0]}" with content "${args[1]}"`;
          
          case 'deleteFile':
            return `And I delete file "${args[0]}"`;

          // Command and process operations
          case 'executeCommand':
            return `And I execute command "${args[0]}"`;
          
          case 'startProcess':
            const processArgs = args[1] ? ` with arguments "${args[1].join(' ')}"` : '';
            return `And I start process "${args[0]}"${processArgs}`;
          
          case 'killProcess':
            const signal = args[1] ? ` with signal "${args[1]}"` : '';
            return `And I kill process "${args[0]}"${signal}`;
          
          case 'listProcesses':
            return `And I list all processes`;

          // UI automation actions
          case 'takeScreenshot':
            const filename = args[0] || `step-${stepNumber}.png`;
            return `And I take a screenshot "${filename}"`;
          
          case 'clickAt':
            return `And I click at coordinates (${args[0]}, ${args[1]})`;
          
          case 'doubleClickAt':
            return `And I double-click at coordinates (${args[0]}, ${args[1]})`;
          
          case 'rightClickAt':
            return `And I right-click at coordinates (${args[0]}, ${args[1]})`;
          
          case 'typeText':
            return `And I type text "${args[0]}"`;
          
          case 'pressKey':
            if (args[1] && Array.isArray(args[1]) && args[1].length > 0) {
              return `And I press key combination "${args[1].join('+')}+${args[0]}"`;
            }
            return `And I press key "${args[0]}"`;
          
          case 'moveMouse':
            return `And I move mouse to coordinates (${args[0]}, ${args[1]})`;
          
          case 'drag':
            return `And I drag from coordinates (${args[0]}, ${args[1]}) to (${args[2]}, ${args[3]})`;
          
          case 'scroll':
            return `And I scroll at coordinates (${args[0]}, ${args[1]}) by (${args[2] || 0}, ${args[3] || 0})`;
          
          case 'getMousePosition':
            return `And I get mouse position`;
          
          case 'getScreenSize':
            return `And I get screen size`;
          
          case 'captureRegion':
            return `And I capture screen region from (${args[0]}, ${args[1]}) to (${args[2]}, ${args[3]})`;
          
          case 'findColorAt':
            return `And I find color at coordinates (${args[0]}, ${args[1]})`;
          
          case 'waitForColor':
            return `And I wait for color "${args[0]}" at coordinates (${args[1]}, ${args[2]})`;

          // Verification actions
          case 'verifyFileContent':
            return `And I verify file "${args[0]}" contains "${args[1]}"`;
          
          case 'verifyFileExistsContains':
            return `And I verify file "${args[0]}" exists and contains "${args[1]}"`;
          
          case 'verifyCommandOutput':
            return `And I verify command "${args[0]}" output contains "${args[1]}"`;
          
          case 'verifyProcessStarted':
            return `And I verify process "${args[0]}" is started`;
          
          case 'verifyProcessManageable':
            return `And I verify process "${args[0]}" is manageable`;
          
          case 'attemptRestrictedAccess':
            return `And I attempt restricted access to "${args[0]}"`;
          
          case 'verifySecurityRestrictions':
            return `And I verify security restrictions for "${args[0]}"`;

          // Batch operations
          case 'createMultipleFiles':
            return `And I create multiple files: ${JSON.stringify(args[0])}`;
          
          case 'readAllFiles':
            return `And I read all files: ${JSON.stringify(args[0])}`;
          
          case 'verifyEachFileContent':
            return `And I verify each file content: ${JSON.stringify(args[0])}`;
          
          case 'cleanUpFiles':
            return `And I clean up files: ${JSON.stringify(args[0])}`;

          // Key checking
          case 'checkKeyPressed':
            return `And I check if key "${args[0]}" is pressed`;
          
          case 'checkAnyKeyPressed':
            return `And I check if any key is pressed`;

          // Generic introspection
          case 'introspect':
            return `And I introspect system driver capabilities`;

          default:
            // Handle legacy action formats from vision-driver or ai-driver
            return this.handleLegacyActionFormats(actionData, stepNumber);
        }
      }

      // Handle built-in actions
      if (actionData.driver === 'built-in') {
        switch (actionData.action) {
          case 'wait':
            return `And I wait for ${actionData.args[0]} milliseconds`;
          
          case 'screenshot':
            return `And I take a screenshot "step-${stepNumber}.png"`;
          
          case 'task_complete':
            return `And I complete the task`;
          
          default:
            return `# Built-in action: ${actionData.action}`;
        }
      }

      // Handle legacy action formats from vision-driver or ai-driver
      return this.handleLegacyActionFormats(actionData, stepNumber);

    } catch (error) {
      this.log.debug('Error converting action to Gherkin step', { error, actionData });
      return `# Error converting action: ${JSON.stringify(actionData)}`;
    }
  }

  /**
   * Handle legacy action formats from vision-driver or ai-driver
   */
  private handleLegacyActionFormats(actionData: any, stepNumber: number): string | null {
    try {
      switch (actionData.action || actionData.type) {
        case 'typed':
          return `And I type text "${actionData.text}"`;
        
        case 'key-pressed':
          if (actionData.modifiers && actionData.modifiers.length > 0) {
            return `And I press key combination "${actionData.modifiers.join('+')}+${actionData.key}"`;
          }
          return `And I press key "${actionData.key}"`;
        
        case 'clicked':
          return `And I click at coordinates (${actionData.x}, ${actionData.y})`;
        
        case 'double-clicked':
          return `And I double-click at coordinates (${actionData.x}, ${actionData.y})`;
        
        case 'scrolled':
          return `And I scroll at coordinates (${actionData.x}, ${actionData.y}) by (${actionData.scrollX || 0}, ${actionData.scrollY || 0})`;
        
        case 'screenshot':
          return `And I take a screenshot "step-${stepNumber}.png"`;
        
        default:
          // Generic fallback for unknown actions
          if (actionData.text) {
            return `And I type text "${actionData.text}"`;
          } else if (actionData.key) {
            return `And I press key "${actionData.key}"`;
          } else if (actionData.x !== undefined && actionData.y !== undefined) {
            return `And I click at coordinates (${actionData.x}, ${actionData.y})`;
          }
          return `# Unknown action: ${JSON.stringify(actionData)}`;
      }
    } catch (error) {
      this.log.debug('Error handling legacy action format', { error, actionData });
      return `# Error handling legacy action: ${JSON.stringify(actionData)}`;
    }
  }  /**
   * Voice announcement for action start
   * NASA Rule: Single responsibility - focused voice announcements
   */  /**
   * Voice announcement for action start
   * NASA Rule: Single responsibility - focused voice announcements
   */
  private async announceActionStart(actionType: string, action: any): Promise<void> {
    this.log.debug('announceActionStart called', { 
      actionType, 
      voiceEnabled: this.voiceController.isEnabled() 
    });
    
    if (!this.voiceController.isEnabled()) {
      this.log.debug('Voice controller disabled, skipping announcement');
      return;
    }

    // Simple, direct voice messages - easier to debug and modify
    const actionDescription = this.getActionDescription(actionType, action);
    const message = `${actionDescription}`;
    
    const event: VoiceEvent = {
      type: 'action_start',
      message,
      data: { actionType, action }
    };

    this.log.debug('Announcing action start', { message });
    await this.voiceController.announceEvent(event);
  }/**
   * Voice announcement for action completion
   * NASA Rule: Single responsibility - focused voice announcements
   */  /**
   * Voice announcement for action completion
   * NASA Rule: Single responsibility - focused voice announcements
   */
  private async announceActionComplete(actionType: string, actionResult: any): Promise<void> {
    this.log.debug('announceActionComplete called', { 
      actionType, 
      voiceEnabled: this.voiceController.isEnabled() 
    });
    
    if (!this.voiceController.isEnabled()) {
      this.log.debug('Voice controller disabled, skipping completion announcement');
      return;
    }

    // Simple, direct voice messages - easier to debug and modify
    const actionDescription = this.getActionDescription(actionType, actionResult.originalAction || actionResult);
    const message = actionResult.success 
      ? `Successfully completed ${actionDescription}`
      : `Failed to ${actionDescription}`;

    const event: VoiceEvent = {
      type: 'action_complete',
      message,
      data: actionResult
    };

    this.log.debug('Announcing action complete', { message });
    await this.voiceController.announceEvent(event);
  }
  /**
   * Format action for voice announcement with AI reasoning
   * NASA Rule: Keep functions focused and simple
   */  private formatActionForVoiceWithReasoning(actionType: string, action: any, phase: 'start' | 'complete'): string {
    // Generate reasoning and descriptive message for each action type
    const reasoning = this.generateActionReasoning(actionType, action);
    const actionDescription = this.getActionDescription(actionType, action);
    
    let message: string;
    if (phase === 'start') {
      message = `${reasoning}. I will ${actionDescription}`;
    } else {
      message = `Successfully ${actionDescription}`;
    }
    
    this.log.debug('Formatted voice message', {
      actionType,
      phase,
      reasoning: reasoning.substring(0, 50) + '...',
      actionDescription,
      fullMessage: message,
      messageLength: message.length
    });
    
    return message;
  }

  /**
   * Generate AI reasoning for why an action is being taken
   * NASA Rule: Provide clear explanations for system actions
   */
  private generateActionReasoning(actionType: string, action: any): string {
    switch (actionType) {
      case 'typeText':
      case 'type':
        const text = action.args?.[0] || action.text || '';
        const shortText = text.length > 30 ? text.substring(0, 30) + '...' : text;
        return `To input the required text "${shortText}"`;
        case 'pressKey':
      case 'key':
        // Handle different action structure formats
        const key = action.args?.[0] || action.key || action.data?.key || '';
        const modifiers = action.args?.[1] || action.modifiers || action.data?.modifiers || [];
        
        if (modifiers.length > 0) {
          return `To execute the keyboard shortcut ${modifiers.join('+')}+${key}`;
        }
        switch (key.toLowerCase()) {
          case 'enter':
          case 'return':
            return 'To confirm the input or proceed to the next step';
          case 'tab':
            return 'To navigate to the next element';
          case 'escape':
            return 'To cancel the current operation';
          case 'backspace':
            return 'To delete the previous character';
          case 'delete':
            return 'To delete the selected content';
          case 'space':
            return 'To insert a space character';
          case 'win':
          case 'windows':
          case 'meta':
            return 'To open the Start menu or system launcher';
          case 'printscreen':
            return 'To capture a screenshot of the desktop';
          default:
            return `To perform the ${key} key operation`;
        }
      
      case 'click':
        const x = action.args?.[0] || action.x || 0;
        const y = action.args?.[1] || action.y || 0;
        // Try to get element description if available
        const element = action.element || action.target;
        if (element && element.description) {
          return `To interact with ${element.description}`;
        }
        return `To select or activate the element at coordinates ${x}, ${y}`;
      
      case 'doubleClick':
        return 'To open or activate the selected item';
      
      case 'scroll':
        const direction = action.direction || 'down';
        const amount = action.amount || action.args?.[0] || 'some';
        return `To scroll ${direction} by ${amount} units to view more content`;
      
      case 'takeScreenshot':
        return 'To capture the current screen state for analysis';
      
      case 'wait':
        const duration = action.args?.[0] || action.duration || 1000;
        const seconds = Math.round(duration / 1000 * 10) / 10;
        return `To wait ${seconds} seconds for the interface to respond`;
      
      case 'task_complete':
        return 'The goal has been achieved successfully';
      
      default:
        return `To perform the ${actionType.replace(/([A-Z])/g, ' $1').toLowerCase().trim()} operation`;
    }
  }
  /**
   * Get descriptive action text for voice announcement  
   * NASA Rule: Provide clear action descriptions
   */
  private getActionDescription(actionType: string, action: any): string {
    switch (actionType) {
      case 'typeText':
      case 'type':
        const text = action.args?.[0] || action.text || '';
        const shortText = text.length > 20 ? text.substring(0, 20) + '...' : text;
        return `typing "${shortText}"`;
        
      case 'pressKey':
      case 'key':
        // Handle different action structure formats
        let key = action.args?.[0] || action.key || action.data?.key || '';
        const modifiers = action.args?.[1] || action.modifiers || action.data?.modifiers || [];
        
        this.log.debug('Processing pressKey action for voice', {
          actionType,
          key,
          modifiers,
          actionStructure: Object.keys(action || {})
        });
        
        if (modifiers.length > 0) {
          return `pressing keyboard shortcut ${modifiers.join('+')}+${key}`;
        }
        
        return `pressing key ${key}`;
      
      case 'click':
        const x = action.args?.[0] || action.x || 0;
        const y = action.args?.[1] || action.y || 0;
        const element = action.element || action.target;
        if (element && element.description) {
          return `clicking on ${element.description}`;
        }
        return `clicking at position ${x}, ${y}`;
      
      case 'doubleClick':
        return 'double-clicking the target';
      
      case 'scroll':
        const direction = action.direction || 'down';
        return `scrolling ${direction}`;
      
      case 'takeScreenshot':
        return 'taking a screenshot';
      
      case 'wait':
        const duration = action.args?.[0] || action.duration || 1000;
        const seconds = Math.round(duration / 1000 * 10) / 10;
        return `waiting for ${seconds} seconds`;
      
      case 'task_complete':
        return 'marking the task as complete';
      
      default:
        return actionType.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
    }
  }
  /**
   * Voice announcement for goal setting
   * NASA Rule: Provide clear status updates
   */
  private async announceGoal(goal: string): Promise<void> {
    if (!this.voiceController.isEnabled()) {
      return;
    }

    const message = `Starting autonomous task execution. My goal is to ${goal}. I will analyze the screen, plan actions, and execute them step by step until the goal is achieved.`;

    const event: VoiceEvent = {
      type: 'goal_set',
      message,
      data: { goal }
    };

    await this.voiceController.announceEvent(event);
  }

  /**
   * Voice announcement for thinking/analysis phase
   * NASA Rule: Keep user informed of system state
   */
  private async announceThinking(phase: string): Promise<void> {
    if (!this.voiceController.isEnabled()) {
      return;
    }

    const event: VoiceEvent = {
      type: 'thinking',
      message: phase,
      data: { phase }
    };

    await this.voiceController.announceEvent(event);
  }

  /**
   * Voice announcement for errors
   * NASA Rule: Provide clear error reporting
   */
  private async announceError(error: string): Promise<void> {
    if (!this.voiceController.isEnabled()) {
      return;
    }

    const event: VoiceEvent = {
      type: 'error',
      message: error,
      data: { error }
    };

    await this.voiceController.announceEvent(event);
  }

  /**
   * Test method to validate voice announcements and logging
   * NASA Rule: Include comprehensive testing capabilities
   */
  async testVoiceAndLogging(): Promise<void> {
    this.log.info('🧪 Starting voice and logging test...');
    
    // Test environment variable loading

    this.log.info('📋 Environment variables:', {
      voiceEnabled: process.env.RUNIX_VOICE_ENABLED,
      voiceRate: process.env.RUNIX_VOICE_RATE,
      voicePitch: process.env.RUNIX_VOICE_PITCH,
      voiceVolume: process.env.RUNIX_VOICE_VOLUME,
      voiceLanguage: process.env.RUNIX_VOICE_LANGUAGE
    });
    
    // Test voice controller configuration
    this.log.info('🔊 Voice controller status:', {
      enabled: this.voiceController.isEnabled(),
      platform: process.platform
    });
    
    // Test goal announcement
    await this.announceGoal('Testing voice announcements and logging functionality');
    
    // Test thinking announcement
    await this.announceThinking('analyzing');
    
    // Test sample AI reasoning
    const sampleReasoning = "I can see a webpage is loaded. I need to take a screenshot first to analyze the current state, then determine what actions are needed to complete the task.";
    this.log.info('🧠 Testing AI reasoning announcement', {
      reasoningLength: sampleReasoning.length
    });
    
    try {
      await this.voiceController.speak(sampleReasoning);
      this.log.info('✅ AI reasoning voice test completed successfully');
    } catch (voiceError) {
      this.log.warn('⚠️ AI reasoning voice test failed', { error: voiceError });
    }
    
    // Test action announcements
    const testAction = {
      type: 'click',
      coordinates: { x: 100, y: 200 },
      target: 'test button'
    };
    
    await this.announceActionStart('click', testAction);
    
    // Simulate action completion
    const testResult = {
      success: true,
      duration: 1500,
      message: 'Click action completed successfully'
    };
    
    await this.announceActionComplete('click', testResult);
    
    this.log.info('✅ Voice and logging test completed');
  }
}