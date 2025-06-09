import WebSocket from 'ws';
import { Logger } from '../../utils/logger';
import { DriverMetadata } from '../driverRegistry';
import { DriverStartupError, DriverCommunicationError } from '../../utils/errors';

export class WebSocketDriverInstance {
  private ws: WebSocket | null = null;
  private log: Logger;
  private metadata: DriverMetadata;
  private port: number;
  private connected = false;
  private pendingRequests = new Map<string, any>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private defaultTimeout = 60000; // Increased from 30s to 60s
  private capabilities: any = null; // Store capabilities after startup

  constructor(metadata: DriverMetadata, port: number) {    this.metadata = metadata;
    this.port = port;
    const loggerInstance = Logger.getInstance();
    // Safety check for createChildLogger method during cleanup
    if (typeof loggerInstance.createChildLogger === 'function') {
      this.log = loggerInstance.createChildLogger({
        component: 'WebSocketDriver',
        driverId: metadata.id
      });
    } else {
      // Fallback to main logger instance if createChildLogger is not available
      this.log = loggerInstance;
    }
  }

  async start(): Promise<any> {
    const traceId = this.log.startTrace('websocket-driver-start');
    
    try {
      const url = `ws://127.0.0.1:${this.port}`;
      this.log.debug('Connecting to driver via WebSocket', { traceId, url, port: this.port });
      
      this.ws = new WebSocket(url);
      
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.log.error('WebSocket connection timeout', { traceId, url, port: this.port });
          if (this.ws) {
            this.ws.terminate();
          }
          reject(new Error(`WebSocket connection timeout to ${url}`));
        }, 10000);

        this.ws!.on('open', () => {
          clearTimeout(timeout);
          this.connected = true;
          this.log.debug('WebSocket connection established', { traceId, url, port: this.port });
          resolve(void 0);
        });

        this.ws!.on('error', (error) => {
          clearTimeout(timeout);
          this.log.error('WebSocket connection error', { traceId, url, port: this.port }, error);
          reject(new Error(`Failed to connect to driver at ${url}: ${error.message}`));
        });
      });      // Get capabilities using the correct JSON-RPC method call
      const capabilities = await this.callMethod('capabilities', {});
      this.log.info('Driver capabilities received', { traceId, port: this.port }, capabilities);
      
      // Store capabilities for later retrieval
      this.capabilities = capabilities;
      
      return capabilities;

    } catch (error) {
      this.log.error('Failed to start WebSocket driver', { traceId, port: this.port }, error);
      throw error;
    } finally {
      this.log.endTrace(traceId);
    }
  }

  async initialize(config: any): Promise<void> {
    const traceId = this.log.startTrace('websocket-driver-initialize');
    
    try {
      this.log.debug('Initializing driver with config', { traceId }, config);
      await this.callMethod('initialize', { config });
      this.log.debug('Driver initialization complete', { traceId });
    } finally {
      this.log.endTrace(traceId);
    }
  }

  async execute(action: string, args: any[]): Promise<any> {
    if (!this.connected || !this.ws) {
      throw new DriverCommunicationError(this.metadata.id, action, {
        port: this.port
      });
    }

    return this.callMethod('execute', { action, args });
  }

  async introspect(type?: string): Promise<any> {
    if (!this.connected || !this.ws) {
      throw new DriverCommunicationError(this.metadata.id, 'introspect', {
        port: this.port
      });
    }

    return this.callMethod('introspect', { type: type || 'steps' });
  }

  /**
   * Get driver capabilities (cached from startup)
   */
  async getCapabilities(): Promise<any> {
    if (!this.capabilities) {
      throw new Error('Driver capabilities not available. Driver may not be started yet.');
    }
    return this.capabilities;
  }

  /**
   * Call a JSON-RPC method on the driver
   */
  private async callMethod(method: string, params: any): Promise<any> {
    if (!this.connected || !this.ws) {
      throw new DriverCommunicationError(this.metadata.id, method, {
        port: this.port
      });
    }

    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).substring(2);
      const message = {
        id: requestId,
        type: 'request',
        method: method,
        params: params
      };

      // Set up timeout with longer duration for web operations
      const timeoutId = setTimeout(() => {
        reject(new Error(`Request timeout for method: ${method}. Consider increasing timeout for slow-loading pages.`));
      }, this.defaultTimeout);      const messageHandler = (data: WebSocket.Data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === requestId) {
            clearTimeout(timeoutId);
            if (this.ws) {
              this.ws.off('message', messageHandler);
            }
            
            // Enhanced logging to debug response structure
            this.log.info(`[WEBSOCKET-RESPONSE] Raw response received`, {
              method,
              requestId,
              responseKeys: Object.keys(response),
              hasResult: 'result' in response,
              hasError: 'error' in response,
              errorStructure: response.error ? Object.keys(response.error) : null,
              fullResponse: response
            });
            
            if (response.result !== undefined) {
              resolve(response.result);
            } else if (response.error) {
              // Enhanced error logging
              this.log.error(`[WEBSOCKET-ERROR] Error response from driver`, {
                method,
                requestId,
                errorObject: response.error,
                errorMessage: response.error.message,
                errorCode: response.error.code,
                hasMessage: 'message' in response.error,
                messageType: typeof response.error.message
              });
              
              reject(new Error(response.error.message || 'Unknown error'));
            } else {
              resolve(response);
            }
          }
        } catch (error) {
          // Ignore parsing errors for other messages
        }
      };

      if (this.ws) {
        this.ws.on('message', messageHandler);
        this.ws.send(JSON.stringify(message));
      } else {
        clearTimeout(timeoutId);
        reject(new Error('WebSocket connection is null'));
      }
    });
  }
  async stop(): Promise<void> {
    const traceId = this.log.startTrace('websocket-driver-stop');
    
    try {
      if (this.ws) {
        // Force terminate immediately for cleanup
        this.ws.terminate();
        this.ws = null;
        this.connected = false;
      }
      
      // Clear any pending requests
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error('Driver stopped'));
      }
      this.pendingRequests.clear();
      
      this.log.debug('WebSocket driver stopped', { traceId });
    } finally {
      this.log.endTrace(traceId);
    }
  }

  async shutdown(): Promise<void> {
    return this.stop();
  }

  private handleResponse(response: any): void {
    const { id } = response;
    const pending = this.pendingRequests.get(id);
    
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingRequests.delete(id);
      
      if (response.error) {
        pending.reject(new Error(response.error.message || 'Unknown error'));
      } else {
        pending.resolve(response.result);
      }
    }
  }
  
  private handleDisconnection(): void {
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('WebSocket disconnected'));
    }
    this.pendingRequests.clear();
    
    // Attempt reconnection if needed
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => this.attemptReconnect(), 1000 * this.reconnectAttempts);
    }
  }
  
  private async attemptReconnect(): Promise<void> {
    // Implementation would depend on stored connection URL
    // Note: Reconnection functionality would need to be implemented
    // this.emit('reconnecting', this.reconnectAttempts);
    this.log.debug('Attempting reconnection', { 
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts 
    });
  }
  
  private generateRequestId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
    async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
      this.connected = false;
    }
    
    // Clear any pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Driver disconnected'));
    }
    this.pendingRequests.clear();
  }
}
