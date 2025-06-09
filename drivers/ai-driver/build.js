#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

// Create structured logger for build scripts
function createBuildLogger() {
  const getCallerInfo = () => {
    const stack = new Error().stack;
    if (!stack) return 'unknown';
    
    const lines = stack.split('\n');
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/at\s+(\w+)\s*\(/);
      if (match) return match[1];
    }
    return 'unknown';
  };

  return {
    log: (message, data = {}) => {
      const caller = getCallerInfo();
      const timestamp = new Date().toISOString();
      const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      console.log(`${timestamp} [INFO] [build.js::AIDriverBuilder::${caller}] ${message}${dataStr}`);
    },
    error: (message, data = {}) => {
      const caller = getCallerInfo();
      const timestamp = new Date().toISOString();
      const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      console.error(`${timestamp} [ERROR] [build.js::AIDriverBuilder::${caller}] ${message}${dataStr}`);
    }
  };
}

const logger = createBuildLogger();

logger.log('Building AIDriver...');

// Validate we're in the right directory
if (!fs.existsSync('package.json') || !fs.existsSync('driver.json')) {
  logger.error('Error: Must run from ai-driver directory with package.json and driver.json');
  process.exit(1);
}

// Read package.json to get the main entry point
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const mainFile = packageJson.main || 'index.js';

if (!fs.existsSync(mainFile)) {
  logger.error(`Error: Main file ${mainFile} not found`);
  process.exit(1);
}

// Create wrapper script for port handling
// Use the working standalone.js as the entry point
logger.log('Using existing standalone.js as entry point');

// Build standalone executable
const executableName = process.platform === 'win32' ? 'AIDriver.exe' : 'AIDriver';

logger.log(`Building standalone executable: ${executableName}`);

try {
    // Build standalone executable with correct target format
    execSync('npm exec -- pkg standalone.js --targets node18-win-x64 --output AIDriver.exe', { stdio: 'inherit' });
    
    logger.log(`✅ Successfully built ${executableName}`);
    
    // Verify executable exists
    if (fs.existsSync(executableName)) {
      logger.log(`📁 Executable size: ${Math.round(fs.statSync(executableName).size / 1024 / 1024)} MB`);
      
      // Update driver.json to reference the executable
      const driverConfig = JSON.parse(fs.readFileSync('driver.json', 'utf8'));
      driverConfig.executable = executableName;
      fs.writeFileSync('driver.json', JSON.stringify(driverConfig, null, 2));
      logger.log('✅ Updated driver.json executable reference');
      
      logger.log('\n🎉 AIDriver build complete!');
      logger.log(`Standalone testing: ./${executableName} --port=9004`);
      logger.log(`Engine usage: Port will be assigned automatically by Runix`);
    } else {
      logger.error('❌ Executable not found after build');
      process.exit(1);
    }
} catch (error) {
    logger.error('Error during build process', { error: error.message });
    process.exit(1);
}
