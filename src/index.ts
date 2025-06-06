#!/usr/bin/env node
import { RunixEngine } from './core/engine';
import { Logger } from './utils/logger';
import { DriverRegistry } from './drivers/driverRegistry';

const args = process.argv.slice(2);
const command = args[0];
const logger = Logger.getInstance();

// Global engine instance for cleanup
let globalEngine: RunixEngine | null = null;

// Setup process signal handlers for graceful shutdown
const setupSignalHandlers = () => {
  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    
    if (globalEngine && typeof globalEngine.shutdown === 'function') {
      try {
        await globalEngine.shutdown();
        logger.info('Engine shutdown completed');
      } catch (error) {
        logger.error(`Error during engine shutdown: ${error}`);
      }
    }
    
    // Force cleanup of any remaining driver processes
    try {
      const { DriverProcessManager } = await import('./drivers/management/DriverProcessManager');
      const processManager = DriverProcessManager.getInstance();
      await processManager.stopAllDrivers();
      logger.info('All driver processes cleaned up');
    } catch (error) {
      logger.error(`Error cleaning up driver processes: ${error}`);
    }
    
    process.exit(0);
  };
  
  // Handle SIGTERM (kill command)
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  
  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    logger.error(`Uncaught exception: ${error}`);
    await gracefulShutdown('uncaughtException');
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', async (reason, promise) => {
    logger.error(`Unhandled rejection at: ${promise}, reason: ${reason}`);
    await gracefulShutdown('unhandledRejection');
  });
};

// Initialize signal handlers
setupSignalHandlers();

if (command === 'run') {
  const feature = args[1];
  const options: any = {
    driverConfig: '{}',
    tags: [], // Already an array
    parallel: false,
    autoLoadDrivers: true  // New flag to enable automatic driver loading
  };
  args.slice(2).forEach(arg => {
    const equalIndex = arg.indexOf('=');
    if (equalIndex > 0) {
      const key = arg.substring(0, equalIndex);
      const value = arg.substring(equalIndex + 1);
      if (key && value !== undefined) {
        const optionKey = key.replace('--', '');
        if (optionKey === 'autoLoadDrivers') {
          options[optionKey] = value.toLowerCase() === 'true';
        } else {
          options[optionKey] = value;
        }
      }
    }
  });
  
  (async () => {
    try {
      // Initialize DriverRegistry before RunixEngine
      const registry = DriverRegistry.getInstance();
      await registry.initialize();
      
      // Get available drivers for validation
      const availableDrivers = registry.listDriverIds();
      logger.info(`Discovered ${availableDrivers.length} available drivers`, {
        drivers: availableDrivers
      });
      
      // If specific driver is requested, validate it exists
      if (options.driver && !availableDrivers.includes(options.driver)) {
        throw new Error(`Specified driver '${options.driver}' not found. Available drivers: ${availableDrivers.join(', ')}`);
      }
      
      // Parse driverConfig with error handling
      let driverConfig = {};
      try {
        driverConfig = JSON.parse(options.driverConfig);
      } catch (jsonError) {
        logger.error('Invalid JSON in driverConfig parameter', { 
          provided: options.driverConfig,
          error: jsonError instanceof Error ? jsonError.message : String(jsonError)
        });
        throw new Error(`Invalid JSON in driverConfig: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
      }

      const config = {
        // Remove driverName for automatic driver loading, or keep if specifically provided
        driverName: options.driver || undefined,
        driverConfig,
        autoLoadDrivers: options.autoLoadDrivers,
        // options.tags logic is correct as is
        tags: Array.isArray(options.tags) ? options.tags : (options.tags ? options.tags.split(',') : []),
        // Ensure parallelScenarios is a boolean
        parallelScenarios: typeof options.parallel === 'string' 
          ? options.parallel.toLowerCase() === 'true' 
          : Boolean(options.parallel),
        reportPath: 'reports/runix-report.json',
        logLevel: 1, // DEBUG
        logFilePath: 'logs/runix-dev.log'
      };const engine = new RunixEngine(config);
      globalEngine = engine; // Store engine globally for signal handlers
      
      try {
        await engine.initialize();
        const results = await engine.runFeature(feature);
        
        // Print detailed results to console
        console.log('\n🏁 EXECUTION COMPLETE\n');
        
        const failed = results.filter(r => !r.success).length;
        const passed = results.filter(r => r.success).length;
        
        if (failed === 0) {
          console.log(`🎊 SUCCESS: All ${passed} steps passed!`);
          console.log(`📄 Reports generated in: ${config.reportPath}`);
        } else {
          console.log(`⚠️  PARTIAL SUCCESS: ${passed} passed, ${failed} failed`);
          console.log(`📄 Detailed report: ${config.reportPath}`);
        }
          process.exit(failed > 0 ? 1 : 0);
      } finally {
        await engine.shutdown();
        globalEngine = null; // Clear global reference after shutdown
      }
    } catch (error) {
      logger.error(`Execution failed: ${error}`);
      process.exit(1);
    }
  })();
} else if (command === 'list-drivers') {
  (async () => {
    // DriverRegistry is already imported at the top
    const registry = DriverRegistry.getInstance();
    await registry.initialize();
    
    const drivers = registry.listDriverIds();
    logger.info('Available drivers:');
    drivers.forEach(id => {
      const driver = registry.getDriver(id);
      logger.info(
        `Available driver: ${id}`,
        { 
          class: 'Main',
          method: 'listDrivers'
        },
        {
          driverId: id,
          name: driver?.name,
          version: driver?.version
        }
      );
    });
  })();
} else if (command === 'ai') {
  (async () => {
    const subCommand = args[0];
    const aiArgs = args.slice(1);
    
    try {
      const { AIDriver } = await import('./ai/aiDriver');
      const aiDriver = new AIDriver();
      
      // Initialize with environment configuration
      await aiDriver.initialize({
        openaiApiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4-vision-preview',
        confirmActions: process.env.RUNIX_AI_CONFIRM_ACTIONS !== 'false',
        outputDir: process.env.RUNIX_AI_OUTPUT_DIR || './ai-artifacts'
      });
      
      let result;
      
      switch (subCommand) {
        case 'agent':
          const taskDescription = aiArgs[0];
          if (!taskDescription) {
            console.error('Usage: runix ai agent "task description"');
            process.exit(1);
          }
          result = await aiDriver.execute('agent', [taskDescription, { confirmActions: true }]);
          break;
          
        case 'editor':
          const sessionName = aiArgs[0] || `session-${Date.now()}`;
          result = await aiDriver.execute('editor', [sessionName]);
          break;
          
        case 'ask':
          const question = aiArgs[0];
          if (!question) {
            console.error('Usage: runix ai ask "your question"');
            process.exit(1);
          }
          result = await aiDriver.execute('ask', [question]);
          break;
          
        case 'config':
          if (aiArgs[0] === '--check') {
            console.log('🔧 AI Configuration:');
            console.log(`OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✓ Set' : '✗ Not set'}`);
            console.log(`Model: ${process.env.OPENAI_MODEL || 'gpt-4-vision-preview (default)'}`);
            console.log(`Confirm Actions: ${process.env.RUNIX_AI_CONFIRM_ACTIONS !== 'false'}`);
            console.log(`Output Dir: ${process.env.RUNIX_AI_OUTPUT_DIR || './ai-artifacts (default)'}`);
            return;
          }
          break;
          
        default:
          console.error(`Unknown AI command: ${subCommand}`);
          console.log('Available AI commands:');
          console.log('  agent "task"     - Complete task autonomously');
          console.log('  editor "name"    - Learn from user actions');
          console.log('  ask "question"   - Get AI assistance');
          console.log('  config --check   - Check AI configuration');
          process.exit(1);
      }
      
      if (result) {
        if (result.success) {
          console.log('✅ AI task completed successfully');
          if (result.data) {
            console.log(JSON.stringify(result.data, null, 2));
          }
        } else {
          console.error('❌ AI task failed:', result.error?.message);
          process.exit(1);
        }
      }
      
    } catch (error) {
      logger.error(`AI command failed: ${error}`);
      process.exit(1);
    }
  })();
} else {
  logger.info(
    'Unknown command',
    { 
      class: 'Main',
      method: 'main'
    },
    {
      command,
      availableCommands: ['run', 'list-drivers']
    }
  );
}

export { RunixEngine };
export * from './core/engine';
export * from './drivers/driverRegistry';
