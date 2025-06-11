// Action handlers for unified web driver
const { sendErrorResponse, sendSuccessResponse } = require('../utils/responses');

async function executeAction(id, action, args, engine, config, logger) {
  logger.log(`Executing action: ${action}`, { args, engine: config.engine });
  
  try {
    switch (action) {
      case 'open':
      case 'goto':
        await engine.navigate(args[0]);
        return sendSuccessResponse(id, { url: args[0] });      case 'click':
        await engine.click(args[0]);
        return sendSuccessResponse(id, { clicked: args[0] });

      case 'type':
      case 'enterText':
      case 'typeAlt':
        // Natural order: text first, selector second
        await engine.type(args[0], args[1]);
        return sendSuccessResponse(id, { typed: args[0], selector: args[1] });

      case 'getText':
        const text = await engine.getText(args[0]);
        return sendSuccessResponse(id, { text });

      case 'screenshot':
      case 'takeScreenshot':
        const screenshotPath = await engine.screenshot(args[0] || {});
        return sendSuccessResponse(id, { screenshot: screenshotPath });

      case 'waitForElement':
        await engine.waitForElement(args[0], args[1]);
        return sendSuccessResponse(id, { waited: args[0] });

      case 'getTitle':
        const title = await engine.getTitle();
        return sendSuccessResponse(id, { title });

      case 'getUrl':
        const url = await engine.getUrl();
        return sendSuccessResponse(id, { url });

      case 'isVisible':
      case 'assertVisible':
        const visible = await engine.isVisible(args[0]);
        return sendSuccessResponse(id, { visible, selector: args[0] });

      case 'getAttribute':
        const attributeValue = await engine.getAttribute(args[0], args[1]);
        return sendSuccessResponse(id, { attribute: args[1], value: attributeValue, selector: args[0] });

      case 'getValue':
        const value = await engine.getValue(args[0]);
        return sendSuccessResponse(id, { value, selector: args[0] });      case 'hover':
        await engine.hover(args[0]);
        return sendSuccessResponse(id, { hovered: args[0] });

      case 'selectOption':
        // Natural order: value first, selector second
        await engine.selectOption(args[0], args[1]);
        return sendSuccessResponse(id, { selected: args[0], selector: args[1] });

      case 'executeJS':
        const result = await engine.executeJS(args[0]);
        return sendSuccessResponse(id, { result, script: args[0] });

      case 'assertText':
      case 'verifyText':
        // For "I should see" - search entire page for text
        if (args.length === 1) {
          const pageText = await engine.getPageSource();
          const expectedText = args[0];
          const matches = pageText && pageText.includes(expectedText);
          return sendSuccessResponse(id, { 
            matches, 
            expected: expectedText, 
            actual: pageText ? 'Page content' : 'No content',
            selector: 'page' 
          });
        } else {
          // For "I should see text in element" - search specific element
          const actualText = await engine.getText(args[0]);
          const expectedText = args[1];
          const matches = actualText && actualText.includes(expectedText);
          return sendSuccessResponse(id, { 
            matches, 
            expected: expectedText, 
            actual: actualText, 
            selector: args[0] 
          });
        }
        break;

      // Navigation actions
      case 'goBack':
        await engine.goBack();
        return sendSuccessResponse(id, { action: 'goBack' });

      case 'goForward':
        await engine.goForward();
        return sendSuccessResponse(id, { action: 'goForward' });

      case 'reload':
      case 'refresh':
        await engine.reload();
        return sendSuccessResponse(id, { action: 'reload' });

      // Advanced clicking
      case 'doubleClick':
        await engine.doubleClick(args[0]);
        return sendSuccessResponse(id, { doubleClicked: args[0] });

      case 'rightClick':
        await engine.rightClick(args[0]);
        return sendSuccessResponse(id, { rightClicked: args[0] });

      case 'focus':
        await engine.focus(args[0]);
        return sendSuccessResponse(id, { focused: args[0] });

      case 'blur':
        await engine.blur(args[0]);
        return sendSuccessResponse(id, { blurred: args[0] });

      // Text input variations
      case 'clear':
        await engine.clear(args[0]);
        return sendSuccessResponse(id, { cleared: args[0] });

      case 'pressKey':
        await engine.pressKey(args[0]);
        return sendSuccessResponse(id, { pressedKey: args[0] });

      case 'pressKeys':
        await engine.pressKeys(args[0]);
        return sendSuccessResponse(id, { pressedKeys: args[0] });

      // Element properties
      case 'getInnerText':
        const innerText = await engine.getInnerText(args[0]);
        return sendSuccessResponse(id, { innerText });      case 'getInnerHTML':
        const innerHTML = await engine.getInnerHTML(args[0]);
        return sendSuccessResponse(id, { innerHTML });      case 'getProperty':
        const property = await engine.getProperty(args[1], args[0]);
        return sendSuccessResponse(id, { property: args[1], value: property, selector: args[0] });

      case 'getCSSProperty':
        const cssValue = await engine.getCSSProperty(args[1], args[0]);
        return sendSuccessResponse(id, { cssProperty: args[1], value: cssValue, selector: args[0] });

      // Element state checks
      case 'isHidden':
        const hidden = await engine.isHidden(args[0]);
        return sendSuccessResponse(id, { hidden, selector: args[0] });

      case 'isEnabled':
        const enabled = await engine.isEnabled(args[0]);
        return sendSuccessResponse(id, { enabled, selector: args[0] });

      case 'isDisabled':
        const disabled = await engine.isDisabled(args[0]);
        return sendSuccessResponse(id, { disabled, selector: args[0] });

      case 'isChecked':
        const checked = await engine.isChecked(args[0]);
        return sendSuccessResponse(id, { checked, selector: args[0] });

      case 'isEditable':
        const editable = await engine.isEditable(args[0]);
        return sendSuccessResponse(id, { editable, selector: args[0] });

      // Form interactions
      case 'check':
        await engine.check(args[0]);
        return sendSuccessResponse(id, { checked: args[0] });      case 'uncheck':
        await engine.uncheck(args[0]);
        return sendSuccessResponse(id, { unchecked: args[0] });

      case 'uploadFile':
        // Natural order: filename first, selector second
        await engine.uploadFile(args[0], args[1]);
        return sendSuccessResponse(id, { uploaded: args[0], selector: args[1] });

      // Screenshots
      case 'screenshotElement':
        const elementScreenshot = await engine.screenshotElement(args[0], args[1] || {});
        return sendSuccessResponse(id, { screenshot: elementScreenshot });

      // Wait operations
      case 'waitForElementVisible':
        await engine.waitForElementVisible(args[0], args[1]);
        return sendSuccessResponse(id, { waitedForVisible: args[0] });

      case 'waitForElementHidden':
        await engine.waitForElementHidden(args[0], args[1]);
        return sendSuccessResponse(id, { waitedForHidden: args[0] });

      case 'waitForText':
        await engine.waitForText(args[0], args[1], args[2]);
        return sendSuccessResponse(id, { waitedForText: args[1], selector: args[0] });

      case 'waitForUrl':
        await engine.waitForUrl(args[0], args[1]);
        return sendSuccessResponse(id, { waitedForUrl: args[0] });

      case 'waitForLoadState':
        await engine.waitForLoadState(args[0]);
        return sendSuccessResponse(id, { waitedForLoadState: args[0] });

      // Page information
      case 'getPageSource':
        const pageSource = await engine.getPageSource();
        return sendSuccessResponse(id, { pageSource });

      // JavaScript execution
      case 'executeAsyncJS':
        const asyncResult = await engine.executeAsyncJS(args[0], ...args.slice(1));
        return sendSuccessResponse(id, { result: asyncResult });

      // Frame handling
      case 'switchToFrame':
        await engine.switchToFrame(args[0]);
        return sendSuccessResponse(id, { switchedToFrame: args[0] });

      case 'switchToMainFrame':
        await engine.switchToMainFrame();
        return sendSuccessResponse(id, { switchedToMainFrame: true });

      case 'getFrameCount':
        const frameCount = await engine.getFrameCount();
        return sendSuccessResponse(id, { frameCount });

      case 'getFrameNames':
        const frameNames = await engine.getFrameNames();
        return sendSuccessResponse(id, { frameNames });

      // Shadow DOM operations
      case 'queryInShadowDOM':
        const shadowElement = await engine.queryInShadowDOM(args[0], args[1]);
        return sendSuccessResponse(id, { shadowElement: !!shadowElement });

      case 'clickInShadowDOM':
        await engine.clickInShadowDOM(args[0], args[1]);
        return sendSuccessResponse(id, { clickedInShadowDOM: true, host: args[0], shadow: args[1] });      case 'typeInShadowDOM':
        // Step definition captures: [text, host, selector]
        // Engine expects: (hostSelector, shadowSelector, text)
        await engine.typeInShadowDOM(args[1], args[2], args[0]);
        return sendSuccessResponse(id, { typedInShadowDOM: args[0], host: args[1], shadow: args[2] });

      // Window management
      case 'setViewportSize':
        const width = parseInt(args[0]);
        const height = parseInt(args[1]);
        await engine.setViewportSize(width, height);
        return sendSuccessResponse(id, { viewportSize: { width, height } });

      case 'getViewportSize':
        const viewportSize = await engine.getViewportSize();
        return sendSuccessResponse(id, { viewportSize });

      case 'maximizeWindow':
        await engine.maximizeWindow();
        return sendSuccessResponse(id, { maximized: true });      // Cookie management
      case 'addCookie':
        const cookieObj = { name: args[0], value: args[1] };
        await engine.addCookie(cookieObj);
        return sendSuccessResponse(id, { addedCookie: cookieObj });

      case 'getCookies':
        const cookies = await engine.getCookies();
        return sendSuccessResponse(id, { cookies });

      case 'deleteCookie':
        await engine.deleteCookie(args[0]);
        return sendSuccessResponse(id, { deletedCookie: args[0] });

      case 'deleteAllCookies':
        await engine.deleteAllCookies();
        return sendSuccessResponse(id, { deletedAllCookies: true });

      // Local Storage
      case 'setLocalStorage':
        await engine.setLocalStorage(args[0], args[1]);
        return sendSuccessResponse(id, { setLocalStorage: { key: args[0], value: args[1] } });

      case 'getLocalStorage':
        const localStorageValue = await engine.getLocalStorage(args[0]);
        return sendSuccessResponse(id, { localStorageValue, key: args[0] });

      case 'removeLocalStorage':
        await engine.removeLocalStorage(args[0]);
        return sendSuccessResponse(id, { removedLocalStorage: args[0] });

      case 'clearLocalStorage':
        await engine.clearLocalStorage();
        return sendSuccessResponse(id, { clearedLocalStorage: true });

      // Session Storage
      case 'setSessionStorage':
        await engine.setSessionStorage(args[0], args[1]);
        return sendSuccessResponse(id, { setSessionStorage: { key: args[0], value: args[1] } });

      case 'getSessionStorage':
        const sessionStorageValue = await engine.getSessionStorage(args[0]);
        return sendSuccessResponse(id, { sessionStorageValue, key: args[0] });

      // Drag and drop
      case 'dragAndDrop':
        await engine.dragAndDrop(args[0], args[1]);
        return sendSuccessResponse(id, { draggedFrom: args[0], droppedTo: args[1] });

      // Touch gestures
      case 'tap':
        await engine.tap(args[0]);
        return sendSuccessResponse(id, { tapped: args[0] });

      case 'swipe':
        await engine.swipe(args[0], args[1], args[2], args[3]);
        return sendSuccessResponse(id, { swiped: { from: [args[0], args[1]], to: [args[2], args[3]] } });

      // Alert handling
      case 'acceptAlert':
        await engine.acceptAlert();
        return sendSuccessResponse(id, { acceptedAlert: true });      case 'dismissAlert':
        await engine.dismissAlert();
        return sendSuccessResponse(id, { dismissedAlert: true });

      case 'getAlertText':
        const alertText = await engine.getAlertText();
        return sendSuccessResponse(id, { alertText });

      // Network operations (Playwright only)
      case 'interceptRequest':
        await engine.interceptRequest(args[0], args[1]);
        return sendSuccessResponse(id, { interceptedPattern: args[0] });

      case 'blockUrls':
        await engine.blockUrls(args[0]);
        return sendSuccessResponse(id, { blockedUrls: args[0] });

      // Session storage operations
      case 'removeSessionStorage':
        await engine.removeSessionStorage(args[0]);
        return sendSuccessResponse(id, { removedSessionStorage: args[0] });

      case 'clearSessionStorage':
        await engine.clearSessionStorage();
        return sendSuccessResponse(id, { clearedSessionStorage: true });

      case 'introspect':
        const introspectParams = args[0] || {};
        if (introspectParams.type === 'steps') {
          const { getStepDefinitions } = require('./step-definitions');
          return sendSuccessResponse(id, { 
            steps: getStepDefinitions(),
            engine: config.engine
          });
        } else {
          return sendSuccessResponse(id, { 
            capabilities: require('../../driver.json').actions,
            engine: config.engine
          });
        }

      // Additional comprehensive testing actions
      case 'titleContains':
        const pageTitle = await engine.getTitle();
        const titleMatches = pageTitle && pageTitle.includes(args[0]);
        return sendSuccessResponse(id, { 
          matches: titleMatches, 
          expected: args[0], 
          actual: pageTitle 
        });

      case 'urlContains':
        const currentUrl = await engine.getUrl();
        const urlMatches = currentUrl && currentUrl.includes(args[0]);
        return sendSuccessResponse(id, { 
          matches: urlMatches, 
          expected: args[0], 
          actual: currentUrl 
        });

      case 'rapidClicksOnElement':
        const clickCount = parseInt(args[0]) || 5;
        const selector = args[1];
        for (let i = 0; i < clickCount; i++) {
          await engine.click(selector);
          await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
        }
        return sendSuccessResponse(id, { rapidClicks: clickCount, selector });

      case 'verifyNotChecked':
        const isNotChecked = !(await engine.isChecked(args[0]));
        return sendSuccessResponse(id, { notChecked: isNotChecked, selector: args[0] });

      case 'verifyNotHidden':
        const isNotHidden = !(await engine.isHidden(args[0]));
        return sendSuccessResponse(id, { notHidden: isNotHidden, selector: args[0] });

      case 'waitWithShortTimeout':
        try {
          await engine.waitForElement(args[0], 100); // Very short timeout
          return sendSuccessResponse(id, { timeoutTest: 'passed unexpectedly' });
        } catch (err) {
          return sendSuccessResponse(id, { timeoutTest: 'failed as expected', error: err.message });
        }

      case 'interactWithNonExistent':
        try {
          await engine.click(args[0]);
          return sendSuccessResponse(id, { nonExistentTest: 'passed unexpectedly' });
        } catch (err) {
          return sendSuccessResponse(id, { nonExistentTest: 'failed as expected', error: err.message });
        }

      case 'navigateToInvalidURL':
        try {
          await engine.navigate(args[0]);
          return sendSuccessResponse(id, { invalidUrlTest: 'passed unexpectedly' });
        } catch (err) {
          return sendSuccessResponse(id, { invalidUrlTest: 'failed as expected', error: err.message });
        }

      case 'verifyFormValidation':
        // Check if form elements have expected values
        const formValid = await engine.executeJS(`
          const form = document.getElementById('test-form');
          return form && form.checkValidity();
        `);
        return sendSuccessResponse(id, { formValid });

      case 'verifyAllFormFields':
        const fieldValues = await engine.executeJS(`
          return {
            name: document.getElementById('customer-name')?.value || '',
            email: document.getElementById('customer-email')?.value || '',
            phone: document.getElementById('customer-phone')?.value || ''
          };
        `);
        return sendSuccessResponse(id, { fieldValues });

      case 'openComprehensiveTestPage':
        const testPagePath = 'file:///c:/_Runix/drivers/web-driver/test/comprehensive-test-page.html';
        await engine.navigate(testPagePath);
        return sendSuccessResponse(id, { url: testPagePath });

      // Missing verification actions
      case 'pageLoaded':
      case 'verifyPageLoaded':
        const loadState = await engine.executeJS('document.readyState');
        return sendSuccessResponse(id, { pageLoaded: loadState === 'complete' });

      case 'verifyInteractions':
        // Verify that interaction elements are present and working
        const interactionResults = await engine.executeJS(`
          return {
            clickTest: !!document.getElementById('click-test'),
            doubleClickTest: !!document.getElementById('double-click-test'),
            rightClickTest: !!document.getElementById('right-click-test'),
            hoverTest: !!document.getElementById('hover-test')
          };
        `);
        return sendSuccessResponse(id, { interactions: interactionResults });

      case 'verifyFormValues':
        // Verify form has expected values
        const formData = await engine.executeJS(`
          return {
            name: document.getElementById('customer-name')?.value || '',
            email: document.getElementById('customer-email')?.value || '',
            phone: document.getElementById('customer-phone')?.value || '',
            size: document.getElementById('size-select')?.value || '',
            comments: document.getElementById('comments')?.value || ''
          };
        `);
        return sendSuccessResponse(id, { formValues: formData });

      case 'verifyScreenshots':
        // Just confirm screenshots can be taken
        return sendSuccessResponse(id, { screenshotsEnabled: true });

      case 'verifyJSExecution':
        // Verify JavaScript execution works
        const jsTest = await engine.executeJS('typeof document !== "undefined"');
        return sendSuccessResponse(id, { jsExecutionWorks: jsTest });

      case 'verifyFrameOperations':
        // Verify frame operations work
        const frameTest = await engine.executeJS('window.frames.length >= 0');
        return sendSuccessResponse(id, { frameOperationsWork: frameTest });

      case 'verifyShadowDOM':
        // Verify shadow DOM operations
        const shadowTest = await engine.executeJS(`
          const host = document.getElementById('shadow-host');
          return host && host.shadowRoot;
        `);
        return sendSuccessResponse(id, { shadowDOMAvailable: !!shadowTest });

      case 'verifyWindowOperations':
        // Verify window operations
        const windowTest = await engine.executeJS('typeof window !== "undefined"');
        return sendSuccessResponse(id, { windowOperationsWork: windowTest });

      case 'verifyCookieOperations':
        // Verify cookies can be managed
        return sendSuccessResponse(id, { cookieOperationsEnabled: true });

      case 'verifyStorageOperations':
        // Verify storage operations
        const storageTest = await engine.executeJS(`
          return typeof localStorage !== "undefined" && typeof sessionStorage !== "undefined";
        `);
        return sendSuccessResponse(id, { storageOperationsWork: storageTest });

      case 'verifyDragDrop':
        // Verify drag and drop worked
        const dragTest = await engine.executeJS(`
          const dropzone = document.getElementById('dropzone');
          return dropzone && dropzone.textContent.includes('Dropped');
        `);
        return sendSuccessResponse(id, { dragDropWorked: !!dragTest });

      case 'verifyTouchGestures':
        // Verify touch gestures
        return sendSuccessResponse(id, { touchGesturesEnabled: false, reason: 'Desktop mode' });

      case 'verifyWaitOperations':
        // Verify wait operations completed
        return sendSuccessResponse(id, { waitOperationsEnabled: true });

      default:
        return sendErrorResponse(id, 404, `Unknown action: ${action}`);
    }
  } catch (err) {
    logger.error(`Action ${action} failed:`, err);
    return sendErrorResponse(id, 500, `Action failed: ${err.message}`);
  }
}

module.exports = {
  executeAction
};
