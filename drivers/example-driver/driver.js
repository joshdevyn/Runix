#!/usr/bin/env node
const port = process.env.RUNIX_DRIVER_PORT || process.argv.find(arg => arg.startsWith('--port='))?.replace('--port=', '') || process.argv[process.argv.indexOf('--port') + 1] || 8000;
process.env.RUNIX_DRIVER_PORT = port;
require('./index.js');