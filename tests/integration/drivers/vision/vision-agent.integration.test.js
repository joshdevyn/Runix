/**
 * Integration tests between AgentDriver and enhanced vision-driver
 * Tests computer use analysis capabilities for agent mode
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

describe('Vision-Agent Integration', () => {
    let ws;
    let requestId = 1;
    let testImage;
    const VISION_DRIVER_PORT = 9003;
    const REQUEST_TIMEOUT = 10000;

    const loadTestImage = () => {
        // Use a real screenshot from the screenshots directory
        const screenshotPath = path.join('c:', '_Runix', 'screenshots', '01-homepage.png');
        if (fs.existsSync(screenshotPath)) {
            const imageBuffer = fs.readFileSync(screenshotPath);
            testImage = imageBuffer.toString('base64');
            console.log(`Loaded test screenshot: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
        } else {
            console.log('No test screenshot found, using minimal test image');
            // Fallback to a valid minimal PNG
            testImage = 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAQ0lEQVR42u3BMQEAAADCoPVPbQhfoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgMhRQAAGjg+p2AAAAAElFTkSuQmCC';
        }
    };

    const sendRequest = (method, params = {}) => {
        return new Promise((resolve, reject) => {
            const request = {
                id: requestId++,
                method: method,
                params: params
            };
            
            const timeout = setTimeout(() => {
                reject(new Error('Request timeout'));
            }, REQUEST_TIMEOUT);
            
            const responseHandler = (data) => {
                const response = JSON.parse(data.toString());
                if (response.id === request.id) {
                    clearTimeout(timeout);
                    ws.removeListener('message', responseHandler);
                    resolve(response);
                }
            };
            
            ws.on('message', responseHandler);
            ws.send(JSON.stringify(request));
        });
    };

    beforeAll(async () => {
        loadTestImage();
        
        ws = new WebSocket(`ws://127.0.0.1:${VISION_DRIVER_PORT}`);
        
        await new Promise((resolve, reject) => {
            ws.on('open', () => {
                resolve();
            });
            
            ws.on('error', (err) => {
                reject(err);
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

    test('should support computer use analysis capability', async () => {
        const capabilities = await sendRequest('capabilities');
        
        expect(capabilities.result).toBeDefined();
        expect(capabilities.result.supportedActions).toBeDefined();
        expect(capabilities.result.supportedActions).toContain('analyzeForComputerUse');
        
        console.log('✅ Computer use analysis action supported');
    });

    test('should execute analyzeForComputerUse action successfully', async () => {
        const result = await sendRequest('execute', {
            action: 'analyzeForComputerUse',
            args: [testImage]
        });
        
        expect(result.result).toBeDefined();
        expect(result.result.success).toBe(true);
        expect(result.result.data).toBeDefined();
        
        const data = result.result.data;
        expect(data).toHaveProperty('screen_analysis');
        expect(Array.isArray(data.interactive_elements)).toBe(true);
        expect(Array.isArray(data.text_elements)).toBe(true);
        expect(Array.isArray(data.possible_actions)).toBe(true);
        expect(data.method).toBeDefined();
        
        console.log('📊 Response structure:', {
            hasScreenAnalysis: !!data.screen_analysis,
            hasInteractiveElements: Array.isArray(data.interactive_elements),
            hasTextElements: Array.isArray(data.text_elements),
            hasPossibleActions: Array.isArray(data.possible_actions),
            method: data.method
        });
    });

    test('should perform enhanced scene analysis for agent mode', async () => {
        const result = await sendRequest('execute', {
            action: 'analyzeScene',
            args: [testImage, 'computer_use']
        });
        
        expect(result.result).toBeDefined();
        expect(result.result.success).toBe(true);
        expect(result.result.data).toBeDefined();
        expect(result.result.data.scene).toBeDefined();
        
        const sceneData = result.result.data.scene;
        expect(sceneData.method).toBeDefined();
        
        console.log('📊 Scene analysis data:', {
            hasSceneData: !!sceneData,
            analysisType: sceneData.analysis ? 'detailed' : 'basic',
            method: sceneData.method
        });
    });

    test('should have working fallback mechanisms', async () => {
        const result = await sendRequest('execute', {
            action: 'extractText',
            args: [testImage]
        });
        
        expect(result.result).toBeDefined();
        expect(result.result.success).toBe(true);
        expect(result.result.data).toBeDefined();
        expect(result.result.data.method).toBeDefined();
        
        console.log('📊 Fallback method:', result.result.data.method);
    });

    test('should handle invalid image data gracefully', async () => {
        const result = await sendRequest('execute', {
            action: 'analyzeForComputerUse',
            args: ['invalid-base64-data']
        });
        
        // Should either succeed with fallback or fail gracefully
        expect(result).toBeDefined();
        // If it fails, it should have an error message
        if (!result.result?.success) {
            expect(result.error).toBeDefined();
        }
    });
});
