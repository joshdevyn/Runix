#!/usr/bin/env node

// Load environment variables first
import * as dotenv from 'dotenv';
dotenv.config();

import { RunixEngine } from './core/engine';
import { Logger, LogLevel } from './utils/logger';
import { DriverRegistry } from './drivers/driverRegistry';
import { registerDriverCleanup } from './utils/processCleanup';
import * as path from 'path';

// Debug: Check if voice environment variables are loaded
const debugLogger = Logger.getInstance();
debugLogger.info('Environment variables after dotenv.config()', {
  RUNIX_VOICE_ENABLED: process.env.RUNIX_VOICE_ENABLED || 'UNDEFINED',
  RUNIX_VOICE_RATE: process.env.RUNIX_VOICE_RATE || 'UNDEFINED', 
  RUNIX_VOICE_PITCH: process.env.RUNIX_VOICE_PITCH || 'UNDEFINED',
  RUNIX_VOICE_VOLUME: process.env.RUNIX_VOICE_VOLUME || 'UNDEFINED',
  RUNIX_VOICE_LANGUAGE: process.env.RUNIX_VOICE_LANGUAGE || 'UNDEFINED'
});

// Global shutdown flag for immediate stopping
export let globalShutdownRequested = false;
export function requestGlobalShutdown() {
  globalShutdownRequested = true;
}

const args = process.argv.slice(2);
const command = args[0];

// Initialize logger with proper configuration based on command
const getLogConfig = () => {
  const logLevel = process.env.RUNIX_LOG_LEVEL || 'INFO';
  const logLevelValue = LogLevel[logLevel as keyof typeof LogLevel] ?? LogLevel.INFO;
    if (command === 'ai') {
    return {
      level: logLevelValue,
      filePath: 'logs/runix-dev.log',  // Use same log file so we see driver stdout
      console: process.env.RUNIX_LOG_CONSOLE !== 'false',
      enableTracing: true
    };
  } else {
    return {
      level: logLevelValue,
      filePath: 'logs/runix-dev.log',
      console: process.env.RUNIX_LOG_CONSOLE !== 'false',
      enableTracing: true
    };
  }
};

const logger = Logger.getInstance(getLogConfig());

// Start a new logging session for this CLI run
logger.startNewSession();

// Global engine instance for cleanup
let globalEngine: RunixEngine | null = null;

// Help system
function showHelp() {
  console.log(`
🚀 Runix - Automated Testing & AI Orchestration Platform
═══════════════════════════════════════════════════════

USAGE:
  runix <command> [options]

COMMANDS:
  run <feature>                Run a Gherkin feature file
  ai <subcommand> [args]       AI-powered automation and assistance
  list-drivers                 List all available drivers
  help, --help, -h            Show this help message

RUN COMMAND:
  runix run <feature.feature> [options]
  
  Options:
    --driver=<name>            Specify driver to use
    --driverConfig=<json>      Driver configuration (JSON)
    --tags=<tag1,tag2>         Run scenarios with specific tags
    --parallel=<true|false>    Run scenarios in parallel
    --autoLoadDrivers=<bool>   Auto-discover and load drivers

  Examples:
    runix run tests/example.feature
    runix run tests/web.feature --driver=web-driver --driverConfig='{"headless":false}'
    runix run tests/api.feature --tags=smoke,regression

AI COMMANDS:
  runix ai ask "question" [--interactive]  Ask AI for help or information
  runix ai agent "task description"        Autonomous task completion with confirmation
  runix ai editor [session-name]           Interactive AI session for learning
  runix ai analyze "file or data"          Analyze files, logs, or data
  runix ai plan "project description"      Generate project plans and strategies
  runix ai execute "commands"              Execute AI-generated command sequences
  runix ai observe [--continuous]          Monitor system and provide insights
  runix ai config --check                  Check AI configuration
  runix ai help                           Show detailed AI command help

  Global AI Options:
    --interactive                          Stay running for multiple AI commands

  Examples:
    runix ai ask "How do I automate a web form?"
    runix ai agent "Create a test for user login flow"
    runix ai analyze "logs/error.log"
    runix ai plan "E2E testing strategy for ecommerce site"

ENVIRONMENT VARIABLES:
  OPENAI_API_KEY                OpenAI API key for AI features
  RUNIX_DRIVER_DIR             Custom driver directory
  RUNIX_LOG_LEVEL             Log level (DEBUG, INFO, WARN, ERROR)
  RUNIX_LOG_CONSOLE           Enable console logging (true/false)

GETTING STARTED:
  1. Set up your environment:     cp .env.example .env
  2. Configure API keys in .env
  3. List available drivers:      runix list-drivers
  4. Run a basic test:           runix run tests/fixtures/example-driver.feature
  5. Try AI assistance:          runix ai ask "What can you do?"

For more information, visit: https://github.com/joshdevyn/runix
`);
}

function showAIHelp() {
  console.log(`
🤖 Runix AI Commands - Detailed Help
═══════════════════════════════════

OVERVIEW:
  Runix AI provides intelligent automation, analysis, and assistance capabilities.
  All AI commands support natural language and can adapt to your specific needs.

AVAILABLE AI MODES:

📝 ASK MODE - Interactive Q&A
  runix ai ask "question"
  
  Get immediate answers, explanations, and guidance from AI.
  
  Examples:
    runix ai ask "How do I write a test for API endpoints?"
    runix ai ask "Explain this error message: TypeError undefined"
    runix ai ask "Best practices for web automation"

🤖 AGENT MODE - Autonomous Task Completion  
  runix ai agent "task description" [--confirm] [--dry-run]
  
  AI autonomously completes complex tasks with optional human confirmation.
  The agent analyzes the current state, creates a plan, and executes steps.
    Options:
    --confirm        Request confirmation before each action (default: true)
    --dry-run        Show planned actions without executing
    --no-confirm     Skip confirmations (auto-execute all actions)
    --output=<dir>   Specify output directory for generated files
    --max-iterations=<n>  Maximum number of execution iterations (default: 5)
  
  Examples:
    runix ai agent "Create comprehensive tests for user registration"
    runix ai agent "Analyze performance logs and generate report"
    runix ai agent "Set up CI/CD pipeline for this project" --confirm
    runix ai agent "Generate test data for the database" --dry-run
    
  Agent Mode Features:
    ✨ Intelligent task planning with adaptive execution
    🔍 Visual and text-based system analysis
    🔄 Automatic error recovery and retry logic
    📊 Comprehensive session tracking and artifacts
    🎯 Context-aware action selection
    ⚡ Integration with system, web, and vision drivers

🎭 EDITOR MODE - Interactive Learning Sessions
  runix ai editor [session-name] [--continuous] [--learn-mode]
  
  Interactive AI session that learns from your actions and provides suggestions.
  
  Options:
    --continuous     Keep session running until manually stopped
    --learn-mode     AI observes and learns without interrupting
    --save-session   Save session for future reference
  
  Examples:
    runix ai editor "test-creation-session"
    runix ai editor --continuous --learn-mode

🔍 ANALYZE MODE - Data & File Analysis
  runix ai analyze <target> [--type=<type>] [--output=<format>]
  
  Analyze files, logs, data, or system state and provide insights.
  
  Options:
    --type           Specify analysis type (logs, code, data, performance)
    --output         Output format (text, json, html, markdown)
    --depth          Analysis depth (quick, standard, deep)
  
  Examples:
    runix ai analyze "logs/error.log" --type=logs
    runix ai analyze "src/" --type=code --output=html
    runix ai analyze "test-results.json" --depth=deep

📋 PLAN MODE - Strategic Planning & Architecture
  runix ai plan "description" [--scope=<scope>] [--format=<format>]
  
  Generate comprehensive plans, strategies, and architectural guidance.
  
  Options:
    --scope          Planning scope (feature, project, system, architecture)
    --format         Output format (markdown, json, diagram)
    --templates      Use predefined templates
  
  Examples:
    runix ai plan "E2E testing strategy for microservices"
    runix ai plan "Test automation architecture" --scope=system
    runix ai plan "User onboarding flow tests" --format=markdown

⚡ EXECUTE MODE - Command Generation & Execution
  runix ai execute "description" [--review] [--batch]
  
  Generate and execute command sequences based on natural language.
  
  Options:
    --review         Review commands before execution
    --batch          Execute multiple related commands
    --save-script    Save generated commands as script
  
  Examples:
    runix ai execute "Set up test database with sample data" --review
    runix ai execute "Run all integration tests and generate report"
    runix ai execute "Deploy to staging environment" --batch

👁️ OBSERVE MODE - Continuous Monitoring & Insights
  runix ai observe [--continuous] [--alert-on=<conditions>]
  
  Monitor system, tests, or processes and provide intelligent insights.
  
  Options:
    --continuous     Run continuously until stopped
    --alert-on       Specify conditions for alerts
    --interval       Observation interval (default: 30s)
  
  Examples:
    runix ai observe --continuous --alert-on="error_rate>5%"
    runix ai observe --interval=60s

⚙️ CONFIGURATION:
  runix ai config --check                    Check current AI configuration
  runix ai config --set <key>=<value>        Set configuration value
  runix ai config --reset                    Reset to default configuration

GLOBAL OPTIONS:
  --interactive                Enable interactive mode (stay running for multiple commands)
  --model=<model>              Specify AI model to use
  --temperature=<0.0-1.0>      Control response creativity
  --timeout=<seconds>          Set request timeout
  --verbose                    Enable verbose output
  --quiet                      Suppress non-essential output

EXAMPLES WORKFLOW:
  # Standard mode (exit after each command)
  runix ai analyze "current-project"
  runix ai plan "Comprehensive testing strategy" 
  runix ai agent "Implement the testing plan" --confirm
  
  # Interactive mode (stay running for multiple commands)
  runix ai ask "What should I analyze first?" --interactive
  
  # Monitor results
  runix ai observe --continuous

For more information: runix ai ask "How do I get started with AI features?"
`);
}

// Register driver cleanup as early as possible
registerDriverCleanup().catch(error => {
  logger.error('Failed to register driver cleanup', { error });
});

// Setup process signal handlers for graceful shutdown
const setupSignalHandlers = () => {
  let isShuttingDown = false; // Prevent multiple shutdown attempts
  
  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.info(`Shutdown already in progress, ignoring ${signal}`);
      return;
    }
    
    isShuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully...`);
    
    // Shutdown engine first
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
      
      // Try emergency cleanup for more thorough process termination
      if (signal === 'uncaughtException' || signal === 'unhandledRejection') {
        logger.warn('Crash detected, performing emergency cleanup of all driver processes');
        await processManager.emergencyCleanup();
      } else {
        // Normal cleanup first, fallback to emergency if needed
        const runningDrivers = processManager.listRunningDrivers();
        
        if (runningDrivers.length > 0) {
          logger.info(`Cleaning up ${runningDrivers.length} running drivers: ${runningDrivers.join(', ')}`);
          try {
            await processManager.stopAllDrivers();
            logger.info('All driver processes cleaned up normally');
          } catch (error) {
            logger.warn('Normal cleanup failed, performing emergency cleanup', { error });
            await processManager.emergencyCleanup();
          }
        } else {
          logger.info('No tracked driver processes to clean up, checking for external processes...');
          // Even if no tracked processes, check for external driver processes
          await processManager.emergencyCleanup();
        }
      }
    } catch (error) {
      logger.error(`Error cleaning up driver processes: ${error}`);
    }
    
    // Exit with appropriate code (don't exit on beforeExit)
    if (signal !== 'beforeExit') {
      process.exit(signal === 'uncaughtException' || signal === 'unhandledRejection' ? 1 : 0);
    }
  };
    // Handle SIGTERM (kill command)
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  // Handle SIGINT (Ctrl+C) - Force immediate exit for agent mode
  let sigintCount = 0;
  process.on('SIGINT', () => {
    sigintCount++;
    if (sigintCount === 1) {
      logger.info('🛑 Received SIGINT (Ctrl+C) - Stopping agent immediately...');
      globalShutdownRequested = true; // Set global flag
      gracefulShutdown('SIGINT');
    } else {
      logger.info('🚨 Received second SIGINT - Force exiting NOW!');
      process.exit(1);
    }
  });
  
  // Handle normal process exit (beforeExit for async cleanup)
  process.on('beforeExit', async (code) => {
    logger.info(`Process exiting with code: ${code}`);
    await gracefulShutdown('beforeExit');
  });
  
  // Handle process exit (synchronous cleanup only)
  process.on('exit', (code) => {
    logger.info(`Process exit event with code: ${code}`);
    // Note: No async operations allowed in 'exit' handler
  });
  
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
        // options.tags logic is correct as is        tags: Array.isArray(options.tags) ? options.tags : (options.tags ? options.tags.split(',') : []),
        // Ensure parallelScenarios is a boolean
        parallelScenarios: typeof options.parallel === 'string' 
          ? options.parallel.toLowerCase() === 'true' 
          : Boolean(options.parallel),
        reportPath: process.env.RUNIX_REPORT_PATH || path.join('reports', 'runix-report.json'),
        logLevel: 1 // DEBUG
        // logFilePath removed - engine should use the global logger configuration
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
} else if (command === 'help' || command === '--help' || command === '-h' || !command) {
  showHelp();
} else if (command === 'ai') {
  (async () => {
    const subCommand = args[1];
    const aiArgs = args.slice(2);
    
    // Check for interactive flag
    const isInteractive = aiArgs.includes('--interactive');
    
    // Handle help first
    if (subCommand === 'help' || subCommand === '--help' || !subCommand) {
      showAIHelp();
      return;
    }
    
    try {
      const { AgentDriver } = await import('./drivers/ai/AgentDriver');
      const agentDriver = new AgentDriver();
      
      // Initialize with environment configuration
      await agentDriver.initialize({
        outputDir: process.env.RUNIX_AI_OUTPUT_DIR || './ai-artifacts',
        aiDriverServiceHost: process.env.RUNIX_AI_SERVICE_HOST || 'localhost',
        connectionTimeout: parseInt(process.env.RUNIX_AI_CONNECTION_TIMEOUT || '5000'),
        requestTimeout: parseInt(process.env.RUNIX_AI_REQUEST_TIMEOUT || '30000')
      });
      
      let result;
      
      switch (subCommand) {
        case 'ask':
          const question = aiArgs[0];
          if (!question) {
            console.error('❌ Usage: runix ai ask "your question"');
            console.log('💡 Example: runix ai ask "How do I write a test for API endpoints?"');
            process.exit(1);
          }
          result = await agentDriver.execute('ask', [question]);
          break;
          
        case 'agent':
          const taskDescription = aiArgs[0];
          if (!taskDescription) {
            console.error('❌ Usage: runix ai agent "task description"');
            console.log('💡 Example: runix ai agent "Create tests for user login flow"');
            process.exit(1);
          }
            // Parse agent options
          const agentOptions = {
            confirmActions: !aiArgs.includes('--no-confirm'),
            dryRun: aiArgs.includes('--dry-run'),
            outputDir: aiArgs.find(arg => arg.startsWith('--output='))?.split('=')[1] || './ai-artifacts',
            maxIterations: parseInt(aiArgs.find(arg => arg.startsWith('--max-iterations='))?.split('=')[1] || '5')
          };
          
          console.log('🤖 Agent Mode: Starting autonomous task completion...');
          if (agentOptions.confirmActions) {
            console.log('🔍 Confirmation mode enabled - you will be asked to approve actions');
          }
          if (agentOptions.dryRun) {
            console.log('🏃‍♂️ Dry run mode - actions will be planned but not executed');
          }
          
          result = await agentDriver.execute('agent', [taskDescription, agentOptions]);
          break;
          
        case 'editor':
          const sessionName = aiArgs[0] || `session-${Date.now()}`;
          const editorOptions = {
            continuous: aiArgs.includes('--continuous'),
            learnMode: aiArgs.includes('--learn-mode'),
            saveSession: aiArgs.includes('--save-session')
          };
          
          console.log('🎭 Editor Mode: Starting interactive AI session...');
          console.log(`📝 Session: ${sessionName}`);
          
          result = await agentDriver.execute('editor', [sessionName, editorOptions]);
          break;
          
        case 'analyze':
          const target = aiArgs[0];
          if (!target) {
            console.error('❌ Usage: runix ai analyze <target>');
            console.log('💡 Example: runix ai analyze "logs/error.log" --type=logs');
            process.exit(1);
          }
          
          const analyzeOptions = {
            type: aiArgs.find(arg => arg.startsWith('--type='))?.split('=')[1] || 'auto',
            output: aiArgs.find(arg => arg.startsWith('--output='))?.split('=')[1] || 'text',
            depth: aiArgs.find(arg => arg.startsWith('--depth='))?.split('=')[1] || 'standard'
          };
          
          console.log('🔍 Analyze Mode: Analyzing target with AI...');
          console.log(`🎯 Target: ${target}`);
          console.log(`📊 Type: ${analyzeOptions.type}, Depth: ${analyzeOptions.depth}`);
          
          result = await agentDriver.execute('analyze', [target, analyzeOptions]);
          break;
          
        case 'plan':
          const planDescription = aiArgs[0];
          if (!planDescription) {
            console.error('❌ Usage: runix ai plan "description"');
            console.log('💡 Example: runix ai plan "E2E testing strategy for microservices"');
            process.exit(1);
          }
          
          const planOptions = {
            scope: aiArgs.find(arg => arg.startsWith('--scope='))?.split('=')[1] || 'project',
            format: aiArgs.find(arg => arg.startsWith('--format='))?.split('=')[1] || 'markdown',
            templates: aiArgs.includes('--templates')
          };
          
          console.log('📋 Plan Mode: Generating strategic plan...');
          console.log(`🎯 Description: ${planDescription}`);
          console.log(`📐 Scope: ${planOptions.scope}, Format: ${planOptions.format}`);
          
          result = await agentDriver.execute('plan', [planDescription, planOptions]);
          break;
          
        case 'execute':
          const executeDescription = aiArgs[0];
          if (!executeDescription) {
            console.error('❌ Usage: runix ai execute "description"');
            console.log('💡 Example: runix ai execute "Set up test database with sample data" --review');
            process.exit(1);
          }
          
          const executeOptions = {
            review: aiArgs.includes('--review'),
            batch: aiArgs.includes('--batch'),
            saveScript: aiArgs.includes('--save-script')
          };
          
          console.log('⚡ Execute Mode: Generating and executing commands...');
          console.log(`🎯 Description: ${executeDescription}`);
          if (executeOptions.review) {
            console.log('🔍 Review mode enabled - commands will be shown for approval');
          }
          
          result = await agentDriver.execute('execute', [executeDescription, executeOptions]);
          break;
          
        case 'observe':
          const observeOptions = {
            continuous: aiArgs.includes('--continuous'),
            alertOn: aiArgs.find(arg => arg.startsWith('--alert-on='))?.split('=')[1],
            interval: parseInt(aiArgs.find(arg => arg.startsWith('--interval='))?.split('=')[1] || '30')
          };
          
          console.log('👁️ Observe Mode: Starting intelligent monitoring...');
          if (observeOptions.continuous) {
            console.log('🔄 Continuous mode enabled - press Ctrl+C to stop');
          }
          if (observeOptions.alertOn) {
            console.log(`🚨 Alert conditions: ${observeOptions.alertOn}`);
          }
          
          result = await agentDriver.execute('observe', [observeOptions]);
          break;
          
        case 'config':
          if (aiArgs[0] === '--check') {
            console.log('🔧 AI Configuration Status:');
            console.log(`OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Not set'}`);
            console.log(`Default Model: ${process.env.AI_DEFAULT_MODEL || 'gpt-4o-mini'}`);
            console.log(`Agent Model: ${process.env.AI_AGENT_MODEL || 'gpt-4o-with-canvas'}`);
            console.log(`Vision Model: ${process.env.AI_VISION_MODEL || 'gpt-4o-mini'}`);
            console.log(`Temperature: ${process.env.AI_TEMPERATURE || '0.7'}`);
            console.log(`Max Tokens: ${process.env.AI_MAX_TOKENS || '4096'}`);
            console.log(`Confirm Actions: ${process.env.RUNIX_AI_CONFIRM_ACTIONS !== 'false' ? 'Yes' : 'No'}`);
            console.log(`Output Dir: ${process.env.RUNIX_AI_OUTPUT_DIR || './ai-artifacts'}`);
            console.log(`Computer Use: ${process.env.ENABLE_COMPUTER_USE === 'true' ? '✅ Enabled' : '❌ Disabled'}`);
            return;
          } else if (aiArgs[0] === '--reset') {
            console.log('🔄 Resetting AI configuration to defaults...');
            // Implementation would reset config
            return;
          } else if (aiArgs[0]?.includes('=')) {
            const [key, value] = aiArgs[0].split('=');
            console.log(`⚙️ Setting ${key} = ${value}`);
            // Implementation would set config
            return;
          } else {
            console.error('❌ Usage: runix ai config [--check|--reset|key=value]');
            process.exit(1);
          }
          
        default:
          console.error(`❌ Unknown AI command: ${subCommand}`);
          console.log('\n🤖 Available AI commands:');
          console.log('  ask "question"           - Get AI assistance and answers');
          console.log('  agent "task"             - Autonomous task completion');
          console.log('  editor [session]         - Interactive AI session');
          console.log('  analyze "target"         - Analyze files, logs, or data');
          console.log('  plan "description"       - Generate strategic plans');
          console.log('  execute "commands"       - Generate and run command sequences');
          console.log('  observe [options]        - Monitor system with AI insights');
          console.log('  config --check           - Check AI configuration');
          console.log('  help                     - Show detailed AI help');
          console.log('\n💡 Use "runix ai help" for detailed documentation');
          process.exit(1);
      }
        if (result) {        if (result.success) {
          console.log('\n✅ AI task completed successfully');
          if (result.data) {
            if (typeof result.data === 'string') {
              console.log(result.data);
            } else {
              console.log(JSON.stringify(result.data, null, 2));
            }
          }
          
          if (isInteractive) {
            // Interactive mode - stay running and prompt for more commands
            console.log('\n🔄 Interactive mode enabled. Type another AI command or "exit" to quit.');
            console.log('💡 Example: ask "What should I do next?" or agent "Run tests"');
            // TODO: Implement interactive command loop here
            // For now, we'll exit with a message about future implementation
            console.log('⚠️  Interactive mode is not fully implemented yet. Use --interactive for LaunchDarkly feature flag compatibility.');
            console.log('🎉 AI task completed. Exiting...');
            process.exit(0);
          } else {
            // Standard mode - exit after completion
            console.log('\n🎉 AI task completed. Exiting...');
            console.log('💡 Use --interactive flag to stay running for multiple commands (coming soon)');
            process.exit(0);
          }
        } else {
          console.error('\n❌ AI task failed:', result.error?.message || 'Unknown error');
          if (result.error?.details) {
            console.error('Details:', result.error.details);
          }
          process.exit(1);
        }
      } else {
        // No result returned - this shouldn't happen for AI commands
        console.log('\n⚠️ AI task completed but no result was returned');
        process.exit(0);
      }
      
    } catch (error) {
      logger.error(`AI command failed: ${error}`);
      console.error('\n❌ AI command execution failed');
      console.error('Error:', error instanceof Error ? error.message : String(error));
      console.log('\n💡 Try "runix ai help" for usage information');
      process.exit(1);
    }
  })();
} else {
  console.error(`❌ Unknown command: ${command}`);
  console.log('\n🚀 Available commands:');
  console.log('  run <feature>        - Run a Gherkin feature file');
  console.log('  ai <subcommand>      - AI-powered automation and assistance');
  console.log('  list-drivers         - List all available drivers'); 
  console.log('  help                 - Show detailed help');
  console.log('\n💡 Use "runix help" for complete documentation');
  process.exit(1);
}

export { RunixEngine };
export * from './core/engine';
export * from './drivers/driverRegistry';
