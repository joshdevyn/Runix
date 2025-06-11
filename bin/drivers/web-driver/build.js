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
      console.log(`${timestamp} [INFO] [build.js::UnifiedWebDriverBuilder::${caller}] ${message}${dataStr}`);
    },
    error: (message, data = {}) => {
      const caller = getCallerInfo();
      const timestamp = new Date().toISOString();
      const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      console.error(`${timestamp} [ERROR] [build.js::UnifiedWebDriverBuilder::${caller}] ${message}${dataStr}`);
    }
  };
}

const logger = createBuildLogger();

logger.log('Building Unified WebDriver...');

// Validate we're in the right directory
if (!fs.existsSync('package.json') || !fs.existsSync('driver.json')) {
  logger.error('Error: Must run from web-driver directory with package.json and driver.json');
  process.exit(1);
}

try {
  // Read package.json to get the main entry point
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const mainFile = packageJson.main || 'index.js';

  if (!fs.existsSync(mainFile)) {
    logger.error(`Error: Main file ${mainFile} not found`);
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
  return '9001'; // Default for standalone testing
})();

// Validate port number
const portNum = parseInt(port, 10);
if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
  console.error('Invalid port number:', port);
  process.exit(1);
}

// Set the port in environment for the driver to use
process.env.RUNIX_DRIVER_PORT = portNum.toString();
require('./index.js');
`;

  fs.writeFileSync('driver.js', wrapperContent);
  logger.log('Created driver.js wrapper');

  // Build standalone executable
  const driverJson = JSON.parse(fs.readFileSync('driver.json', 'utf8'));
  const executableName = driverJson.executable || (process.platform === 'win32' ? 'WebDriver.exe' : 'WebDriver');

  logger.log(`Building standalone executable: ${executableName}`);  // Build standalone executable with correct target format
  const pkgAssets = packageJson.pkg?.assets || [];
  const assetArgs = pkgAssets.length > 0 ? `--assets ${pkgAssets.join(',')}` : '';
  
  const pkgCommand = `npm exec -- pkg driver.js --targets node18-win-x64 --output ${executableName} ${assetArgs}`;
  logger.log(`Running: ${pkgCommand}`);
  
  execSync(pkgCommand, { stdio: 'inherit' });
  
  logger.log(`✅ Successfully built ${executableName}`);
  
  // Verify executable exists
  if (!fs.existsSync(executableName)) {
    logger.error(`Error: Executable ${executableName} not found after build`);
    process.exit(1);
  }

  logger.log('✅ Unified WebDriver build process complete');

} catch (err) {
  logger.error('Build failed:', err);
  process.exit(1);
}
