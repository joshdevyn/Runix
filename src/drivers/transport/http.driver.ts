import { request as httpRequest } from 'http';
import { Logger } from '../../utils/logger';
import { DriverMetadata } from '../driverRegistry';
import { DriverError } from '../../utils/errors';

/**
 * HTTP implementation of a driver instance
 */
export class HttpDriverInstance {
  private baseUrl: string;
  private log: Logger;
  private metadata: DriverMetadata;
  private port: number;
  private timeout: number = 30000;

  constructor(metadata: DriverMetadata, port: number) {
    this.metadata = metadata;
    this.port = port;
    this.baseUrl = `http://localhost:${port}`;
    this.log = Logger.getInstance().createChildLogger({
      component: 'HttpDriver',
      driverId: metadata.id
    });
  }

  async start(): Promise<any> {
    const traceId = this.log.startTrace('http-driver-start');
    
    try {
      this.log.debug('Starting HTTP driver', { traceId, port: this.port });
      
      // Get capabilities using proper HTTP endpoint
      const capabilities = await this.makeRequest('GET', '/capabilities');
      
      this.log.info('Driver capabilities received', { traceId }, capabilities);
      return capabilities;

    } catch (error) {
      this.log.error('Failed to start HTTP driver', { traceId }, error);
      throw error;
    } finally {
      this.log.endTrace(traceId);
    }
  }

  async initialize(config: any): Promise<void> {
    const traceId = this.log.startTrace('http-driver-initialize');
    
    try {
      this.log.debug('Initializing driver with config', { traceId }, config);
      await this.makeRequest('POST', '/initialize', { config });
      this.log.debug('Driver initialization complete', { traceId });
    } finally {
      this.log.endTrace(traceId);
    }
  }

  async execute(action: string, args: any[]): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/execute', {
        action,
        args
      });
      
      return response;
    } catch (error) {
      throw new DriverError(`HTTP execution failed for ${action}`, this.metadata.id, {
        operation: 'http_execute'
      }, error instanceof Error ? error : new Error(String(error)));
    }
  }

  async shutdown(): Promise<void> {
    const traceId = this.log.startTrace('http-driver-shutdown');
    
    try {
      await this.makeRequest('POST', '/shutdown');
      this.log.debug('HTTP driver shutdown complete', { traceId });
    } catch (error) {
      // Ignore shutdown errors
      this.log.warn('Error during HTTP driver shutdown', { traceId }, error);
    } finally {
      this.log.endTrace(traceId);
    }
  }

  private async makeRequest(method: string, path: string, data?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const postData = data ? JSON.stringify(data) : undefined;
      
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(postData && { 'Content-Length': Buffer.byteLength(postData) })
        },
        timeout: this.timeout
      };

      const req = httpRequest(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              const parsedData = responseData ? JSON.parse(responseData) : {};
              resolve(parsedData);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse response: ${responseData}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${this.timeout}ms`));
      });

      if (postData) {
        req.write(postData);
      }
      
      req.end();
    });
  }
}
