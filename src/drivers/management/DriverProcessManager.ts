import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';
import { DriverMetadata } from '../driverRegistry';
import { findExecutable } from '../../utils/executableFinder';
import { Logger, LogContext } from '../../utils/logger';

/**
 * Information about a running driver process
 */
export interface DriverProcessInfo {
  id: string;
  process: ChildProcess;
  port: number;
  metadata: DriverMetadata;
  startTime: Date;
}

/**
 * Manages the lifecycle of driver processes
 */
export class DriverProcessManager {
  private static instance: DriverProcessManager;
  private processes: Map<string, DriverProcessInfo> = new Map();
  private logger = Logger.getInstance();

  private constructor() {}

  /**
   * Get the singleton instance
   */
  public static getInstance(): DriverProcessManager {
    if (!DriverProcessManager.instance) {
      DriverProcessManager.instance = new DriverProcessManager();
    }
    return DriverProcessManager.instance;
  }

  /**
   * Get an available ephemeral port from the OS
   */
  private async getAvailablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(0, () => {
        const port = (server.address() as net.AddressInfo)?.port;
        server.close(() => {
          if (port) {
            resolve(port);
          } else {
            reject(new Error('Failed to get available port'));
          }
        });
      });
      server.on('error', reject);
    });
  }

  /**
   * Start a driver process
   */
  public async startDriver(driver: DriverMetadata): Promise<DriverProcessInfo> {
    // Check if driver is already running
    if (this.processes.has(driver.id)) {
      return this.processes.get(driver.id)!;
    }

    // Get an available ephemeral port from the OS
    const port = await this.getAvailablePort();

    // Determine the executable path - ensure both path and executable are defined
    if (!driver.path) {
      throw new Error(`Driver ${driver.id} has no path defined`);
    }
    if (!driver.executable) {
      throw new Error(`Driver ${driver.id} has no executable defined`);
    }
    
    const executablePath = path.join(driver.path, driver.executable);
    
    // Setup command and arguments properly
    let command: string;
    let args: string[];
    
    // Get args from config or provide default
    const driverArgs = driver.config?.args || [];
    
    // For JavaScript files, use Node.js
    if (driver.executable.endsWith('.js')) {
      // Verify the JavaScript file exists
      if (!fs.existsSync(executablePath)) {
        throw new Error(`JavaScript file not found: ${executablePath} for driver ${driver.id}`);
      }
      
      command = 'node';
      args = [executablePath];
      
      // Add any additional arguments
      if (driverArgs.length > 0) {
        args = [...args, ...driverArgs];
      }
      
      // Add port argument
      args.push('--port', port.toString());
    } else {
      // For native executables
      // Verify the executable exists
      if (!fs.existsSync(executablePath)) {
        throw new Error(`Executable not found: ${executablePath} for driver ${driver.id}`);
      }
      
      command = executablePath;
      args = [...driverArgs, '--port', port.toString()];
    }

    // Set up environment variables for the driver
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      RUNIX_DRIVER_PORT: port.toString(),
      RUNIX_DRIVER_INSTANCE_ID: driver.id,
      RUNIX_DRIVER_LOG_LEVEL: process.env.RUNIX_LOG_LEVEL || 'info'
    };

    this.logger.info(`Starting driver ${driver.name} on ephemeral port ${port}`);
    this.logger.info(`Command: ${command} ${args.join(' ')}`);
    this.logger.info(`Working directory: ${driver.path}`);

    // Start the driver process with correct directory
    const childProcess = spawn(command, args, {
      env,
      cwd: driver.path,
      stdio: 'pipe'
    });

    // Store process information
    const processInfo: DriverProcessInfo = {
      id: driver.id,
      process: childProcess,
      port,
      metadata: driver,
      startTime: new Date()
    };
    this.processes.set(driver.id, processInfo);

    // Set up logging
    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data: Buffer) => {
        this.logger.info(`[${driver.name}] ${data.toString().trim()}`);
      });
    }
    
    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        this.logger.error(`[${driver.name}] ${data.toString().trim()}`);
      });
    }

    // Handle process exit
    childProcess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      this.logger.info(`Driver ${driver.name} exited with code ${code} and signal ${signal}`);
      this.processes.delete(driver.id);
    });

    // Wait for the driver to start and become responsive
    const transportType = driver.config?.transport || 'websocket';
    await this.waitForDriverStart(port, transportType);
    this.logger.info(`Driver ${driver.name} started successfully on port ${port}`);

    return processInfo;
  }

  /**
   * Shut down a driver process
   */
  public async shutdownDriver(driverId: string): Promise<void> {
    const processInfo = this.processes.get(driverId);
    if (!processInfo) {
      this.logger.info(`No running process found for driver ${driverId}`);
      return;
    }

    this.logger.info(`Shutting down driver ${processInfo.metadata.name}`);
    
    try {
      // Try graceful shutdown
      processInfo.process.kill('SIGTERM');
      
      // Wait for process to exit
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          this.logger.warn(`Driver ${driverId} did not shut down gracefully, forcing termination`);
          processInfo.process.kill('SIGKILL');
          resolve();
        }, 5000);

        processInfo.process.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.processes.delete(driverId);
      this.logger.info(`Driver ${driverId} shut down successfully`);
    } catch (err) {
      this.logger.error(`Error shutting down driver ${driverId}:`, { driverId }, err);
      throw err;
    }
  }

  /**
   * Check if a driver is running
   */
  public isDriverRunning(driverId: string): boolean {
    return this.processes.has(driverId);
  }

  /**
   * Get information about a running driver process
   */
  public getDriverProcess(driverId: string): DriverProcessInfo | undefined {
    return this.processes.get(driverId);
  }

  /**
   * Get all running driver processes
   */
  public getAllDriverProcesses(): DriverProcessInfo[] {
    return Array.from(this.processes.values());
  }

  /**
   * Resolve the path to the driver executable
   */
  private async resolveDriverExecutable(driver: DriverMetadata, driverDir: string): Promise<string> {
    const standardExecutables = [
      'index.js',
      `${driver.name.toLowerCase()}.exe`,
      `${driver.name.toLowerCase()}`,
      'driver.exe',
      'driver',
      'driver.js',
      `${driver.name}.exe`,
      `${driver.name}`
    ];

    for (const exe of standardExecutables) {
      const foundPath = findExecutable(exe, driverDir);
      if (foundPath) {
        return foundPath;
      }
    }

    throw new Error(`Could not find executable for driver ${driver.name} in ${driverDir}`);
  }

  /**
   * Find the directory containing the driver
   */
  private findDriverDirectory(driver: DriverMetadata): string | undefined {
    const cwd = process.cwd();
    const possibleDirs = [
      path.join(cwd, 'bin', 'drivers', driver.id),                  // <--- add built drivers location
      path.join(cwd, 'drivers', driver.id),
      path.join(cwd, 'drivers', driver.name.toLowerCase()),
      path.join(__dirname, '..', '..', '..', 'drivers', driver.id),
      path.join(__dirname, '..', '..', '..', 'drivers', driver.name.toLowerCase())
    ];

    for (const dir of possibleDirs) {
      if (fs.existsSync(path.join(dir, 'driver.json'))) {
        return dir;
      }
    }
    return undefined;
  }

  /**
   * Wait for a driver to start up and become responsive
   */
  private async waitForDriverStart(port: number, transport: string): Promise<void> {
    const maxAttempts = 30; // 30 attempts with 100ms intervals = 3 seconds max
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        if (transport === 'websocket') {
          // Try connecting with WebSocket
          const WebSocket = require('ws');
          const ws = new WebSocket(`ws://127.0.0.1:${port}`);
          
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              ws.terminate();
              reject(new Error('Connection timeout'));
            }, 1000);
            
            ws.on('open', () => {
              clearTimeout(timeout);
              ws.terminate();
              resolve();
            });
            
            ws.on('error', (err: Error) => {
              clearTimeout(timeout);
              reject(err);
            });
          });
          
          // Connection successful
          this.logger.debug(`Driver startup verification successful on port ${port}`);
          return;
          
        } else if (transport === 'http') {
          // Try HTTP health check
          const http = require('http');
          await new Promise<void>((resolve, reject) => {
            const req = http.get(`http://127.0.0.1:${port}/health`, (res: any) => {
              if (res.statusCode === 200) {
                resolve();
              } else {
                reject(new Error(`HTTP ${res.statusCode}`));
              }
            });
            
            req.on('error', reject);
            req.setTimeout(1000, () => {
              req.destroy();
              reject(new Error('Request timeout'));
            });
          });
          
          this.logger.debug(`Driver startup verification successful on port ${port}`);
          return;
        }
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw new Error(`Driver failed to start after ${maxAttempts} attempts: ${error}`);
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * Stop a specific driver process
   */
  public async stopDriver(driverId: string): Promise<void> {
    const processInfo = this.processes.get(driverId);
    if (!processInfo) {
      this.logger.debug(`No process found for driver ${driverId}`);
      return;
    }

    this.logger.info(`Stopping driver process: ${driverId}`);
    
    try {
      // Try graceful shutdown first
      processInfo.process.kill('SIGTERM');
      
      // Wait for process to exit gracefully
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          this.logger.warn(`Driver ${driverId} did not shut down gracefully, forcing termination`);
          processInfo.process.kill('SIGKILL');
          resolve();
        }, 5000);

        processInfo.process.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.processes.delete(driverId);
      this.logger.info(`Driver ${driverId} stopped successfully`);
    } catch (error) {
      this.logger.error(`Error stopping driver ${driverId}:`, { driverId }, error);
      throw error;
    }
  }

  /**
   * Stop all running driver processes
   */
  public async stopAll(): Promise<void> {
    this.logger.info('Stopping all driver processes');
    
    const stopPromises = Array.from(this.processes.keys()).map(driverId => 
      this.stopDriver(driverId).catch(error => {
        this.logger.error(`Error stopping driver ${driverId}:`, { driverId }, error);
      })
    );
    
    await Promise.all(stopPromises);
    this.processes.clear();
    this.logger.info('All driver processes stopped');
  }
}
