import { EventEmitter } from 'events';
import {
  AutomationDriver,
  DriverCapabilities,
  DriverConfig,
  DriverInstance,
  StepExecutionResult
} from './driver.interface';
import { DriverMetadata } from './driverRegistry';
import { Logger } from '../utils/logger';
import { DriverError } from '../utils/errors';

/**
 * Base implementation of a driver instance
 */
export class BaseDriverInstance extends EventEmitter implements DriverInstance {
  protected driver?: AutomationDriver;
  protected isRunning: boolean = false;
  protected config: DriverConfig = {};
  protected metadata?: DriverMetadata;
  
  constructor(driverOrMetadata: AutomationDriver | DriverMetadata) {
    super();
    if ('execute' in driverOrMetadata) {
      // It's an AutomationDriver instance
      this.driver = driverOrMetadata;
    } else {
      // It's metadata, we'll create a proxy driver later
      this.metadata = driverOrMetadata;
    }
  }
  
  async start(): Promise<DriverCapabilities> {
    this.isRunning = true;
    if (this.driver) {
      return this.driver.getCapabilities();
    } else {
      // Return capabilities from metadata
      return {
        name: this.metadata?.name || 'Unknown',
        version: this.metadata?.version || '1.0.0',
        description: 'Driver instance created from metadata',
        author: 'Unknown',
        supportedActions: []
      };
    }
  }
  
  async initialize(config: DriverConfig): Promise<void> {
    this.config = config;
    if (this.driver) {
      await this.driver.initialize(config);
    }
  }
  
  async execute(action: string, args: any[]): Promise<StepExecutionResult> {
    if (!this.isRunning) {
      return {
        success: false,
        error: { message: 'Driver not started' }
      };
    }
    
    if (!this.driver) {
      return {
        success: false,
        error: { message: 'Driver not properly initialized' }
      };
    }
    
    try {
      return await this.driver.execute(action, args);
    } catch (err) {
      return {
        success: false,
        error: { 
          message: err instanceof Error ? err.message : String(err) 
        }
      };
    }
  }
  
  async executeStep(action: string, args: any[]): Promise<StepExecutionResult> {
    return this.execute(action, args);
  }
  
  async introspect(type?: string): Promise<any> {
    if (!this.isRunning) {
      throw new Error('Driver not started');
    }
    
    if (!this.driver) {
      throw new Error('Driver not properly initialized');
    }
    
    // Try to call introspect on the driver if it supports it
    if (typeof (this.driver as any).introspect === 'function') {
      return await (this.driver as any).introspect(type);
    }
    
    // Fallback to executing introspect as an action
    return await this.execute('introspect', [{ type: type || 'steps' }]);
  }
  
  async shutdown(): Promise<void> {
    if (this.isRunning && this.driver) {
      await this.driver.shutdown();
      this.isRunning = false;
    }
  }
}

/**
 * Base class for implementing automation drivers
 */
export abstract class BaseDriver implements AutomationDriver {
  protected log: Logger;
  protected initialized: boolean = false;
  
  constructor() {
    this.log = Logger.getInstance().createChildLogger({
      component: this.constructor.name
    });
  }
  
  async initialize(config: DriverConfig): Promise<void> {
    // Validate configuration
    if (config && typeof config !== 'object') {
      throw new Error('Driver configuration must be an object');
    }
    
    this.log.debug('Base driver initialization', { config });
    this.initialized = true;
  }
  
  abstract getCapabilities(): DriverCapabilities;
  
  abstract execute(action: string, args: any[]): Promise<StepExecutionResult>;
  
  async shutdown(): Promise<void> {
    this.log.debug('Base driver shutdown');
    this.initialized = false;
  }
  
  protected validateInitialized(): void {
    if (!this.initialized) {
      throw new Error('Driver not initialized');
    }
  }
  
  protected validateAction(action: string): void {
    if (!action || typeof action !== 'string' || action.trim().length === 0) {
      throw new Error('Action must be a non-empty string');
    }
  }
  
  protected validateArgs(args: any[]): void {
    if (!Array.isArray(args)) {
      throw new Error('Arguments must be an array');
    }
  }
}
