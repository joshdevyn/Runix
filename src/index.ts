#!/usr/bin/env node
import { RunixEngine } from './core/engine';
import { Logger } from './utils/logger';
import { DriverRegistry } from './drivers/driverRegistry';

const args = process.argv.slice(2);
const command = args[0];
const logger = Logger.getInstance();

if (command === 'run') {
  const feature = args[1];
  const options: any = {
    driver: 'ExampleDriver',
    driverConfig: '{}',
    tags: [], // Already an array
    parallel: false
  };

  args.slice(2).forEach(arg => {
    const [key, value] = arg.split('=');
    if (key && value !== undefined) {
      options[key.replace('--', '')] = value;
    }
  });
  
  (async () => {
    try {
      // Initialize DriverRegistry before RunixEngine
      const registry = DriverRegistry.getInstance();
      await registry.initialize();

      const config = {
        driverName: options.driver,
        driverConfig: JSON.parse(options.driverConfig),
        // options.tags logic is correct as is
        tags: Array.isArray(options.tags) ? options.tags : (options.tags ? options.tags.split(',') : []),
        // Ensure parallelScenarios is a boolean
        parallelScenarios: typeof options.parallel === 'string' 
          ? options.parallel.toLowerCase() === 'true' 
          : Boolean(options.parallel),
        reportPath: 'reports/runix-report.json',
        logLevel: 1, // DEBUG
        logFilePath: 'logs/runix-dev.log'
      };

      const engine = new RunixEngine(config);
      
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
