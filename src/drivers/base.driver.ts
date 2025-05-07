import { EventEmitter } from 'events';
import {
  AutomationDriver,
  DriverCapabilities,
  DriverConfig,
  DriverInstance,
  StepExecutionResult
} from './driver.interface';

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
  abstract getCapabilities(): DriverCapabilities;
  
  async initialize(config: DriverConfig): Promise<void> {
    // Default implementation - can be overridden by subclasses
  }
  
  abstract execute(action: string, args: any[]): Promise<StepExecutionResult>;
  
  async shutdown(): Promise<void> {
    // Default implementation - can be overridden by subclasses
  }
}
