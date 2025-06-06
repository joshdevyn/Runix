#!/usr/bin/env node
// Get port from environment (assigned by Runix engine) or command line for standalone testing
const port = (() => {
  const envPort = process.env.RUNIX_DRIVER_PORT;
  if (envPort) return envPort; // Engine assigned port takes precedence
  
  const portArg = process.argv.find(arg => arg.startsWith('--port='));
  if (portArg) return portArg.replace('--port=', '');
  const portIndex = process.argv.indexOf('--port');
  if (portIndex !== -1 && process.argv[portIndex + 1]) return process.argv[portIndex + 1];
  return '9003'; // Default for standalone testing
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
