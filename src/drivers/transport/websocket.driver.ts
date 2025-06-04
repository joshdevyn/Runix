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

  constructor(metadata: DriverMetadata, port: number) {
    this.metadata = metadata;
    this.port = port;
    this.log = Logger.getInstance().createChildLogger({
      component: 'WebSocketDriver',
      driverId: metadata.id
    });
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
      });

      // Get capabilities using the correct JSON-RPC method call
      const capabilities = await this.callMethod('capabilities', {});
      this.log.info('Driver capabilities received', { traceId, port: this.port }, capabilities);
      
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

      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout for method: ${method}`));
      }, 30000);

      const messageHandler = (data: WebSocket.Data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === requestId) {
            clearTimeout(timeout);
            if (this.ws) {
              this.ws.off('message', messageHandler);
            }
            
            if (response.result !== undefined) {
              resolve(response.result);
            } else if (response.error) {
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
        clearTimeout(timeout);
        reject(new Error('WebSocket connection is null'));
      }
    });
  }

  async stop(): Promise<void> {
    const traceId = this.log.startTrace('websocket-driver-stop');
    
    try {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
        this.connected = false;
      }
      this.log.debug('WebSocket driver stopped', { traceId });
    } finally {
      this.log.endTrace(traceId);
    }
  }

  async shutdown(): Promise<void> {
    return this.stop();
  }
}
