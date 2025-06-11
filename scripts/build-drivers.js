#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Create structured logger for build processes
function createBuildLogger() {
  return {
    log: (message, data = {}) => {
      const timestamp = new Date().toISOString();
      const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      console.log(`${timestamp} [INFO] [build-drivers.js] ${message}${dataStr}`);
    },
    error: (message, data = {}) => {
      const timestamp = new Date().toISOString();
      const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      console.error(`${timestamp} [ERROR] [build-drivers.js] ${message}${dataStr}`);
    }
  };
}

const logger = createBuildLogger();

logger.log('Building all drivers...');

const driversDir = path.join(__dirname, '..', 'drivers');

if (!fs.existsSync(driversDir)) {
  logger.error('Drivers directory not found:', driversDir);
  process.exit(1);
}

const driverDirs = fs.readdirSync(driversDir)
  .filter(dir => fs.statSync(path.join(driversDir, dir)).isDirectory())
  .filter(dir => fs.existsSync(path.join(driversDir, dir, 'build.js')));

logger.log('Found drivers with build scripts:', driverDirs);

let buildErrors = [];

for (const driverDir of driverDirs) {
  const driverPath = path.join(driversDir, driverDir);
  const buildScript = path.join(driverPath, 'build.js');
  
  logger.log(`Building driver: ${driverDir}`);
  
  try {
    // Change to driver directory and run build
    process.chdir(driverPath);
    execSync('node build.js', { stdio: 'inherit' });
    logger.log(`✅ Successfully built ${driverDir}`);
  } catch (error) {
    logger.error(`❌ Failed to build ${driverDir}:`, error.message);
    buildErrors.push({ driver: driverDir, error: error.message });
  }
}

// Return to original directory
process.chdir(path.join(__dirname, '..'));

if (buildErrors.length > 0) {
  logger.error('Some drivers failed to build:');
  buildErrors.forEach(({ driver, error }) => {
    logger.error(`  ${driver}: ${error}`);
  });
  process.exit(1);
} else {
  logger.log('✅ All drivers built successfully');
}
