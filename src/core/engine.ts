import { parseFeatureFile } from '../parser/parser';
import { DriverRegistry } from '../drivers/driverRegistry';
import { ResultLogger } from '../report/resultLogger';
import { StepResult } from '../report/resultLogger';
import { Database } from '../db/database';
import { Tag, Feature, FeatureChild } from '@cucumber/messages';
import { Logger, LogLevel } from '../utils/logger';
import { env } from '../utils/env';
import { StepRegistry } from '../drivers/stepRegistry';

interface EngineConfig {
  driverName?: string;
  driverConfig?: any;
  tags?: string[];
  databaseConfig?: any;
  reportPath?: string;
  parallelScenarios?: boolean;
  logLevel?: LogLevel;
  logFilePath?: string;
}

const DEFAULT_CONFIG: EngineConfig = {
  // Get values from environment variables or use defaults
  driverName: env.get('DRIVER', 'WebDriver') || 'WebDriver',
  tags: env.get('TAGS')?.split(',') || [],
  parallelScenarios: env.getBoolean('PARALLEL_SCENARIOS', false) || false,
  reportPath: env.get('REPORT_PATH', 'runix-report.json') || 'runix-report.json',
  logLevel: parseLogLevel(env.get('LOG_LEVEL') || 'INFO') || LogLevel.INFO,
  logFilePath: env.get('LOG_FILE', 'logs/runix-engine.log') || 'logs/runix-engine.log'
};

// Helper function to parse log level from string
function parseLogLevel(levelStr: string): LogLevel | undefined {
  switch (levelStr.toUpperCase()) {
    case 'TRACE': return LogLevel.TRACE;
    case 'DEBUG': return LogLevel.DEBUG;
    case 'INFO': return LogLevel.INFO;
    case 'WARN': return LogLevel.WARN;
    case 'ERROR': return LogLevel.ERROR;
    case 'FATAL': return LogLevel.FATAL;
    case 'SILENT': return LogLevel.SILENT;
    default: return undefined;
  }
}

export class RunixEngine {
  private drivers: Map<string, any> = new Map();
  private logger: ResultLogger;
  private log: Logger;
  private config: EngineConfig;
  private initialized = false;
  private executionId: string;

  constructor(config: Partial<EngineConfig> = {}) {
    // First load .env configs, then override with passed config
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = new ResultLogger();
    
    // Try to get logFilePath from ENV if not specified in config
    if (!this.config.logFilePath) {
      this.config.logFilePath = env.get('LOG_FILE');
    }
    
    // Setup the logger with configured options
    this.log = Logger.getInstance({
      level: this.config.logLevel,
      filePath: this.config.logFilePath,
      console: true,
      enableTracing: env.getBoolean('TRACING_ENABLED', true) || true,
      context: { 
        engineId: Math.random().toString(36).substring(2, 10),
        envSource: env.getEnvFilePath() || 'none'
      }
    });
    
    this.executionId = env.get('EXECUTION_ID') || Math.random().toString(36).substring(2, 15);
    this.log.info('Engine instance created', { 
      executionId: this.executionId,
      config: JSON.stringify(this.config)
    });
  }

  async initialize(): Promise<void> {
    const traceId = this.log.startTrace('engine-initialize');
    
    try {
      if (this.initialized) {
        this.log.debug('Engine already initialized, skipping initialization');
        return;
      }
      
      this.log.info('Initializing Runix engine', { executionId: this.executionId });

      // Initialize database if configured
      if (this.config.databaseConfig) {
        this.log.debug('Initializing database connection', { 
          config: JSON.stringify(this.config.databaseConfig) 
        });
        await Database.getInstance().initialize(this.config.databaseConfig);
      }

      // Initialize step registry
      await StepRegistry.getInstance().initialize();
      
      // Instead of just initializing one driver, we'll prepare for multiple drivers
      const driverRegistry = DriverRegistry.getInstance();
      
      // If a default driver is specified, initialize it first
      if (this.config.driverName) {
        const defaultDriver = await this.initializeDriver(this.config.driverName);
        if (defaultDriver) {
          this.drivers.set(this.config.driverName.toLowerCase(), defaultDriver);
        }
      }
      
      this.initialized = true;
      this.log.info('Engine initialization complete', { executionId: this.executionId });
    } catch (error) {
      this.log.error(`Engine initialization failed: ${error}`, {}, traceId);
      throw error;
    } finally {
      this.log.endTrace(traceId);
    }
  }

  /**
   * Initialize a specific driver
   */
  private async initializeDriver(driverName: string): Promise<any> {
    const driverRegistry = DriverRegistry.getInstance();
    const driverMeta = driverRegistry.getDriver(driverName);
    
    if (!driverMeta) {
      this.log.error(`Driver not found: ${driverName}`, { 
        availableDrivers: driverRegistry.listDriverIds().join(',') 
      });
      return null;
    }
    
    const driverId = driverMeta.id;
    this.log.debug('Starting driver', { driverId });
    
    try {
      const driver = await driverRegistry.startDriver(driverId);
      
      // Get driver capabilities
      const capabilities = await driver.start();
      this.log.info(`Started driver: ${capabilities.name} v${capabilities.version}`, {
        supportedActions: capabilities.supportedActions.join(', ')
      });
      
      // Initialize the driver with configuration
      await driver.initialize(this.config.driverConfig || {});
      this.log.debug(`Initialized driver: ${driverName}`, { 
        config: JSON.stringify(this.config.driverConfig || {})
      });

      // Introspect and register steps
      try {
        const introspection = await driver.execute('introspect/steps', []);
        if (introspection.steps) {
          StepRegistry.getInstance().registerSteps(driverId, introspection.steps);
          this.log.info(`Registered ${introspection.steps.length} steps from ${driverName}`);
        }
      } catch (introspectErr) {
        this.log.warn(`Failed to introspect steps for ${driverName}: ${introspectErr}`);
      }

      return driver;
    } catch (error) {
      this.log.error(`Failed to start driver ${driverName}: ${error}`);
      return null;
    }
  }

  async runFeature(path: string): Promise<StepResult[]> {
    const traceId = this.log.startTrace('run-feature', { featurePath: path });
    
    try {
      if (!this.initialized) {
        this.log.warn('Engine not initialized, initializing now');
        await this.initialize();
      }

      this.log.info(`Running feature file: ${path}`, { executionId: this.executionId });
      
      // Parse the feature file
      const parseTraceId = this.log.startTrace('parse-feature-file', { file: path });
      const parsedFeature = parseFeatureFile(path);
      this.log.endTrace(parseTraceId, { featureTitle: parsedFeature?.name });

      // Process and run scenarios
      const stepResults: StepResult[] = [];
      
      if (parsedFeature && parsedFeature.children) {
        const scenarios = parsedFeature.children.filter(
          (child: FeatureChild) => child.scenario && 
          (!this.config.tags?.length || this.hasMatchingTags(child.scenario.tags, this.config.tags))
        );
        
        this.log.debug(`Found ${scenarios.length} matching scenarios`, { 
          totalScenarios: parsedFeature.children.length,
          filteredBy: this.config.tags?.join(',') || 'none'
        });
        
        // Determine if we're running scenarios in parallel
        if (this.config.parallelScenarios && scenarios.length > 1) {
          this.log.info(`Running ${scenarios.length} scenarios in parallel`);
          
          const parallelTraceId = this.log.startTrace('parallel-scenarios', { count: scenarios.length });
          
          // Run each scenario in parallel and collect results
          const results = await Promise.all(scenarios.map(async (child: FeatureChild, index: number) => {
            if (!child.scenario) return [];
            
            const scenarioTraceId = this.log.startTrace('scenario', { 
              scenarioName: child.scenario.name,
              index
            });
            
            try {
              const scenarioResults: StepResult[] = [];
              this.log.debug(`Running scenario: ${child.scenario.name}`, { index });
              
              for (const step of child.scenario.steps) {
                this.log.debug(`Executing step: ${step.text}`, { 
                  scenarioName: child.scenario.name,
                  keyword: step.keyword
                });
                
                const stepResult = await this.executeStep(step.text);
                scenarioResults.push(stepResult);
                this.logger.addResult(stepResult);
                
                // If a step fails and it's not an "And" or "But" step, skip the rest of the scenario
                if (!stepResult.success && !['And', 'But'].includes(step.keyword.trim())) {
                  this.log.warn(`Step failed, skipping remaining steps in scenario: ${child.scenario.name}`, {
                    failedStep: step.text
                  });
                  break;
                }
              }
              
              return scenarioResults;
            } finally {
              this.log.endTrace(scenarioTraceId);
            }
          }));
          
          // Flatten results array
          results.forEach((result: StepResult[]) => stepResults.push(...result));
          this.log.endTrace(parallelTraceId);
        } else {
          // Run scenarios sequentially
          this.log.info(`Running ${scenarios.length} scenarios sequentially`);
          
          for (const child of scenarios) {
            if (!child.scenario) continue;
            
            const scenarioTraceId = this.log.startTrace('scenario', { 
              scenarioName: child.scenario.name 
            });
            
            try {
              this.log.debug(`Running scenario: ${child.scenario.name}`);
              
              for (const step of child.scenario.steps) {
                this.log.debug(`Executing step: ${step.text}`, {
                  keyword: step.keyword
                });
                
                const stepResult = await this.executeStep(step.text);
                stepResults.push(stepResult);
                this.logger.addResult(stepResult);
                
                // If a step fails and it's not an "And" or "But" step, skip the rest of the scenario
                if (!stepResult.success && !['And', 'But'].includes(step.keyword.trim())) {
                  this.log.warn(`Step failed, skipping remaining steps in scenario: ${child.scenario.name}`, {
                    failedStep: step.text
                  });
                  break;
                }
              }
            } finally {
              this.log.endTrace(scenarioTraceId);
            }
          }
        }
      }

      // Generate report
      if (this.config.reportPath) {
        this.log.debug(`Writing report to ${this.config.reportPath}`);
        this.logger.writeReport(this.config.reportPath);
      } else {
        this.log.debug(`Writing report to default path`);
        this.logger.writeReport();
      }
      
      this.logger.printSummary();
      
      const succeededSteps = stepResults.filter(r => r.success).length;
      const failedSteps = stepResults.filter(r => !r.success).length;
      this.log.info('Feature execution completed', { 
        total: stepResults.length,
        succeeded: succeededSteps,
        failed: failedSteps,
        success: failedSteps === 0
      });
      
      return stepResults;
    } catch (error) {
      this.log.error(`Error running feature: ${error}`, {}, traceId);
      throw error;
    } finally {
      this.log.endTrace(traceId);
    }
  }

  private async executeStep(stepText: string): Promise<StepResult> {
    const traceId = this.log.startTrace('execute-step', { step: stepText });
    
    try {
      this.log.trace(`Executing step: ${stepText}`);
      
      // Use the StepRegistry to find which driver should handle this step
      const stepMatch = StepRegistry.getInstance().findMatchingStep(stepText);
      
      if (!stepMatch) {
        return {
          success: false,
          step: stepText,
          error: new Error(`No matching step found: "${stepText}"`)
        };
      }
      
      const { driverId, step } = stepMatch;
      
      // Make sure the required driver is initialized
      if (!this.drivers.has(driverId)) {
        this.log.debug(`Lazily initializing driver: ${driverId} for step: "${stepText}"`);
        const driver = await this.initializeDriver(driverId);
        if (!driver) {
          return {
            success: false,
            step: stepText,
            error: new Error(`Failed to initialize driver ${driverId} for step: "${stepText}"`)
          };
        }
        this.drivers.set(driverId, driver);
      }
      
      // Extract parameters from step text based on pattern
      const args = this.extractStepArguments(stepText, step.pattern);
      
      // Execute the action with the appropriate driver
      try {
        const driver = this.drivers.get(driverId);
        const result = await driver.execute(step.action, args);
        
        return {
          success: result.success,
          step: stepText,
          data: result.data,
          // If result.error already contains an Error object, use it, otherwise create one from the message
          error: result.success ? undefined : (result.error instanceof Error ? result.error : new Error(result.error?.message || 'Unknown error'))
        };
      } catch (error) {
        return {
          success: false,
          step: stepText,
          error: error instanceof Error ? error : new Error(`Error executing step: ${error}`)
        };
      }
    } finally {
      this.log.endTrace(traceId);
    }
  }

  /**
   * Extract arguments from a step text based on the pattern
   */
  private extractStepArguments(stepText: string, pattern: string): string[] {
    const regexPattern = pattern.replace(/\(([^)]+)\)/g, '(.+?)');
    const regex = new RegExp(`^${regexPattern}$`);
    const match = stepText.match(regex);
    
    if (match) {
      // First element is the full match, skip it
      return match.slice(1);
    }
    
    return [];
  }

  private hasMatchingTags(scenarioTags: readonly Tag[], filterTags: string[]): boolean {
    const tagNames = scenarioTags.map(tag => tag.name || '');
    const hasMatch = filterTags.some(filterTag => tagNames.includes(filterTag));
    this.log.trace(`Tag matching result: ${hasMatch}`, { 
      scenarioTags: tagNames.join(','), 
      filterTags: filterTags.join(',') 
    });
    return hasMatch;
  }

  async shutdown(): Promise<void> {
    const traceId = this.log.startTrace('engine-shutdown');
    
    try {
      this.log.info('Shutting down engine', { executionId: this.executionId });
      
      // Shut down all initialized drivers
      for (const [driverId, driver] of this.drivers.entries()) {
        try {
          this.log.debug(`Shutting down driver: ${driverId}`);
          if (driver && typeof driver.shutdown === 'function') {
            await driver.shutdown();
          } else {
            this.log.warn(`Driver ${driverId} doesn't have a shutdown method or is not properly initialized`);
          }
        } catch (error) {
          this.log.error(`Error shutting down driver ${driverId}: ${error}`);
        }
      }
      
      this.drivers.clear();
      
      // Safely disconnect from database if initialized
      try {
        this.log.debug('Disconnecting from database');
        const db = Database.getInstance();
        if (db && typeof db.disconnect === 'function') {
          await db.disconnect();
        }
      } catch (error) {
        this.log.warn(`Error disconnecting from database: ${error}`);
      }
      
      this.initialized = false;
      this.log.info('Engine shutdown complete', { executionId: this.executionId });
    } catch (error) {
      this.log.error(`Error during engine shutdown: ${error}`, {}, traceId);
    } finally {
      this.log.endTrace(traceId);
    }
  }
}

// Compatibility function for the existing API
export async function runFeature(path: string, config: Partial<EngineConfig> = {}): Promise<StepResult[]> {
  const logger = Logger.getInstance();
  logger.info(`Running feature with compatibility function: ${path}`);
  
  const engine = new RunixEngine(config);
  try {
    await engine.initialize();
    return await engine.runFeature(path);
  } finally {
    await engine.shutdown();
  }
}
