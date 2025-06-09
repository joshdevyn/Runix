#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Use structured logger for build scripts
function createBuildLogger() {
  const getCallerInfo = () => {
    const stack = new Error().stack;
    if (!stack) return { file: 'build-binaries.js', method: 'unknown' };

    const lines = stack.split('\n');
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('build-binaries.js')) {
        const match = line.match(/at\s+(\w+)\s*\(/);
        return {
          file: 'build-binaries.js',
          method: match ? match[1] : 'anonymous'
        };
      }
    }
    return { file: 'build-binaries.js', method: 'unknown' };
  };

  return {
    info: (message, data = {}) => {
      const caller = getCallerInfo();
      const timestamp = new Date().toISOString();
      const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      console.log(`${timestamp} [INFO] [${caller.file}::BuildProcess::${caller.method}] ${message}${dataStr}`);
    },
    error: (message, data = {}) => {
      const caller = getCallerInfo();
      const timestamp = new Date().toISOString();
      const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      console.error(`${timestamp} [ERROR] [${caller.file}::BuildProcess::${caller.method}] ${message}${dataStr}`);
    }
  };
}

const logger = createBuildLogger();

// Configuration
const targetDir = path.join(__dirname, '..', 'bin');
const platforms = ['win-x64', 'linux-x64', 'macos-x64'];
const nodeVersion = '18'; // Node.js version

// Create target directory if it doesn't exist
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

logger.info(`Building binaries for ${platforms.join(', ')} in ${targetDir}`);

// Build command - let pkg use its default naming
const pkgArgs = [
  'dist/src/index.js',
  '--targets', platforms.map(p => `node${nodeVersion}-${p}`).join(','),
  '--out-path', 'bin'
];

const pkgProcess = spawn('pkg', pkgArgs, { 
  stdio: 'inherit',
  shell: true
});

pkgProcess.on('close', (code) => {
  if (code !== 0) {
    logger.error(`pkg process exited with code ${code}`);
    process.exit(code);
  }
    // Check what files were actually created and rename them appropriately
  const binContents = fs.readdirSync('bin');
  logger.info(`Files created in bin: ${binContents.join(', ')}`);
  
  // Map platform-specific naming
  const platformMapping = {
    'win-x64': { pattern: /index.*win.*\.exe$/i, finalName: 'runix.exe' },
    'linux-x64': { pattern: /index.*linux/i, finalName: 'runix-linux' },
    'macos-x64': { pattern: /index.*macos/i, finalName: 'runix-macos' }
  };
  
  // Process each created binary
  binContents.forEach(filename => {
    const filePath = path.join('bin', filename);
    
    // Find which platform this file belongs to
    for (const [platform, config] of Object.entries(platformMapping)) {
      if (config.pattern.test(filename)) {
        const finalPath = path.join('bin', config.finalName);
        
        try {
          // Only rename if the target doesn't exist or is different
          if (!fs.existsSync(finalPath) || filename !== config.finalName) {
            if (fs.existsSync(finalPath)) {
              fs.unlinkSync(finalPath); // Remove existing
            }
            fs.renameSync(filePath, finalPath);
          }
          
          logger.info(`✅ Created: ${config.finalName} (${platform})`);
          
          // Fix permissions on Unix
          if (!platform.includes('win') && os.platform() !== 'win32') {
            fs.chmodSync(finalPath, '755');
            logger.info(`Fixed permissions for ${config.finalName}`);
          }
        } catch (renameError) {
          logger.error(`Failed to rename ${filename} to ${config.finalName}: ${renameError.message}`);
        }
        break;
      }
    }
  });
  
  // Create batch file for Windows if runix.exe exists
  const exePath = path.join('bin', 'runix.exe');
  const batPath = path.join('bin', 'runix.bat');
  
  if (fs.existsSync(exePath)) {
    const batContent = `@echo off
"%~dp0\\runix.exe" %*`;
    fs.writeFileSync(batPath, batContent);
    logger.info('✅ Created runix.bat wrapper');
  }
  
  logger.info('Binary build process completed!');
});
