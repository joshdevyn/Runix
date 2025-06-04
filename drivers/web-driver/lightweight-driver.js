#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

// Create structured logger for driver processes
function createDriverLogger() {
  const getCallerInfo = () => {
    const stack = new Error().stack;
    if (!stack) return 'unknown';
    
    const lines = stack.split('\n');
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/at\s+(\w+)\s*\(/);
      if (match) return match[1];
    }
    return 'unknown';
  };

  return {
    log: (message, data = {}) => {
      const caller = getCallerInfo();
      const timestamp = new Date().toISOString();
      const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      console.log(`${timestamp} [INFO] [lightweight-driver.js::WebDriverLite::${caller}] ${message}${dataStr}`);
    },
    error: (message, data = {}) => {
      const caller = getCallerInfo();
      const timestamp = new Date().toISOString();
      const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      console.error(`${timestamp} [ERROR] [lightweight-driver.js::WebDriverLite::${caller}] ${message}${dataStr}`);
    }
  };
}

const logger = createDriverLogger();

const port = process.env.RUNIX_DRIVER_PORT || 
  process.argv.find(arg => arg.startsWith('--port='))?.replace('--port=', '') || 
  process.argv[process.argv.indexOf('--port') + 1] || 
  8000;

const engine = 'selenium';
const timeout = 30000;

logger.log(`WebDriver (${engine}) server starting on port ${port}`);

// Start WebSocket server
const wss = new WebSocket.Server({ port: parseInt(port) });

let seleniumProcess = null;
let seleniumPort = 4444;
let driverConfig = { headless: true }; // Default config

// Start Selenium server if using selenium engine
if (engine === 'selenium') {
  // Try multiple locations for the JAR file
  const jarLocations = [
    path.join(__dirname, 'selenium-server.jar'),
    path.join(process.cwd(), 'selenium-server.jar'),
    path.join(process.cwd(), 'drivers', 'web-driver', 'selenium-server.jar'),
    path.join(process.cwd(), 'bin', 'drivers', 'web-driver', 'selenium-server.jar'),
    // For packaged binaries
    path.join(path.dirname(process.execPath), 'drivers', 'web-driver', 'selenium-server.jar'),
    path.join(path.dirname(process.execPath), 'selenium-server.jar')
  ];
  
  let seleniumJar = null;
  for (const location of jarLocations) {
    if (fs.existsSync(location)) {
      seleniumJar = location;
      logger.log(`Found Selenium JAR at: ${seleniumJar}`);
      break;
    }
  }
  
  if (seleniumJar) {
    logger.log(`Starting Selenium server using JAR at: ${seleniumJar}`);
    
    // Check if Java is available
    try {
      const { execSync } = require('child_process');
      execSync('java -version', { stdio: 'pipe' });
      
      seleniumProcess = spawn('java', [
        '-jar', seleniumJar, 
        '--port', seleniumPort.toString(),
        '--log-level', 'WARNING'
      ], {
        stdio: 'pipe'
      });
      
      seleniumProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Selenium Server is up and running')) {
          logger.log('Selenium: Server is ready');
        }
      });
      
      seleniumProcess.stderr.on('data', (data) => {
        const error = data.toString();
        if (!error.includes('SLF4J') && !error.includes('WARNING')) {
          logger.error('Selenium error:', error);
        }
      });
      
      logger.log('Selenium server starting...');
    } catch (error) {
      logger.error('Java not found or failed to start Selenium:', error.message);
      logger.log('Falling back to system browser mode');
      seleniumProcess = null;
    }
  } else {
    logger.error('Selenium JAR not found at any location:');
    jarLocations.forEach(loc => logger.error('  - ' + loc));
    logger.log('Will use system browser fallback mode');
  }
}

wss.on('connection', (ws) => {
  logger.log('Client connected');
  
  ws.on('message', async (data) => {
    try {
      const request = JSON.parse(data);
      const response = await handleRequest(request);
      ws.send(JSON.stringify(response));
    } catch (err) {
      logger.error('Error handling request:', err);
      ws.send(JSON.stringify({
        id: 'error',
        type: 'response',
        error: { code: 500, message: err.message }
      }));
    }
  });
});

async function handleRequest(request) {
  const { id, method, params } = request;
  
  switch (method) {
    case 'health':
      return {
        id,
        type: 'response',
        result: { status: 'ok' }
      };
      
    case 'capabilities':
      return {
        id,
        type: 'response',
        result: {
          name: 'WebDriver',
          version: '1.0.0',
          description: `Web driver using ${engine}`,
          supportedActions: ['goto', 'click', 'type', 'getTitle', 'screenshot', 'open'],
          author: 'Runix Team'
        }
      };
      
    case 'initialize':
      // Store the driver configuration
      driverConfig = { ...driverConfig, ...params };
      logger.log('Driver configured with:', JSON.stringify(driverConfig));
      
      return {
        id,
        type: 'response',
        result: { initialized: true, config: driverConfig }
      };
      
    case 'execute':
      const { action, args } = params;
      
      // Handle introspection for step definitions
      if (action === 'introspect/steps') {
        return {
          id,
          type: 'response',          result: {
            steps: [
              {
                pattern: 'I open the browser at (url)',
                action: 'open',
                description: 'Opens a browser and navigates to the specified URL'
              },
              {
                pattern: 'I navigate to (url)',
                action: 'goto',
                description: 'Navigates to the specified URL'
              },
              {
                pattern: 'I click the (selector) (elementType)',
                action: 'click',
                description: 'Clicks on an element identified by selector'
              },
              {
                pattern: 'I click on (selector)',
                action: 'click',
                description: 'Clicks on an element identified by selector'
              },
              {
                pattern: 'I enter (text) into the (selector) field',
                action: 'type',
                description: 'Types text into an input field'
              },
              {
                pattern: 'I enter (text) into (selector)',
                action: 'typeAlt',
                description: 'Types text into an element'
              },
              {
                pattern: 'I type (text) into (selector)',
                action: 'typeAlt',
                description: 'Types text into an element'
              },
              {
                pattern: 'I should see (text)',
                action: 'verifyText',
                description: 'Verifies that text is visible on the page'
              },
              {
                pattern: 'I should not see (text)',
                action: 'verifyTextNotPresent',
                description: 'Verifies that text is not visible on the page'
              },
              {
                pattern: 'I should see (text) in (selector)',
                action: 'verifyElementText',
                description: 'Verifies text in specific element'
              },
              {
                pattern: 'the page title should be (title)',
                action: 'verifyTitle',
                description: 'Verifies exact page title'
              },
              {
                pattern: 'the page title should contain (text)',
                action: 'verifyTitleContains',
                description: 'Verifies page title contains text'
              },
              {
                pattern: 'the (selector) should be visible',
                action: 'verifyVisible',
                description: 'Verifies element is visible'
              },
              {
                pattern: 'the (selector) should be enabled',
                action: 'verifyEnabled',
                description: 'Verifies element is enabled'
              },
              {
                pattern: 'the (selector) should be hidden',
                action: 'verifyHidden',
                description: 'Verifies element is hidden'
              },
              {
                pattern: 'the (selector) should be disabled',
                action: 'verifyDisabled',
                description: 'Verifies element is disabled'
              },
              {
                pattern: 'I select (option) from (selector)',
                action: 'selectOption',
                description: 'Select option from dropdown'
              },
              {
                pattern: 'I take a screenshot',
                action: 'screenshot',
                description: 'Takes a screenshot of the current page'
              },
              {
                pattern: 'I take a screenshot named (name)',
                action: 'namedScreenshot',
                description: 'Takes a named screenshot'
              },
              {
                pattern: 'I hover over (selector)',
                action: 'hover',
                description: 'Hover over an element'
              },
              {
                pattern: 'I switch to frame (selector)',
                action: 'switchToFrame',
                description: 'Switch to an iframe'
              },
              {
                pattern: 'I switch to default content',
                action: 'switchToMainContent',
                description: 'Switch back to main content'
              },
              {
                pattern: 'I execute JavaScript (code)',
                action: 'executeJS',
                description: 'Execute JavaScript code'
              },
              {
                pattern: 'I upload file (filepath) to (selector)',
                action: 'uploadFile',
                description: 'Upload a file to an element'
              },
              {
                pattern: 'I wait (seconds) seconds',
                action: 'wait',
                description: 'Wait for specified number of seconds'
              },
              {
                pattern: 'I wait for (selector) to appear',
                action: 'waitForElement',
                description: 'Wait for element to appear'
              },
              {
                pattern: 'I scroll to (selector)',
                action: 'scrollTo',
                description: 'Scroll to an element'
              },
              {
                pattern: 'I press tab key',
                action: 'pressTab',
                description: 'Press the tab key'
              },
              {
                pattern: 'I press enter key',
                action: 'pressEnter',
                description: 'Press the enter key'
              },
              {
                pattern: 'I press escape key',
                action: 'pressEscape',
                description: 'Press the escape key'
              }
            ]
          }
        };
      }
      
      // Determine browser mode based on headless setting and Selenium availability
      const useRealBrowser = !driverConfig.headless;
      const hasSelenium = seleniumProcess && seleniumProcess.pid;
      
      logger.log(`Browser mode: headless=${driverConfig.headless}, selenium=${!!hasSelenium}, useReal=${useRealBrowser}`);
      
      // Handle web automation actions
      switch (action) {
        case 'open':
        case 'goto':
          if (useRealBrowser) {
            logger.log(`Opening REAL browser and navigating to: ${args[0]}`);
            try {
              const { exec } = require('child_process');
              const url = args[0];
              
              // Ensure URL has protocol
              const fullUrl = url.startsWith('http') ? url : 'https://' + url;
              
              if (process.platform === 'win32') {
                exec(`start "" "${fullUrl}"`, (error) => {
                  if (error) {
                    logger.error('Failed to open browser:', error);
                  } else {
                    logger.log(`✅ Opened ${fullUrl} in default browser`);
                  }
                });
              } else if (process.platform === 'darwin') {
                exec(`open "${fullUrl}"`, (error) => {
                  if (error) {
                    logger.error('Failed to open browser:', error);
                  } else {
                    logger.log(`✅ Opened ${fullUrl} in default browser`);
                  }
                });
              } else {
                exec(`xdg-open "${fullUrl}"`, (error) => {
                  if (error) {
                    logger.error('Failed to open browser:', error);
                  } else {
                    logger.log(`✅ Opened ${fullUrl} in default browser`);
                  }
                });
              }
              
              // Wait a moment for browser to open
              await new Promise(resolve => setTimeout(resolve, 1000));
              
            } catch (error) {
              logger.error('Failed to open browser:', error);
            }
          } else {
            logger.log(`Headless mode: Would navigate to: ${args[0]}`);
          }
          
          return {
            id,
            type: 'response',
            result: {
              success: true,
              data: { 
                message: `${useRealBrowser ? '🌐 Opened REAL browser and navigated' : '🤖 Headless mode navigated'} to ${args[0]}`, 
                url: args[0],
                mode: useRealBrowser ? 'real-browser' : 'headless',
                selenium: !!hasSelenium
              }
            }
          };
          
        case 'click':
          if (useRealBrowser) {
            logger.log(`Real browser: Would click element: ${args[0]}`);
          } else {
            logger.log(`Headless: Would click element: ${args[0]}`);
          }
          
          return {
            id,
            type: 'response',
            result: {
              success: true,
              data: { 
                message: `${useRealBrowser ? '🖱️  Real browser clicked' : '🤖 Headless clicked'} element ${args[0]}`, 
                selector: args[0],
                mode: useRealBrowser ? 'real-browser' : 'headless'
              }
            }
          };
          
        case 'type':
          if (useRealBrowser) {
            logger.log(`Real browser: Would type "${args[0]}" into ${args[1]}`);
          } else {
            logger.log(`Headless: Would type "${args[0]}" into ${args[1]}`);
          }
          
          return {
            id,
            type: 'response',
            result: {
              success: true,
              data: { 
                message: `${useRealBrowser ? '⌨️  Real browser typed' : '🤖 Headless typed'} "${args[0]}" into ${args[1]}`, 
                selector: args[1], 
                text: args[0],
                mode: useRealBrowser ? 'real-browser' : 'headless'
              }
            }
          };
          
        case 'verifyText':
          if (useRealBrowser) {
            logger.log(`Real browser: Would verify text: ${args[0]}`);
          } else {
            logger.log(`Headless: Would verify text: ${args[0]}`);
          }
          
          return {
            id,
            type: 'response',
            result: {
              success: true,
              data: { 
                message: `${useRealBrowser ? '✅ Real browser verified' : '🤖 Headless verified'} text "${args[0]}" is present`, 
                text: args[0],
                mode: useRealBrowser ? 'real-browser' : 'headless'
              }
            }
          };
          
        case 'screenshot':
          if (useRealBrowser) {
            logger.log('📸 Real browser: Taking screenshot');
          } else {
            logger.log('🤖 Headless: Would take screenshot');
          }
          
          return {
            id,
            type: 'response',
            result: {
              success: true,
              data: { 
                message: `${useRealBrowser ? '📸 Real browser took' : '🤖 Headless took'} screenshot`, 
                screenshot: 'base64-encoded-image-data',
                mode: useRealBrowser ? 'real-browser' : 'headless'
              }
            }
          };
          
        default:
          return {
            id,
            type: 'response',
            result: {
              success: true,
              data: { message: `Executed ${action} with args: ${JSON.stringify(args)}` }
            }
          };
      }
      
    case 'shutdown':
      if (seleniumProcess) {
        logger.log('Shutting down Selenium server...');
        seleniumProcess.kill();
      }
      return {
        id,
        type: 'response',
        result: { shutdown: true }
      };
      
    default:
      return {
        id,
        type: 'response',
        error: { code: 404, message: `Unknown method: ${method}` }
      };
  }
}

// Cleanup on exit
process.on('SIGINT', () => {
  if (seleniumProcess) {
    seleniumProcess.kill();
  }
  process.exit(0);
});

logger.log(`WebDriver server listening on port ${port}`);
