#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Use structured logger for build scripts
function createBuildLogger() {
  const getCallerInfo = () => {
    const stack = new Error().stack;
    if (!stack) return { file: 'copy-drivers.js', method: 'unknown' };

    const lines = stack.split('\n');
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('copy-drivers.js')) {
        const match = line.match(/at\s+(\w+)\s*\(/);
        return {
          file: 'copy-drivers.js',
          method: match ? match[1] : 'anonymous'
        };
      }
    }
    return { file: 'copy-drivers.js', method: 'unknown' };
  };

  return {
    info: (message, data = {}) => {
      const caller = getCallerInfo();
      const timestamp = new Date().toISOString();
      const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      console.log(`${timestamp} [INFO] [${caller.file}::CopyProcess::${caller.method}] ${message}${dataStr}`);
    },
    error: (message, data = {}) => {
      const caller = getCallerInfo();
      const timestamp = new Date().toISOString();
      const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      console.error(`${timestamp} [ERROR] [${caller.file}::CopyProcess::${caller.method}] ${message}${dataStr}`);
    }
  };
}

const logger = createBuildLogger();

// Configuration
const sourceDir = path.join(__dirname, '..', 'drivers');
const targetDir = path.join(__dirname, '..', 'bin', 'drivers');

// Recursive copy function
function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    logger.error(`Source directory does not exist: ${src}`);
    return false;
  }

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const items = fs.readdirSync(src);
  let copiedCount = 0;

  items.forEach(item => {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    
    const stat = fs.statSync(srcPath);
    
    if (stat.isDirectory()) {
      if (copyRecursive(srcPath, destPath)) {
        copiedCount++;
      }
    } else {
      fs.copyFileSync(srcPath, destPath);
      copiedCount++;
    }
  });

  return copiedCount > 0;
}

// Main execution
logger.info(`Copying drivers from ${sourceDir} to ${targetDir}`);

try {
  if (!fs.existsSync(sourceDir)) {
    logger.error(`Source drivers directory does not exist: ${sourceDir}`);
    process.exit(1);
  }

  // Ensure target directory exists
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Copy all drivers
  const driverDirs = fs.readdirSync(sourceDir).filter(item => {
    const itemPath = path.join(sourceDir, item);
    return fs.statSync(itemPath).isDirectory();
  });
  let totalCopied = 0;
  driverDirs.forEach(driverDir => {
    const srcDriverPath = path.join(sourceDir, driverDir);
    const destDriverPath = path.join(targetDir, driverDir);
    
    logger.info(`Copying driver: ${driverDir}`);
    
    if (copyRecursive(srcDriverPath, destDriverPath)) {
      totalCopied++;
      
      // Copy .env file to driver directory for environment variables
      const rootEnvPath = path.join(__dirname, '..', '.env');
      const driverEnvPath = path.join(destDriverPath, '.env');
      
      if (fs.existsSync(rootEnvPath)) {
        try {
          fs.copyFileSync(rootEnvPath, driverEnvPath);
          logger.info(`✅ Copied .env file to driver: ${driverDir}`);
        } catch (envError) {
          logger.error(`⚠️  Failed to copy .env to driver ${driverDir}: ${envError.message}`);
        }
      }
      
      logger.info(`✅ Copied driver: ${driverDir}`);
    } else {
      logger.error(`❌ Failed to copy driver: ${driverDir}`);
    }
  });

  logger.info(`Driver copy completed! Copied ${totalCopied}/${driverDirs.length} drivers`);
  
  // List what's in the target directory
  if (fs.existsSync(targetDir)) {
    const copiedDrivers = fs.readdirSync(targetDir);
    logger.info(`Drivers available in bin: ${copiedDrivers.join(', ')}`);
  }

} catch (error) {
  logger.error(`Failed to copy drivers: ${error.message}`);
  process.exit(1);
}
