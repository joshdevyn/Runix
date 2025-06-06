import { Logger } from '../utils/logger';
import { DriverRegistry } from '../drivers/driverRegistry';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const access = promisify(fs.access);

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  main: string;
  drivers?: string[];
  dependencies?: Record<string, string>;
  runixVersion?: string;
  tags?: string[];
}

export interface PluginInfo extends PluginManifest {
  path: string;
  installed: boolean;
  loaded: boolean;
}

export class PluginManager {
  private static instance: PluginManager;
  private logger: Logger;
  private pluginPaths: string[];
  private loadedPlugins: Map<string, PluginInfo>;
  private driverRegistry: DriverRegistry;

  private constructor() {
    this.logger = Logger.getInstance();
    this.pluginPaths = [
      path.join(process.cwd(), 'plugins'),
      path.join(process.cwd(), 'drivers'), // Legacy driver location
      path.join(__dirname, '../../plugins'),
      path.join(__dirname, '../../drivers'), // Legacy driver location
    ];
    this.loadedPlugins = new Map();
    this.driverRegistry = DriverRegistry.getInstance();
  }

  public static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }

  /**
   * Initialize the plugin manager and discover available plugins
   */
  public async initialize(): Promise<void> {
    this.logger.debug('Initializing Plugin Manager');
    
    try {
      await this.discoverPlugins();
      await this.loadEnabledPlugins();
      this.logger.info(`Plugin Manager initialized with ${this.loadedPlugins.size} plugins`);
    } catch (error) {
      this.logger.error('Failed to initialize Plugin Manager', { error });
      throw error;
    }
  }

  /**
   * Discover all available plugins from configured paths
   */
  private async discoverPlugins(): Promise<void> {
    this.logger.debug('Discovering plugins', { paths: this.pluginPaths });

    for (const pluginPath of this.pluginPaths) {
      try {
        await access(pluginPath);
        const items = await readdir(pluginPath);
        
        for (const item of items) {
          const itemPath = path.join(pluginPath, item);
          const itemStat = await stat(itemPath);
          
          if (itemStat.isDirectory()) {
            await this.loadPluginFromDirectory(itemPath);
          }
        }
      } catch (error) {
        // Path doesn't exist or not accessible, skip silently
        this.logger.debug(`Plugin path not accessible: ${pluginPath}`);
      }
    }
  }

  /**
   * Load plugin information from a directory
   */
  private async loadPluginFromDirectory(pluginDir: string): Promise<void> {
    try {
      const manifestPath = path.join(pluginDir, 'plugin.json');
      const driverJsonPath = path.join(pluginDir, 'driver.json');
      
      let manifest: PluginManifest;
      
      // Check for plugin.json first, then fallback to driver.json for legacy drivers
      if (fs.existsSync(manifestPath)) {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } else if (fs.existsSync(driverJsonPath)) {
        // Convert driver.json to plugin format
        const driverConfig = JSON.parse(fs.readFileSync(driverJsonPath, 'utf-8'));
        manifest = this.convertDriverToPlugin(driverConfig, pluginDir);
      } else {
        this.logger.debug(`No manifest found in ${pluginDir}`);
        return;
      }

      const pluginInfo: PluginInfo = {
        ...manifest,
        path: pluginDir,
        installed: true,
        loaded: false
      };

      this.loadedPlugins.set(manifest.name, pluginInfo);
      this.logger.debug(`Discovered plugin: ${manifest.name}`, { pluginInfo });
      
    } catch (error) {
      this.logger.warn(`Failed to load plugin from ${pluginDir}`, { error });
    }
  }

  /**
   * Convert legacy driver.json to plugin format
   */
  private convertDriverToPlugin(driverConfig: any, pluginDir: string): PluginManifest {
    return {
      name: driverConfig.id || path.basename(pluginDir),
      version: driverConfig.version || '1.0.0',
      description: driverConfig.description || 'Legacy driver plugin',
      author: driverConfig.author,
      main: driverConfig.executable || 'index.js',
      drivers: [driverConfig.id || path.basename(pluginDir)],
      tags: ['driver', 'legacy']
    };
  }

  /**
   * Load all enabled plugins
   */
  private async loadEnabledPlugins(): Promise<void> {
    for (const [name, plugin] of this.loadedPlugins) {
      try {
        await this.loadPlugin(name);
      } catch (error) {
        this.logger.warn(`Failed to load plugin ${name}`, { error });
      }
    }
  }

  /**
   * Load a specific plugin
   */
  public async loadPlugin(name: string): Promise<void> {
    const plugin = this.loadedPlugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not found`);
    }

    if (plugin.loaded) {
      this.logger.debug(`Plugin ${name} already loaded`);
      return;
    }

    try {
      // If this plugin contains drivers, register them with the driver registry
      if (plugin.drivers && plugin.drivers.length > 0) {
        for (const driverId of plugin.drivers) {
          await this.registerPluginDriver(plugin, driverId);
        }
      }

      plugin.loaded = true;
      this.logger.info(`Plugin ${name} loaded successfully`);
      
    } catch (error) {
      this.logger.error(`Failed to load plugin ${name}`, { error });
      throw error;
    }
  }

  /**
   * Register a driver from a plugin
   */
  private async registerPluginDriver(plugin: PluginInfo, driverId: string): Promise<void> {
    try {
      // Check if driver is already registered
      if (this.driverRegistry.getDriver(driverId)) {
        this.logger.debug(`Driver ${driverId} already registered`);
        return;
      }

      // Register the driver path with the driver registry
      this.driverRegistry.registerPluginDriver(driverId, plugin.path);
      
      this.logger.debug(`Registered driver ${driverId} from plugin ${plugin.name}`);
    } catch (error) {
      this.logger.warn(`Failed to register driver ${driverId} from plugin ${plugin.name}`, { error });
    }
  }

  /**
   * List all available plugins
   */
  public listPlugins(): PluginInfo[] {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * Get plugin information
   */
  public getPlugin(name: string): PluginInfo | undefined {
    return this.loadedPlugins.get(name);
  }

  /**
   * Install a plugin from a path or URL
   */
  public async installPlugin(source: string): Promise<void> {
    // TODO: Implement plugin installation from various sources
    // - Local path
    // - Git repository
    // - NPM package
    // - ZIP file
    throw new Error('Plugin installation not yet implemented');
  }

  /**
   * Uninstall a plugin
   */
  public async uninstallPlugin(name: string): Promise<void> {
    const plugin = this.loadedPlugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not found`);
    }

    // TODO: Implement plugin removal
    // - Unregister drivers
    // - Remove files (if installed by Runix)
    // - Clean up dependencies
    throw new Error('Plugin uninstallation not yet implemented');
  }

  /**
   * Hot reload a plugin (useful for development)
   */
  public async reloadPlugin(name: string): Promise<void> {
    const plugin = this.loadedPlugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not found`);
    }

    try {
      // Unload plugin first
      if (plugin.loaded) {
        // TODO: Implement proper plugin unloading
        plugin.loaded = false;
      }

      // Reload plugin manifest
      await this.loadPluginFromDirectory(plugin.path);
      
      // Load the plugin again
      await this.loadPlugin(name);
      
      this.logger.info(`Plugin ${name} reloaded successfully`);
    } catch (error) {
      this.logger.error(`Failed to reload plugin ${name}`, { error });
      throw error;
    }
  }

  /**
   * Get plugin health status
   */
  public getPluginHealth(): { total: number; loaded: number; failed: number; } {
    const total = this.loadedPlugins.size;
    const loaded = Array.from(this.loadedPlugins.values()).filter(p => p.loaded).length;
    const failed = total - loaded;

    return { total, loaded, failed };
  }

  /**
   * Enable hot-reloading for development
   */
  public enableHotReload(): void {
    // TODO: Implement file watching for plugin directories
    // Automatically reload plugins when their files change
    this.logger.info('Hot reload enabled for plugins');
  }
}
