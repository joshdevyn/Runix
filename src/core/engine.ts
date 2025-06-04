import { parseFeatureFile } from '../parser/parser';
import { DriverRegistry } from '../drivers/driverRegistry';
import { Logger, LogLevel } from '../utils/logger';
import { env } from '../utils/env';
import { ResultLogger } from '../report/resultLogger';
import { StepResult } from '../report/resultLogger';
import { Database } from '../db/database';
import { Tag, Feature, FeatureChild } from '@cucumber/messages';
import { StepRegistry } from './stepRegistry';
import { RunixError, DriverError, StepExecutionError, FeatureParsingError, ConfigurationError } from '../utils/errors';

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

  // Add constants for better maintainability
  private static readonly DEFAULT_DRIVER_TIMEOUT = 30000;
  private static readonly MAX_PARALLEL_SCENARIOS = 10;
  private static readonly DRIVER_STARTUP_TIMEOUT = 5000;

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
    this.log.info(
      'Engine instance created',
      { 
        class: 'RunixEngine',
        method: 'constructor'
      },
      { 
        executionId: this.executionId,
        config: JSON.stringify(this.config)
      }
    );
  }

  async initialize(): Promise<void> {
    const traceId = this.log.logMethodEntry('initialize', { 
      class: 'RunixEngine',
      executionId: this.executionId 
    }, []);
    
    try {
      if (this.initialized) {
        this.log.debug(
          'Engine already initialized, skipping initialization',
          { 
            class: 'RunixEngine',
            method: 'initialize',
            traceId
          }
        );
        this.log.logMethodExit('initialize', traceId, { alreadyInitialized: true });
        return;
      }
      
      this.log.info(
        'Initializing Runix engine',
        { 
          class: 'RunixEngine',
          method: 'initialize',
          traceId
        },
        { 
          executionId: this.executionId,
          config: this.config
        }
      );

      // Initialize database if configured
      if (this.config.databaseConfig) {
        const dbTraceId = this.log.startTrace('database-initialization');
        try {
          this.log.debug(
            'Initializing database connection',
            { 
              class: 'RunixEngine',
              method: 'initialize',
              traceId,
              dbTraceId
            },
            { config: this.config.databaseConfig }
          );
          
          await Database.getInstance().initialize(this.config.databaseConfig);
          this.log.info('Database initialized successfully', { traceId, dbTraceId });
        } catch (dbError) {
          this.log.error('Database initialization failed', { traceId, dbTraceId }, dbError);
          throw new ConfigurationError('Database initialization failed', { 
            operation: 'database_init',
            traceId
          }, dbError instanceof Error ? dbError : new Error(String(dbError)));
        } finally {
          this.log.endTrace(dbTraceId);
        }
      }

      // Initialize step registry
      const stepRegistryTraceId = this.log.startTrace('step-registry-initialization');
      try {
        this.log.debug('Initializing step registry', { traceId, stepRegistryTraceId });
        await StepRegistry.getInstance().initialize();
        this.log.info('Step registry initialized successfully', { traceId, stepRegistryTraceId });
      } catch (stepError) {
        this.log.error('Step registry initialization failed', { traceId, stepRegistryTraceId }, stepError);
        throw new ConfigurationError('Step registry initialization failed', { 
          operation: 'step_registry_init',
          traceId 
        }, stepError instanceof Error ? stepError : new Error(String(stepError)));
      } finally {
        this.log.endTrace(stepRegistryTraceId);
      }
      
      // Initialize driver registry
      const driverRegistryTraceId = this.log.startTrace('driver-registry-initialization');
      try {
        this.log.debug('Initializing driver registry', { traceId, driverRegistryTraceId });
        const driverRegistry = DriverRegistry.getInstance();
        await driverRegistry.initialize();
        
        const discoveredDrivers = driverRegistry.listDriverIds();
        this.log.info('Driver registry initialized successfully', { 
          traceId, 
          driverRegistryTraceId 
        }, { 
          discoveredDriverCount: discoveredDrivers.length,
          discoveredDrivers 
        });
      } catch (driverRegistryError) {
        this.log.error('Driver registry initialization failed', { traceId, driverRegistryTraceId }, driverRegistryError);
        throw new ConfigurationError('Driver registry initialization failed', { 
          operation: 'driver_registry_init',
          traceId 
        }, driverRegistryError instanceof Error ? driverRegistryError : new Error(String(driverRegistryError)));
      } finally {
        this.log.endTrace(driverRegistryTraceId);
      }
      
      // If a default driver is specified, initialize it
      if (this.config.driverName) {
        const defaultDriverTraceId = this.log.startTrace('default-driver-initialization');
        try {
          this.log.debug('Initializing default driver', { 
            traceId, 
            defaultDriverTraceId,
            driverName: this.config.driverName 
          });
          
          const defaultDriver = await this.initializeDriver(this.config.driverName);
          if (defaultDriver) {
            this.drivers.set(this.config.driverName.toLowerCase(), defaultDriver);
            this.log.info('Default driver initialized successfully', { 
              traceId, 
              defaultDriverTraceId,
              driverName: this.config.driverName 
            });
          }
        } catch (defaultDriverError) {
          this.log.error('Default driver initialization failed', { 
            traceId, 
            defaultDriverTraceId,
            driverName: this.config.driverName 
          }, defaultDriverError);
          throw defaultDriverError; // Re-throw as it's already a proper error from initializeDriver
        } finally {
          this.log.endTrace(defaultDriverTraceId);
        }
      }
      
      this.initialized = true;
      this.log.logMethodExit('initialize', traceId, { 
        class: 'RunixEngine',
        initialized: true,
        driversInitialized: this.drivers.size
      });
      
    } catch (error) {
      this.log.logMethodError('initialize', traceId, error instanceof Error ? error : new Error(String(error)), {
        class: 'RunixEngine',
        executionId: this.executionId
      });
      throw error;
    }
  }

  /**
   * Initialize a specific driver with exhaustive logging
   */
  private async initializeDriver(driverName: string): Promise<any> {
    const traceId = this.log.logMethodEntry('initializeDriver', { 
      class: 'RunixEngine',
      driverName 
    }, [driverName]);

    let driver: any = null;

    try {
      this.log.debug('Starting driver initialization process', { 
        traceId,
        driverName,
        step: 'lookup_driver'
      });

      const driverRegistry = DriverRegistry.getInstance();
      const driverMeta = driverRegistry.getDriver(driverName);
      
      if (!driverMeta) {
        const availableDrivers = driverRegistry.listDriverIds();
        this.log.error('Driver not found during lookup', { 
          traceId,
          driverName,
          availableDrivers,
          step: 'lookup_driver'
        });
        
        throw new DriverError(`Driver not found: ${driverName}. Available: ${availableDrivers.join(', ')}`, driverName, {
          operation: 'driver_lookup',
          traceId
        });
      }
      
      this.log.debug('Driver metadata found', { 
        traceId,
        driverName,
        step: 'driver_metadata_found'
      }, {
        driverMeta: {
          id: driverMeta.id,
          name: driverMeta.name,
          version: driverMeta.version,
          path: driverMeta.path,
          executable: driverMeta.executable
        }
      });
      
      const driverId = driverMeta.id;
      
      // Start driver process first, then create instance
      const driverStartTraceId = this.log.startTrace('driver-startup', { driverId, driverName });
      
      try {
        this.log.debug('Starting driver through registry', { 
          traceId,
          driverStartTraceId,
          driverId,
          step: 'start_driver_via_registry'
        });

        // Use the registry to start the driver - this handles process management and transport creation
        driver = await Promise.race([
          (async () => {
            const startTime = Date.now();
            this.log.trace('Calling driverRegistry.startDriver', { traceId, driverStartTraceId, driverId });
            const result = await driverRegistry.startDriver(driverId);
            const duration = Date.now() - startTime;
            this.log.trace('driverRegistry.startDriver completed', { 
              traceId, 
              driverStartTraceId, 
              driverId,
              duration: `${duration}ms`
            });
            return result;
          })(),
          new Promise((_, reject) => 
            setTimeout(() => {
              this.log.error('Driver startup timeout exceeded', { 
                traceId,
                driverStartTraceId,
                driverId,
                timeout: RunixEngine.DRIVER_STARTUP_TIMEOUT
              });
              reject(new Error(`Driver startup timeout: ${driverId} (${RunixEngine.DRIVER_STARTUP_TIMEOUT}ms)`));
            }, RunixEngine.DRIVER_STARTUP_TIMEOUT)
          )
        ]);
        
        this.log.debug('Driver instance created, validating', { 
          traceId,
          driverStartTraceId,
          driverId,
          step: 'validate_driver_instance'
        });

        // Validate driver before proceeding
        if (!driver) {
          throw new DriverError(`Driver instance is null for ${driverId}`, driverId, {
            operation: 'driver_validation',
            traceId
          });
        }

        if (typeof driver.start !== 'function') {
          this.log.error('Driver instance missing start method', { 
            traceId,
            driverStartTraceId,
            driverId,
            availableMethods: Object.getOwnPropertyNames(driver).filter(prop => typeof driver[prop] === 'function')
          });
          throw new DriverError(`Invalid driver instance returned for ${driverId}: missing start method`, driverId, {
            operation: 'driver_validation',
            traceId
          });
        }

        this.log.debug('Driver instance validated, calling start method', { 
          traceId,
          driverStartTraceId,
          driverId,
          step: 'call_driver_start'
        });

        // Call driver start method (this will connect to the already-running process)
        const capabilitiesStartTime = Date.now();
        const capabilities = await driver.start();
        const capabilitiesDuration = Date.now() - capabilitiesStartTime;
        
        this.log.info('Driver started successfully', { 
          traceId,
          driverStartTraceId,
          driverId,
          step: 'driver_start_complete',
          duration: `${capabilitiesDuration}ms`
        }, {
          capabilities: {
            name: capabilities.name,
            version: capabilities.version,
            supportedActions: capabilities.supportedActions
          }
        });

      } finally {
        this.log.endTrace(driverStartTraceId);
      }

      // Initialize driver with configuration
      const initTraceId = this.log.startTrace('driver-config-initialization', { driverId });
      try {
        this.log.debug('Initializing driver with configuration', { 
          traceId,
          initTraceId,
          driverId,
          step: 'driver_config_init'
        }, { 
          config: this.config.driverConfig || {}
        });

        const initStartTime = Date.now();
        await driver.initialize(this.config.driverConfig || {});
        const initDuration = Date.now() - initStartTime;
        
        this.log.debug('Driver configuration initialization complete', { 
          traceId,
          initTraceId,
          driverId,
          duration: `${initDuration}ms`
        });
      } finally {
        this.log.endTrace(initTraceId);
      }

      // Introspect and register steps
      const introspectionTraceId = this.log.startTrace('driver-step-introspection', { driverId });
      try {
        this.log.debug('Starting step introspection', { 
          traceId,
          introspectionTraceId,
          driverId,
          step: 'step_introspection'
        });

        const introspectionStartTime = Date.now();
        const introspection = await driver.execute('introspect', [{ type: 'steps' }]);
        const introspectionDuration = Date.now() - introspectionStartTime;
        
        if (introspection?.steps?.length > 0) {
          StepRegistry.getInstance().registerSteps(driverId, introspection.steps);
          this.log.info('Driver steps registered successfully', { 
            traceId,
            introspectionTraceId,
            driverId,
            stepCount: introspection.steps.length,
            duration: `${introspectionDuration}ms`
          }, {
            steps: introspection.steps.map((step: any) => ({
              id: step.id,
              pattern: step.pattern,
              action: step.action
            }))
          });
        } else {
          this.log.warn('No steps returned from driver introspection', { 
            traceId,
            introspectionTraceId,
            driverId,
            duration: `${introspectionDuration}ms`
          }, { introspectionResult: introspection });
        }
      } catch (introspectErr) {
        this.log.warn('Failed to introspect steps for driver', { 
          traceId,
          introspectionTraceId,
          driverId
        }, introspectErr);
        // Continue execution - introspection failure shouldn't kill driver
      } finally {
        this.log.endTrace(introspectionTraceId);
      }

      this.log.logMethodExit('initializeDriver', traceId, { 
        driverId,
        success: true
      }, { driverInitialized: true });

      return driver;

    } catch (error) {
      this.log.logMethodError('initializeDriver', traceId, error instanceof Error ? error : new Error(String(error)), {
        driverName,
        class: 'RunixEngine'
      });

      // Enhanced cleanup with logging
      if (driver && typeof driver.shutdown === 'function') {
        const cleanupTraceId = this.log.startTrace('driver-cleanup-after-error');
        try {
          this.log.debug('Attempting driver cleanup after initialization error', { 
            traceId,
            cleanupTraceId,
            driverName 
          });
          await driver.shutdown();
          this.log.debug('Driver cleanup completed', { traceId, cleanupTraceId, driverName });
        } catch (cleanupError) {
          this.log.error('Failed to cleanup driver after initialization error', { 
            traceId,
            cleanupTraceId,
            driverName
          }, cleanupError);
        } finally {
          this.log.endTrace(cleanupTraceId);
        }
      }
      
      // Wrap error with more context if it's not already a RunixError
      if (!(error instanceof RunixError)) {
        throw new DriverError(`Driver initialization failed: ${error}`, driverName, {
          operation: 'driver_initialization',
          traceId
        }, error instanceof Error ? error : new Error(String(error)));
      }
      
      throw error;
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
          const maxConcurrent = Math.min(scenarios.length, RunixEngine.MAX_PARALLEL_SCENARIOS);
          this.log.info(`Running ${scenarios.length} scenarios in parallel (max concurrent: ${maxConcurrent})`);
          
          const parallelTraceId = this.log.startTrace('parallel-scenarios', { count: scenarios.length });
          
          // Use semaphore-like pattern to limit concurrency
          const semaphore = Array(maxConcurrent).fill(null);
          let currentIndex = 0;
          
          const executeScenario = async (child: FeatureChild, index: number): Promise<StepResult[]> => {
            if (!child.scenario) return [];
            
            const scenarioTraceId = this.log.startTrace('scenario', { 
              scenarioName: child.scenario.name,
              index
            });
            
            try {
              const scenarioResults: StepResult[] = [];
              this.log.debug(`Running scenario: ${child.scenario.name}`, { index });
              
              for (const step of child.scenario.steps) {
                const stepResult = await this.executeStep(step.text);
                scenarioResults.push(stepResult);
                this.logger.addResult(stepResult);
                
                if (!stepResult.success && !['And', 'But'].includes(step.keyword.trim())) {
                  this.log.warn(`Step failed, skipping remaining steps in scenario: ${child.scenario.name}`, {
                    failedStep: step.text
                  });
                  break;
                }
              }
              
              return scenarioResults;
            } catch (error) {
              this.log.error(`Scenario execution failed: ${child.scenario?.name}`, { error: error instanceof Error ? error.message : String(error) });
              return [{
                success: false,
                step: `Scenario: ${child.scenario?.name}`,
                error: error instanceof Error ? error : new Error(String(error))
              }];
            } finally {
              this.log.endTrace(scenarioTraceId);
            }
          };
          
          const results = await Promise.all(scenarios.map(executeScenario));
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
    const traceId = this.log.logMethodEntry('executeStep', { 
      class: 'RunixEngine',
      stepText 
    }, [stepText]);
    
    try {
      this.log.trace('Starting step execution process', { 
        traceId,
        stepText,
        step: 'find_matching_step'
      });
      
      // Use the StepRegistry to find which driver should handle this step
      const stepRegistryTraceId = this.log.startTrace('step-registry-lookup', { stepText });
      let stepMatch;
      
      try {
        stepMatch = StepRegistry.getInstance().findMatchingStep(stepText);
        this.log.trace('Step registry lookup completed', { 
          traceId,
          stepRegistryTraceId,
          stepText,
          found: !!stepMatch
        });
      } finally {
        this.log.endTrace(stepRegistryTraceId);
      }
      
      if (!stepMatch) {
        const error = new StepExecutionError(`No matching step found: "${stepText}"`, { 
          operation: 'step_matching',
          traceId 
        });
        this.log.error('No matching step pattern found', { traceId, stepText }, error);
        return {
          success: false,
          step: stepText,
          error
        };
      }
      
      const { driverId, step } = stepMatch;
      this.log.debug('Step match found', { 
        traceId,
        stepText,
        driverId,
        stepId: step.id,
        pattern: step.pattern,
        action: step.action
      });
      
      // Make sure the required driver is initialized
      if (!this.drivers.has(driverId)) {
        this.log.debug('Driver not initialized, performing lazy initialization', { 
          traceId,
          driverId,
          stepText,
          step: 'lazy_driver_init'
        });
        
        const driver = await this.initializeDriver(driverId);
        if (!driver) {
          const error = new DriverError(`Failed to initialize driver ${driverId} for step: "${stepText}"`, driverId, {
            operation: 'lazy_driver_initialization',
            traceId,
            stepText
          });
          this.log.error('Lazy driver initialization failed', { traceId, driverId, stepText }, error);
          return {
            success: false,
            step: stepText,
            error
          };
        }
        this.drivers.set(driverId, driver);
        this.log.debug('Lazy driver initialization completed', { traceId, driverId, stepText });
      }
      
      // Extract parameters from step text based on pattern
      const argExtractionTraceId = this.log.startTrace('argument-extraction', { stepText, pattern: step.pattern });
      let args;
      try {
        args = this.extractStepArguments(stepText, step.pattern);
        this.log.trace('Step arguments extracted', { 
          traceId,
          argExtractionTraceId,
          stepText,
          pattern: step.pattern,
          extractedArgs: args
        });
      } finally {
        this.log.endTrace(argExtractionTraceId);
      }
      
      // Execute the action with the appropriate driver
      const executionTraceId = this.log.startTrace('driver-action-execution', { 
        driverId, 
        action: step.action,
        stepText 
      });
      
      try {
        const driver = this.drivers.get(driverId);
        this.log.debug('Executing driver action', { 
          traceId,
          executionTraceId,
          driverId,
          action: step.action,
          args,
          stepText
        });

        const executionStartTime = Date.now();
        const result = await driver.execute(step.action, args);
        const executionDuration = Date.now() - executionStartTime;
        
        this.log.debug('Driver action execution completed', { 
          traceId,
          executionTraceId,
          driverId,
          action: step.action,
          success: result.success,
          duration: `${executionDuration}ms`
        }, {
          result: (this.log as any).sanitizeForLogging(result)
        });
        
        const stepResult = {
          success: result.success,
          step: stepText,
          data: result.data,
          duration: executionDuration,
          error: result.success ? undefined : (result.error instanceof Error ? result.error : new Error(result.error?.message || 'Unknown error'))
        };

        this.log.logMethodExit('executeStep', traceId, { 
          stepText,
          success: stepResult.success,
          duration: executionDuration
        }, stepResult);

        return stepResult;

      } catch (error) {
        this.log.error('Driver action execution failed', { 
          traceId,
          executionTraceId,
          driverId,
          action: step.action,
          stepText
        }, error);
        
        // Extract meaningful error message from the underlying error
        let errorMessage = 'Unknown error occurred';
        if (error instanceof Error) {
          errorMessage = error.message;
          // If it's a timeout error, provide more context
          if (error.message.includes('timeout')) {
            errorMessage = `Operation timed out: ${error.message}. The browser may need more time to load or the element may not exist.`;
          }
          // If it's a connection error, provide guidance
          else if (error.message.includes('connection') || error.message.includes('WebSocket')) {
            errorMessage = `Connection error: ${error.message}. The driver may have stopped responding.`;
          }
        }
        
        const stepExecutionError = new StepExecutionError(`${stepText} - ${errorMessage}`, {
          operation: 'driver_action_execution',
          traceId,
          driverId
        }, error instanceof Error ? error : new Error(String(error)));

        return {
          success: false,
          step: stepText,
          error: stepExecutionError
        };
      } finally {
        this.log.endTrace(executionTraceId);
      }
      
    } catch (error) {
      this.log.logMethodError('executeStep', traceId, error instanceof Error ? error : new Error(String(error)), {
        stepText,
        class: 'RunixEngine'
      });
      
      let errorMessage = 'Error executing step';
      if (error instanceof Error) {
        errorMessage = `Error executing step: ${error.message}`;
      }
      
      return {
        success: false,
        step: stepText,
        error: error instanceof Error ? error : new Error(errorMessage)
      };
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
  logger.info(
    'Running feature with compatibility function',
    { 
      class: 'Global',
      method: 'runFeature'
    },
    { path }
  );
  
  const engine = new RunixEngine(config);
  try {
    await engine.initialize();
    return await engine.runFeature(path);
  } finally {
    await engine.shutdown();
  }
}
