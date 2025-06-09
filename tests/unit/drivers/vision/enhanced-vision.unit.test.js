/**
 * Unit tests for enhanced vision-driver with GPT-4o integration
 */
const WebSocket = require('ws');

// Test fixtures
const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAGA4nEKtAAAAABJRU5ErkJggg==';

describe('Enhanced Vision Driver', () => {
    let ws;
    let requestId = 1;

    const connectToDriver = () => {
        return new Promise((resolve, reject) => {
            ws = new WebSocket('ws://127.0.0.1:9003');
            
            ws.on('open', () => {
                resolve();
            });
            
            ws.on('error', (err) => {
                reject(err);
            });
        });
    };

    const sendRequest = (method, params = {}) => {
        const request = {
            id: requestId++,
            method: method,
            params: params
        };
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Request ${request.id} timed out`));
            }, 5000);

            const messageHandler = (data) => {
                const response = JSON.parse(data.toString());
                if (response.id === request.id) {
                    clearTimeout(timeout);
                    ws.removeListener('message', messageHandler);
                    resolve(response);
                }
            };

            ws.on('message', messageHandler);
            ws.send(JSON.stringify(request));
        });
    };

    beforeAll(async () => {
        await connectToDriver();
    });

    afterAll(() => {
        if (ws) {
            ws.close();
        }
    });

    test('should return capabilities', async () => {
        const response = await sendRequest('capabilities');
        expect(response).toBeDefined();
        expect(response.result).toBeDefined();
    });

    test('should perform computer use analysis', async () => {
        const response = await sendRequest('execute', {
            action: 'analyzeForComputerUse',
            args: [testImageBase64]
        });
        expect(response).toBeDefined();
        expect(response.result).toBeDefined();
    });

    test('should perform enhanced scene analysis', async () => {
        const response = await sendRequest('execute', {
            action: 'analyzeScene',
            args: [testImageBase64, 'computer_use']
        });
        expect(response).toBeDefined();
        expect(response.result).toBeDefined();
    });

    test('should extract text with GPT-4o', async () => {
        const response = await sendRequest('execute', {
            action: 'extractText',
            args: [testImageBase64]
        });
        expect(response).toBeDefined();
        expect(response.result).toBeDefined();
    }, 10000);
});
