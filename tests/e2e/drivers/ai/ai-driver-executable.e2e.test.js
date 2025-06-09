/**
 * End-to-end tests for AI driver executable
 * Tests that the built AI driver executable works correctly
 */

const WebSocket = require('ws');

describe('AI Driver Executable E2E', () => {
    let ws;
    const AI_DRIVER_PORT = 9004;
    const CONNECTION_TIMEOUT = 10000;

    beforeAll(() => {
        // Allow some time for driver to start if needed
        return new Promise(resolve => setTimeout(resolve, 2000));
    });

    afterEach(() => {
        if (ws) {
            ws.close();
            ws = null;
        }
    });

    test('should connect to AI driver executable', async () => {
        await new Promise((resolve, reject) => {
            ws = new WebSocket(`ws://127.0.0.1:${AI_DRIVER_PORT}`);
            
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, CONNECTION_TIMEOUT);
            
            ws.on('open', () => {
                clearTimeout(timeout);
                resolve();
            });
            
            ws.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    });

    test('should return valid capabilities response', async () => {
        ws = new WebSocket(`ws://127.0.0.1:${AI_DRIVER_PORT}`);
        
        await new Promise((resolve, reject) => {
            ws.on('open', () => resolve());
            ws.on('error', reject);
        });

        const response = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Response timeout'));
            }, 5000);

            ws.on('message', (data) => {
                clearTimeout(timeout);
                const response = JSON.parse(data.toString());
                resolve(response);
            });

            const capabilitiesRequest = {
                id: 'test-capabilities',
                method: 'capabilities',
                params: {}
            };

            ws.send(JSON.stringify(capabilitiesRequest));
        });

        expect(response).toBeDefined();
        expect(response.result).toBeDefined();
        expect(response.result.name).toBeDefined();
        expect(response.result.version).toBeDefined();
        
        // Log driver information
        console.log(`AI Driver: ${response.result.name} v${response.result.version}`);
        if (response.result.supportedModes) {
            console.log(`Supported modes: ${response.result.supportedModes.join(', ')}`);
        }
        if (response.result.supportedActions) {
            console.log(`Supported actions: ${response.result.supportedActions.length} actions`);
        }
    });

    test('should handle invalid requests gracefully', async () => {
        ws = new WebSocket(`ws://127.0.0.1:${AI_DRIVER_PORT}`);
        
        await new Promise((resolve, reject) => {
            ws.on('open', () => resolve());
            ws.on('error', reject);
        });

        const response = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Response timeout'));
            }, 5000);

            ws.on('message', (data) => {
                clearTimeout(timeout);
                const response = JSON.parse(data.toString());
                resolve(response);
            });

            const invalidRequest = {
                id: 'test-invalid',
                method: 'non_existent_method',
                params: {}
            };

            ws.send(JSON.stringify(invalidRequest));
        });

        expect(response).toBeDefined();
        // Should either return an error or handle gracefully
        expect(response.id).toBe('test-invalid');
    });
});
