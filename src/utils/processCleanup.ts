/**
 * Process cleanup utility for ensuring all Runix driver processes are terminated
 * This module provides a centralized way to register cleanup handlers and ensure
 * that driver processes are always cleaned up, even in crash scenarios.
 */

import { Logger } from './logger';

export class ProcessCleanup {
  private static instance: ProcessCleanup;
  private cleanupHandlers: (() => Promise<void>)[] = [];
  private isRegistered = false;
  private logger: Logger;

  private constructor() {
    this.logger = Logger.getInstance();
  }

  static getInstance(): ProcessCleanup {
    if (!ProcessCleanup.instance) {
      ProcessCleanup.instance = new ProcessCleanup();
    }
    return ProcessCleanup.instance;
  }

  /**
   * Register a cleanup handler that will be called on process exit
   */
  registerCleanupHandler(handler: () => Promise<void>): void {
    this.cleanupHandlers.push(handler);
    
    // Auto-register process handlers on first cleanup registration
    if (!this.isRegistered) {
      this.registerProcessHandlers();
      this.isRegistered = true;
    }
  }

  /**
   * Execute all registered cleanup handlers
   */
  async executeCleanup(reason: string): Promise<void> {
    if (this.cleanupHandlers.length === 0) {
      this.logger.info('No cleanup handlers registered');
      return;
    }

    this.logger.info(`Executing ${this.cleanupHandlers.length} cleanup handlers due to: ${reason}`);
    
    const results = await Promise.allSettled(
      this.cleanupHandlers.map(async (handler, index) => {
        try {
          await handler();
          this.logger.debug(`Cleanup handler ${index + 1} completed successfully`);
        } catch (error) {
          this.logger.error(`Cleanup handler ${index + 1} failed`, { error });
          throw error;
        }
      })
    );

    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      this.logger.warn(`${failed.length} cleanup handlers failed`);
    } else {
      this.logger.info('All cleanup handlers completed successfully');
    }
  }

  /**
   * Emergency cleanup using system commands (fallback when normal cleanup fails)
   */
  async emergencySystemCleanup(): Promise<void> {
    this.logger.warn('Performing emergency system-level cleanup of Runix processes');
    
    try {
      if (process.platform === 'win32') {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        // Kill Runix driver executables
        const driverNames = ['runix', 'AIDriver', 'WebDriver', 'SystemDriver', 'VisionDriver', 'ExampleDriver'];
        for (const name of driverNames) {
          try {
            await execAsync(`taskkill /F /IM ${name}.exe 2>nul`);
            this.logger.debug(`Killed ${name}.exe processes`);
          } catch {
            // Ignore - process might not exist
          }
        }
        
        // Kill Node.js processes running Runix
        try {
          await execAsync(`wmic process where "name='node.exe' and (commandline like '%runix%' or commandline like '%driver%')" call terminate`);
          this.logger.debug('Killed Node.js Runix processes');
        } catch {
          // Ignore
        }
      } else {
        // Unix/Linux/macOS
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        try {
          // Kill by process name
          await execAsync('pkill -9 -f "runix|AIDriver|WebDriver|SystemDriver|VisionDriver|ExampleDriver"');
          await execAsync('pkill -9 -f "node.*driver"');
          this.logger.debug('Killed Runix processes on Unix system');
        } catch {
          // Ignore
        }
      }
    } catch (error) {
      this.logger.error('Emergency system cleanup failed', { error });
    }
  }

  private registerProcessHandlers(): void {
    let isShuttingDown = false;

    const handleExit = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      try {
        await this.executeCleanup(signal);
      } catch (error) {
        this.logger.error(`Cleanup failed during ${signal}`, { error });
        // Fallback to emergency cleanup
        await this.emergencySystemCleanup();
      }

      if (signal !== 'beforeExit') {
        process.exit(signal === 'uncaughtException' || signal === 'unhandledRejection' ? 1 : 0);
      }
    };

    // Register all the signal handlers
    process.on('SIGTERM', () => handleExit('SIGTERM'));
    process.on('SIGINT', () => handleExit('SIGINT'));
    process.on('beforeExit', () => handleExit('beforeExit'));
    process.on('uncaughtException', async (error) => {
      this.logger.error('Uncaught exception, cleaning up...', { error });
      await handleExit('uncaughtException');
    });
    process.on('unhandledRejection', async (reason) => {
      this.logger.error('Unhandled rejection, cleaning up...', { reason });
      await handleExit('unhandledRejection');
    });

    this.logger.info('Process cleanup handlers registered');
  }
}

/**
 * Convenience function to register a driver cleanup handler
 */
export async function registerDriverCleanup(): Promise<void> {
  const cleanup = ProcessCleanup.getInstance();
  
  cleanup.registerCleanupHandler(async () => {
    try {
      const { DriverProcessManager } = await import('../drivers/management/DriverProcessManager');
      const manager = DriverProcessManager.getInstance();
      await manager.emergencyCleanup();
    } catch (error) {
      // If the import fails, try emergency system cleanup
      await cleanup.emergencySystemCleanup();
    }
  });
}
