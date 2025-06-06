#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
      console.log(`${timestamp} [INFO] [build.js::WebDriverBuilder::${caller}] ${message}${dataStr}`);
    },
    error: (message, data = {}) => {
      const caller = getCallerInfo();
      const timestamp = new Date().toISOString();
      const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      console.error(`${timestamp} [ERROR] [build.js::WebDriverBuilder::${caller}] ${message}${dataStr}`);
    }
  };
}

const logger = createBuildLogger();

logger.log('Building WebDriver...');

// Validate we're in the right directory
if (!fs.existsSync('package.json') || !fs.existsSync('driver.json')) {
  logger.error('Error: Must run from web-driver directory with package.json and driver.json');
  process.exit(1);
}

try {
  // First compile TypeScript
  logger.log('Compiling TypeScript...');
  execSync('npm run compile', { stdio: 'inherit' });
  
  // Read package.json to get the main entry point
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const mainFile = 'dist/index.js'; // Compiled output
  
  if (!fs.existsSync(mainFile)) {
    logger.error(`Error: Compiled file ${mainFile} not found`);
    process.exit(1);
  }

  // Create wrapper script for port handling
  const wrapperContent = `#!/usr/bin/env node
// Get port from environment (assigned by Runix engine) or command line for standalone testing
const port = (() => {
  const envPort = process.env.RUNIX_DRIVER_PORT;
  if (envPort) return envPort; // Engine assigned port takes precedence
  
  const portArg = process.argv.find(arg => arg.startsWith('--port='));
  if (portArg) return portArg.replace('--port=', '');
  const portIndex = process.argv.indexOf('--port');
  if (portIndex !== -1 && process.argv[portIndex + 1]) return process.argv[portIndex + 1];
  return '8000'; // Default for standalone testing
})();

// Validate port number
const portNum = parseInt(port, 10);
if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
  console.error('Invalid port number:', port);
  process.exit(1);
}

// Set the port in environment for the driver to use
process.env.RUNIX_DRIVER_PORT = portNum.toString();
require('./dist/index.js');
`;

  fs.writeFileSync('driver.js', wrapperContent);
  logger.log('Created driver.js wrapper');

  // Build standalone executable
  const executableName = process.platform === 'win32' ? 'WebDriver.exe' : 'WebDriver';

  logger.log(`Building standalone executable: ${executableName}`);

  // Build standalone executable with correct target format
  execSync('npm exec -- pkg driver.js --targets node18-win-x64 --output WebDriver.exe', { stdio: 'inherit' });
  
  logger.log(`✅ Successfully built ${executableName}`);
  
  // Verify executable exists
  if (fs.existsSync(executableName)) {
    logger.log(`📁 Executable size: ${Math.round(fs.statSync(executableName).size / 1024 / 1024)} MB`);
    
    // Update driver.json to reference the executable
    const driverConfig = JSON.parse(fs.readFileSync('driver.json', 'utf8'));
    driverConfig.executable = executableName;
    fs.writeFileSync('driver.json', JSON.stringify(driverConfig, null, 2));
    logger.log('✅ Updated driver.json executable reference');
    
    logger.log('\n🎉 WebDriver build complete!');
    logger.log(`Standalone testing: ./${executableName} --port=8000`);
    logger.log(`Engine usage: Port will be assigned automatically by Runix`);
  } else {
    logger.error('❌ Executable not found after build');
    process.exit(1);
  }
} catch (error) {
  logger.error('Error during build process', { error: error.message });
  process.exit(1);
}
