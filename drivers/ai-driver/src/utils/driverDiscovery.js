/**
 * Driver Discovery and Client Management Module
 * Handles discovery of available drivers and manages driver client connections
 */

const WebSocket = require('ws');

/**
 * DriverClient class for communicating with individual drivers
 */
class DriverClient {
  constructor(driverId, port) {
    this.driverId = driverId;
    this.port = port;
    this.ws = null;
    this.connected = false;
    this.messageHandlers = new Map();
    this.requestCounter = 0;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        console.log(`Connecting to driver ${this.driverId} on port ${this.port}...`);
        this.ws = new WebSocket(`ws://127.0.0.1:${this.port}`);
        
        this.ws.on('open', () => {
          console.log(`Connected to driver: ${this.driverId}`);
          this.connected = true;
          resolve();
        });
        
        this.ws.on('message', (data) => {
          try {
            const response = JSON.parse(data);
            const handler = this.messageHandlers.get(response.id);
            if (handler) {
              this.messageHandlers.delete(response.id);
              handler(response);
            }
          } catch (err) {
            console.error(`Error parsing response from ${this.driverId}:`, err);
          }
        });
        
        this.ws.on('close', () => {
          console.log(`Disconnected from driver: ${this.driverId}`);
          this.connected = false;
        });
        
        this.ws.on('error', (error) => {
          console.error(`WebSocket error for ${this.driverId}:`, error);
          this.connected = false;
          reject(error);
        });
      } catch (error) {
        console.error(`Failed to create WebSocket connection to ${this.driverId}:`, error);
        reject(error);
      }
    });
  }

  async execute(action, args) {
    if (!this.connected || !this.ws) {
      throw new Error(`Not connected to driver: ${this.driverId}`);
    }
    
    return new Promise((resolve, reject) => {
      const requestId = `req-${Date.now()}-${++this.requestCounter}`;
      
      const request = {
        id: requestId,
        method: 'execute',
        params: { action, args }
      };
      
      // Set up response handler
      this.messageHandlers.set(requestId, (response) => {
        if (response.error) {
          reject(new Error(response.error.message || 'Driver execution failed'));
        } else {
          // Handle different response formats
          const result = response.result || response;
          resolve(result);
        }
      });
      
      // Send request
      this.ws.send(JSON.stringify(request));
      
      // Set timeout for response
      setTimeout(() => {
        if (this.messageHandlers.has(requestId)) {
          this.messageHandlers.delete(requestId);
          reject(new Error(`Timeout waiting for response from ${this.driverId}`));
        }
      }, 30000);
    });
  }
  
  async executeStep(action, args) {
    return this.execute(action, args);
  }
  
  async disconnect() {
    if (this.ws) {
      this.ws.close();
      this.connected = false;
    }
  }
}

// Map to store active DriverClient instances
const driverClients = new Map();

/**
 * Gets or creates a driver client instance
 * @param {string} driverId - ID of the driver to connect to
 * @param {Object} config - Configuration object containing known drivers
 * @param {Map} availableDrivers - Map of available drivers (for testing)
 * @returns {Promise<DriverClient|null>} Driver client instance or null if failed
 */
async function getDriverInstance(driverId, config, availableDrivers = new Map()) {
  // Test mode: return mocked drivers if global mocks are available
  if (global.MOCK_DRIVER_REGISTRY && global.MOCK_DRIVER_REGISTRY.getDriverInstance) {
    console.log(`Using mocked driver instance for ${driverId} (test mode)`);
    return await global.MOCK_DRIVER_REGISTRY.getDriverInstance(driverId);
  }

  if (driverClients.has(driverId)) {
    const client = driverClients.get(driverId);
    if (client.connected) {
      return client;
    } else {
      try {
        console.log(`Attempting to reconnect to ${driverId}...`);
        await client.connect();
        if (client.connected) {
          console.log(`Successfully reconnected to ${driverId}.`);
          return client;
        }
        console.warn(`Reconnection attempt to ${driverId} did not result in connected state.`);
        driverClients.delete(driverId);
        return null;
      } catch (e) {
        console.error(`Failed to reconnect to ${driverId}:`, { error: e.message });
        driverClients.delete(driverId);
        return null;
      }
    }
  }

  const driverConfig = config.knownDrivers.find(d => d.id === driverId || d.name === driverId);
  if (driverConfig && driverConfig.port) {
    console.log(`Creating new DriverClient for ${driverId} on port ${driverConfig.port}`);
    const newClient = new DriverClient(driverId, driverConfig.port);
    try {
      await newClient.connect();
      if (newClient.connected) {
        driverClients.set(driverId, newClient);
        return newClient;
      }
      console.warn(`New connection attempt to ${driverId} did not result in connected state.`);
      return null;
    } catch (error) {
      console.error(`Failed to connect to new driver ${driverId}:`, { error: error.message });
      return null;
    }
  } else {
    console.warn(`Configuration (including port) not found for driver ${driverId}. Cannot create client.`);
    if (availableDrivers.has(driverId) && !driverConfig) {
        console.log(`Driver ${driverId} found in availableDrivers (mock) but port info is missing from config.knownDrivers.`);
    }
    return null;
  }
}

/**
 * Discovers available drivers by attempting to connect to known driver ports
 * @param {Object} config - Configuration object containing known drivers
 * @returns {Promise<Array>} Array of available driver information
 */
async function discoverDrivers(config) {
  console.log('Discovering available drivers...');
  const availableDrivers = [];
  
  for (const driver of config.knownDrivers) {
    try {
      // Test connection to the driver
      const testClient = new DriverClient(driver.id, driver.port);
      await testClient.connect();
      
      if (testClient.connected) {
        console.log(`✓ Driver ${driver.id} is available on port ${driver.port}`);
        availableDrivers.push({
          id: driver.id,
          name: driver.name,
          port: driver.port,
          description: driver.description || `${driver.name} driver`,
          status: 'online'
        });
        await testClient.disconnect();
      }
    } catch (error) {
      console.log(`✗ Driver ${driver.id} is not available on port ${driver.port}`);
    }
  }
  
  console.log(`Driver discovery completed. Found ${availableDrivers.length} available drivers.`);
  return availableDrivers;
}

/**
 * Gets a list of all available drivers for capabilities reporting
 * @param {Object} config - Configuration object containing known drivers
 * @returns {Promise<Array>} Array of driver capabilities
 */
async function getAvailableDrivers(config) {
  const drivers = await discoverDrivers(config);
  return drivers.map(driver => ({
    id: driver.id,
    name: driver.name,
    description: driver.description,
    actions: getDriverActions(driver.id)
  }));
}

/**
 * Gets the supported actions for a specific driver
 * @param {string} driverId - ID of the driver
 * @returns {Array} Array of supported actions
 */
function getDriverActions(driverId) {
  const actionMap = {
    'ui-driver': [
      'click', 'doubleClick', 'rightClick', 'type', 'key', 'keyCombo',
      'scroll', 'drag', 'hover', 'getElement', 'waitFor', 'screenshot'
    ],
    'file-driver': [
      'readFile', 'writeFile', 'deleteFile', 'copyFile', 'moveFile',
      'createFolder', 'deleteFolder', 'listFiles', 'exists', 'getInfo'
    ],
    'browser-driver': [
      'navigate', 'click', 'type', 'scroll', 'waitFor', 'screenshot',
      'executeScript', 'getCookies', 'setCookie', 'clearCookies'
    ]
  };
  
  return actionMap[driverId] || [];
}

/**
 * Closes all active driver connections
 * @returns {Promise<void>}
 */
async function closeAllDriverConnections() {
  console.log('Closing all driver connections...');
  const closePromises = [];
  
  for (const [driverId, client] of driverClients.entries()) {
    if (client.connected) {
      closePromises.push(client.disconnect());
    }
  }
  
  await Promise.all(closePromises);
  driverClients.clear();
  console.log('All driver connections closed.');
}

/**
 * Health check for a specific driver
 * @param {string} driverId - ID of the driver to check
 * @param {Object} config - Configuration object
 * @returns {Promise<Object>} Health status
 */
async function checkDriverHealth(driverId, config) {
  try {
    const client = await getDriverInstance(driverId, config);
    if (!client) {
      return {
        id: driverId,
        status: 'offline',
        error: 'Could not connect to driver'
      };
    }
    
    // Try to execute a simple health check
    try {
      await client.execute('health', {});
      return {
        id: driverId,
        status: 'online',
        connected: true
      };
    } catch (error) {
      return {
        id: driverId,
        status: 'connected_but_unhealthy',
        error: error.message
      };
    }
  } catch (error) {
    return {
      id: driverId,
      status: 'offline',
      error: error.message
    };
  }
}

module.exports = {
  DriverClient,
  getDriverInstance,
  discoverDrivers,
  getAvailableDrivers,
  getDriverActions,
  closeAllDriverConnections,
  checkDriverHealth
};
