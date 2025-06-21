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
    
    // Try up to 3 times if build fails due to file locking
    let attempts = 0;
    let buildSuccess = false;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts && !buildSuccess) {
      try {
        attempts++;
        if (attempts > 1) {
          logger.log(`Build attempt ${attempts} for ${driverDir}...`);
          // Wait between attempts
          execSync('timeout /t 2 /nobreak >nul 2>&1 || sleep 2', { stdio: 'pipe' });
        }
        
        execSync('node build.js', { stdio: 'inherit' });
        buildSuccess = true;
        logger.log(`✅ Successfully built ${driverDir}`);
      } catch (error) {
        if (attempts >= maxAttempts) {
          throw error; // Re-throw on final attempt
        }
        logger.log(`⚠️ Build attempt ${attempts} failed for ${driverDir}, retrying...`);
      }
    }
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
