#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Configuration
const targetDir = path.join(__dirname, '..', 'bin', 'runix');
const platforms = ['win-x64', 'linux-x64', 'macos-x64'];
const nodeVersion = '18'; // Node.js version

// Create target directory if it doesn't exist
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

console.log(`Building binaries for ${platforms.join(', ')} in ${targetDir}`);

// Build command
const pkgArgs = [
  'dist/index.js',
  '--targets', platforms.map(p => `node${nodeVersion}-${p}`).join(','),
  '--output', path.join(targetDir, 'runix')
];

// Platform-specific extensions
const pkgProcess = spawn('pkg', pkgArgs, { 
  stdio: 'inherit',
  shell: true
});

pkgProcess.on('close', (code) => {
  if (code !== 0) {
    console.error(`pkg process exited with code ${code}`);
    process.exit(code);
  }
  
  // Fix permissions on Unix
  if (os.platform() !== 'win32') {
    platforms.forEach(platform => {
      if (!platform.includes('win')) {
        const binaryPath = path.join(targetDir, `runix-${platform}`);
        fs.chmodSync(binaryPath, '755');
        console.log(`Fixed permissions for ${binaryPath}`);
      }
    });
  }
  
  console.log('Binary build process completed successfully!');
});
