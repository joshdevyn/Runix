/**
 * Computer Interface - Inspired by OpenAI CUA architecture
 * Provides a unified interface for different execution environments
 */

export type ComputerEnvironment = 'windows' | 'mac' | 'linux' | 'browser' | 'mobile' | 'virtual';

export interface ComputerDimensions {
  width: number;
  height: number;
}

export interface ComputerAction {
  type: string;
  [key: string]: any;
}

export interface ComputerActionResult {
  success: boolean;
  screenshot?: string;
  data?: any;
  error?: {
    message: string;
    details?: any;
  };
  currentUrl?: string;
  timestamp: number;
}

export interface SafetyCheck {
  id: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  requiresAcknowledgment: boolean;
}

/**
 * Computer interface that defines the contract for different execution environments
 */
export interface Computer {
  /**
   * Get the environment type
   */
  getEnvironment(): ComputerEnvironment;

  /**
   * Get screen dimensions
   */
  getDimensions(): ComputerDimensions;

  /**
   * Take a screenshot and return base64 encoded image
   */
  screenshot(): Promise<string>;

  /**
   * Click at specific coordinates
   */
  click(x: number, y: number, button?: 'left' | 'right' | 'middle'): Promise<ComputerActionResult>;

  /**
   * Double click at specific coordinates
   */
  doubleClick(x: number, y: number): Promise<ComputerActionResult>;

  /**
   * Right click at specific coordinates
   */
  rightClick(x: number, y: number): Promise<ComputerActionResult>;

  /**
   * Scroll at specific coordinates
   */
  scroll(x: number, y: number, scrollX: number, scrollY: number): Promise<ComputerActionResult>;

  /**
   * Type text
   */
  type(text: string): Promise<ComputerActionResult>;

  /**
   * Press key combinations
   */
  keyPress(keys: string[]): Promise<ComputerActionResult>;

  /**
   * Move mouse to coordinates
   */
  move(x: number, y: number): Promise<ComputerActionResult>;

  /**
   * Drag from one point to another
   */
  drag(path: Array<{x: number, y: number}>): Promise<ComputerActionResult>;

  /**
   * Wait for specified time
   */
  wait(ms: number): Promise<ComputerActionResult>;

  /**
   * Get current URL (for browser environments)
   */
  getCurrentUrl?(): Promise<string>;

  /**
   * Navigate to URL (for browser environments)
   */
  goto?(url: string): Promise<ComputerActionResult>;

  /**
   * Go back (for browser environments)
   */
  back?(): Promise<ComputerActionResult>;

  /**
   * Go forward (for browser environments)
   */
  forward?(): Promise<ComputerActionResult>;

  /**
   * Execute a computer action
   */
  executeAction(action: ComputerAction): Promise<ComputerActionResult>;

  /**
   * Perform safety checks
   */
  performSafetyChecks?(action: ComputerAction): Promise<SafetyCheck[]>;

  /**
   * Get available actions for this computer
   */
  getAvailableActions(): string[];

  /**
   * Initialize the computer environment
   */
  initialize(): Promise<void>;

  /**
   * Cleanup and dispose resources
   */
  dispose(): Promise<void>;
}

/**
 * Computer environment configuration
 */
export interface ComputerConfig {
  environment: ComputerEnvironment;
  dimensions?: ComputerDimensions;
  enableSafetyChecks?: boolean;
  customActions?: ComputerAction[];
  [key: string]: any;
}

/**
 * Factory for creating computer instances
 */
export interface ComputerFactory {
  createComputer(config: ComputerConfig): Promise<Computer>;
  getSupportedEnvironments(): ComputerEnvironment[];
}
