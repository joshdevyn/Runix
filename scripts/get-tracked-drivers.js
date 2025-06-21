#!/usr/bin/env node

/**
 * Script to get dynamically tracked driver process names
 * This replaces hardcoded driver names in Task files
 */

const { DriverProcessManager } = require('../dist/drivers/management/DriverProcessManager');

async function getTrackedDrivers() {
  try {
    const manager = DriverProcessManager.getInstance();
    const trackedProcessNames = manager.getTrackedProcessNames();
    const runningProcesses = manager.getRunningProcesses();
    
    console.log('Tracked Process Names:', trackedProcessNames.join(' '));
    console.log('Running Driver Count:', runningProcesses.length);
    
    if (runningProcesses.length > 0) {
      console.log('Running Drivers:');
      runningProcesses.forEach(proc => {
        console.log(`  ${proc.driverId}: PID ${proc.pid}, Port ${proc.port}, Process: ${proc.processName || 'Unknown'}`);
      });
    }
    
    return {
      trackedNames: trackedProcessNames,
      runningCount: runningProcesses.length,
      processes: runningProcesses
    };
  } catch (error) {
    console.error('Error getting tracked drivers:', error.message);
    return {
      trackedNames: [],
      runningCount: 0,
      processes: []
    };
  }
}

// If run directly, output the information
if (require.main === module) {
  getTrackedDrivers();
}

module.exports = { getTrackedDrivers };
