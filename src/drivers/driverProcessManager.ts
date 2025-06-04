import { spawn, ChildProcess } from 'child_process';
import { Logger } from '../utils/logger';
import { DriverMetadata } from './driverRegistry';
import { DriverStartupError } from '../utils/errors';

export interface ProcessInfo {
  port: number;
  process: ChildProcess;
  pid: number;
}

export class DriverProcessManager {
  private static instance: DriverProcessManager;
  private processes: Map<string, ProcessInfo> = new Map();
  private log: Logger;
  private portCounter = 8000;

  private constructor() {
    this.log = Logger.getInstance().createChildLogger({
      component: 'DriverProcessManager'
    });
  }

  public static getInstance(): DriverProcessManager {
    if (!DriverProcessManager.instance) {
      DriverProcessManager.instance = new DriverProcessManager();
    }
    return DriverProcessManager.instance;
  }

  public async startDriver(metadata: DriverMetadata): Promise<ProcessInfo> {
    const traceId = this.log.startTrace('start-driver', { driverId: metadata.id });
    
    try {
      if (this.processes.has(metadata.id)) {
        const existing = this.processes.get(metadata.id)!;
        this.log.debug('Driver process already running', { traceId, driverId: metadata.id, port: existing.port });
        return existing;
      }

      if (!metadata.executable) {
        throw new DriverStartupError(`No executable found for driver: ${metadata.id}`, {
          operation: 'driver_startup',
          traceId,
          driverId: metadata.id
        });
      }      const port = this.getNextPort();
      this.log.debug('Starting driver process', { traceId, driverId: metadata.id, executable: metadata.executable, port });

      // Set up environment variables for the driver process
      const env = {
        ...process.env,
        RUNIX_DRIVER_PORT: port.toString()
      };

      const childProcess = spawn(metadata.executable, ['--port', port.toString()], {
        cwd: metadata.path,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: env
      });

      const processInfo: ProcessInfo = {
        port,
        process: childProcess,
        pid: childProcess.pid || 0
      };

      this.processes.set(metadata.id, processInfo);

      // Wait for process to start
      await this.waitForProcessStart(childProcess, port);      this.log.info('Driver process started successfully', { 
        traceId, 
        driverId: metadata.id, 
        port, 
        pid: childProcess.pid 
      });

      return processInfo;

    } catch (error) {
      this.log.error('Failed to start driver process', { traceId, driverId: metadata.id }, error);
      throw error;
    } finally {
      this.log.endTrace(traceId);
    }
  }
  private getNextPort(): number {
    // Always use the counter to avoid port conflicts, ignore RUNIX_DRIVER_PORT here
    // The environment variable is used by the driver executable itself
    return this.portCounter++;
  }
  private async waitForProcessStart(process: ChildProcess, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Driver process startup timeout on port ${port}`));
      }, 10000);

      process.on('spawn', () => {
        clearTimeout(timeout);
        // Add a small delay to ensure the driver server is fully started
        setTimeout(() => resolve(), 2000);
      });

      process.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  public async stopDriver(driverId: string): Promise<void> {
    const processInfo = this.processes.get(driverId);
    if (processInfo) {
      processInfo.process.kill();
      this.processes.delete(driverId);
      this.log.debug('Driver process stopped', { driverId, pid: processInfo.pid });
    }
  }

  public async stopAll(): Promise<void> {
    for (const [driverId] of this.processes) {
      await this.stopDriver(driverId);
    }
  }

  public isDriverRunning(driverId: string): boolean {
    return this.processes.has(driverId);
  }

  public getDriverProcess(driverId: string): ProcessInfo | undefined {
    return this.processes.get(driverId);
  }

  public async shutdownDriver(driverId: string): Promise<void> {
    return this.stopDriver(driverId);
  }
}
