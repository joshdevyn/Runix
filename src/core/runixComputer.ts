import { Computer, ComputerAction, ComputerActionResult, ComputerEnvironment, ComputerDimensions, SafetyCheck } from './computer.interface';
import { DriverInstance } from '../drivers/driver.interface';
import { Logger } from '../utils/logger';

/**
 * NOTE: This file contains Computer interface implementation that is currently unused.
 * It provides a unified interface adapter for all Runix drivers following OpenAI CUA patterns.
 * Keep for future direct Computer interface usage.
 */

/**
 * Runix Computer Implementation
 * Adapts Runix drivers to the Computer interface pattern
 */
export class RunixComputer implements Computer {
  private drivers: Map<string, DriverInstance> = new Map();
  private environment: ComputerEnvironment;
  private dimensions: ComputerDimensions;
  private enableSafetyChecks: boolean;
  private blockedDomains: string[] = [
    'malware-site.com',
    'phishing-example.com',
    'suspicious-domain.net'
  ];

  constructor(
    private driverRegistry: any,
    private log: Logger,
    environment: ComputerEnvironment = 'windows',
    dimensions: ComputerDimensions = { width: 1920, height: 1080 },
    enableSafetyChecks: boolean = true
  ) {
    this.environment = environment;
    this.dimensions = dimensions;
    this.enableSafetyChecks = enableSafetyChecks;
  }

  async initialize(): Promise<void> {
    this.log.info('Initializing Runix Computer', { environment: this.environment });

    try {
      // Load essential drivers
      const systemDriver = await this.driverRegistry.getDriverInstance('system-driver');
      const webDriver = await this.driverRegistry.getDriverInstance('web-driver');
      const visionDriver = await this.driverRegistry.getDriverInstance('vision-driver');
      const aiDriver = await this.driverRegistry.getDriverInstance('ai-driver');

      if (systemDriver) this.drivers.set('system', systemDriver);
      if (webDriver) this.drivers.set('web', webDriver);
      if (visionDriver) this.drivers.set('vision', visionDriver);
      if (aiDriver) this.drivers.set('ai', aiDriver);

      this.log.info('Runix Computer initialized successfully', {
        loadedDrivers: Array.from(this.drivers.keys())
      });
    } catch (error) {
      this.log.error('Failed to initialize Runix Computer', { error });
      throw error;
    }
  }

  getEnvironment(): ComputerEnvironment {
    return this.environment;
  }

  getDimensions(): ComputerDimensions {
    return this.dimensions;
  }
  async screenshot(): Promise<string> {
    const visionDriver = this.drivers.get('vision');
    const systemDriver = this.drivers.get('system');

    try {
      if (visionDriver) {
        const result = await visionDriver.executeStep('takeScreenshot', []);
        return result.data?.screenshot || '';
      } else if (systemDriver) {
        const result = await systemDriver.executeStep('takeScreenshot', []);
        return result.data?.screenshot || '';
      }
      throw new Error('No capable driver found for screenshot');
    } catch (error) {
      this.log.error('Screenshot failed', { error });
      throw error;
    }
  }

  async click(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): Promise<ComputerActionResult> {
    return this.executeAction({
      type: 'click',
      x,
      y,
      button
    });
  }

  async doubleClick(x: number, y: number): Promise<ComputerActionResult> {
    return this.executeAction({
      type: 'doubleClick',
      x,
      y
    });
  }

  async rightClick(x: number, y: number): Promise<ComputerActionResult> {
    return this.executeAction({
      type: 'rightClick',
      x,
      y
    });
  }

  async scroll(x: number, y: number, scrollX: number, scrollY: number): Promise<ComputerActionResult> {
    return this.executeAction({
      type: 'scroll',
      x,
      y,
      scrollX,
      scrollY
    });
  }

  async type(text: string): Promise<ComputerActionResult> {
    return this.executeAction({
      type: 'type',
      text
    });
  }

  async keyPress(keys: string[]): Promise<ComputerActionResult> {
    return this.executeAction({
      type: 'keyPress',
      keys
    });
  }

  async move(x: number, y: number): Promise<ComputerActionResult> {
    return this.executeAction({
      type: 'move',
      x,
      y
    });
  }

  async drag(path: Array<{x: number, y: number}>): Promise<ComputerActionResult> {
    return this.executeAction({
      type: 'drag',
      path
    });
  }

  async wait(ms: number): Promise<ComputerActionResult> {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          success: true,
          timestamp: Date.now()
        });
      }, ms);
    });
  }
  async getCurrentUrl(): Promise<string> {
    const webDriver = this.drivers.get('web');
    if (!webDriver) {
      throw new Error('Web driver not available for getCurrentUrl');
    }

    try {
      const result = await webDriver.executeStep('getCurrentUrl', []);
      return result.data?.url || '';
    } catch (error) {
      this.log.error('Failed to get current URL', { error });
      throw error;
    }
  }

  async goto(url: string): Promise<ComputerActionResult> {
    return this.executeAction({
      type: 'goto',
      url
    });
  }

  async back(): Promise<ComputerActionResult> {
    return this.executeAction({
      type: 'back'
    });
  }

  async forward(): Promise<ComputerActionResult> {
    return this.executeAction({
      type: 'forward'
    });
  }

  async executeAction(action: ComputerAction): Promise<ComputerActionResult> {
    const timestamp = Date.now();

    try {
      // Perform safety checks
      if (this.enableSafetyChecks) {
        const safetyChecks = await this.performSafetyChecks(action);
        const criticalChecks = safetyChecks.filter(check => check.severity === 'error');
        
        if (criticalChecks.length > 0) {
          return {
            success: false,
            error: {
              message: `Safety check failed: ${criticalChecks[0].message}`,
              details: { safetyChecks }
            },
            timestamp
          };
        }
      }

      // Route action to appropriate driver
      const driver = this.selectDriverForAction(action);
      if (!driver) {
        return {
          success: false,
          error: {
            message: `No suitable driver found for action: ${action.type}`,
            details: { action }
          },
          timestamp
        };
      }      // Execute the action
      const result = await driver.executeStep(action.type, [action]);
      
      // Take screenshot after action (optional)
      let screenshot: string | undefined;
      try {
        if (this.shouldTakeScreenshot(action)) {
          screenshot = await this.screenshot();
        }
      } catch (screenshotError) {
        this.log.warn('Failed to take screenshot after action', { screenshotError });
      }

      // Get current URL for browser actions
      let currentUrl: string | undefined;
      if (this.isBrowserAction(action)) {
        try {
          currentUrl = await this.getCurrentUrl();
        } catch (urlError) {
          this.log.warn('Failed to get current URL', { urlError });
        }
      }

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        screenshot,
        currentUrl,
        timestamp
      };

    } catch (error) {
      this.log.error('Action execution failed', { action, error });
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          details: { action }
        },
        timestamp
      };
    }
  }

  async performSafetyChecks(action: ComputerAction): Promise<SafetyCheck[]> {
    const checks: SafetyCheck[] = [];

    // URL safety checks for browser actions
    if (action.type === 'goto' && action.url) {
      const url = action.url.toLowerCase();
      
      for (const blockedDomain of this.blockedDomains) {
        if (url.includes(blockedDomain)) {
          checks.push({
            id: 'blocked-domain',
            message: `Attempting to navigate to blocked domain: ${blockedDomain}`,
            severity: 'error',
            requiresAcknowledgment: true
          });
        }
      }

      // Check for suspicious patterns
      if (url.includes('localhost') && url.includes('admin')) {
        checks.push({
          id: 'admin-access',
          message: 'Attempting to access localhost admin interface',
          severity: 'warning',
          requiresAcknowledgment: true
        });
      }
    }

    // File system safety checks
    if (action.type === 'deleteFile' || action.type === 'removeDirectory') {
      checks.push({
        id: 'destructive-action',
        message: `Attempting destructive file system operation: ${action.type}`,
        severity: 'warning',
        requiresAcknowledgment: true
      });
    }

    // System command safety checks
    if (action.type === 'executeCommand' && action.command) {
      const dangerousCommands = ['rm -rf', 'del /s', 'format', 'shutdown'];
      const command = action.command.toLowerCase();
      
      for (const dangerous of dangerousCommands) {
        if (command.includes(dangerous)) {
          checks.push({
            id: 'dangerous-command',
            message: `Attempting to execute potentially dangerous command: ${dangerous}`,
            severity: 'error',
            requiresAcknowledgment: true
          });
        }
      }
    }

    return checks;
  }

  getAvailableActions(): string[] {
    const baseActions = [
      'click', 'doubleClick', 'rightClick', 'scroll', 'type', 'keyPress',
      'move', 'drag', 'wait', 'screenshot'
    ];

    if (this.drivers.has('web')) {
      baseActions.push('goto', 'back', 'forward', 'getCurrentUrl');
    }

    if (this.drivers.has('system')) {
      baseActions.push('executeCommand', 'readFile', 'writeFile', 'deleteFile');
    }

    return baseActions;
  }

  private selectDriverForAction(action: ComputerAction): DriverInstance | null {
    const webActions = ['goto', 'back', 'forward', 'getCurrentUrl'];
    const systemActions = ['executeCommand', 'readFile', 'writeFile', 'deleteFile'];
    const visionActions = ['takeScreenshot', 'analyzeImage'];

    if (webActions.includes(action.type)) {
      return this.drivers.get('web') || null;
    }

    if (systemActions.includes(action.type)) {
      return this.drivers.get('system') || null;
    }

    if (visionActions.includes(action.type)) {
      return this.drivers.get('vision') || null;
    }

    // Default to system driver for general actions
    return this.drivers.get('system') || this.drivers.get('web') || null;
  }

  private shouldTakeScreenshot(action: ComputerAction): boolean {
    const screenshotTriggers = [
      'click', 'doubleClick', 'type', 'keyPress', 'goto', 'back', 'forward'
    ];
    return screenshotTriggers.includes(action.type);
  }

  private isBrowserAction(action: ComputerAction): boolean {
    const browserActions = ['goto', 'back', 'forward', 'click', 'scroll'];
    return browserActions.includes(action.type);
  }

  async dispose(): Promise<void> {
    this.log.info('Disposing Runix Computer resources');
    
    for (const [name, driver] of this.drivers) {
      try {
        // Drivers might not have explicit dispose methods
        if (typeof (driver as any).dispose === 'function') {
          await (driver as any).dispose();
        }
      } catch (error) {
        this.log.warn(`Failed to dispose driver: ${name}`, { error });
      }
    }

    this.drivers.clear();
  }
}
