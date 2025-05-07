#!/usr/bin/env node
import { RunixEngine } from './core/engine';
import path from 'path';
import { DriverRegistry, loadDriversFromDirectory } from './drivers/driverRegistry';
import { Database } from './db/database';

async function main() {
  const [, , command, ...args] = process.argv;

  // Try to load drivers from standard locations
  await loadDrivers();

  switch (command) {
    case 'run':
      await handleRun(args);
      break;
    case 'list-drivers':
      await handleListDrivers();
      break;
    case 'version':
      console.log('Runix v0.1.0');
      break;
    default:
      printUsage();
      break;
  }
}

// Helper function to load drivers from standard locations
async function loadDrivers() {
  try {
    // Check for drivers in multiple locations
    const execDir = path.dirname(process.execPath);
    const appDir = path.dirname(require.main?.filename || '');
    
    // Define search paths in priority order
    const searchPaths = [
      // User-defined path from env var has highest priority
      process.env.RUNIX_DRIVER_DIR,
      // Current working directory
      path.join(process.cwd(), 'drivers'),
      // Next to the executable
      path.join(execDir, 'drivers'),
      // In the installation directory
      path.join(appDir, '..', 'drivers')
    ].filter(Boolean); // Filter out undefined paths
    
    // Log search paths for better debugging
    console.log(`Searching for drivers in: ${searchPaths.join(', ')}`);
    
    // Load from all paths
    for (const searchPath of searchPaths) {
      if (typeof searchPath === 'string') {
        await loadDriversFromDirectory(searchPath);
      }
    }
    
    // Check if any drivers were loaded
    const registry = DriverRegistry.getInstance();
    if (registry.listDriverIds().length === 0) {
      console.warn('No automation drivers loaded. Please ensure driver executables are in the drivers directory.');
    } else {
      console.log(`Loaded ${registry.listDriverIds().length} drivers`);
    }
  } catch (error) {
    console.error('Error loading drivers:', error);
  }
}

async function handleRun(args: string[]) {
  if (args.length === 0) {
    console.error('Error: Missing feature file path');
    printUsage();
    process.exit(1);
  }

  const featurePath = args[0];
  const configOptions: Record<string, any> = {};
  
  // Parse command line options
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      configOptions[key] = value || true;
    }
  }

  const engine = new RunixEngine({
    driverName: configOptions.driver || 'WebDriver',
    driverConfig: configOptions.driverConfig ? JSON.parse(configOptions.driverConfig) : undefined,
    tags: configOptions.tags ? configOptions.tags.split(',') : [],
    reportPath: configOptions.report || 'runix-report.json',
    parallelScenarios: configOptions.parallel === 'true'
  });

  try {
    await engine.initialize();
    await engine.runFeature(path.resolve(featurePath));
    console.log('✅ Run complete');
  } catch (err) {
    console.error('❌ Run failed:', err);
    process.exit(1);
  } finally {
    await engine.shutdown();
  }
}

async function handleListDrivers() {
  const registry = DriverRegistry.getInstance();
  const drivers = registry.getAllDrivers();
  
  console.log('Available Drivers:');
  drivers.forEach(driver => {
    // Access properties directly from DriverMetadata instead of calling getCapabilities()
    console.log(`- ${driver.name} v${driver.version}`);
    console.log(`  ${driver.description}`);
    console.log(`  Supported actions: ${driver.supportedActions.join(', ')}`);
    console.log(`  Author: ${driver.author}`);
    console.log('');
  });
}

function printUsage() {
  console.log(`
Usage: runix <command> [options]

Commands:
  run <feature-file> [options]    Run a feature file
  list-drivers                    List available drivers
  version                         Show version information

Options for 'run':
  --driver=<name>                 Driver to use (default: WebDriver)
  --driverConfig=<json>           Driver configuration as JSON string
  --tags=<tags>                   Comma-separated list of tags to filter scenarios
  --report=<path>                 Path to save report (default: runix-report.json)
  --parallel=<true|false>         Run scenarios in parallel (default: false)
`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
}

// Export public API
export { RunixEngine } from './core/engine';
export { AutomationDriver, DriverStep, DriverConfig } from './drivers/driver.interface';
export { BaseDriver } from './drivers/base.driver';
export { DriverRegistry } from './drivers/driverRegistry';
export { StepResult } from './report/resultLogger';
export { Database } from './db/database';
export { DatabaseConfig } from './db/database.interface';
