import { spawn, ChildProcess } from 'child_process';
import { Logger } from '../../utils/logger';
import { DriverStartupError, DriverCommunicationError } from '../../utils/errors';
import path from 'path';
import net from 'net';

export interface ProcessInfo {
  pid: number;
  port: number;
  process: ChildProcess;
  driverId: string;
  startTime: Date;
}

export interface DriverMetadata {
  id: string;
  name: string;
  executable: string;
  path: string;
  config?: {
    transport?: string;
    [key: string]: any;
  };
}

export class DriverProcessManager {
  private static instance: DriverProcessManager;
  private processes = new Map<string, ProcessInfo>();
  private log: Logger;  private portRange = { min: 49152, max: 65535 }; // Ephemeral port range
  private constructor() {
    const loggerInstance = Logger.getInstance();
    // Safety check for createChildLogger method during cleanup
    if (typeof loggerInstance.createChildLogger === 'function') {
      this.log = loggerInstance.createChildLogger({
        component: 'DriverProcessManager'
      });
    } else {
      // Fallback to main logger instance if createChildLogger is not available
      this.log = loggerInstance;
    }
  }

  static getInstance(): DriverProcessManager {
    if (!DriverProcessManager.instance) {
      DriverProcessManager.instance = new DriverProcessManager();
    }
    return DriverProcessManager.instance;
  }

  async startDriver(metadata: DriverMetadata): Promise<ProcessInfo> {
    const traceId = this.log.startTrace(`start-driver-${metadata.id}`);
    
    try {
      this.log.debug('Starting driver process', { traceId, driverId: metadata.id, executable: metadata.executable });

      // Find available port
      const port = await this.findAvailablePort();
      
      // Build executable path
      const executablePath = path.resolve(metadata.path, metadata.executable);
        this.log.debug('Spawning driver process', { 
        traceId, 
        driverId: metadata.id, 
        executablePath, 
        port 
      });      // Determine command and arguments based on file extension
      let command: string;
      let args: string[];
      
      if (metadata.executable.endsWith('.js')) {
        // For Node.js files, use node as the command
        command = process.platform === 'win32' ? 'node.exe' : 'node';
        args = [executablePath, '--port', port.toString()];
      } else if (metadata.executable.endsWith('.exe')) {
        // For executables, run directly
        command = executablePath;
        args = ['--port', port.toString()];
      } else {
        // Default to trying to execute directly
        command = executablePath;
        args = ['--port', port.toString()];
      }

      // Spawn the driver process with shell option for Windows
      const childProcess = spawn(command, args, {
        env: {
          ...process.env,
          RUNIX_DRIVER_PORT: port.toString(),
          RUNIX_DRIVER_INSTANCE_ID: `${metadata.id}-${Date.now()}`,
          RUNIX_DRIVER_LOG_LEVEL: 'info'
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
        shell: process.platform === 'win32' // Use shell on Windows to resolve executables
      });

      const processInfo: ProcessInfo = {
        pid: childProcess.pid!,
        port,
        process: childProcess,
        driverId: metadata.id,
        startTime: new Date()
      };

      // Set up process event handlers
      this.setupProcessHandlers(processInfo, traceId);

      // Wait for process to be ready
      await this.waitForDriverReady(processInfo, traceId);

      // Store process info
      this.processes.set(metadata.id, processInfo);

      this.log.info('Driver process started successfully', {
        traceId,
        driverId: metadata.id,
        pid: processInfo.pid,
        port: processInfo.port
      });

      return processInfo;

    } catch (error) {
      this.log.error('Failed to start driver process', { traceId, driverId: metadata.id }, error);
      throw new DriverStartupError(metadata.id, { 
        executable: metadata.executable,
        traceId 
      }, error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.log.endTrace(traceId);
    }
  }

  async stopDriver(driverId: string): Promise<void> {
    const traceId = this.log.startTrace(`stop-driver-${driverId}`);
    
    try {
      const processInfo = this.processes.get(driverId);
      if (!processInfo) {
        this.log.warn('Driver process not found', { traceId, driverId });
        return;
      }

      this.log.debug('Stopping driver process', { 
        traceId, 
        driverId, 
        pid: processInfo.pid 
      });

      // Try graceful shutdown first
      processInfo.process.kill('SIGTERM');

      // Wait for process to exit
      await this.waitForProcessExit(processInfo.process, 5000);

      this.processes.delete(driverId);

      this.log.info('Driver process stopped successfully', {
        traceId,
        driverId,
        pid: processInfo.pid
      });

    } catch (error) {
      this.log.error('Failed to stop driver process', { traceId, driverId }, error);
      throw new DriverCommunicationError(driverId, 'shutdown', { traceId }, error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.log.endTrace(traceId);
    }
  }

  getProcessInfo(driverId: string): ProcessInfo | undefined {
    return this.processes.get(driverId);
  }

  getAllProcesses(): Map<string, ProcessInfo> {
    return new Map(this.processes);
  }

  // Add alias methods for backward compatibility
  getDriverProcess(driverId: string): ProcessInfo | undefined {
    return this.getProcessInfo(driverId);
  }

  listRunningDrivers(): string[] {
    return Array.from(this.processes.keys());
  }
  async stopAllDrivers(): Promise<void> {
    // Safely start trace if method exists
    const traceId = typeof this.log.startTrace === 'function' ? this.log.startTrace('stop-all-drivers') : 'stop-all-drivers';
    
    try {
      const stopPromises = Array.from(this.processes.keys()).map(driverId => 
        this.stopDriver(driverId).catch(error => {
          this.log.error('Failed to stop driver during cleanup', { traceId, driverId }, error);
        })
      );

      await Promise.all(stopPromises);
      
      this.log.info('All driver processes stopped', { traceId, processCount: stopPromises.length });
    } finally {
      // Safely end trace if method exists
      if (typeof this.log.endTrace === 'function') {
        this.log.endTrace(traceId);
      }
    }
  }

  private async findAvailablePort(): Promise<number> {
    for (let i = 0; i < 100; i++) {
      const port = Math.floor(Math.random() * (this.portRange.max - this.portRange.min + 1)) + this.portRange.min;
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }
    throw new Error('No available ports found in ephemeral range');
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(true));
      });
      server.on('error', () => resolve(false));
    });
  }

  private setupProcessHandlers(processInfo: ProcessInfo, traceId: string): void {
    const { process: childProcess, driverId } = processInfo;

    childProcess.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        this.log.debug(`Driver stdout [${driverId}]`, { traceId, output });
      }
    });

    childProcess.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        this.log.warn(`Driver stderr [${driverId}]`, { traceId, output });
      }
    });

    childProcess.on('exit', (code, signal) => {
      this.log.info('Driver process exited', { 
        traceId, 
        driverId, 
        pid: processInfo.pid,
        code, 
        signal 
      });
      this.processes.delete(driverId);
    });

    childProcess.on('error', (error) => {
      this.log.error('Driver process error', { traceId, driverId, pid: processInfo.pid }, error);
      this.processes.delete(driverId);
    });
  }

  private async waitForDriverReady(processInfo: ProcessInfo, traceId: string): Promise<void> {
    const maxWaitTime = 30000; // 30 seconds
    const checkInterval = 500; // 500ms
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Try to connect to the driver port
        const isReady = await this.checkDriverReady(processInfo.port);
        if (isReady) {
          this.log.debug('Driver process ready', { 
            traceId, 
            driverId: processInfo.driverId,
            port: processInfo.port,
            waitTime: Date.now() - startTime
          });
          return;
        }
      } catch (error) {
        // Ignore connection errors during startup
      }

      // Check if process is still running
      if (processInfo.process.killed || processInfo.process.exitCode !== null) {
        throw new Error(`Driver process exited unexpectedly with code ${processInfo.process.exitCode}`);
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    throw new Error(`Driver failed to become ready within ${maxWaitTime}ms`);
  }

  private async checkDriverReady(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      
      socket.connect(port, '127.0.0.1', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => resolve(false));
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  private waitForProcessExit(process: ChildProcess, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        process.kill('SIGKILL');
        reject(new Error('Process did not exit gracefully, killed forcefully'));
      }, timeoutMs);

      process.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}
