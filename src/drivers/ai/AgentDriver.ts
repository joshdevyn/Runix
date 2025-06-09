import { BaseDriver } from '../base.driver';
import { DriverCapabilities, DriverConfig, StepExecutionResult } from '../driver.interface';
import { DriverProcessManager } from '../management/DriverProcessManager';
import { DriverRegistry } from '../driverRegistry';
import * as net from 'net';
import { Logger } from '../../utils/logger'; // Added Logger import

export interface AgentDriverConfig extends DriverConfig {
  outputDir?: string;
  aiDriverServicePort?: number;
  aiDriverServiceHost?: string;
  connectionTimeout?: number;
  requestTimeout?: number;
}

/**
 * AgentDriver - Simple delegation layer to the AI Driver service
 * This turns Runix into an agent-driven automation system by delegating
 * all AI operations to the standalone ai-driver service using the DriverRegistry and its transport layer.
 * 
 * Uses ephemeral ports allocated by the engine's DriverProcessManager
 * to avoid conflicts with other driver instances.
 */
export class AgentDriver extends BaseDriver {
  private config: AgentDriverConfig = {};
  private servicePort: number | null = null; // Port of the ai-driver service
  private serviceHost: string = '127.0.0.1'; // Host of the ai-driver service
  private connectionTimeout: number = 5000;
  private requestTimeout: number = 30000; // General request timeout
  private aiDriverInstance: any = null; // Stores the WebSocketDriverInstance from the registry

  constructor(config: AgentDriverConfig = {}) {
    super();
    this.config = config;
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
  }
  getCapabilities(): DriverCapabilities {
    return {
      name: 'AgentDriver',
      version: '1.0.0',
      description: 'Agent-driven automation system that delegates to AI Driver service over WebSocket using DriverRegistry',
      supportedActions: [
        'agent', 'ask', 'analyze', 'plan', 'execute',
        'generateFeature', 'setMode', 'startSession', 
        'analyzeScreenAndPlan', 'executeNextAction', 'loadFeatureFile', 'continueSession'
      ],
      author: 'Runix Team'
    };
  }

  async execute(action: string, args: any[]): Promise<StepExecutionResult> {
    this.validateInitialized();
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

  async shutdown(): Promise<void> {
    this.log.info('Agent Driver shutting down');
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
}
