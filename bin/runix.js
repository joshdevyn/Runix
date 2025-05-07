#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Database = exports.DriverRegistry = exports.BaseDriver = exports.RunixEngine = void 0;
const engine_1 = require("./core/engine");
const path_1 = __importDefault(require("path"));
const driverRegistry_1 = require("./drivers/driverRegistry");
async function main() {
    const [, , command, ...args] = process.argv;
    // Try to load drivers from default locations
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
        // First check for drivers in the current working directory
        await (0, driverRegistry_1.loadDriversFromDirectory)(path_1.default.join(process.cwd(), 'drivers'));
        // Then check for drivers alongside the executable
        const execDir = path_1.default.dirname(process.execPath);
        await (0, driverRegistry_1.loadDriversFromDirectory)(path_1.default.join(execDir, 'drivers'));
        // Also check for built-in drivers from our library directory
        await (0, driverRegistry_1.loadDriversFromDirectory)(path_1.default.join(__dirname, 'drivers'));
        // Look for optional user-defined drivers directory from env var
        const customDriverDir = process.env.RUNIX_DRIVER_DIR;
        if (customDriverDir) {
            await (0, driverRegistry_1.loadDriversFromDirectory)(customDriverDir);
        }
        // Check if any drivers were loaded
        const registry = driverRegistry_1.DriverRegistry.getInstance();
        if (registry.listDriverIds().length === 0) {
            console.warn('No automation drivers loaded. Some features may be unavailable.');
        }
    }
    catch (err) {
        console.warn('Error loading drivers:', err);
    }
}
async function handleRun(args) {
    if (args.length === 0) {
        console.error('Error: Missing feature file path');
        printUsage();
        process.exit(1);
    }
    const featurePath = args[0];
    const configOptions = {};
    // Parse command line options
    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const [key, value] = arg.substring(2).split('=');
            configOptions[key] = value || true;
        }
    }
    const engine = new engine_1.RunixEngine({
        driverName: configOptions.driver || 'WebDriver',
        driverConfig: configOptions.driverConfig ? JSON.parse(configOptions.driverConfig) : undefined,
        tags: configOptions.tags ? configOptions.tags.split(',') : [],
        reportPath: configOptions.report || 'runix-report.json',
        parallelScenarios: configOptions.parallel === 'true'
    });
    try {
        await engine.initialize();
        await engine.runFeature(path_1.default.resolve(featurePath));
        console.log('✅ Run complete');
    }
    catch (err) {
        console.error('❌ Run failed:', err);
        process.exit(1);
    }
    finally {
        await engine.shutdown();
    }
}
async function handleListDrivers() {
    const registry = driverRegistry_1.DriverRegistry.getInstance();
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
var engine_2 = require("./core/engine");
Object.defineProperty(exports, "RunixEngine", { enumerable: true, get: function () { return engine_2.RunixEngine; } });
var base_driver_1 = require("./drivers/base.driver");
Object.defineProperty(exports, "BaseDriver", { enumerable: true, get: function () { return base_driver_1.BaseDriver; } });
var driverRegistry_2 = require("./drivers/driverRegistry");
Object.defineProperty(exports, "DriverRegistry", { enumerable: true, get: function () { return driverRegistry_2.DriverRegistry; } });
var database_1 = require("./db/database");
Object.defineProperty(exports, "Database", { enumerable: true, get: function () { return database_1.Database; } });
