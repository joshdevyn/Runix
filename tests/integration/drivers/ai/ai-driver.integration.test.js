/**
 * Integration tests for AI Driver
 * Tests driver functionality and module integration
 */

const WebSocket = require('ws');

describe('AI Driver Integration', () => {
    let ws;
    const DRIVER_PORT = 8084;
    const CONNECTION_TIMEOUT = 5000;
    const REQUEST_TIMEOUT = 5000;

    beforeAll(async () => {
        // Connect to AI Driver
        ws = new WebSocket(`ws://127.0.0.1:${DRIVER_PORT}`);
        
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, CONNECTION_TIMEOUT);

            ws.on('open', () => {
                clearTimeout(timeout);
                resolve();
            });
            
            ws.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    });

    afterAll(() => {
        if (ws) {
            ws.close();
        }
    });

    const sendRequest = (method, params = {}) => {
        const requestId = `test-${method}-${Date.now()}`;
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`${method} request timeout`));
            }, REQUEST_TIMEOUT);

            const messageHandler = (data) => {
                try {
                    const response = JSON.parse(data.toString());
                    if (response.id === requestId) {
                        clearTimeout(timeout);
                        ws.removeListener('message', messageHandler);
                        
                        if (response.error) {
                            reject(new Error(response.error.message));
                        } else {
                            resolve(response);
                        }
                    }
                } catch (error) {
                    clearTimeout(timeout);
                    ws.removeListener('message', messageHandler);
                    reject(error);
                }
            };

            ws.on('message', messageHandler);
            
            ws.send(JSON.stringify({
                id: requestId,
                method,
                params
            }));
        });
    };

    test('should connect to AI driver', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
    });

    test('should return capabilities', async () => {
        const response = await sendRequest('capabilities');
        
        expect(response).toBeDefined();
        expect(response.result).toBeDefined();
        expect(response.result.data).toBeDefined();
        
        // Log available capabilities for debugging
        if (response.result.data.capabilities) {
            console.log('Available capabilities:', Object.keys(response.result.data.capabilities));
        }
    });

    test('should respond to health check', async () => {
        const response = await sendRequest('health');
        
        expect(response).toBeDefined();
        expect(response.result).toBeDefined();
    });

    test('should handle invalid method gracefully', async () => {
        await expect(sendRequest('invalid_method')).rejects.toThrow();
    });
});
