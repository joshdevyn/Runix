#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Building ExampleDriver executable...');

// Create a simple wrapper script - single line with no formatting issues
fs.writeFileSync(path.join(__dirname, 'driver.js'), "#!/usr/bin/env node\nconst port = process.env.RUNIX_DRIVER_PORT || process.argv.find(arg => arg.startsWith('--port='))?.replace('--port=', '') || process.argv[process.argv.indexOf('--port') + 1] || 8000;\nprocess.env.RUNIX_DRIVER_PORT = port;\nrequire('./index.js');");

// Make sure driver.json has the right executable name
try {
  const driverJsonPath = path.join(__dirname, 'driver.json');
  if (fs.existsSync(driverJsonPath)) {
    const driverConfig = JSON.parse(fs.readFileSync(driverJsonPath, 'utf8'));
    driverConfig.executable = 'ExampleDriver.exe';
    fs.writeFileSync(driverJsonPath, JSON.stringify(driverConfig, null, 2));
    console.log('Updated driver.json to use ExampleDriver.exe');
  }
} catch (err) {
  console.error('Error updating driver.json:', err.message);
}

// Check if there's an existing ExampleDriver.exe before building
if (fs.existsSync(path.join(__dirname, 'ExampleDriver.exe'))) {
  console.log('Removing existing ExampleDriver.exe');
  try {
    fs.unlinkSync(path.join(__dirname, 'ExampleDriver.exe'));
  } catch (err) {
    console.error('Failed to remove existing executable:', err.message);
    process.exit(1);
  }
}

// Build the executable with pkg
try {
  console.log('Building ExampleDriver.exe with pkg...');
  execSync('npx pkg . --output ExampleDriver.exe --targets node18-win-x64', {
    cwd: __dirname,
    stdio: 'inherit'
  });
  console.log('Successfully built ExampleDriver.exe');
} catch (err) {
  console.error('Failed to build executable:', err.message);
  process.exit(1);
}
