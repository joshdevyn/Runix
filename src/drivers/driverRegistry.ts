import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { findExecutable } from '../utils/executableFinder';
import { DriverProcessManager } from './driverProcessManager';
import { DriverError, DriverStartupError, ConfigurationError } from '../utils/errors';

export interface DriverMetadata {
  id: string;
  name: string;
  version: string;
  path: string;
  executable?: string;
  config?: any;
}

export interface StepDefinition {
  id: string;
  pattern: string;
  action: string;
  description?: string;
}

/**
 * Singleton registry for managing automation drivers
 */
export class DriverRegistry {
  private static instance: DriverRegistry;
  private drivers: Map<string, DriverMetadata> = new Map();
  private processes: Map<string, any> = new Map();
  private log: Logger;
  private initialized = false;
  private discovering = false;

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
   * Initialize the registry with driver discovery
   */
  public async initialize(): Promise<void> {
    const traceId = this.log.logMethodEntry('initialize', { component: 'DriverRegistry' });
    
    try {
      if (this.initialized) {
        this.log.debug('Driver registry already initialized', { traceId });
        this.log.logMethodExit('initialize', traceId, { alreadyInitialized: true });
        return;
      }
      
      if (this.discovering) {
        this.log.debug('Driver discovery already in progress, waiting...', { traceId });
        // Wait for current discovery to complete
        let waitCount = 0;
        while (this.discovering) {
          await new Promise(resolve => setTimeout(resolve, 100));
          waitCount++;
          if (waitCount % 10 === 0) { // Log every second
            this.log.trace('Still waiting for driver discovery to complete', { 
              traceId, 
              waitTimeSeconds: waitCount / 10 
            });
          }
          if (waitCount > 100) { // 10 second timeout
            throw new ConfigurationError('Driver discovery timeout', { 
              operation: 'driver_discovery_wait',
              traceId
            });
          }
        }
        this.log.debug('Driver discovery wait completed', { traceId, waitTimeSeconds: waitCount / 10 });
        this.log.logMethodExit('initialize', traceId, { waitedForDiscovery: true });
        return;
      }

      this.discovering = true;
      try {
        await this.discoverDrivers();
        this.initialized = true;
        this.log.info(`Driver registry initialized successfully`, { 
          traceId,
          component: 'DriverRegistry',
          driversDiscovered: this.drivers.size
        }, {
          discoveredDrivers: Array.from(this.drivers.keys())
        });
        
        this.log.logMethodExit('initialize', traceId, { 
          driversDiscovered: this.drivers.size,
          initialized: true
        });
      } finally {
        this.discovering = false;
      }
    } catch (error) {
      this.discovering = false;
      this.log.logMethodError('initialize', traceId, error instanceof Error ? error : new Error(String(error)), {
        component: 'DriverRegistry'
      });
      throw error;
    }
  }

  /**
   * Discover all available drivers with caching
   */
  private async discoverDrivers(): Promise<void> {
    const traceId = this.log.startTrace('driver-discovery');
    
    try {
      if (this.drivers.size > 0) {
        this.log.debug('Drivers already discovered, skipping discovery', { 
          traceId,
          existingDriverCount: this.drivers.size 
        });
        return;
      }

      this.log.debug('Starting driver discovery process', { traceId });
      
      const searchPaths = [
        path.join(process.cwd(), 'drivers'),
        path.join(path.dirname(process.execPath), 'drivers'),
        path.join(__dirname, '..', '..', 'drivers'),
        path.join(__dirname, '..', '..', 'bin', 'drivers')
      ];

      // Add custom driver directory from environment
      const customDriverDir = process.env.RUNIX_DRIVER_DIR;
      if (customDriverDir) {
        searchPaths.push(customDriverDir);
        this.log.debug('Added custom driver directory from environment', { 
          traceId,
          customDriverDir 
        });
      }

      this.log.debug('Driver discovery search paths configured', { 
        traceId,
        searchPaths,
        totalPaths: searchPaths.length
      });

      let totalDriversFound = 0;
      for (let i = 0; i < searchPaths.length; i++) {
        const searchPath = searchPaths[i];
        const pathTraceId = this.log.startTrace('search-path-scan', { searchPath, pathIndex: i });
        
        try {
          this.log.trace(`Scanning search path ${i + 1}/${searchPaths.length}`, { 
            traceId,
            pathTraceId,
            searchPath,
            pathIndex: i
          });
          
          const driversFoundInPath = await this.loadDriversFromDirectory(searchPath);
          totalDriversFound += driversFoundInPath;
          
          this.log.trace(`Search path scan completed`, { 
            traceId,
            pathTraceId,
            searchPath,
            driversFoundInPath,
            totalDriversFound
          });
        } finally {
          this.log.endTrace(pathTraceId);
        }
      }

      this.log.info('Driver discovery completed', { 
        traceId,
        totalDriversFound,
        searchPathsScanned: searchPaths.length
      }, {
        discoveredDriverIds: Array.from(this.drivers.keys()),
        searchPaths
      });

    } finally {
      this.log.endTrace(traceId);
    }
  }

  /**
   * Load drivers from a directory
   */
  private async loadDriversFromDirectory(dir: string): Promise<number> {
    const traceId = this.log.startTrace('load-drivers-from-directory', { directory: dir });
    let driversLoaded = 0;
    
    try {
      if (!fs.existsSync(dir)) {
        this.log.debug(`Driver directory does not exist, skipping`, { traceId, directory: dir });
        return 0;
      }

      this.log.trace(`Reading directory contents`, { traceId, directory: dir });
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const subdirectories = entries.filter(entry => entry.isDirectory());
      
      this.log.trace(`Found subdirectories`, { 
        traceId,
        directory: dir,
        subdirectoryCount: subdirectories.length,
        subdirectories: subdirectories.map(d => d.name)
      });
      
      for (let i = 0; i < subdirectories.length; i++) {
        const entry = subdirectories[i];
        const driverPath = path.join(dir, entry.name);
        const driverTraceId = this.log.startTrace('load-single-driver', { 
          driverPath,
          driverIndex: i,
          driverName: entry.name
        });
        
        try {
          this.log.trace(`Loading driver ${i + 1}/${subdirectories.length}`, { 
            traceId,
            driverTraceId,
            driverPath,
            driverName: entry.name
          });
          
          const metadata = await this.loadDriverMetadata(driverPath);
          if (metadata) {
            this.drivers.set(metadata.id, metadata);
            driversLoaded++;
            this.log.debug(`Driver loaded successfully`, { 
              traceId,
              driverTraceId,
              driverId: metadata.id,
              driverName: metadata.name,
              driverPath
            });
          } else {
            this.log.warn(`Failed to load driver metadata`, { 
              traceId,
              driverTraceId,
              driverPath,
              driverName: entry.name
            });
          }
        } catch (error) {
          this.log.error(`Error loading individual driver`, { 
            traceId,
            driverTraceId,
            driverPath,
            driverName: entry.name
          }, error);
        } finally {
          this.log.endTrace(driverTraceId);
        }
      }

      this.log.debug(`Directory scan completed`, { 
        traceId,
        directory: dir,
        driversLoaded,
        subdirectoriesScanned: subdirectories.length
      });

      return driversLoaded;

    } catch (error) {
      this.log.error(`Error loading drivers from directory`, { traceId, directory: dir }, error);
      return 0;
    } finally {
      this.log.endTrace(traceId);
    }
  }

  /**
   * Load driver metadata from directory
   */
  private async loadDriverMetadata(driverPath: string): Promise<DriverMetadata | null> {
    const traceId = this.log.startTrace('load-driver-metadata', { driverPath });
    
    try {
      const manifestPath = path.join(driverPath, 'driver.json');
      
      this.log.trace('Checking for driver manifest', { traceId, manifestPath });
      
      if (!fs.existsSync(manifestPath)) {
        this.log.debug(`No driver.json found`, { traceId, driverPath, manifestPath });
        return null;
      }

      this.log.trace('Reading driver manifest', { traceId, manifestPath });
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      
      this.log.trace('Parsing driver manifest', { traceId, manifestPath, contentLength: manifestContent.length });
      const manifest = JSON.parse(manifestContent);
      
      // Get executable from manifest or try to find one
      let executable = manifest.executable;
      if (!executable) {
        this.log.trace('No executable specified in manifest, searching for default', { traceId, driverPath });
        executable = findExecutable(driverPath);
      } else {
        this.log.trace('Using executable from manifest', { traceId, driverPath, manifestExecutable: executable });
        // Verify the specified executable exists
        const executablePath = path.join(driverPath, executable);
        if (!fs.existsSync(executablePath)) {
          this.log.warn('Specified executable not found, searching for alternatives', { 
            traceId, 
            driverPath, 
            specifiedExecutable: executable 
          });
          executable = findExecutable(driverPath) || executable;
        }
      }
      
      const metadata: DriverMetadata = {
        id: manifest.id || path.basename(driverPath),
        name: manifest.name || 'Unknown Driver',
        version: manifest.version || '1.0.0',
        path: driverPath,
        executable,
        config: manifest.config || {}
      };

      this.log.debug('Driver metadata loaded successfully', { traceId, driverPath }, {
        metadata: {
          id: metadata.id,
          name: metadata.name,
          version: metadata.version,
          executable: metadata.executable,
          hasConfig: !!metadata.config && Object.keys(metadata.config).length > 0
        }
      });

      return metadata;

    } catch (error) {
      this.log.error(`Error loading driver metadata`, { traceId, driverPath }, error);
      return null;
    } finally {
      this.log.endTrace(traceId);
    }
  }

  /**
   * Start a driver instance
   */
  public async startDriver(driverId: string): Promise<any> {
    if (this.processes.has(driverId)) {
      return this.processes.get(driverId)!;
    }

    const metadata = this.drivers.get(driverId);
    if (!metadata) {
      throw new Error(`Driver not found: ${driverId}`);
    }

    this.log.debug(`Starting driver: ${driverId}`);
    
    const instance = await this.createDriverInstance(metadata);
    this.processes.set(driverId, instance);
    
    return instance;
  }

  /**
   * Create a driver instance using the process manager
   */
  private async createDriverInstance(metadata: DriverMetadata): Promise<any> {
    const processManager = DriverProcessManager.getInstance();
    
    // Start the driver process
    const processInfo = await processManager.startDriver(metadata);
    
    // Create the appropriate driver instance based on transport type
    const transport = metadata.config?.transport || 'websocket';
    
    switch (transport) {
      case 'websocket':
        const { WebSocketDriverInstance } = await import('./transport/websocket.driver');
        const wsInstance = new WebSocketDriverInstance(metadata, processInfo.port);
        await wsInstance.start(); // Initialize the connection
        return wsInstance;
        
      case 'http':
        const { HttpDriverInstance } = await import('./transport/http.driver');
        const httpInstance = new HttpDriverInstance(metadata, processInfo.port);
        await httpInstance.start(); // Initialize the connection
        return httpInstance;
        
      default:
        throw new Error(`Unsupported transport type: ${transport}`);
    }
  }

  /**
   * Get driver metadata
   */
  public getDriver(driverId: string): DriverMetadata | undefined {
    return this.drivers.get(driverId);
  }

  /**
   * List all driver IDs
   */
  public listDriverIds(): string[] {
    return Array.from(this.drivers.keys());
  }

  /**
   * Stop a running driver
   */
  public async stopDriver(driverId: string): Promise<void> {
    const traceId = this.log.logMethodEntry('stopDriver', { 
      component: 'DriverRegistry',
      driverId 
    });
    
    try {
      const instance = this.processes.get(driverId);
      if (!instance) {
        this.log.debug('Driver not running, nothing to stop', { traceId, driverId });
        this.log.logMethodExit('stopDriver', traceId, { driverId, wasRunning: false });
        return;
      }

      this.log.debug('Stopping driver instance', { traceId, driverId });
      
      // Stop the driver instance if it has a stop method
      if (typeof instance.stop === 'function') {
        await instance.stop();
        this.log.trace('Driver instance stopped', { traceId, driverId });
      }

      // Clean up the process using the process manager
      const processManager = DriverProcessManager.getInstance();
      await processManager.stopDriver(driverId);
      
      // Remove from our processes map
      this.processes.delete(driverId);
      
      this.log.info('Driver stopped successfully', { 
        traceId,
        component: 'DriverRegistry',
        driverId
      });
      
      this.log.logMethodExit('stopDriver', traceId, { driverId, success: true });
      
    } catch (error) {
      this.log.logMethodError('stopDriver', traceId, error instanceof Error ? error : new Error(String(error)), {
        component: 'DriverRegistry',
        driverId
      });
      throw error;
    }
  }

  /**
   * Stop all running drivers
   */
  public async stopAllDrivers(): Promise<void> {
    const traceId = this.log.logMethodEntry('stopAllDrivers', { 
      component: 'DriverRegistry',
      runningDriverCount: this.processes.size
    });
    
    try {
      const runningDriverIds = Array.from(this.processes.keys());
      this.log.debug('Stopping all running drivers', { 
        traceId,
        runningDriverIds,
        count: runningDriverIds.length
      });
      
      // Stop all drivers in parallel
      await Promise.all(
        runningDriverIds.map(driverId => 
          this.stopDriver(driverId).catch(error => {
            this.log.error(`Failed to stop driver ${driverId}`, { traceId, driverId }, error);
          })
        )
      );
      
      this.log.info('All drivers stopped', { 
        traceId,
        component: 'DriverRegistry',
        stoppedCount: runningDriverIds.length
      });
      
      this.log.logMethodExit('stopAllDrivers', traceId, { 
        stoppedCount: runningDriverIds.length 
      });
      
    } catch (error) {
      this.log.logMethodError('stopAllDrivers', traceId, error instanceof Error ? error : new Error(String(error)), {
        component: 'DriverRegistry'
      });
      throw error;
    }
  }

  /**
   * Check if a driver is currently running
   */
  public isDriverRunning(driverId: string): boolean {
    return this.processes.has(driverId);
  }

  /**
   * Get list of currently running driver IDs
   */
  public getRunningDriverIds(): string[] {
    return Array.from(this.processes.keys());
  }
}
