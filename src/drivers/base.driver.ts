import { EventEmitter } from 'events';
import {
  AutomationDriver,
  DriverCapabilities,
  DriverConfig,
  DriverInstance,
  StepExecutionResult
} from './driver.interface';
import { Logger } from '../utils/logger';

/**
 * Base implementation of a driver instance
 */
export class BaseDriverInstance extends EventEmitter implements DriverInstance {
  protected driver: AutomationDriver;
  protected isRunning: boolean = false;
  protected config: DriverConfig = {};
  
  constructor(driver: AutomationDriver) {
    super();
    this.driver = driver;
  }
  
  async start(): Promise<DriverCapabilities> {
    this.isRunning = true;
    return this.driver.getCapabilities();
  }
  
  async initialize(config: DriverConfig): Promise<void> {
    this.config = config;
    await this.driver.initialize(config);
  }
  
  async execute(action: string, args: any[]): Promise<StepExecutionResult> {
    if (!this.isRunning) {
      return {
        success: false,
        error: { message: 'Driver not started' }
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
  
  async shutdown(): Promise<void> {
    if (this.isRunning) {
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
