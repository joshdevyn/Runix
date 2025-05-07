import * as http from 'http';
import * as https from 'https';
import * as url from 'url';
import { BaseDriverInstance } from '../base.driver';
import { DriverCapabilities, DriverConfig, StepExecutionResult } from '../driver.interface';
import { DriverMetadata } from '../driverRegistry';

/**
 * HTTP implementation of a driver instance
 */
export class HttpDriverInstance extends BaseDriverInstance {
  private driverMetadata: DriverMetadata;
  private port: number;
  private baseUrl: string;
  
  constructor(driverMetadata: DriverMetadata, port: number) {
    super({
      getCapabilities: () => ({
        name: driverMetadata.name,
        version: driverMetadata.version,
        description: driverMetadata.description,
        author: driverMetadata.author,
        supportedActions: driverMetadata.supportedActions
      }),
      initialize: async () => {},
      execute: async () => ({ success: false, error: { message: 'Not connected to driver' } }),
      shutdown: async () => {}
    });
    
    this.driverMetadata = driverMetadata;
    this.port = port;
    this.baseUrl = driverMetadata.endpoint || `http://localhost:${port}`;
  }
  
  async start(): Promise<DriverCapabilities> {
    try {
      // Check if the driver is up by requesting capabilities
      const capabilities = await this.sendRequest<DriverCapabilities>('GET', '/capabilities');
      this.isRunning = true;
      return capabilities;
    } catch (err) {
      console.error('Failed to start HTTP driver:', err);
      throw err;
    }
  }
  
  async initialize(config: DriverConfig): Promise<void> {
    await this.sendRequest('POST', '/initialize', { config });
    this.config = config;
  }
  
  async execute(action: string, args: any[]): Promise<StepExecutionResult> {
    try {
      return await this.sendRequest<StepExecutionResult>('POST', '/execute', { action, args });
    } catch (err) {
      return {
        success: false,
        error: {
          message: err instanceof Error ? err.message : String(err)
        }
      };
    }
  }
  
  async introspect(type: string): Promise<any> {
    try {
      return await this.sendRequest('GET', `/introspect/${type}`);
    } catch (err) {
      console.error('Error introspecting driver:', err);
      return null;
    }
  }
  
  async shutdown(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    
    try {
      await this.sendRequest('POST', '/shutdown');
    } catch (err) {
      console.error('Error shutting down HTTP driver:', err);
    } finally {
      this.isRunning = false;
    }
  }
  
  /**
   * Send an HTTP request to the driver
   */
  private sendRequest<T = any>(method: string, path: string, data?: any): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const endpoint = new URL(path, this.baseUrl);
      
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };
      
      const req = (endpoint.protocol === 'https:' ? https : http).request(
        endpoint,
        options,
        (res) => {
          let responseData = '';
          
          res.on('data', (chunk) => {
            responseData += chunk;
          });
          
          res.on('end', () => {
            if (res.statusCode! >= 200 && res.statusCode! < 300) {
              try {
                const parsedData = responseData ? JSON.parse(responseData) : {};
                resolve(parsedData);
              } catch (err) {
                reject(new Error(`Failed to parse response: ${responseData}`));
              }
            } else {
              reject(new Error(`HTTP request failed with status ${res.statusCode}`));
            }
          });
        }
      );
      
      req.on('error', (err) => {
        reject(err);
      });
      
      if (data) {
        req.write(JSON.stringify(data));
      }
      
      req.end();
    });
  }
}
