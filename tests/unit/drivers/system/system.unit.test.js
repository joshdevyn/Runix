/**
 * Unit tests for system-driver functionality
 */

const WebSocket = require('ws');

describe('System Driver', () => {
  let ws;
  let requestId = 1;
  const DRIVER_PORT = 9002;
  const REQUEST_TIMEOUT = 5000;

  const sendRequest = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const id = requestId++;
      const request = { id, method, params };
      
      const timeout = setTimeout(() => {
        reject(new Error(`Request ${id} timed out`));
      }, REQUEST_TIMEOUT);
      
      const handler = (message) => {
        const response = JSON.parse(message);
        if (response.id === id) {
          clearTimeout(timeout);
          ws.removeListener('message', handler);
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result);
          }
        }
      };
      
      ws.on('message', handler);
      ws.send(JSON.stringify(request));
    });
  };

  beforeAll(async () => {
    ws = new WebSocket(`ws://127.0.0.1:${DRIVER_PORT}`);
    
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        resolve();
      });
      
      ws.on('error', (error) => {
        reject(error);
      });
      
      setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);
    });
  });
  afterAll(() => {
    if (ws) {
      ws.close();
    }
  });
  test('should return capabilities', async () => {
    const result = await sendRequest('capabilities');
    
    expect(result).toBeDefined();
    expect(result.name).toBe('SystemDriver');
    expect(result.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Array.isArray(result.supportedActions)).toBe(true);
    expect(result.supportedActions.length).toBeGreaterThan(5);
    
    // Check for essential actions
    const requiredActions = ['takeScreenshot', 'moveMouse', 'typeText', 'getScreenSize'];
    requiredActions.forEach(action => {
      expect(result.supportedActions).toContain(action);
    });
    
    console.log(`✅ ${result.name} v${result.version} - ${result.supportedActions.length} actions`);
  });
  test('should initialize successfully', async () => {
    const result = await sendRequest('initialize', { config: { test: true } });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    console.log('✅ Driver initialized');
  });
  test('should take screenshot using modern nut-js', async () => {
    const timestamp = Date.now();
    const filename = `test-screenshot-${timestamp}.png`;
    
    const result = await sendRequest('execute', { 
      action: 'takeScreenshot', 
      args: [filename] 
    });
    
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.data.filename).toContain('.png');
    
    // Check if file actually exists
    const fs = require('fs');
    const path = require('path');
    const screenshotPath = path.join(process.cwd(), 'screenshots', filename);
    
    if (fs.existsSync(screenshotPath)) {
      const stats = fs.statSync(screenshotPath);
      expect(stats.size).toBeGreaterThan(1000); // Should be a real image file
      console.log(`✅ Screenshot: ${filename} (${Math.round(stats.size / 1024)}KB)`);
    } else {
      console.log(`⚠️  Screenshot saved elsewhere: ${result.data.filename}`);
    }
  });
  test('should detect screen size', async () => {
    const result = await sendRequest('execute', { 
      action: 'getScreenSize', 
      args: [] 
    });
    
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.data.width).toBeGreaterThan(800);
    expect(result.data.height).toBeGreaterThan(600);
    expect(typeof result.data.width).toBe('number');
    expect(typeof result.data.height).toBe('number');
    
    const aspectRatio = (result.data.width / result.data.height).toFixed(2);
    console.log(`✅ Screen: ${result.data.width}×${result.data.height} (${aspectRatio}:1)`);
  });

  test('should get mouse position', async () => {
    const result = await sendRequest('execute', { 
      action: 'getMousePosition', 
      args: [] 
    });
    
    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(typeof result.data.x).toBe('number');
    expect(typeof result.data.y).toBe('number');
    
    console.log(`Mouse position: (${result.data.x}, ${result.data.y})`);
  });

  test('should move mouse to specified position', async () => {
    const result = await sendRequest('execute', { 
      action: 'moveMouse', 
      args: [100, 100] 
    });
    
    expect(result).toBeDefined();
  });
  test('should type text using keyboard input', async () => {
    const result = await sendRequest('execute', { 
      action: 'typeText', 
      args: ['test'] 
    });
    
    expect(result).toBeDefined();
  });
});
