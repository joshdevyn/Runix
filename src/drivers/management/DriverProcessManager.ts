import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { DriverMetadata } from '../driverRegistry';
import { findExecutable } from '../../utils/executableFinder';

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
  private nextPort: number = 9000;

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
   * Start a driver process
   */
  public async startDriver(driver: DriverMetadata): Promise<DriverProcessInfo> {
    // Check if driver is already running
    if (this.processes.has(driver.id)) {
      return this.processes.get(driver.id)!;
    }

    // Assign a port for the driver
    const port = this.getNextAvailablePort();

    // Determine the executable path
    const executablePath = await this.resolveDriverExecutable(driver);
    
    // Setup command and arguments properly
    let command: string;
    let args: string[];
    
    // For JavaScript files, use Node.js
    if (executablePath.endsWith('.js')) {
      command = 'node';
      // Just use the executable path directly, don't include it in directory again
      args = [executablePath];
      
      // Add any additional arguments
      if (driver.args && driver.args.length > 0) {
        args = [...args, ...driver.args];
      }
      
      // Add port argument
      args.push('--port', port.toString());
    } else {
      // For native executables
      command = executablePath;
      args = ['--port', port.toString()];
    }

    // Set up environment variables for the driver
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      RUNIX_DRIVER_PORT: port.toString(),
      RUNIX_DRIVER_INSTANCE_ID: driver.id,
      RUNIX_DRIVER_LOG_LEVEL: process.env.RUNIX_LOG_LEVEL || 'info'
    };

    console.log(`Starting driver ${driver.name} on port ${port}`);
    console.log(`Command: ${command} ${args.join(' ')}`);
    console.log(`Working directory: ${driver.directory}`);

    // Start the driver process with correct directory
    const childProcess = spawn(command, args, {
      env,
      cwd: driver.directory,
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
        console.log(`[${driver.name}] ${data.toString().trim()}`);
      });
    }
    
    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        console.error(`[${driver.name}] ${data.toString().trim()}`);
      });
    }

    // Handle process exit
    childProcess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      console.log(`Driver ${driver.name} exited with code ${code} and signal ${signal}`);
      this.processes.delete(driver.id);
    });

    // Wait for the driver to start and become responsive
    await this.waitForDriverStart(port, driver.transport || 'default');
    console.log(`Driver ${driver.name} started successfully`);

    return processInfo;
  }

  /**
   * Shut down a driver process
   */
  public async shutdownDriver(driverId: string): Promise<void> {
    const processInfo = this.processes.get(driverId);
    if (!processInfo) {
      console.log(`No running process found for driver ${driverId}`);
      return;
    }

    console.log(`Shutting down driver ${processInfo.metadata.name}`);
    
    try {
      // Try graceful shutdown
      processInfo.process.kill('SIGTERM');
      
      // Wait for process to exit
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          console.warn(`Driver ${driverId} did not shut down gracefully, forcing termination`);
          processInfo.process.kill('SIGKILL');
          resolve();
        }, 5000);

        processInfo.process.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.processes.delete(driverId);
      console.log(`Driver ${driverId} shut down successfully`);
    } catch (err) {
      console.error(`Error shutting down driver ${driverId}:`, err);
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
   * Get the next available port for a driver
   */
  private getNextAvailablePort(): number {
    // Simple port allocation strategy
    // In a real implementation, we would check if the port is actually available
    return this.nextPort++;
  }

  /**
   * Resolve the path to the driver executable
   */
  private async resolveDriverExecutable(driver: DriverMetadata): Promise<string> {
    // Try multiple locations for finding the driver executable
    const driverDir = driver.directory;
    if (!driverDir) {
      throw new Error(`Driver directory not specified for driver ${driver.name}`);
    }

    // Check if we have an executable directly specified
    if (driver.executable) {
      const executablePath = path.join(driverDir, driver.executable);
      if (fs.existsSync(executablePath)) {
        return executablePath;
      }
      
      // For platform-specific executables
      const platformExec = `${driver.executable}${process.platform === 'win32' ? '.exe' : ''}`;
      const platformPath = path.join(driverDir, platformExec);
      if (fs.existsSync(platformPath)) {
        return platformPath;
      }
    }

    // Look for standard executables
    const standardExecutables = [
      'index.js',
      `${driver.name.toLowerCase()}.exe`,
      `${driver.name.toLowerCase()}`,
      'driver.exe',
      'driver'
    ];

    for (const exe of standardExecutables) {
      const exePath = path.join(driverDir, exe);
      if (fs.existsSync(exePath)) {
        return exePath;
      }
    }

    throw new Error(`Could not find executable for driver ${driver.name}`);
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
    // In a real implementation, we would poll the driver endpoint
    // For now, we'll just wait a fixed time
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
