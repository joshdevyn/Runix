import { EventEmitter } from 'events';

/**
 * Driver capabilities response from a driver
 */
export interface DriverCapabilities {
  name: string;
  version: string;
  description: string;
  author: string;
  protocol?: string;
  supportedActions: string[];
  features?: string[];
}

/**
 * Driver configuration options
 */
export interface DriverConfig {
  [key: string]: any;
}

/**
 * Result from executing a step
 */
export interface StepExecutionResult {
  success: boolean;
  data?: any;
  error?: {
    message: string;
    details?: any;
  };
}

/**
 * Represents a driver instance that can execute actions
 */
export interface DriverInstance extends EventEmitter {
  /**
   * Start the driver and get its capabilities
   */
  start(): Promise<DriverCapabilities>;
  
  /**
   * Initialize the driver with configuration
   */
  initialize(config: DriverConfig): Promise<void>;
  
  /**
   * Execute an action with arguments
   */
  execute(action: string, args: any[]): Promise<StepExecutionResult>;
  
  /**
   * Introspect the driver for capabilities and step definitions
   */
  introspect?(type?: string): Promise<any>;
  
  /**
   * Execute a step by name with arguments
   */
  executeStep(action: string, args: any[]): Promise<StepExecutionResult>;
  
  /**
   * Shut down the driver
   */
  shutdown(): Promise<void>;
}

/**
 * Defines the contract for automation drivers
 */
export interface AutomationDriver {
  /**
   * Get driver capabilities
   */
  getCapabilities(): DriverCapabilities;
  
  /**
   * Initialize driver with configuration
   */
  initialize(config: DriverConfig): Promise<void>;
  
  /**
   * Execute specified action with arguments
   */
  execute(action: string, args: any[]): Promise<StepExecutionResult>;
  
  /**
   * Clean up and shutdown
   */
  shutdown(): Promise<void>;
}

/**
 * Definition of a step that can be executed by a driver
 */
export interface DriverStep {
  id: string;
  pattern: string;
  description?: string;
  action: string;
  parameters?: Array<{
    name: string;
    type: string;
    description?: string;
    required?: boolean;
    default?: any;
  }>;
  examples?: string[];
}
