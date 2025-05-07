import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { BaseDriverInstance } from '../base.driver';
import { DriverCapabilities, DriverConfig, StepExecutionResult } from '../driver.interface';
import { DriverMetadata } from '../driverRegistry';

interface WebSocketRequest {
  id: string;
  type: 'request';
  method: string;
  params?: any;
}

interface WebSocketResponse {
  id: string;
  type: 'response';
  result?: any;
  error?: {
    code: number;
    message: string;
    details?: any;
  };
}

/**
 * WebSocket implementation of a driver instance
 */
export class WebSocketDriverInstance extends BaseDriverInstance {
  private ws: WebSocket | null = null;
  private pendingRequests: Map<string, { 
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private driverMetadata: DriverMetadata;
  private port: number;
  private requestTimeout = 30000; // 30 seconds
  
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
  }
  
  async start(): Promise<DriverCapabilities> {
    if (this.ws) {
      return super.start();
    }
    
    return new Promise<DriverCapabilities>((resolve, reject) => {
      // Connect to the driver
      const wsUrl = this.driverMetadata.endpoint || `ws://localhost:${this.port}`;
      console.log(`Connecting to driver at ${wsUrl}`);
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.on('open', async () => {
        console.log(`Connected to driver at ${wsUrl}`);
        
        try {
          // Get capabilities
          const capabilities = await this.sendRequest('capabilities', {});
          this.isRunning = true;
          resolve(capabilities);
        } catch (err) {
          reject(err);
        }
      });
      
      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const response: WebSocketResponse = JSON.parse(data.toString());
          this.handleResponse(response);
        } catch (err) {
          console.error('Error parsing driver response:', err);
        }
      });
      
      this.ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        reject(err);
      });
      
      this.ws.on('close', (code, reason) => {
        console.log(`WebSocket closed: ${code} - ${reason}`);
        this.isRunning = false;
        this.ws = null;
        
        // Reject all pending requests
        for (const [id, { reject }] of this.pendingRequests) {
          reject(new Error(`WebSocket closed: ${code} - ${reason}`));
          this.pendingRequests.delete(id);
        }
      });
    });
  }
  
  async initialize(config: DriverConfig): Promise<void> {
    await this.sendRequest('initialize', { config });
    this.config = config;
  }
  
  async execute(action: string, args: any[]): Promise<StepExecutionResult> {
    try {
      return await this.sendRequest('execute', { action, args });
    } catch (err) {
      return {
        success: false,
        error: {
          message: err instanceof Error ? err.message : String(err)
        }
      };
    }
  }
  
  async shutdown(): Promise<void> {
    if (!this.isRunning || !this.ws) {
      return;
    }
    
    try {
      await this.sendRequest('shutdown', {});
    } catch (err) {
      console.error('Error shutting down driver:', err);
    } finally {
      this.isRunning = false;
      this.ws.close();
      this.ws = null;
    }
  }
  
  /**
   * Send a request to the driver and wait for a response
   */
  private sendRequest<T = any>(method: string, params: any): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('Not connected to driver'));
        return;
      }
      
      const id = uuidv4();
      const request: WebSocketRequest = {
        id,
        type: 'request',
        method,
        params
      };
      
      // Set a timeout for the request
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timed out: ${method}`));
        }
      }, this.requestTimeout);
      
      // Store the request callbacks
      this.pendingRequests.set(id, { resolve, reject, timeout });
      
      // Send the request
      this.ws.send(JSON.stringify(request));
    });
  }
  
  /**
   * Handle a response from the driver
   */
  private handleResponse(response: WebSocketResponse): void {
    const { id, result, error } = response;
    
    if (!id || !this.pendingRequests.has(id)) {
      console.warn('Received response for unknown request:', response);
      return;
    }
    
    const { resolve, reject, timeout } = this.pendingRequests.get(id)!;
    this.pendingRequests.delete(id);
    clearTimeout(timeout);
    
    if (error) {
      reject(new Error(error.message));
    } else {
      resolve(result);
    }
  }
}
