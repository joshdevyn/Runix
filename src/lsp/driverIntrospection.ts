import WebSocket from 'ws';

/**
 * Represents a step definition from a driver
 */
export interface StepDefinition {
  id: string;
  pattern: string;
  action: string;
  description: string;
  examples?: string[];
  parameters?: StepParameter[];
  driver?: string;
  confidence?: number;
}

/**
 * Parameter definition for a step
 */
export interface StepParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

/**
 * Driver capability information
 */
export interface DriverCapabilities {
  name: string;
  version: string;
  description: string;
  supportedActions: string[];
  supportedFeatures?: string[];
  features?: string[];
}

/**
 * Driver connection info
 */
export interface DriverInfo {
  id: string;
  name: string;
  port: number;
  host?: string;
  capabilities?: DriverCapabilities;
  steps?: StepDefinition[];
}

/**
 * Introspection response from driver
 */
export interface IntrospectionResponse {
  id: string;
  type: 'response';
  result: {
    steps?: StepDefinition[];
    capabilities?: DriverCapabilities;
  };
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Central driver introspection service
 */
export class DriverIntrospectionService {
  private knownDrivers: Map<string, DriverInfo> = new Map();
  private stepDefinitions: StepDefinition[] = [];
  private logger = this.createLogger();

  constructor() {
    this.initializeKnownDrivers();
  }

  private createLogger() {
    return {
      log: (message: string, data?: any) => {
        const timestamp = new Date().toISOString();
        const dataStr = data ? ` ${JSON.stringify(data)}` : '';
        console.log(`${timestamp} [INFO] [DriverIntrospectionService] ${message}${dataStr}`);
      },
      error: (message: string, data?: any) => {
        const timestamp = new Date().toISOString();
        const dataStr = data ? ` ${JSON.stringify(data)}` : '';
        console.error(`${timestamp} [ERROR] [DriverIntrospectionService] ${message}${dataStr}`);
      }
    };
  }

  /**
   * Initialize known drivers with their default ports
   */
  private initializeKnownDrivers(): void {
    const drivers: DriverInfo[] = [
      { id: 'example-driver', name: 'ExampleDriver', port: 9000 },
      { id: 'web-driver', name: 'WebDriver', port: 9001 },
      { id: 'system-driver', name: 'SystemDriver', port: 9002 },
      { id: 'vision-driver', name: 'VisionDriver', port: 9003 },
      { id: 'ai-driver', name: 'AIDriver', port: 9004 }
    ];

    drivers.forEach(driver => {
      this.knownDrivers.set(driver.id, driver);
    });

    this.logger.log(`Initialized ${drivers.length} known drivers`);
  }

  /**
   * Connect to a driver via WebSocket
   */
  private async connectToDriver(driverInfo: DriverInfo): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const host = driverInfo.host || '127.0.0.1';
      const ws = new WebSocket(`ws://${host}:${driverInfo.port}`);

      ws.on('open', () => {
        this.logger.log(`Connected to ${driverInfo.name} at ${host}:${driverInfo.port}`);
        resolve(ws);
      });

      ws.on('error', (error) => {
        this.logger.error(`Failed to connect to ${driverInfo.name}:`, error);
        reject(error);
      });

      // Set timeout for connection
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          reject(new Error(`Connection timeout for ${driverInfo.name}`));
        }
      }, 5000);
    });
  }

  /**
   * Send request to driver and wait for response
   */
  private async sendDriverRequest(ws: WebSocket, request: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 10000);

      ws.once('message', (data) => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(data.toString());
          resolve(response);
        } catch (err) {
          reject(err);
        }
      });

      ws.send(JSON.stringify(request));
    });
  }

  /**
   * Get capabilities from a specific driver
   */
  public async getDriverCapabilities(driverId: string): Promise<DriverCapabilities | null> {
    const driverInfo = this.knownDrivers.get(driverId);
    if (!driverInfo) {
      this.logger.error(`Unknown driver: ${driverId}`);
      return null;
    }

    try {
      const ws = await this.connectToDriver(driverInfo);
      
      const request = {
        id: `cap-${Date.now()}`,
        method: 'capabilities'
      };

      const response = await this.sendDriverRequest(ws, request);
      ws.close();

      if (response.error) {
        this.logger.error(`Capabilities error from ${driverId}:`, response.error);
        return null;
      }

      driverInfo.capabilities = response.result;
      return response.result;
    } catch (error) {
      this.logger.error(`Failed to get capabilities from ${driverId}:`, error);
      return null;
    }
  }

  /**
   * Get step definitions from a specific driver
   */
  public async getDriverSteps(driverId: string): Promise<StepDefinition[]> {
    const driverInfo = this.knownDrivers.get(driverId);
    if (!driverInfo) {
      this.logger.error(`Unknown driver: ${driverId}`);
      return [];
    }

    try {
      const ws = await this.connectToDriver(driverInfo);
      
      const request = {
        id: `steps-${Date.now()}`,
        method: 'introspect',
        params: { type: 'steps' }
      };

      const response: IntrospectionResponse = await this.sendDriverRequest(ws, request);
      ws.close();

      if (response.error) {
        this.logger.error(`Steps error from ${driverId}:`, response.error);
        return [];
      }

      const steps = response.result.steps || [];
      
      // Normalize step definitions
      const normalizedSteps = steps.map(step => ({
        ...step,
        driver: driverInfo.name,
        id: step.id || `${driverId}-${step.action}`,
        parameters: step.parameters || []
      }));

      driverInfo.steps = normalizedSteps;
      this.logger.log(`Retrieved ${normalizedSteps.length} steps from ${driverId}`);
      
      return normalizedSteps;
    } catch (error) {
      this.logger.error(`Failed to get steps from ${driverId}:`, error);
      return [];
    }
  }

  /**
   * Discover and introspect all available drivers
   */
  public async discoverAllDrivers(): Promise<{
    drivers: DriverInfo[];
    totalSteps: number;
    errors: string[];
  }> {
    this.logger.log('Starting driver discovery...');
    
    const discoveredDrivers: DriverInfo[] = [];
    const errors: string[] = [];
    let totalSteps = 0;

    for (const [driverId, driverInfo] of this.knownDrivers) {
      try {
        // Get capabilities
        const capabilities = await this.getDriverCapabilities(driverId);
        if (capabilities) {
          driverInfo.capabilities = capabilities;
        }

        // Get step definitions
        const steps = await this.getDriverSteps(driverId);
        if (steps.length > 0) {
          driverInfo.steps = steps;
          totalSteps += steps.length;
          
          // Add to global step definitions
          this.stepDefinitions.push(...steps);
          
          discoveredDrivers.push({ ...driverInfo });
        }
      } catch (error) {
        const errorMsg = `Failed to discover ${driverId}: ${error instanceof Error ? error.message : String(error)}`;
        this.logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    this.logger.log(`Discovery complete: ${discoveredDrivers.length} drivers, ${totalSteps} total steps`);

    return {
      drivers: discoveredDrivers,
      totalSteps,
      errors
    };
  }

  /**
   * Get all collected step definitions
   */
  public getAllStepDefinitions(): StepDefinition[] {
    return [...this.stepDefinitions];
  }

  /**
   * Search for steps by pattern or action
   */
  public searchSteps(query: string): StepDefinition[] {
    const searchTerm = query.toLowerCase();
    return this.stepDefinitions.filter(step =>
      step.pattern.toLowerCase().includes(searchTerm) ||
      step.action.toLowerCase().includes(searchTerm) ||
      step.description.toLowerCase().includes(searchTerm) ||
      (step.driver && step.driver.toLowerCase().includes(searchTerm))
    );
  }

  /**
   * Get steps by driver
   */
  public getStepsByDriver(driverName: string): StepDefinition[] {
    return this.stepDefinitions.filter(step => step.driver === driverName);
  }

  /**
   * Check if a driver is available
   */
  public async isDriverAvailable(driverId: string): Promise<boolean> {
    const driverInfo = this.knownDrivers.get(driverId);
    if (!driverInfo) return false;

    try {
      const ws = await this.connectToDriver(driverInfo);
      
      const request = {
        id: `health-${Date.now()}`,
        method: 'health'
      };

      const response = await this.sendDriverRequest(ws, request);
      ws.close();

      return response.result?.status === 'ok';
    } catch (error) {
      return false;
    }
  }

  /**
   * Get driver registry information
   */
  public getDriverRegistry(): DriverInfo[] {
    return Array.from(this.knownDrivers.values());
  }

  /**
   * Refresh step definitions from all drivers
   */
  public async refreshStepDefinitions(): Promise<void> {
    this.stepDefinitions = [];
    await this.discoverAllDrivers();
  }
}

/**
 * Default export - singleton instance
 */
export const driverIntrospectionService = new DriverIntrospectionService();
