import * as dotenv from 'dotenv';
import * as path from 'path';
import { WebSocket } from 'ws';
import { WebDriverAutomation, WebDriverConfig } from './webDriver';

// Create structured logger for driver processes
class DriverLogger {
  private getCallerInfo() {
    const stack = new Error().stack;
    if (!stack) return { method: 'unknown' };

    const lines = stack.split('\n');
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/at\s+(\w+)\s*\(/);
      if (match) return { method: match[1] };
    }
    return { method: 'unknown' };
  }

  log(message: string, data: any = {}) {
    const caller = this.getCallerInfo();
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} [INFO] [index.ts::WebDriverServer::${caller.method}] ${message}`, JSON.stringify(data));
  }
  
  error(message: string, data: any = {}) {
    const caller = this.getCallerInfo();
    const timestamp = new Date().toISOString();
    console.error(`${timestamp} [ERROR] [index.ts::WebDriverServer::${caller.method}] ${message}`, JSON.stringify(data));
  }
}

const logger = new DriverLogger();

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const port = parseInt(process.env.RUNIX_DRIVER_PORT || '8000');
const wss = new WebSocket.Server({ port });

let webDriver: WebDriverAutomation | null = null;
let driverConfig: WebDriverConfig = { headless: true };

logger.log(`WebDriver server listening on port ${port}`);

wss.on('connection', (ws) => {
  logger.log('Client connected');
  
  ws.on('message', async (data) => {
    try {
      const request = JSON.parse(data.toString());
      const response = await handleRequest(request);
      ws.send(JSON.stringify(response));
    } catch (err) {
      logger.error('Error handling request:', err);
      ws.send(JSON.stringify({
        id: 'error',
        type: 'response',
        error: { code: 500, message: err instanceof Error ? err.message : String(err) }
      }));
    }
  });
});

async function handleRequest(request: any) {
  const { id, method, params } = request;
  
  try {
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
            description: 'Professional web automation driver with Selenium WebDriver',
            supportedActions: [
              'open', 'goto', 'click', 'doubleClick', 'rightClick', 'type', 'typeKey',
              'hover', 'dragAndDrop', 'selectOption', 'checkCheckbox', 'selectRadio',
              'uploadFile', 'scrollTo', 'getText', 'getAttribute', 'getValue',
              'isVisible', 'isEnabled', 'waitForElement', 'waitForText',
              'switchToFrame', 'switchToWindow', 'takeScreenshot', 'executeJS',
              'getTitle', 'getUrl', 'getSource', 'refresh', 'goBack', 'goForward',
              'verifyText', 'verifyTitle', 'verifyUrl', 'verifyAttribute'
            ],
            author: 'Runix Team'
          }
        };
        
      case 'initialize':
        driverConfig = { ...driverConfig, ...params };
        logger.log('Driver configured with:', JSON.stringify(driverConfig));
        
        return {
          id,
          type: 'response',
          result: { initialized: true, config: driverConfig }
        };
        
      case 'execute':
        const { action, args } = params;
        const result = await executeAction(action, args);
        
        return {
          id,
          type: 'response',
          result: { success: true, data: result }
        };
        
      case 'shutdown':
        if (webDriver) {
          await webDriver.close();
          webDriver = null;
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
  } catch (error) {
    logger.error(`Error in ${method}:`, error);
    return {
      id,
      type: 'response',
      result: {
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          type: error instanceof Error ? error.constructor.name : 'UnknownError'
        }
      }
    };
  }
}

async function executeAction(action: string, args: any[]): Promise<any> {
  if (!webDriver) {
    webDriver = new WebDriverAutomation(driverConfig);
    await webDriver.initialize();
  }

  logger.log(`Executing action: ${action} with args:`, args);

  // Handle introspection for step definitions
  if (action === 'introspect/steps') {
    return {
      steps: [
        // Basic navigation and interaction
        {
          pattern: 'I open the browser at {string}',
          action: 'open',
          description: 'Opens a browser and navigates to the specified URL'
        },
        {
          pattern: 'I navigate to {string}',
          action: 'goto',
          description: 'Navigates to the specified URL'
        },
        {
          pattern: 'I click the {string} {word}',
          action: 'click',
          description: 'Clicks on an element identified by selector'
        },
        {
          pattern: 'I click on {string}',
          action: 'click',
          description: 'Clicks on an element identified by selector'
        },
        {
          pattern: 'I enter {string} into the {string} field',
          action: 'type',
          description: 'Types text into an input field'
        },
        {
          pattern: 'I enter {string} into {string}',
          action: 'typeAlt',
          description: 'Types text into an element (alternative syntax)'
        },
        {
          pattern: 'I type {string} into {string}',
          action: 'typeAlt',
          description: 'Types text into an element'
        },
        {
          pattern: 'I should see {string}',
          action: 'verifyText',
          description: 'Verifies that text is visible on the page'
        },
        {
          pattern: 'I should not see {string}',
          action: 'verifyTextNotPresent',
          description: 'Verifies that text is not visible on the page'
        },
        {
          pattern: 'I should see {string} in {string}',
          action: 'verifyElementText',
          description: 'Verifies text in specific element'
        },
        {
          pattern: 'I should not see {string} in {string}',
          action: 'verifyElementTextNotPresent',
          description: 'Verifies text not in specific element'
        },
        {
          pattern: 'I take a screenshot',
          action: 'screenshot',
          description: 'Takes a screenshot of the current page'
        },
        {
          pattern: 'I take a screenshot named {string}',
          action: 'namedScreenshot',
          description: 'Takes a named screenshot'
        },
        // Title verification
        {
          pattern: 'the page title should be {string}',
          action: 'verifyTitle',
          description: 'Verifies the page title exactly matches'
        },
        {
          pattern: 'the page title should contain {string}',
          action: 'verifyTitleContains',
          description: 'Verifies page title contains text'
        },
        // Element state verification
        {
          pattern: 'the {string} should be visible',
          action: 'verifyVisible',
          description: 'Verifies element is visible'
        },
        {
          pattern: 'the {string} should be enabled',
          action: 'verifyEnabled',
          description: 'Verifies element is enabled'
        },
        {
          pattern: 'the {string} should be hidden',
          action: 'verifyHidden',
          description: 'Verifies element is hidden'
        },
        {
          pattern: 'the {string} should be disabled',
          action: 'verifyDisabled',
          description: 'Verifies element is disabled'
        },
        // Selection and form interactions
        {
          pattern: 'I select {string} from {string}',
          action: 'selectOption',
          description: 'Selects option from dropdown'
        },
        // Mouse interactions
        {
          pattern: 'I hover over {string}',
          action: 'hover',
          description: 'Hovers over an element'
        },
        // Frame and window management
        {
          pattern: 'I switch to frame {string}',
          action: 'switchToFrame',
          description: 'Switches to an iframe'
        },
        {
          pattern: 'I switch to default content',
          action: 'switchToMainContent',
          description: 'Switches back to main content'
        },
        // JavaScript execution
        {
          pattern: 'I execute JavaScript {string}',
          action: 'executeJS',
          description: 'Executes JavaScript code'
        },
        // File operations
        {
          pattern: 'I upload file {string} to {string}',
          action: 'uploadFile',
          description: 'Uploads a file'
        },
        // Wait operations
        {
          pattern: 'I wait {int} seconds', 
          action: 'wait',
          description: 'Waits for specified time'
        },
        {
          pattern: 'I wait for {string} to appear',
          action: 'waitForElement',
          description: 'Waits for element to appear'
        },
        // Scrolling
        {
          pattern: 'I scroll to {string}',
          action: 'scrollTo',
          description: 'Scrolls to an element'
        },
        // Keyboard navigation
        {
          pattern: 'I press tab key',
          action: 'pressTab',
          description: 'Presses tab key'
        },
        {
          pattern: 'I press enter key',
          action: 'pressEnter',
          description: 'Presses enter key'
        },
        {
          pattern: 'I press escape key',
          action: 'pressEscape',
          description: 'Presses escape key'
        }
      ]
    };
  }

  // Execute the action using WebDriver
  switch (action) {
    case 'open':
    case 'goto':
      await webDriver.navigateTo(args[0]);
      return { message: `Navigated to ${args[0]}` };

    case 'refresh':
      await webDriver.refreshPage();
      return { message: 'Page refreshed' };

    case 'goBack':
      await webDriver.goBack();
      return { message: 'Navigated back' };

    case 'goForward':
      await webDriver.goForward();
      return { message: 'Navigated forward' };

    // Click actions
    case 'click':
      await webDriver.click(args[0]);
      return { message: `Clicked element ${args[0]}`, selector: args[0] };

    case 'doubleClick':
      await webDriver.doubleClick(args[0]);
      return { message: `Double clicked element ${args[0]}`, selector: args[0] };

    case 'rightClick':
      await webDriver.rightClick(args[0]);
      return { message: `Right clicked element ${args[0]}`, selector: args[0] };

    case 'clickAndHold':
      await webDriver.clickAndHold(args[0]);
      return { message: `Click and hold on ${args[0]}`, selector: args[0] };

    case 'release':
      await webDriver.release(args[0]);
      return { message: `Released click on ${args[0]}`, selector: args[0] };

    // Text input
    case 'type':
      await webDriver.type(args[0], args[1]);
      return { message: `Typed "${args[1]}" into ${args[0]}`, selector: args[0], text: args[1] };

    case 'appendText':
      await webDriver.appendText(args[0], args[1]);
      return { message: `Appended "${args[1]}" to ${args[0]}`, selector: args[0], text: args[1] };

    case 'clear':
      await webDriver.clear(args[0]);
      return { message: `Cleared field ${args[0]}`, selector: args[0] };

    // Key presses
    case 'typeKey':
      await webDriver.typeSpecialKey('body', args[0]);
      return { message: `Pressed ${args[0]} key`, key: args[0] };

    case 'typeKeyInElement':
      await webDriver.typeSpecialKey(args[0], args[1]);
      return { message: `Pressed ${args[1]} key in ${args[0]}`, key: args[1], selector: args[0] };

    case 'pressTab':
      await webDriver.typeSpecialKey('body', 'tab');
      return { message: 'Pressed tab key', key: 'tab' };

    case 'pressEnter':
      await webDriver.typeSpecialKey('body', 'enter');
      return { message: 'Pressed enter key', key: 'enter' };

    case 'pressEscape':
      await webDriver.typeSpecialKey('body', 'escape');
      return { message: 'Pressed escape key', key: 'escape' };

    // Form controls
    case 'selectOption':
      await webDriver.selectOption(args[1], args[0]);
      return { message: `Selected "${args[0]}" from ${args[1]}`, option: args[0], selector: args[1] };

    case 'selectByValue':
      await webDriver.selectOption(args[1], args[0], 'value');
      return { message: `Selected option with value "${args[0]}" from ${args[1]}`, value: args[0], selector: args[1] };

    case 'selectByIndex':
      await webDriver.selectOption(args[1], args[0], 'index');
      return { message: `Selected option at index ${args[0]} from ${args[1]}`, index: args[0], selector: args[1] };

    case 'checkCheckbox':
      await webDriver.checkCheckbox(args[0]);
      return { message: `Checked checkbox ${args[0]}`, selector: args[0] };

    case 'uncheckCheckbox':
      await webDriver.checkCheckbox(args[0], false);
      return { message: `Unchecked checkbox ${args[0]}`, selector: args[0] };

    case 'selectRadio':
      await webDriver.selectRadioButton(args[0]);
      return { message: `Selected radio button ${args[0]}`, selector: args[0] };

    case 'toggleCheckbox':
      await webDriver.toggleCheckbox(args[0]);
      return { message: `Toggled checkbox ${args[0]}`, selector: args[0] };

    // File operations
    case 'uploadFile':
      await webDriver.uploadFile(args[1], args[0]);
      return { message: `Uploaded file "${args[0]}" to ${args[1]}`, filePath: args[0], selector: args[1] };

    case 'uploadMultipleFiles':
      await webDriver.uploadMultipleFiles(args[1], args[0]);
      return { message: `Uploaded files "${args[0]}" to ${args[1]}`, filePaths: args[0], selector: args[1] };

    case 'downloadFile':
      const downloadResult = await webDriver.downloadFile(args[0]);
      return { message: `Downloaded file from ${args[0]}`, url: args[0], filePath: downloadResult };

    // Mouse actions
    case 'hover':
      await webDriver.hover(args[0]);
      return { message: `Hovered over ${args[0]}`, selector: args[0] };

    case 'moveTo':
      await webDriver.moveTo(args[0]);
      return { message: `Moved mouse to ${args[0]}`, selector: args[0] };

    case 'dragAndDrop':
      await webDriver.dragAndDrop(args[0], args[1]);
      return { message: `Dragged ${args[0]} to ${args[1]}`, source: args[0], target: args[1] };

    case 'dragByOffset':
      await webDriver.dragByOffset(args[0], args[1], args[2]);
      return { message: `Dragged ${args[0]} by offset (${args[1]}, ${args[2]})`, selector: args[0], x: args[1], y: args[2] };

    case 'moveByOffset':
      await webDriver.moveByOffset(args[1], args[2]);
      return { message: `Moved by offset (${args[1]}, ${args[2]})`, x: args[1], y: args[2] };

    // Scrolling
    case 'scrollTo':
      await webDriver.scrollTo(args[0]);
      return { message: `Scrolled to ${args[0]}`, selector: args[0] };

    case 'scrollToPosition':
      await webDriver.scrollTo(undefined, { x: args[0], y: args[1] });
      return { message: `Scrolled to position (${args[0]}, ${args[1]})`, x: args[0], y: args[1] };

    case 'scrollUp':
      await webDriver.scrollBy(0, -args[0]);
      return { message: `Scrolled up by ${args[0]} pixels`, pixels: args[0] };

    case 'scrollDown':
      await webDriver.scrollBy(0, args[0]);
      return { message: `Scrolled down by ${args[0]} pixels`, pixels: args[0] };

    case 'scrollLeft':
      await webDriver.scrollBy(-args[0], 0);
      return { message: `Scrolled left by ${args[0]} pixels`, pixels: args[0] };

    case 'scrollRight':
      await webDriver.scrollBy(args[0], 0);
      return { message: `Scrolled right by ${args[0]} pixels`, pixels: args[0] };

    case 'scrollToTop':
      await webDriver.scrollTo(undefined, { x: 0, y: 0 });
      return { message: 'Scrolled to top of page' };

    case 'scrollToBottom':
      await webDriver.scrollToBottom();
      return { message: 'Scrolled to bottom of page' };

    // Wait actions
    case 'waitForElement':
      await webDriver.waitForElement(args[0]);
      return { message: `Waited for element ${args[0]} to appear`, selector: args[0] };

    case 'waitForElementToDisappear':
      await webDriver.waitForElementToDisappear(args[0]);
      return { message: `Waited for element ${args[0]} to disappear`, selector: args[0] };

    case 'waitForVisible':
      await webDriver.waitForVisible(args[0]);
      return { message: `Waited for ${args[0]} to be visible`, selector: args[0] };

    case 'waitForHidden':
      await webDriver.waitForHidden(args[0]);
      return { message: `Waited for ${args[0]} to be hidden`, selector: args[0] };

    case 'waitForEnabled':
      await webDriver.waitForEnabled(args[0]);
      return { message: `Waited for ${args[0]} to be enabled`, selector: args[0] };

    case 'waitForDisabled':
      await webDriver.waitForDisabled(args[0]);
      return { message: `Waited for ${args[0]} to be disabled`, selector: args[0] };

    case 'waitForText':
      await webDriver.waitForText(args[0], args[1]);
      return { message: `Waited for ${args[0]} to contain "${args[1]}"`, selector: args[0], text: args[1] };

    case 'waitForTitle':
      await webDriver.waitForTitle(args[0]);
      return { message: `Waited for page title to be "${args[0]}"`, title: args[0] };

    case 'waitForUrl':
      await webDriver.waitForUrl(args[0]);
      return { message: `Waited for URL to contain "${args[0]}"`, url: args[0] };

    case 'wait':
      const waitTime = parseInt(args[0]) * 1000; // Convert seconds to milliseconds
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return { message: `Waited for ${args[0]} seconds`, seconds: args[0] };

    // Frame/Window management
    case 'switchToFrame':
      await webDriver.switchToFrame(args[0]);
      return { message: `Switched to frame ${args[0]}`, frameSelector: args[0] };

    case 'switchToFrameByIndex':
      await webDriver.switchToFrame(args[0]);
      return { message: `Switched to frame at index ${args[0]}`, index: args[0] };

    case 'switchToMainContent':
      await webDriver.switchToFrame();
      return { message: 'Switched to main content' };

    case 'switchToNewWindow':
      await webDriver.switchToWindow();
      return { message: 'Switched to new window' };

    case 'switchToWindow':
      await webDriver.switchToWindow(args[0]);
      return { message: `Switched to window ${args[0]}`, windowHandle: args[0] };

    case 'closeWindow':
      await webDriver.closeWindow();
      return { message: 'Closed current window' };

    case 'switchToParentFrame':
      await webDriver.switchToParentFrame();
      return { message: 'Switched to parent frame' };

    // Shadow DOM
    case 'switchToShadowRoot':
      await webDriver.switchToShadowRoot(args[0]);
      return { message: `Switched to shadow root of ${args[0]}`, selector: args[0] };

    case 'findInShadowRoot':
      const element = await webDriver.findInShadowRoot(args[1], args[0]);
      return { message: `Found element ${args[0]} in shadow root of ${args[1]}`, selector: args[0], hostSelector: args[1], element };

    case 'clickInShadowRoot':
      await webDriver.clickInShadowRoot(args[1], args[0]);
      return { message: `Clicked ${args[0]} in shadow root of ${args[1]}`, selector: args[0], hostSelector: args[1] };

    // Alert handling
    case 'acceptAlert':
      await webDriver.acceptAlert();
      return { message: 'Accepted alert' };

    case 'dismissAlert':
      await webDriver.dismissAlert();
      return { message: 'Dismissed alert' };

    case 'sendKeysToAlert':
      await webDriver.sendKeysToAlert(args[0]);
      return { message: `Entered "${args[0]}" in alert prompt`, text: args[0] };

    case 'getAlertText':
      const alertText = await webDriver.getAlertText();
      return { message: 'Got alert text', text: alertText };

    // Cookie management
    case 'addCookie':
      await webDriver.addCookie(args[0], args[1]);
      return { message: `Added cookie "${args[0]}" with value "${args[1]}"`, name: args[0], value: args[1] };

    case 'deleteCookie':
      await webDriver.deleteCookie(args[0]);
      return { message: `Deleted cookie "${args[0]}"`, name: args[0] };

    case 'deleteAllCookies':
      await webDriver.deleteAllCookies();
      return { message: 'Deleted all cookies' };

    case 'getCookie':
      const cookie = await webDriver.getCookie(args[0]);
      return { message: `Got cookie "${args[0]}"`, name: args[0], value: cookie };

    // Window management
    case 'maximizeWindow':
      await webDriver.maximizeWindow();
      return { message: 'Maximized window' };

    case 'minimizeWindow':
      await webDriver.minimizeWindow();
      return { message: 'Minimized window' };

    case 'setWindowSize':
      await webDriver.setWindowSize(args[0], args[1]);
      return { message: `Set window size to ${args[0]}x${args[1]}`, width: args[0], height: args[1] };

    case 'setWindowPosition':
      await webDriver.setWindowPosition(args[0], args[1]);
      return { message: `Set window position to (${args[0]}, ${args[1]})`, x: args[0], y: args[1] };

    case 'openNewTab':
      await webDriver.openNewTab();
      return { message: 'Opened new tab' };

    case 'closeCurrentTab':
      await webDriver.closeCurrentTab();
      return { message: 'Closed current tab' };

    // Verification actions
    case 'verifyText':
      const pageSource = await webDriver.getPageSource();
      if (pageSource.includes(args[0])) {
        return { message: `Verified text "${args[0]}" is present` };
      } else {
        throw new Error(`Text "${args[0]}" not found on page`);
      }

    case 'verifyElementText':
      const elementText = await webDriver.getText(args[1]);
      const textMatch = elementText.includes(args[0]);
      if (!textMatch) {
        throw new Error(`Expected text "${args[0]}" not found in element ${args[1]}`);
      }
      return { message: `Verified text "${args[0]}" in element ${args[1]}`, text: args[0], selector: args[1], result: textMatch };

    case 'verifyTextNotPresent':
      const pageContent = await webDriver.getPageSource();
      if (!pageContent.includes(args[0])) {
        return { message: `Verified text "${args[0]}" is not present` };
      } else {
        throw new Error(`Text "${args[0]}" was found on page but should not be present`);
      }

    case 'verifyElementTextNotPresent':
      const elementTextNotMatch = await webDriver.getText(args[1]);
      const noTextMatch = !elementTextNotMatch.includes(args[0]);
      if (!noTextMatch) {
        throw new Error(`Text "${args[0]}" was found in element ${args[1]} but should not be present`);
      }
      return { message: `Verified text "${args[0]}" not in element ${args[1]}`, text: args[0], selector: args[1], result: noTextMatch };

    case 'verifyTitle':
      const titleToVerify = await webDriver.getPageTitle();
      if (titleToVerify === args[0]) {
        return { message: `Verified page title "${args[0]}"` };
      } else {
        throw new Error(`Expected title "${args[0]}" but got "${titleToVerify}"`);
      }

    case 'verifyTitleContains':
      const currentPageTitle = await webDriver.getPageTitle();
      if (currentPageTitle.includes(args[0])) {
        return { message: `Verified page title contains "${args[0]}"` };
      } else {
        throw new Error(`Title "${currentPageTitle}" does not contain "${args[0]}"`);
      }

    case 'verifyUrl':
      const currentUrl = await webDriver.getCurrentUrl();
      const urlMatch = currentUrl === args[0];
      if (!urlMatch) {
        throw new Error(`Expected URL "${args[0]}" but got "${currentUrl}"`);
      }
      return { message: `Verified current URL is "${args[0]}"`, url: args[0], result: urlMatch };

    case 'verifyUrlContains':
      const currentUrlContains = await webDriver.getCurrentUrl();
      const urlContains = currentUrlContains.includes(args[0]);
      if (!urlContains) {
        throw new Error(`URL "${currentUrlContains}" does not contain "${args[0]}"`);
      }
      return { message: `Verified URL contains "${args[0]}"`, url: args[0], result: urlContains };

    case 'verifyVisible':
      const isVisible = await webDriver.isVisible(args[0]);
      if (!isVisible) {
        throw new Error(`Element ${args[0]} is not visible`);
      }
      return { message: `Verified ${args[0]} is visible`, selector: args[0], result: isVisible };

    case 'verifyHidden':
      const isHidden = !(await webDriver.isVisible(args[0]));
      if (!isHidden) {
        throw new Error(`Element ${args[0]} is visible but should be hidden`);
      }
      return { message: `Verified ${args[0]} is hidden`, selector: args[0], result: isHidden };

    case 'verifyEnabled':
      const isEnabled = await webDriver.isEnabled(args[0]);
      if (!isEnabled) {
        throw new Error(`Element ${args[0]} is not enabled`);
      }
      return { message: `Verified ${args[0]} is enabled`, selector: args[0], result: isEnabled };

    case 'verifyDisabled':
      const isDisabled = !(await webDriver.isEnabled(args[0]));
      if (!isDisabled) {
        throw new Error(`Element ${args[0]} is enabled but should be disabled`);
      }
      return { message: `Verified ${args[0]} is disabled`, selector: args[0], result: isDisabled };

    case 'verifySelected':
      const isSelected = await webDriver.isSelected(args[0]);
      if (!isSelected) {
        throw new Error(`Element ${args[0]} is not selected`);
      }
      return { message: `Verified ${args[0]} is selected`, selector: args[0], result: isSelected };

    case 'verifyNotSelected':
      const isNotSelected = !(await webDriver.isSelected(args[0]));
      if (!isNotSelected) {
        throw new Error(`Element ${args[0]} is selected but should not be`);
      }
      return { message: `Verified ${args[0]} is not selected`, selector: args[0], result: isNotSelected };

    case 'verifyAttribute':
      const attributeValue = await webDriver.getAttribute(args[0], args[1]);
      const attributeMatch = attributeValue === args[2];
      if (!attributeMatch) {
        throw new Error(`Expected attribute "${args[1]}" to be "${args[2]}" but got "${attributeValue}"`);
      }
      return { message: `Verified ${args[0]} has attribute "${args[1]}" with value "${args[2]}"`, selector: args[0], attribute: args[1], value: args[2], result: attributeMatch };

    case 'verifyCssProperty':
      const cssValue = await webDriver.getCssProperty(args[0], args[1]);
      const cssMatch = cssValue === args[2];
      if (!cssMatch) {
        throw new Error(`Expected CSS property "${args[1]}" to be "${args[2]}" but got "${cssValue}"`);
      }
      return { message: `Verified ${args[0]} has CSS property "${args[1]}" with value "${args[2]}"`, selector: args[0], property: args[1], value: args[2], result: cssMatch };

    case 'verifyElementCount':
      const elementCount = await webDriver.countElements(args[0]);
      const countMatches = elementCount === parseInt(args[1]);
      if (!countMatches) {
        throw new Error(`Expected ${args[1]} elements but found ${elementCount}`);
      }
      return { message: `Verified ${args[0]} contains ${args[1]} elements`, selector: args[0], count: args[1], result: countMatches };

    case 'verifyElementExists':
      const exists = await webDriver.elementExists(args[0]);
      if (!exists) {
        throw new Error(`Element ${args[0]} does not exist`);
      }
      return { message: `Verified ${args[0]} exists`, selector: args[0], result: exists };

    case 'verifyElementNotExists':
      const notExists = !(await webDriver.elementExists(args[0]));
      if (!notExists) {
        throw new Error(`Element ${args[0]} exists but should not`);
      }
      return { message: `Verified ${args[0]} does not exist`, selector: args[0], result: notExists };

    // Screenshot actions
    case 'takeScreenshot':
      const screenshot = await webDriver.takeScreenshot();
      return { message: 'Took screenshot', screenshot };

    case 'takeNamedScreenshot':
      const namedScreenshot = await webDriver.takeScreenshot(args[0]);
      return { message: `Took screenshot named "${args[0]}"`, filename: args[0], screenshot: namedScreenshot };

    case 'takeElementScreenshot':
      const elementScreenshot = await webDriver.takeElementScreenshot(args[0]);
      return { message: `Took screenshot of ${args[0]}`, selector: args[0], screenshot: elementScreenshot };

    case 'takeFullPageScreenshot':
      const fullPageScreenshot = await webDriver.takeFullPageScreenshot();
      return { message: 'Took full page screenshot', screenshot: fullPageScreenshot };

    // Information retrieval
    case 'getText':
      const text = await webDriver.getText(args[0]);
      return { message: `Got text from ${args[0]}`, selector: args[0], text };

    case 'getAttribute':
      const attribute = await webDriver.getAttribute(args[0], args[1]);
      return { message: `Got attribute "${args[1]}" from ${args[0]}`, selector: args[0], attribute: args[1], value: attribute };

    case 'getValue':
      const value = await webDriver.getValue(args[0]);
      return { message: `Got value from ${args[0]}`, selector: args[0], value };

    case 'getCssProperty':
      const cssProperty = await webDriver.getCssProperty(args[0], args[1]);
      return { message: `Got CSS property "${args[1]}" from ${args[0]}`, selector: args[0], property: args[1], value: cssProperty };

    case 'getTitle':
      const pageTitle = await webDriver.getPageTitle();
      return { message: 'Got page title', title: pageTitle };

    case 'getUrl':
      const url = await webDriver.getCurrentUrl();
      return { message: 'Got current URL', url };

    case 'getSource':
      const source = await webDriver.getPageSource();
      return { message: 'Got page source', source };

    case 'countElements':
      const elementsCount = await webDriver.countElements(args[0]);
      return { message: `Counted elements matching ${args[0]}`, selector: args[0], count: elementsCount };

    // JavaScript execution
    case 'executeJS':
      const jsResult = await webDriver.executeJavaScript(args[0]);
      return { message: `Executed JavaScript: ${args[0]}`, script: args[0], result: jsResult };

    case 'executeJSWithArgs':
      const jsWithArgsResult = await webDriver.executeJavaScript(args[0], ...args[1]);
      return { message: `Executed JavaScript with arguments: ${args[0]}`, script: args[0], args: args[1], result: jsWithArgsResult };

    case 'executeAsyncJS':
      const asyncJsResult = await webDriver.executeAsyncJavaScript(args[0]);
      return { message: `Executed async JavaScript: ${args[0]}`, script: args[0], result: asyncJsResult };

    // Touch actions (for mobile)
    case 'touchTap':
      await webDriver.touchTap(args[0]);
      return { message: `Performed touch tap on ${args[0]}`, selector: args[0] };

    case 'doubleTap':
      await webDriver.doubleTap(args[0]);
      return { message: `Performed double tap on ${args[0]}`, selector: args[0] };

    case 'longPress':
      await webDriver.longPress(args[0]);
      return { message: `Performed long press on ${args[0]}`, selector: args[0] };

    case 'swipe':
      await webDriver.swipe(args[0], args[1]);
      return { message: `Swiped from ${args[0]} to ${args[1]}`, startSelector: args[0], endSelector: args[1] };

    case 'zoomIn':
      await webDriver.zoomIn(args[0]);
      return { message: `Zoomed in on ${args[0]}`, selector: args[0] };

    case 'zoomOut':
      await webDriver.zoomOut(args[0]);
      return { message: `Zoomed out on ${args[0]}`, selector: args[0] };

    case 'typeAlt':
      await webDriver.type(args[1], args[0]);
      return { message: `Typed "${args[0]}" into ${args[1]}`, selector: args[1], text: args[0] };

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// Cleanup on exit
process.on('SIGINT', async () => {
  if (webDriver) {
    await webDriver.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (webDriver) {
    await webDriver.close();
  }
  process.exit(0);
});
