const WebSocket = require('ws');
const http = require('http');
const { chromium, firefox, webkit } = require('playwright');

// Get port from environment variable (assigned by engine) or use default for standalone
const port = parseInt(process.env.RUNIX_DRIVER_PORT || '9001', 10);
const manifest = require('./driver.json');

// Simple logger for driver processes
function log(message, ...args) {
  const timestamp = new Date().toISOString();
  const argsStr = args.length > 0 ? ` ${JSON.stringify(args)}` : '';
  console.log(`${timestamp} [INFO] [index.js::WebDriver::handleMessage] ${message}${argsStr}`);
}

function logError(message, ...args) {
  const timestamp = new Date().toISOString();
  const argsStr = args.length > 0 ? ` ${JSON.stringify(args)}` : '';
  console.error(`${timestamp} [ERROR] [index.js::WebDriver::handleMessage] ${message}${argsStr}`);
}

log(`Web Driver starting on port ${port}`);

// Browser management
let browser = null;
let page = null;
let context = null;
let config = {
  browserType: 'chromium',
  headless: true,
  timeout: 30000,
  screenshotDir: 'screenshots'
};

// Create HTTP server and WebSocket server
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Web Driver Running\n');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', function connection(ws) {
  log('Client connected');
  
  ws.on('message', function incoming(message) {
    log(`Received: ${message}`);
    handleMessage(ws, message);
  });
  
  ws.on('close', function() {
    log('Client disconnected');
  });
});

server.listen(port, '127.0.0.1', () => {
  log(`Web driver listening on 127.0.0.1:${port}`);
  log(`WebSocket server ready for connections`);
});

// Handle incoming messages
function handleMessage(ws, message) {
  try {
    const request = JSON.parse(message);
    handleRequest(request).then(response => {
      ws.send(JSON.stringify(response));
    }).catch(err => {
      logError('Error handling request:', err);
      ws.send(JSON.stringify({
        id: request.id || '0',
        type: 'response',
        error: {
          code: 500,
          message: err.message || 'Internal server error'
        }
      }));
    });
  } catch (err) {
    logError('Error parsing message:', err);
  }
}

// Define JSON-RPC helpers
function sendErrorResponse(id, code, message) {
  return { id, type: 'response', error: { code, message } };
}
function sendSuccessResponse(id, data) {
  return { id, type: 'response', result: { success: true, data } };
}

// Handle JSON-RPC requests
async function handleRequest(request) {
  if (!request.id || !request.method) {
    return sendErrorResponse(request.id, 400, 'Invalid request');
  }

  try {
    switch (request.method) {
      case 'capabilities':
        return {
          id: request.id,
          type: 'response',
          result: {
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            supportedActions: manifest.actions
          }
        };

      case 'initialize':
        return handleInitialize(request.id, request.params?.config || {});

      case 'introspect':
        return handleIntrospect(request.id, request.params?.type || 'steps');

      case 'execute':
        return handleExecute(request.id, request.params?.action, request.params?.args || []);

      case 'health':
        return {
          id: request.id,
          type: 'response',
          result: { status: 'ok' }
        };

      case 'shutdown':
        await cleanup();
        return sendSuccessResponse(request.id, { shutdown: true });

      default:
        return sendErrorResponse(request.id, 404, `Unknown method: ${request.method}`);
    }
  }
  catch (err) {
    return sendErrorResponse(request.id, 500, err.message);
  }
}

// Handle initialize requests
async function handleInitialize(id, driverConfig) {
  try {
    // Merge with default config
    config = { ...config, ...driverConfig };
    log('Driver initialized with config', config);
    
    // Initialize browser if not already done
    if (!browser) {
      await initializeBrowser();
    }
    
    return sendSuccessResponse(id, { initialized: true });
  } catch (err) {
    logError('Failed to initialize driver:', err);
    return sendErrorResponse(id, 500, `Initialization failed: ${err.message}`);
  }
}

// Initialize browser
async function initializeBrowser() {
  try {
    log(`Launching ${config.browserType} browser`, { headless: config.headless });
    
    const browserOptions = {
      headless: config.headless,
      timeout: config.timeout
    };
    
    switch (config.browserType) {
      case 'firefox':
        browser = await firefox.launch(browserOptions);
        break;
      case 'webkit':
        browser = await webkit.launch(browserOptions);
        break;
      case 'chromium':
      default:
        browser = await chromium.launch(browserOptions);
        break;
    }
    
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    });
    
    page = await context.newPage();
    page.setDefaultTimeout(config.timeout);
    
    log('Browser initialized successfully');
  } catch (err) {
    logError('Failed to initialize browser:', err);
    throw err;
  }
}

// Handle execute requests
async function handleExecute(id, action, args) {
  log(`Executing action: ${action}`, args);
  
  try {
    // Ensure browser is initialized
    if (!browser || !page) {
      await initializeBrowser();
    }
    
    switch (action) {
      case 'introspect':
        const introspectParams = args[0] || {};
        if (introspectParams.type === 'steps') {
          // Return the same step definitions as the introspect method
          return {
            id,
            type: 'response',
            result: {
              success: true,
              steps: [
                {
                  id: "open-browser",
                  pattern: "open the browser at \"(.*)\"",
                  description: "Opens the browser at the specified URL",
                  action: "open",
                  examples: ["open the browser at \"https://example.com\""],
                  parameters: [
                    {
                      name: "url",
                      type: "string",
                      description: "URL to open",
                      required: true
                    }
                  ]
                },
                {
                  id: "click-element",
                  pattern: "click the \"(.*)\" (?:button|element|link)",
                  description: "Clicks an element on the page",
                  action: "click",
                  examples: ["click the \"submit\" button"],
                  parameters: [
                    {
                      name: "selector",
                      type: "string",
                      description: "CSS selector for the element",
                      required: true
                    }
                  ]
                },
                {
                  id: "enter-text",
                  pattern: "enter \"(.*)\" into the \"(.*)\" field",
                  description: "Enters text into a form field",
                  action: "enterText",
                  examples: ["enter \"john@example.com\" into the \"email\" field"],
                  parameters: [
                    {
                      name: "text",
                      type: "string",
                      description: "Text to enter",
                      required: true
                    },
                    {
                      name: "selector",
                      type: "string",
                      description: "CSS selector for the field",
                      required: true
                    }
                  ]
                },
                {
                  id: "take-screenshot",
                  pattern: "take a screenshot \"(.*)\"",
                  description: "Takes a screenshot of the current page",
                  action: "screenshot",
                  examples: ["take a screenshot \"login-page.png\""],
                  parameters: [
                    {
                      name: "filename",
                      type: "string",
                      description: "Screenshot filename",
                      required: true
                    }
                  ]
                },
                {
                  id: "wait-for-element",
                  pattern: "wait for element \"(.*)\"",
                  description: "Waits for an element to appear on the page",
                  action: "waitForElement",
                  examples: ["wait for element \".loading\""],
                  parameters: [
                    {
                      name: "selector",
                      type: "string",
                      description: "CSS selector for the element",
                      required: true
                    }
                  ]
                },
                {
                  id: "assert-visible",
                  pattern: "element \"(.*)\" should be visible",
                  description: "Asserts that an element is visible",
                  action: "assertVisible",
                  examples: ["element \".success-message\" should be visible"],
                  parameters: [
                    {
                      name: "selector",
                      type: "string",
                      description: "CSS selector for the element",
                      required: true
                    }
                  ]
                },
                {
                  id: "assert-text",
                  pattern: "element \"(.*)\" should contain text \"(.*)\"",
                  description: "Asserts that an element contains specific text",
                  action: "assertText",
                  examples: ["element \"h1\" should contain text \"Welcome\""],
                  parameters: [
                    {
                      name: "selector",
                      type: "string",
                      description: "CSS selector for the element",
                      required: true
                    },
                    {
                      name: "text",
                      type: "string",
                      description: "Expected text content",
                      required: true
                    }
                  ]
                }
              ]
            }
          };
        } else {
          return handleIntrospect(id, introspectParams.type || 'capabilities');
        }
        
      case 'open':
        await page.goto(args[0]);
        const title = await page.title();
        return sendSuccessResponse(id, { 
          url: args[0], 
          title: title 
        });
        
      case 'click':
        await page.click(args[0]);
        return sendSuccessResponse(id, { 
          element: args[0], 
          action: 'clicked' 
        });
        
      case 'enterText':
        await page.fill(args[1], args[0]);
        return sendSuccessResponse(id, { 
          text: args[0], 
          element: args[1] 
        });
        
      case 'getText':
        const text = await page.textContent(args[0]);
        return sendSuccessResponse(id, { 
          element: args[0], 
          text: text 
        });
        
      case 'waitForElement':
        const timeout = args[1] ? parseInt(args[1]) : config.timeout;
        await page.waitForSelector(args[0], { timeout });
        return sendSuccessResponse(id, { 
          element: args[0], 
          found: true 
        });
        
      case 'screenshot':
        const fs = require('fs');
        const path = require('path');
        
        // Ensure screenshot directory exists with absolute path
        const screenshotDir = path.resolve(config.screenshotDir);
        if (!fs.existsSync(screenshotDir)) {
          fs.mkdirSync(screenshotDir, { recursive: true });
          log(`Created screenshot directory: ${screenshotDir}`);
        }
        
        const filename = args[0] || `screenshot-${Date.now()}.png`;
        const filepath = path.join(screenshotDir, filename);
        
        await page.screenshot({ path: filepath, fullPage: true });
        log(`Screenshot saved: ${filepath}`);
        
        return sendSuccessResponse(id, { 
          filename: filename,
          path: filepath 
        });
        
      case 'assertVisible':
        const element = await page.$(args[0]);
        const isVisible = element ? await element.isVisible() : false;
        return sendSuccessResponse(id, { 
          element: args[0], 
          visible: isVisible 
        });
        
      case 'assertText':
        const actualText = await page.textContent(args[0]);
        const expectedText = args[1];
        const matches = actualText && actualText.includes(expectedText);
        return sendSuccessResponse(id, { 
          element: args[0], 
          expected: expectedText, 
          actual: actualText, 
          matches: matches 
        });
        
      case 'getTitle':
        const pageTitle = await page.title();
        return sendSuccessResponse(id, { 
          title: pageTitle 
        });
        
      case 'getUrl':
        const currentUrl = page.url();
        return sendSuccessResponse(id, { 
          url: currentUrl 
        });
        
      default:
        return sendErrorResponse(id, 400, `Unknown action: ${action}`);
    }
  } catch (err) {
    logError(`Error executing action ${action}:`, err);
    return sendErrorResponse(id, 500, err.message);
  }
}

// Handle introspect requests
function handleIntrospect(id, type) {
  if (type === 'steps') {
    return {
      id,
      type: 'response',
      result: {
        steps: [
          {
            id: "open-browser",
            pattern: "open the browser at \"(.*)\"",
            description: "Opens the browser at the specified URL",
            action: "open",
            examples: ["open the browser at \"https://example.com\""],
            parameters: [
              {
                name: "url",
                type: "string",
                description: "URL to open",
                required: true
              }
            ]
          },
          {
            id: "click-element",
            pattern: "click the \"(.*)\" (?:button|element|link)",
            description: "Clicks an element on the page",
            action: "click",
            examples: ["click the \"submit\" button"],
            parameters: [
              {
                name: "selector",
                type: "string",
                description: "CSS selector for the element",
                required: true
              }
            ]
          },
          {
            id: "enter-text",
            pattern: "enter \"(.*)\" into the \"(.*)\" field",
            description: "Enters text into a form field",
            action: "enterText",
            examples: ["enter \"john@example.com\" into the \"email\" field"],
            parameters: [
              {
                name: "text",
                type: "string",
                description: "Text to enter",
                required: true
              },
              {
                name: "selector",
                type: "string",
                description: "CSS selector for the field",
                required: true
              }
            ]
          },
          {
            id: "take-screenshot",
            pattern: "take a screenshot \"(.*)\"",
            description: "Takes a screenshot of the current page",
            action: "screenshot",
            examples: ["take a screenshot \"login-page.png\""],
            parameters: [
              {
                name: "filename",
                type: "string",
                description: "Screenshot filename",
                required: true
              }
            ]
          },
          {
            id: "wait-for-element",
            pattern: "wait for element \"(.*)\"",
            description: "Waits for an element to appear on the page",
            action: "waitForElement",
            examples: ["wait for element \".loading\""],
            parameters: [
              {
                name: "selector",
                type: "string",
                description: "CSS selector for the element",
                required: true
              }
            ]
          },
          {
            id: "assert-visible",
            pattern: "element \"(.*)\" should be visible",
            description: "Asserts that an element is visible",
            action: "assertVisible",
            examples: ["element \".success-message\" should be visible"],
            parameters: [
              {
                name: "selector",
                type: "string",
                description: "CSS selector for the element",
                required: true
              }
            ]
          },
          {
            id: "assert-text",
            pattern: "element \"(.*)\" should contain text \"(.*)\"",
            description: "Asserts that an element contains specific text",
            action: "assertText",
            examples: ["element \"h1\" should contain text \"Welcome\""],
            parameters: [
              {
                name: "selector",
                type: "string",
                description: "CSS selector for the element",
                required: true
              },
              {
                name: "text",
                type: "string",
                description: "Expected text content",
                required: true
              }
            ]
          }
        ]
      }
    };
  } else {
    return {
      id,
      type: 'response',
      result: {
        capabilities: {
          name: 'WebDriver',
          version: '1.0.0',
          description: 'Playwright-based web browser automation driver',
          author: 'Runix Team',
          supportedActions: ['open', 'click', 'enterText', 'getText', 'waitForElement', 'screenshot', 'assertVisible', 'assertText', 'getTitle', 'getUrl'],
          features: ['execute', 'introspection']
        }
      }
    };
  }
}

// Cleanup function
async function cleanup() {
  try {
    if (page) {
      await page.close();
      page = null;
    }
    if (context) {
      await context.close();
      context = null;
    }
    if (browser) {
      await browser.close();
      browser = null;
    }
    log('Browser cleanup completed');
  } catch (err) {
    logError('Error during cleanup:', err);
  }
}

// Handle process termination
process.on('SIGTERM', async () => {
  log('Received SIGTERM, shutting down gracefully');
  await cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log('Received SIGINT, shutting down gracefully');
  await cleanup();
  process.exit(0);
});
