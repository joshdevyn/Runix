import { DriverRegistry } from '../../src/drivers/driverRegistry';
import { ConfigValidator } from '../../src/utils/config-validator';
import path from 'path';
import fs from 'fs';

describe('DriverRegistry Integration', () => {
  let registry: DriverRegistry;
  const testDriversDir = path.join(__dirname, '../fixtures/test-drivers');

  beforeAll(async () => {
    // Create test driver structure
    await fs.promises.mkdir(testDriversDir, { recursive: true });
    
    // Create a test driver
    const driverDir = path.join(testDriversDir, 'test-driver');
    await fs.promises.mkdir(driverDir, { recursive: true });
    
    // Create driver.json
    const driverConfig = {
      name: 'TestDriver',
      executable: 'index.js',
      transport: 'websocket'
    };
    await fs.promises.writeFile(
      path.join(driverDir, 'driver.json'),
      JSON.stringify(driverConfig, null, 2)
    );
    
    // Create a simple driver implementation
    const driverCode = `
const WebSocket = require('ws');
const port = parseInt(process.env.RUNIX_DRIVER_PORT || '9998', 10);

const server = require('http').createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    const request = JSON.parse(data);
    
    if (request.method === 'capabilities') {
      ws.send(JSON.stringify({
        id: request.id,
        type: 'response',
        result: {
          name: 'TestDriver',
          version: '1.0.0',
          supportedActions: ['testAction']
        }
      }));
    }
  });
});

server.listen(port, '127.0.0.1');
`;
    await fs.promises.writeFile(path.join(driverDir, 'index.js'), driverCode);
  });

  beforeEach(() => {
    registry = DriverRegistry.getInstance();
  });

  afterAll(async () => {
    // Cleanup test drivers
    await fs.promises.rm(testDriversDir, { recursive: true, force: true });
  });

  test('should discover drivers from directory', async () => {
    // Set custom driver directory for test
    process.env.RUNIX_DRIVER_DIR = testDriversDir;
    
    await registry.initialize();
    
    const drivers = registry.listDriverIds();
    expect(drivers).toContain('test-driver');
  });

  test('should validate driver configuration', () => {
    const issues = ConfigValidator.validateDrivers();
    
    // Should have issues if no drivers directory exists in cwd
    expect(Array.isArray(issues)).toBe(true);
  });

  test('should start and communicate with driver', async () => {
    // Set custom driver directory for test
    process.env.RUNIX_DRIVER_DIR = testDriversDir;
    
    await registry.initialize();
    
    const driverInstance = await registry.startDriver('test-driver');
    expect(driverInstance).toBeDefined();
    
    // Test driver communication
    const capabilities = await driverInstance.getCapabilities();
    expect(capabilities.name).toBe('TestDriver');
    
    await driverInstance.shutdown();
  });
});
