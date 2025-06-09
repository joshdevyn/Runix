/**
 * Common test utilities and helpers
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

/**
 * Create a WebSocket connection to a driver
 */
async function connectToDriver(port, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        
        const timeoutId = setTimeout(() => {
            reject(new Error(`Connection to port ${port} timed out`));
        }, timeout);
        
        ws.on('open', () => {
            clearTimeout(timeoutId);
            resolve(ws);
        });
        
        ws.on('error', (err) => {
            clearTimeout(timeoutId);
            reject(err);
        });
    });
}

/**
 * Send a request to a driver via WebSocket
 */
async function sendDriverRequest(ws, method, params = {}, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const requestId = `test-${Date.now()}-${Math.random()}`;
        const request = { id: requestId, method, params };
        
        const timeoutId = setTimeout(() => {
            reject(new Error(`Request ${method} timed out`));
        }, timeout);
        
        const messageHandler = (data) => {
            try {
                const response = JSON.parse(data.toString());
                if (response.id === requestId) {
                    clearTimeout(timeoutId);
                    ws.removeListener('message', messageHandler);
                    
                    if (response.error) {
                        reject(new Error(response.error.message));
                    } else {
                        resolve(response);
                    }
                }
            } catch (err) {
                clearTimeout(timeoutId);
                ws.removeListener('message', messageHandler);
                reject(err);
            }
        };
        
        ws.on('message', messageHandler);
        ws.send(JSON.stringify(request));
    });
}

/**
 * Load a test image for vision testing
 */
function loadTestImage(imageName = '01-homepage.png') {
    const screenshotPath = path.join('c:', '_Runix', 'screenshots', imageName);
    
    if (fs.existsSync(screenshotPath)) {
        const imageBuffer = fs.readFileSync(screenshotPath);
        return {
            base64: imageBuffer.toString('base64'),
            size: imageBuffer.length,
            path: screenshotPath
        };
    }
    
    // Fallback to minimal test image
    return {
        base64: 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAQ0lEQVR42u3BMQEAAADCoPVPbQhfoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgMhRQAAGjg+p2AAAAAElFTkSuQmCC',
        size: 123,
        path: 'minimal-test-image'
    };
}

/**
 * Create a temporary directory for test outputs
 */
function createTempTestDir(testName) {
    const tempDir = path.join('c:', '_Runix', 'temp', 'test-outputs', testName);
    
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    
    return tempDir;
}

/**
 * Clean up test files
 */
function cleanupTestFiles(patterns) {
    patterns.forEach(pattern => {
        const files = require('glob').sync(pattern);
        files.forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });
    });
}

/**
 * Driver port configurations
 */
const DRIVER_PORTS = {
    AI: 8084,
    VISION: 9003,
    SYSTEM: 9002,
    WEB: 9001,
    AI_EXECUTABLE: 9004
};

/**
 * Common test timeouts
 */
const TIMEOUTS = {
    CONNECTION: 5000,
    REQUEST: 5000,
    LONG_OPERATION: 30000,
    AGENT_OPERATION: 60000
};

/**
 * Test data generators
 */
const TestData = {
    minimalTask: () => "Take a screenshot and describe what you see",
    complexTask: () => "Navigate to a website, fill out a form, and submit it",
    invalidTask: () => "",
    
    simpleAgentConfig: () => ({
        maxIterations: 3,
        iterationDelay: 1000,
        environment: 'desktop'
    }),
    
    extendedAgentConfig: () => ({
        maxIterations: 5,
        iterationDelay: 2000,
        environment: 'desktop',
        displayWidth: 1920,
        displayHeight: 1080
    })
};

module.exports = {
    connectToDriver,
    sendDriverRequest,
    loadTestImage,
    createTempTestDir,
    cleanupTestFiles,
    DRIVER_PORTS,
    TIMEOUTS,
    TestData
};
