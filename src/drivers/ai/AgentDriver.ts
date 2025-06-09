import { BaseDriver } from '../base.driver';
import { DriverCapabilities, DriverConfig, StepExecutionResult } from '../driver.interface';
import { DriverProcessManager } from '../management/DriverProcessManager';
import { DriverRegistry } from '../driverRegistry';
import * as net from 'net';
import { Logger } from '../../utils/logger';

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
    timestamp: number;
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
  constructor(config: AgentDriverConfig = {}) {
    super();
    this.config = config;
    this.agentState = 'stopped'; // Initialize agent state
    // Initialize logger in constructor
    this.log = Logger.getInstance().createChildLogger({ component: 'AgentDriver' }); 
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
   */
  async orchestrate(goal: string, options: { maxIterations?: number; iterationDelay?: number } = {}): Promise<OrchestrationState> {
    const state: OrchestrationState = {
      goal,
      currentIteration: 0,
      maxIterations: options.maxIterations || this.config.maxIterations || 10,
      isComplete: false,
      history: []
    };

    this.log.info('Starting orchestration', { goal, maxIterations: state.maxIterations });

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
          const screenshotResult = await this.coordinateScreenshot();
          iterationData.screenshot = screenshotResult;

          // Step 2: Analyze screen
          const analysisResult = await this.coordinateScreenAnalysis(screenshotResult);
          iterationData.analysis = analysisResult;

          // Step 3: Make decisions and plan actions
          const planResult = await this.coordinateDecisionMaking(goal, analysisResult, state.history);
          iterationData.plan = planResult;

          // Check if goal is achieved
          if (planResult.goalAchieved) {
            state.isComplete = true;
            this.log.info('Goal achieved!', { iteration: state.currentIteration });
            break;
          }

          // Step 4: Execute actions
          const executionResults = await this.coordinateActionExecution(planResult.actions);
          iterationData.actions = planResult.actions;
          iterationData.results = executionResults;

          // Step 5: Wait before next iteration if configured
          if (options.iterationDelay || this.config.iterationDelay) {
            const delay = options.iterationDelay || this.config.iterationDelay || 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
          }

        } catch (iterationError) {
          this.log.error(`Error in iteration ${state.currentIteration}`, { error: iterationError });
          iterationData.error = iterationError instanceof Error ? iterationError.message : String(iterationError);
        }

        state.history.push(iterationData);
      }

      if (!state.isComplete) {
        state.error = `Task not completed within ${state.maxIterations} iterations`;
        this.log.warn('Orchestration incomplete', { maxIterations: state.maxIterations });
      }

    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      this.log.error('Orchestration failed', { error: state.error });
    }

    this.log.info('Orchestration completed', { 
      success: state.isComplete, 
      iterations: state.currentIteration,
      error: state.error 
    });

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
   */
  private async coordinateActionExecution(actions: any[]): Promise<any[]> {
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
    
    for (const action of actions) {
      try {
        this.log.debug('Executing action', { action: action.type || action.action });
        
        const result = await systemDriver.callMethod('execute', { 
          action: action.type || action.action, 
          args: action.args || [action] 
        });
        
        results.push({
          action,
          success: result?.success || false,
          result: result?.data,
          error: result?.error
        });

        // Small delay between actions for stability
        await new Promise(resolve => setTimeout(resolve, 100));
        
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
  }
  async shutdown(): Promise<void> {
    this.log.info('Agent Driver shutting down');
    
    // Stop agent if running
    this.agentState = 'stopped';
    
    // Clean up keyboard monitoring
    await this.cleanupKeyboardMonitoring();
    
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
      maxIterations: options.maxIterations || this.config.maxIterations || 20,
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

        try {
          // Step 1: Get AI decision based on current screenshot and task
          const aiDecision = await this.getAIDecision(task, screenshotBase64, state.history, {
            environment: options.environment || 'desktop',
            displayWidth: options.displayWidth || 1920,
            displayHeight: options.displayHeight || 1080
          });
          
          iterationData.aiDecision = aiDecision;          // Step 2: Check if task is complete
          if (aiDecision.isComplete || aiDecision.action?.type === 'task_complete') {
            state.isComplete = true;
            this.log.info('✅ Task completed by AI decision!', { iteration: state.currentIteration });
            console.log(`\n✅ TASK COMPLETED! (Iteration ${state.currentIteration})\n`);
            break;
          }// Step 3: Execute the AI-suggested action (if agent is still running)
          if (aiDecision.action && (this.agentState as string) === 'running') {
            this.log.info('About to execute AI action - checking for user interruption first...', { 
              actionType: aiDecision.action.type 
            });
              // Double-check for user input before executing potentially disruptive actions
            await this.checkForUserInput();
            if ((this.agentState as string) !== 'running') {
              this.log.info('Action execution skipped due to agent state change', { 
                state: this.agentState 
              });
              continue;
            }

            const actionResult = await this.executeAIAction(aiDecision.action);
            iterationData.actionResult = actionResult;
            
            // Wait for action to take effect
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Step 4: Take new screenshot after action
            currentScreenshot = await this.coordinateScreenshot();
            screenshotBase64 = await this.convertScreenshotToBase64(currentScreenshot);
          } else if (!aiDecision.action) {
            this.log.warn('No action suggested by AI', { iteration: state.currentIteration });
          }

          // Step 5: Wait before next iteration if configured
          if (options.iterationDelay || this.config.iterationDelay) {
            const delay = options.iterationDelay || this.config.iterationDelay || 2000;
            await new Promise(resolve => setTimeout(resolve, delay));
          }

        } catch (iterationError) {
          this.log.error(`Error in agent loop iteration ${state.currentIteration}`, { error: iterationError });
          iterationData.error = iterationError instanceof Error ? iterationError.message : String(iterationError);
          
          // Take screenshot even if there was an error, for debugging
          try {
            currentScreenshot = await this.coordinateScreenshot();
            screenshotBase64 = await this.convertScreenshotToBase64(currentScreenshot);
          } catch (screenshotError) {
            this.log.error('Failed to take error recovery screenshot', { error: screenshotError });
          }
        }

        state.history.push(iterationData);
      }      // Set completion status and error messages
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
    });

    // Final status display
    console.log('\n' + '='.repeat(50));
    console.log('🏁 AGENT EXECUTION COMPLETE');
    console.log(`✅ Success: ${state.isComplete ? 'YES' : 'NO'}`);
    console.log(`🔄 Iterations: ${state.currentIteration}/${state.maxIterations}`);
    console.log(`📊 Final State: ${this.agentState}`);
    if (state.error) {
      console.log(`❌ Error: ${state.error}`);
    }
    console.log('='.repeat(50) + '\n');

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
   */
  private async executeAIAction(action: any): Promise<any> {
    this.log.debug('Executing AI-suggested action', { actionType: action.type });

    const registry = DriverRegistry.getInstance();
    
    try {
      switch (action.type) {
        case 'click':
          const systemDriver = await registry.startDriver('system-driver');
          return await systemDriver.callMethod('execute', {
            action: 'clickAt',
            args: [action.x, action.y]
          });

        case 'double_click':
          const systemDriver2 = await registry.startDriver('system-driver');
          return await systemDriver2.callMethod('execute', {
            action: 'doubleClickAt',
            args: [action.x, action.y]
          });

        case 'type':
          const systemDriver3 = await registry.startDriver('system-driver');
          return await systemDriver3.callMethod('execute', {
            action: 'typeText',
            args: [action.text]
          });

        case 'key':
        case 'keypress':
          const systemDriver4 = await registry.startDriver('system-driver');
          return await systemDriver4.callMethod('execute', {
            action: 'pressKey',
            args: [action.key || action.keys?.[0]]
          });

        case 'scroll':
          const systemDriver5 = await registry.startDriver('system-driver');
          return await systemDriver5.callMethod('execute', {
            action: 'scroll',
            args: [action.x, action.y, action.scrollX || 0, action.scrollY || action.scroll_y || -3]
          });

        case 'wait':
          this.log.debug('Waiting as requested by AI', { duration: action.duration || 2000 });
          await new Promise(resolve => setTimeout(resolve, action.duration || 2000));
          return { success: true, action: 'wait' };

        case 'screenshot':
          // Screenshot will be taken automatically in the main loop
          return { success: true, action: 'screenshot' };

        case 'task_complete':
          this.log.info('AI indicated task is complete');
          return { success: true, action: 'task_complete', isComplete: true };

        default:
          this.log.warn('Unknown action type from AI', { actionType: action.type });
          return { success: false, error: `Unknown action type: ${action.type}` };
      }
    } catch (error) {
      this.log.error('Failed to execute AI action', { action, error });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
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
}
