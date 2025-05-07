import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { env } from '../utils/env';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';
import http from 'http';

export interface DriverMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  license: string;
  executable: string;
  protocol: 'websocket' | 'http' | 'tcp';
  features: string[];
  supportedActions: string[];
  directory: string;
  config?: Record<string, any>;
  command?: string;
  args?: string[];
  transport?: string;
  endpoint?: string;
  supportedSteps?: StepDefinition[];
  supportedFeatures?: string[];
}

export interface DriverProcessInfo {
  id: string;
  process: ChildProcess;
  port: number;
  metadata: DriverMetadata;
  status: 'starting' | 'running' | 'stopping' | 'error';
}

export interface StepDefinition {
  id: string;
  pattern: string;
  description: string;
  action: string;
  examples: string[];
  parameters: {
    name: string;
    type: string;
    description: string;
    required: boolean;
    default?: any;
  }[];
}

/**
 * Registry for managing driver metadata and processes
 */
export class DriverRegistry {
  private static instance: DriverRegistry;
  private drivers: Map<string, DriverMetadata> = new Map();
  private processes: Map<string, DriverProcessInfo> = new Map();
  private log: Logger;
  private portCounter: number = 8000; // Starting port for driver processes
  
  private constructor() {
    this.log = Logger.getInstance().createChildLogger({ 
      component: 'DriverRegistry'
    });
  }
  
  public static getInstance(): DriverRegistry {
    if (!DriverRegistry.instance) {
      DriverRegistry.instance = new DriverRegistry();
    }
    return DriverRegistry.instance;
  }
  
  /**
   * Discover all drivers in the driver directories
   */
  public async discoverDrivers(): Promise<void> {
    this.log.debug('Discovering drivers...');
    try {
      const cwd = process.cwd();
      // only load built drivers for standalone quickstart
      const driverDirs = [
        path.join(cwd, 'bin', 'drivers')
      ];

      // Add custom driver directories from environment
      const customDriverDir = env.get('DRIVER_DIR');
      if (customDriverDir) {
        driverDirs.push(customDriverDir);
      }
      
      // Add driver directories relative to executable
      if (process.execPath && !process.execPath.includes('node')) {
        const execDir = path.dirname(process.execPath);
        driverDirs.push(path.join(execDir, 'drivers'));
      }
      
      // Scan all driver directories
      for (const dirPath of driverDirs) {
        if (!fs.existsSync(dirPath)) {
          this.log.debug(`Driver directory not found: ${dirPath}`);
          continue;
        }
        
        this.log.debug(`Scanning driver directory: ${dirPath}`);
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          
          const driverDir = path.join(dirPath, entry.name);
          await this.loadDriverFromDirectory(driverDir);
        }
      }
      
      this.log.info(`Discovered ${this.drivers.size} drivers`);
    } catch (error) {
      this.log.error(`Error discovering drivers: ${error}`);
      throw error;
    }
  }
  
  /**
   * Load a driver from a directory
   */
  private async loadDriverFromDirectory(driverDir: string): Promise<void> {
    try {
      this.log.debug(`Loading driver from directory: ${driverDir}`);
      
      // Check for driver.json metadata
      const metadataPath = path.join(driverDir, 'driver.json');
      if (!fs.existsSync(metadataPath)) {
        this.log.debug(`No driver.json found in ${driverDir}`);
        return;
      }
      
      // Parse driver metadata
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      
      // Validate required fields
      if (!metadata.name || !metadata.version || !metadata.executable) {
        this.log.warn(`Invalid driver metadata in ${metadataPath}`);
        return;
      }
      
      // Create driver ID (lowercase name without spaces)
      const driverId = metadata.id || metadata.name.toLowerCase().replace(/\s+/g, '');
      
      // Construct full driver metadata
      const driver: DriverMetadata = {
        id: driverId,
        name: metadata.name,
        description: metadata.description || '',
        version: metadata.version,
        author: metadata.author || 'Unknown',
        license: metadata.license || 'Unknown',
        executable: metadata.executable,
        protocol: metadata.protocol || 'websocket',
        features: metadata.features || ['execute'],
        supportedActions: metadata.actions || [],
        directory: driverDir,
        config: metadata.config
      };
      
      // Register the driver
      this.drivers.set(driverId, driver);
      this.log.info(`Registered driver: ${driver.name} v${driver.version}`);
    } catch (error) {
      this.log.error(`Error loading driver from ${driverDir}: ${error}`);
    }
  }
  
  /**
   * Get all registered drivers
   */
  public getAllDrivers(): DriverMetadata[] {
    return Array.from(this.drivers.values());
  }
  
  /**
   * Get a driver by ID
   */
  public getDriver(idOrName: string): DriverMetadata | undefined {
    // Try direct ID match
    if (this.drivers.has(idOrName)) {
      return this.drivers.get(idOrName);
    }
    
    // Try case-insensitive name match
    const lowercaseId = idOrName.toLowerCase();
    for (const driver of this.drivers.values()) {
      if (driver.id.toLowerCase() === lowercaseId || 
          driver.name.toLowerCase() === lowercaseId) {
        return driver;
      }
    }
    
    return undefined;
  }
  
  /**
   * List all driver IDs
   */
  public listDriverIds(): string[] {
    return Array.from(this.drivers.keys());
  }
  
  /**
   * Start a driver process
   */
  public async startDriver(driverId: string): Promise<any> {
    this.log.debug(`Starting driver: ${driverId}`);
    
    const driver = this.getDriver(driverId);
    if (!driver) {
      throw new Error(`Driver not found: ${driverId}`);
    }
    
    // Check if driver is already running
    if (this.isDriverRunning(driverId)) {
      this.log.debug(`Driver ${driverId} is already running`);
      return this.createDriverInterface(driverId);
    }
    
    // Allocate port for the driver
    const port = this.allocatePort();
    
    // Get executable path
    let executablePath: string;
    if (path.isAbsolute(driver.executable)) {
      executablePath = driver.executable;
    } else {
      executablePath = path.join(driver.directory, driver.executable);
    }
    
    // Make executable path OS-specific for binary drivers
    if (process.platform === 'win32' && !executablePath.endsWith('.js') && !executablePath.endsWith('.exe')) {
      executablePath += '.exe';
    } else if (process.platform !== 'win32' && !executablePath.endsWith('.js')) {
      // For Unix systems, ensure executable has proper permissions
      try {
        await fs.promises.chmod(executablePath, '755');
      } catch (error) {
        this.log.warn(`Failed to set executable permissions: ${error}`);
      }
    }
    
    // Check if executable exists
    if (!fs.existsSync(executablePath)) {
      throw new Error(`Driver executable not found: ${executablePath}`);
    }
    
    // Common environment variables for the driver
    const env = {
      ...process.env,
      RUNIX_DRIVER_PORT: port.toString(),
      RUNIX_DRIVER_ID: driverId,
      RUNIX_DRIVER_LOG_LEVEL: process.env.RUNIX_LOG_LEVEL || 'info'
    };
    
    // Start the driver process
    let driverProcess: ChildProcess;
    
    // Handle JavaScript vs binary driver executables
    if (executablePath.endsWith('.js')) {
      // JavaScript driver
      driverProcess = spawn('node', [executablePath, '--port', port.toString()], {
        cwd: driver.directory,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } else {
      // Binary driver
      driverProcess = spawn(executablePath, ['--port', port.toString()], {
        cwd: driver.directory,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    }
    
    // Setup process logging
    if (driverProcess.stdout) {
      driverProcess.stdout.on('data', (data) => {
        this.log.debug(`[${driverId}] ${data.toString().trim()}`);
      });
    }
    
    if (driverProcess.stderr) {
      driverProcess.stderr.on('data', (data) => {
        this.log.warn(`[${driverId}] ${data.toString().trim()}`);
      });
    }
    
    // Handle process exit
    driverProcess.on('exit', (code, signal) => {
      this.log.info(`Driver ${driverId} exited with code ${code} and signal ${signal}`);
      this.processes.delete(driverId);
    });
    
    // Store process info
    const processInfo: DriverProcessInfo = {
      id: driverId,
      process: driverProcess,
      port,
      metadata: driver,
      status: 'starting'
    };
    
    this.processes.set(driverId, processInfo);
    
    // Wait for driver to become ready
    await this.waitForDriverReady(driverId, port, driver.protocol);
    
    // Create and return driver interface
    return this.createDriverInterface(driverId);
  }
  
  /**
   * Wait for driver to become ready by querying its health endpoint
   */
  private async waitForDriverReady(driverId: string, port: number, protocol: string): Promise<void> {
    const maxRetries = 30;
    const retryInterval = 100;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        if (protocol === 'websocket') {
          await this.checkWebSocketHealth(port);
        } else {
          await this.checkHttpHealth(port);
        }
        
        // If we reach here, the driver is ready
        const processInfo = this.processes.get(driverId);
        if (processInfo) {
          processInfo.status = 'running';
        }
        
        this.log.debug(`Driver ${driverId} is ready on port ${port}`);
        return;
      } catch (error) {
        if (i === maxRetries - 1) {
          const processInfo = this.processes.get(driverId);
          if (processInfo) {
            processInfo.status = 'error';
            try {
              processInfo.process.kill();
            } catch (e) {
              // Ignore errors killing the process
            }
          }
          
          throw new Error(`Timeout waiting for driver ${driverId} to become ready: ${error}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      }
    }
  }
  
  /**
   * Check if WebSocket driver is ready
   */
  private async checkWebSocketHealth(port: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const ws = new WebSocket(`ws://localhost:${port}`);
        
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('WebSocket connection timed out'));
        }, 2000);
        
        ws.on('open', () => {
          // Send health check request
          const request = {
            id: uuidv4(),
            method: 'health',
            params: {}
          };
          
          ws.send(JSON.stringify(request));
        });
        
        ws.on('message', (data) => {
          try {
            const response = JSON.parse(data.toString());
            
            if (response.result && response.result.status === 'ok') {
              clearTimeout(timeout);
              ws.close();
              resolve();
            } else {
              clearTimeout(timeout);
              ws.close();
              reject(new Error('Driver health check failed'));
            }
          } catch (err) {
            clearTimeout(timeout);
            ws.close();
            reject(err);
          }
        });
        
        ws.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Check if HTTP driver is ready
   */
  private async checkHttpHealth(port: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const request = http.get(`http://localhost:${port}/health`, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Health check failed with status: ${res.statusCode}`));
          return;
        }
        
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.status === 'ok') {
              resolve();
            } else {
              reject(new Error('Driver health check failed'));
            }
          } catch (err) {
            reject(err);
          }
        });
      });
      
      request.on('error', reject);
      request.end();
    });
  }
  
  /**
   * Create driver interface for communicating with the driver
   */
  private createDriverInterface(driverId: string): any {
    const processInfo = this.processes.get(driverId);
    if (!processInfo) {
      throw new Error(`Driver process not found: ${driverId}`);
    }
    
    const { port, metadata } = processInfo;
    
    // Create appropriate interface based on protocol
    if (metadata.protocol === 'websocket') {
      return this.createWebSocketInterface(driverId, port, metadata);
    } else {
      return this.createHttpInterface(driverId, port, metadata);
    }
  }
  
  /**
   * Create WebSocket interface for communicating with the driver
   */
  private createWebSocketInterface(driverId: string, port: number, metadata: DriverMetadata): any {
    const log = this.log;
    
    // Return driver interface object
    return {
      id: driverId,
      metadata,
      
      async start(): Promise<any> {
        // Get driver capabilities
        const requestId = uuidv4();
        
        return new Promise((resolve, reject) => {
          const ws = new WebSocket(`ws://localhost:${port}`);
          
          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('WebSocket connection timed out'));
          }, 5000);
          
          ws.on('open', () => {
            // Send capabilities request
            const request = {
              id: requestId,
              method: 'capabilities',
              params: {}
            };
            
            ws.send(JSON.stringify(request));
          });
          
          ws.on('message', (data) => {
            try {
              const response = JSON.parse(data.toString());
              
              if (response.id === requestId) {
                clearTimeout(timeout);
                ws.close();
                
                if (response.error) {
                  reject(new Error(response.error.message));
                } else {
                  resolve(response.result);
                }
              }
            } catch (err) {
              clearTimeout(timeout);
              ws.close();
              reject(err);
            }
          });
          
          ws.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });
      },
      
      async initialize(config: any): Promise<any> {
        // Initialize driver with configuration
        const requestId = uuidv4();
        
        return new Promise((resolve, reject) => {
          const ws = new WebSocket(`ws://localhost:${port}`);
          
          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('WebSocket connection timed out'));
          }, 5000);
          
          ws.on('open', () => {
            // Send initialize request
            const request = {
              id: requestId,
              method: 'initialize',
              params: config || {}
            };
            
            ws.send(JSON.stringify(request));
          });
          
          ws.on('message', (data) => {
            try {
              const response = JSON.parse(data.toString());
              
              if (response.id === requestId) {
                clearTimeout(timeout);
                ws.close();
                
                if (response.error) {
                  reject(new Error(response.error.message));
                } else {
                  resolve(response.result);
                }
              }
            } catch (err) {
              clearTimeout(timeout);
              ws.close();
              reject(err);
            }
          });
          
          ws.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });
      },
      
      async execute(action: string, args: any[]): Promise<any> {
        // Execute action on the driver
        const requestId = uuidv4();
        
        return new Promise((resolve, reject) => {
          const ws = new WebSocket(`ws://localhost:${port}`);
          
          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('WebSocket connection timed out'));
          }, 30000); // Longer timeout for actions
          
          ws.on('open', () => {
            // Send execute request
            const request = {
              id: requestId,
              method: 'execute',
              params: {
                action,
                args
              }
            };
            
            ws.send(JSON.stringify(request));
          });
          
          ws.on('message', (data) => {
            try {
              const response = JSON.parse(data.toString());
              
              if (response.id === requestId) {
                clearTimeout(timeout);
                ws.close();
                
                if (response.error) {
                  reject(new Error(response.error.message));
                } else {
                  resolve(response.result);
                }
              }
            } catch (err) {
              clearTimeout(timeout);
              ws.close();
              reject(err);
            }
          });
          
          ws.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });
      },
      
      async shutdown(): Promise<void> {
        // Shutdown the driver
        try {
          const requestId = uuidv4();
          
          return new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://localhost:${port}`);
            
            const timeout = setTimeout(() => {
              ws.close();
              resolve(); // Resolve anyway on timeout
            }, 2000);
            
            ws.on('open', () => {
              // Send shutdown request
              const request = {
                id: requestId,
                method: 'shutdown',
                params: {}
              };
              
              ws.send(JSON.stringify(request));
            });
            
            ws.on('message', (data) => {
              clearTimeout(timeout);
              ws.close();
              resolve();
            });
            
            ws.on('error', () => {
              clearTimeout(timeout);
              resolve(); // Resolve anyway on error
            });
          });
        } finally {
          // Kill the process regardless of shutdown request success
          const processInfo = DriverRegistry.getInstance().getDriverProcess(driverId);
          if (processInfo) {
            try {
              processInfo.process.kill();
              log.debug(`Killed driver process: ${driverId}`);
            } catch (e) {
              log.warn(`Error killing driver process: ${driverId}`, { error: e });
            }
          }
        }
      }
    };
  }
  
  /**
   * Create HTTP interface for communicating with the driver
   */
  private createHttpInterface(driverId: string, port: number, metadata: DriverMetadata): any {
    const log = this.log;
    
    // Return driver interface object
    return {
      id: driverId,
      metadata,
      
      async start(): Promise<any> {
        // Get driver capabilities
        return new Promise((resolve, reject) => {
          const request = http.get(`http://localhost:${port}/capabilities`, (res) => {
            if (res.statusCode !== 200) {
              reject(new Error(`Capabilities request failed with status: ${res.statusCode}`));
              return;
            }
            
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            
            res.on('end', () => {
              try {
                const response = JSON.parse(data);
                resolve(response);
              } catch (err) {
                reject(err);
              }
            });
          });
          
          request.on('error', reject);
          request.end();
        });
      },
      
      async initialize(config: any): Promise<any> {
        // Initialize driver with configuration
        return new Promise((resolve, reject) => {
          const data = JSON.stringify(config || {});
          
          const options = {
            hostname: 'localhost',
            port,
            path: '/initialize',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': data.length
            }
          };
          
          const request = http.request(options, (res) => {
            if (res.statusCode !== 200) {
              reject(new Error(`Initialize request failed with status: ${res.statusCode}`));
              return;
            }
            
            let responseData = '';
            res.on('data', (chunk) => {
              responseData += chunk;
            });
            
            res.on('end', () => {
              try {
                const response = JSON.parse(responseData);
                resolve(response);
              } catch (err) {
                reject(err);
              }
            });
          });
          
          request.on('error', reject);
          request.write(data);
          request.end();
        });
      },
      
      async execute(action: string, args: any[]): Promise<any> {
        // Execute action on the driver
        return new Promise((resolve, reject) => {
          const data = JSON.stringify({
            action,
            args
          });
          
          const options = {
            hostname: 'localhost',
            port,
            path: '/execute',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': data.length
            }
          };
          
          const request = http.request(options, (res) => {
            if (res.statusCode !== 200) {
              reject(new Error(`Execute request failed with status: ${res.statusCode}`));
              return;
            }
            
            let responseData = '';
            res.on('data', (chunk) => {
              responseData += chunk;
            });
            
            res.on('end', () => {
              try {
                const response = JSON.parse(responseData);
                resolve(response);
              } catch (err) {
                reject(err);
              }
            });
          });
          
          request.on('error', reject);
          request.write(data);
          request.end();
        });
      },
      
      async shutdown(): Promise<void> {
        // Shutdown the driver
        try {
          return new Promise((resolve) => {
            const request = http.get(`http://localhost:${port}/shutdown`, () => {
              resolve();
            });
            
            request.on('error', () => {
              resolve(); // Resolve anyway on error
            });
            
            request.end();
            
            // Resolve after timeout regardless of response
            setTimeout(resolve, 1000);
          });
        } finally {
          // Kill the process regardless of shutdown request success
          const processInfo = DriverRegistry.getInstance().getDriverProcess(driverId);
          if (processInfo) {
            try {
              processInfo.process.kill();
              log.debug(`Killed driver process: ${driverId}`);
            } catch (e) {
              log.warn(`Error killing driver process: ${driverId}`, { error: e });
            }
          }
        }
      }
    };
  }
  
  /**
   * Allocate a port for a driver
   */
  private allocatePort(): number {
    // Simple port allocation strategy
    return this.portCounter++;
  }
  
  /**
   * Check if a driver is running
   */
  public isDriverRunning(driverId: string): boolean {
    const processInfo = this.processes.get(driverId);
    return !!processInfo && processInfo.status === 'running';
  }
  
  /**
   * Get a driver process info
   */
  public getDriverProcess(driverId: string): DriverProcessInfo | undefined {
    return this.processes.get(driverId);
  }
  
  /**
   * Get a list of all running drivers
   */
  public getRunningDrivers(): string[] {
    return Array.from(this.processes.keys());
  }
  
  /**
   * Stop all running drivers
   */
  public async stopAllDrivers(): Promise<void> {
    const driverIds = Array.from(this.processes.keys());
    
    for (const driverId of driverIds) {
      try {
        const driverInterface = this.createDriverInterface(driverId);
        await driverInterface.shutdown();
      } catch (error) {
        this.log.warn(`Error stopping driver ${driverId}: ${error}`);
      }
    }
  }

  /**
   * Verify driver folders and update the bin/driver-manifest.json
   */
  async verifyDrivers(): Promise<void> {
    const manifestPath = path.join(process.cwd(), 'bin', 'driver-manifest.json');
    if (!fs.existsSync(manifestPath)) {
      fs.writeFileSync(manifestPath, JSON.stringify({ drivers: [] }, null, 2), 'utf8');
    }
    // Treat manifest as having a drivers array of any
    interface Manifest { drivers: any[] }
    const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!Array.isArray(manifest.drivers)) manifest.drivers = [];

    const scanDirs = [ path.join(process.cwd(), 'bin', 'drivers'), path.join(process.cwd(), 'drivers') ];
    for (const dir of scanDirs) {
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        const drvPath = path.join(dir, name);
        if (!fs.statSync(drvPath).isDirectory()) continue;

        let info: any = { name, path: drvPath };
        const jsonPath = path.join(drvPath, 'driver.json');
        if (fs.existsSync(jsonPath)) {
          try { Object.assign(info, JSON.parse(fs.readFileSync(jsonPath, 'utf8'))); } catch {}
        }

        const exe = info.executable || 'index.js';
        info.executable = fs.existsSync(path.join(drvPath, exe)) ? exe : info.executable;

        // explicit any for callback parameter
        const idx = manifest.drivers.findIndex((d: any) =>
          d.name === name || path.normalize(d.path) === drvPath
        );
        if (idx >= 0) manifest.drivers[idx] = { ...manifest.drivers[idx], ...info };
        else manifest.drivers.push(info);
      }
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`Verified drivers, manifest updated.`);
  }
}

if (require.main === module) {
  const registry = DriverRegistry.getInstance();
  const arg = process.argv[2];
  if (arg === 'verify') {
    registry.verifyDrivers().catch(err => {
      console.error('Driver verification failed:', err);
      process.exit(1);
    });
  } else {
    console.log('Usage: ts-node src/drivers/driverRegistry.ts verify');
  }
}

/**
 * Helper function to load drivers from a directory
 */
export async function loadDriversFromDirectory(directory: string): Promise<void> {
  const registry = DriverRegistry.getInstance();
  
  if (!fs.existsSync(directory)) {
    console.warn(`Driver directory not found: ${directory}`);
    return;
  }
  
  console.log(`Loading drivers from ${directory}`);
  await registry.discoverDrivers();
}
