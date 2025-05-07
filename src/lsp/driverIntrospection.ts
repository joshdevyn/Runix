import WebSocket from 'ws';
import * as http from 'http';
import * as https from 'https';
import { v4 as uuidv4 } from 'uuid';
import { DriverMetadata, DriverRegistry, StepDefinition } from '../drivers/driverRegistry';
import { DriverProcessManager } from '../drivers/management/DriverProcessManager';

/**
 * Service for introspecting drivers to get completion data for the LSP
 */
export class DriverIntrospectionService {
  private static instance: DriverIntrospectionService;
  private driverRegistry: DriverRegistry;
  private processManager: DriverProcessManager;
  private stepCache: Map<string, StepDefinition[]> = new Map();
  
  private constructor() {
    this.driverRegistry = DriverRegistry.getInstance();
    this.processManager = DriverProcessManager.getInstance();
  }
  
  public static getInstance(): DriverIntrospectionService {
    if (!DriverIntrospectionService.instance) {
      DriverIntrospectionService.instance = new DriverIntrospectionService();
    }
    return DriverIntrospectionService.instance;
  }

  /**
   * Get all step definitions from all registered drivers
   */
  public async getAllStepDefinitions(): Promise<StepDefinition[]> {
    const allSteps: StepDefinition[] = [];
    const drivers = this.driverRegistry.getAllDrivers();
    
    // First, include any statically defined steps from driver metadata
    for (const driver of drivers) {
      allSteps.push(...(driver.supportedSteps || []));
    }
    
    // Then, try to get dynamic steps from running drivers
    for (const driver of drivers) {
      try {
        // Only introspect drivers that aren't already running if they support introspection
        if (driver.supportedFeatures?.includes('introspection') && 
            !this.processManager.isDriverRunning(driver.id)) {
          const steps = await this.getStepsFromDriver(driver);
          if (steps.length > 0) {
            allSteps.push(...steps);
          }
        }
      } catch (err) {
        console.error(`Error introspecting driver ${driver.name}:`, err);
      }
    }
    
    return allSteps;
  }

  /**
   * Get all drivers with their step definitions
   */
  public getDriversWithSteps(): { id: string, name: string, steps: StepDefinition[] }[] {
    const result: { id: string, name: string, steps: StepDefinition[] }[] = [];
    const drivers = this.driverRegistry.getAllDrivers();
    
    for (const driver of drivers) {
      let steps: StepDefinition[] = driver.supportedSteps || [];
      
      // Add steps from cache if available
      if (this.stepCache.has(driver.id)) {
        steps = this.stepCache.get(driver.id) || [];
      }
      
      if (steps.length > 0) {
        result.push({
          id: driver.id,
          name: driver.name,
          steps
        });
      }
    }
    
    return result;
  }

  /**
   * Get step definitions from a specific driver
   */
  public async getStepsFromDriver(driver: DriverMetadata): Promise<StepDefinition[]> {
    // Check cache first
    if (this.stepCache.has(driver.id)) {
      return this.stepCache.get(driver.id)!;
    }
    
    // If driver is already running, query it directly
    if (this.processManager.isDriverRunning(driver.id)) {
      const processInfo = this.processManager.getDriverProcess(driver.id);
      if (processInfo) {
        return this.queryRunningDriver(processInfo.port, driver.protocol);
      }
    }
    
    // Otherwise, start the driver temporarily just to get step definitions
    try {
      // Start the driver
      const processInfo = await this.processManager.startDriver(driver);
      
      // Query the driver for step definitions
      const steps = await this.queryRunningDriver(processInfo.port, driver.protocol);
      
      // Cache the results
      this.stepCache.set(driver.id, steps);
      
      // Shutdown the driver if it was started just for introspection
      await this.processManager.shutdownDriver(driver.id);
      
      return steps;
    } catch (err) {
      console.error(`Error getting steps from driver ${driver.name}:`, err);
      return driver.supportedSteps || [];
    }
  }

  /**
   * Query a running driver for its step definitions
   */
  private async queryRunningDriver(port: number, protocol: string): Promise<StepDefinition[]> {
    switch (protocol) {
      case 'websocket':
        return this.queryWebSocketDriver(port);
      case 'http':
        return this.queryHttpDriver(port);
      default:
        throw new Error(`Unsupported protocol for introspection: ${protocol}`);
    }
  }

  /**
   * Query a WebSocket driver for its step definitions
   */
  private async queryWebSocketDriver(port: number): Promise<StepDefinition[]> {
    return new Promise<StepDefinition[]>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      
      const requestId = uuidv4();
      let timeoutId: NodeJS.Timeout;
      
      ws.on('open', () => {
        // Set a timeout for the request
        timeoutId = setTimeout(() => {
          ws.terminate();
          reject(new Error('Request timed out'));
        }, 5000);
        
        // Send introspection request
        ws.send(JSON.stringify({
          id: requestId,
          type: 'request',
          method: 'introspect',
          params: { type: 'steps' }
        }));
      });
      
      ws.on('message', (data: WebSocket.Data) => {
        try {
          const response = JSON.parse(data.toString());
          
          if (response.id === requestId) {
            clearTimeout(timeoutId);
            ws.terminate();
            
            if (response.error) {
              reject(new Error(response.error.message));
            } else if (response.result && response.result.steps) {
              resolve(response.result.steps);
            } else {
              resolve([]);
            }
          }
        } catch (err) {
          clearTimeout(timeoutId);
          ws.terminate();
          reject(err);
        }
      });
      
      ws.on('error', (err: Error) => {
        clearTimeout(timeoutId);
        ws.terminate();
        reject(err);
      });
    });
  }

  /**
   * Query an HTTP driver for its step definitions
   */
  private async queryHttpDriver(port: number): Promise<StepDefinition[]> {
    return new Promise<StepDefinition[]>((resolve, reject) => {
      const url = `http://localhost:${port}/introspect/steps`;
      
      http.get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP request failed with status: ${res.statusCode}`));
          return;
        }
        
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.steps && Array.isArray(response.steps)) {
              resolve(response.steps);
            } else {
              resolve([]);
            }
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
  }
}
