// Step definitions for Gherkin scenarios

function getStepDefinitions() {
  return [    
    // Navigation steps
    { 
      id: "open-url",
      pattern: "I open \"(.*)\"",
      action: "open",
      description: "Navigate to a URL"
    },
    {
      id: "open-browser-at",
      pattern: "I open the browser at \"(.*)\"",
      action: "open",
      description: "Navigate to a URL by opening browser"
    },
    {
      id: "navigate-to",
      pattern: "I navigate to \"(.*)\"",
      action: "open",
      description: "Navigate to a URL"
    },
    {
      id: "go-back",
      pattern: "I go back",
      action: "goBack",
      description: "Navigate back in browser history"
    },
    {
      id: "go-forward",
      pattern: "I go forward", 
      action: "goForward",
      description: "Navigate forward in browser history"
    },
    {
      id: "reload-page",
      pattern: "I reload the page",
      action: "reload",
      description: "Reload the current page"
    },    {
      id: "refresh-page",
      pattern: "I refresh the page",
      action: "refresh", 
      description: "Refresh the current page"
    },    // Scroll operations
    {
      id: "scroll-to-element",
      pattern: "I scroll to \"(.*)\"",
      action: "scroll",
      description: "Scroll to an element"
    },

    // Element interaction steps    
    {
      id: "click-element",
      pattern: "I click on \"(.*)\"",
      action: "click",
      description: "Click on an element"
    },
    {
      id: "click-button",
      pattern: "I click the \"(.*)\" button",
      action: "click",
      description: "Click a button"
    },
    {
      id: "double-click-element",
      pattern: "I double click on \"(.*)\"",
      action: "doubleClick",
      description: "Double click on an element"
    },
    {
      id: "right-click-element",
      pattern: "I right click on \"(.*)\"",
      action: "rightClick", 
      description: "Right click on an element"
    },    {
      id: "hover-element",
      pattern: "I hover over \"(.*)\"",
      action: "hover",
      description: "Hover over an element"
    },
    {
      id: "focus-element",
      pattern: "I focus on \"(.*)\"",
      action: "focus",
      description: "Focus on an element"
    },
    {
      id: "blur-element",
      pattern: "I blur from \"(.*)\"",
      action: "blur",
      description: "Remove focus from an element"
    },    
      // Text input steps    
    {
      id: "type-text",
      pattern: "I type \"(.*)\" into \"(.*)\"",
      action: "typeAlt",
      description: "Type text into an element"
    },    {
      id: "enter-text",
      pattern: "I enter text \"(.*)\" into \"(.*)\"",
      action: "typeAlt",
      description: "Enter text into an element"
    },
    {
      id: "enter-into-field",
      pattern: "I enter \"(.*)\" into the \"(.*)\" field",
      action: "typeAlt",
      description: "Enter text into a named field"
    },
    {
      id: "enter-into-element",
      pattern: "I enter \"(.*)\" into \"(.*)\"",
      action: "typeAlt",
      description: "Enter text into an element"
    },
    {
      id: "clear-field",
      pattern: "I clear the field \"(.*)\"",
      action: "clear",
      description: "Clear text from an element"
    },    {
      id: "press-key",
      pattern: "I press key \"(.*)\"",
      action: "pressKey",
      description: "Press a keyboard key"
    },
    {
      id: "press-keys",
      pattern: "I press keys \"(.*)\"",
      action: "pressKeys",
      description: "Press multiple keyboard keys"
    },    
    {
      id: "press-tab",
      pattern: "I press tab key",
      action: "pressKey",
      description: "Press tab key",
      args: ["Tab"]
    },
    {
      id: "press-enter",
      pattern: "I press enter key",
      action: "pressKey", 
      description: "Press enter key",
      args: ["Enter"]
    },
    
    // Form interaction steps
    {
      id: "select-option",
      pattern: "I select \"(.*)\" from \"(.*)\"",
      action: "selectOption",
      description: "Select an option from a dropdown"
    },
    {
      id: "check-checkbox",
      pattern: "I check the checkbox \"(.*)\"",
      action: "check",
      description: "Check a checkbox"
    },
    {
      id: "uncheck-checkbox",
      pattern: "I uncheck the checkbox \"(.*)\"",
      action: "uncheck",
      description: "Uncheck a checkbox"
    },
    {
      id: "upload-file",
      pattern: "I upload file \"(.*)\" to \"(.*)\"",
      action: "uploadFile",
      description: "Upload a file to a file input"
    },    
    
    // Element property steps
    {
      id: "get-text",
      pattern: "I get text from \"(.*)\"",
      action: "getText",
      description: "Get text content from an element"
    },
    {
      id: "get-inner-text",
      pattern: "I get inner text from \"(.*)\"",
      action: "getInnerText",
      description: "Get inner text from an element"
    },
    {
      id: "get-inner-html",
      pattern: "I get inner HTML from \"(.*)\"",
      action: "getInnerHTML",
      description: "Get inner HTML from an element"
    },
    {
      id: "get-attribute",
      pattern: "I get attribute \"(.*)\" from \"(.*)\"",
      action: "getAttribute",
      description: "Get attribute value from an element"
    },
    {
      id: "get-property",
      pattern: "I get property \"(.*)\" from \"(.*)\"",
      action: "getProperty",
      description: "Get property value from an element"
    },
    {
      id: "get-value",
      pattern: "I get value from \"(.*)\"",
      action: "getValue",
      description: "Get value from an input element"
    },
    {
      id: "get-css-property",
      pattern: "I get CSS property \"(.*)\" from \"(.*)\"",
      action: "getCSSProperty",
      description: "Get CSS property value from an element"
    },    
    
    // Element state steps
    {
      id: "element-visible",
      pattern: "element \"(.*)\" should be visible",
      action: "isVisible",
      description: "Check if element is visible"
    },
    {
      id: "element-hidden",
      pattern: "element \"(.*)\" should be hidden",
      action: "isHidden",
      description: "Check if element is hidden"
    },
    {
      id: "element-enabled",
      pattern: "element \"(.*)\" should be enabled",
      action: "isEnabled",
      description: "Check if element is enabled"
    },
    {
      id: "element-disabled",
      pattern: "element \"(.*)\" should be disabled",
      action: "isDisabled",
      description: "Check if element is disabled"
    },
    {
      id: "element-checked",
      pattern: "element \"(.*)\" should be checked",
      action: "isChecked",
      description: "Check if checkbox/radio is checked"
    },
    {
      id: "element-editable",
      pattern: "element \"(.*)\" should be editable",
      action: "isEditable",
      description: "Check if element is editable"
    },    
    
    // Wait operations
    {
      id: "wait-for-element",
      pattern: "I wait for element \"(.*)\"",
      action: "waitForElement",
      description: "Wait for element to appear"
    },
    {
      id: "wait-for-element-appear",
      pattern: "I wait for \"(.*)\" to appear",
      action: "waitForElement",
      description: "Wait for element to appear"
    },
    {
      id: "wait-for-element-visible",
      pattern: "I wait for element \"(.*)\" to be visible",
      action: "waitForElementVisible",
      description: "Wait for element to be visible"
    },
    {
      id: "wait-for-element-hidden",
      pattern: "I wait for element \"(.*)\" to be hidden",
      action: "waitForElementHidden",
      description: "Wait for element to be hidden"
    },
    {
      id: "wait-for-text",
      pattern: "I wait for element \"(.*)\" to contain text \"(.*)\"",
      action: "waitForText",
      description: "Wait for element to contain specific text"
    },
    {
      id: "wait-for-url",
      pattern: "I wait for URL to contain \"(.*)\"",
      action: "waitForUrl",
      description: "Wait for URL to contain specific text"
    },
    {
      id: "wait-for-page-loaded",
      pattern: "I wait for page to be loaded",
      action: "waitForLoadState",
      description: "Wait for page to finish loading"
    },
    
    // Timeout-aware wait operations
    {
      id: "wait-for-element-timeout",
      pattern: "I wait for element \"(.*)\" to appear within (\\d+)ms",
      action: "waitForElement",
      description: "Wait for element to appear with timeout"
    },
    {
      id: "wait-for-element-visible-timeout",
      pattern: "I wait for element \"(.*)\" to be visible within (\\d+)ms",
      action: "waitForElementVisible",
      description: "Wait for element to be visible with timeout"
    },
    {
      id: "wait-for-element-hidden-timeout",
      pattern: "I wait for element \"(.*)\" to be hidden within (\\d+)ms",
      action: "waitForElementHidden",
      description: "Wait for element to be hidden with timeout"
    },
    {
      id: "wait-for-text-timeout",
      pattern: "I wait for element \"(.*)\" to contain text \"(.*)\" within (\\d+)ms",
      action: "waitForText",
      description: "Wait for element to contain specific text with timeout"
    },
    {
      id: "wait-for-url-timeout",
      pattern: "I wait for URL to contain \"(.*)\" within (\\d+)ms",
      action: "waitForUrl",
      description: "Wait for URL to contain specific text with timeout"
    },
    {
      id: "wait-seconds",
      pattern: "I wait (\\d+) seconds",
      action: "wait",
      description: "Wait for specified number of seconds"
    },    
    
    // Screenshot steps
    {
      id: "take-screenshot",
      pattern: "I take a screenshot",
      action: "screenshot",
      description: "Take a full page screenshot"
    },
    {
      id: "take-screenshot-named",
      pattern: "I take a screenshot named \"(.*)\"",
      action: "screenshot",
      description: "Take a screenshot with specific filename"
    },
    {
      id: "take-screenshot-element",
      pattern: "I take a screenshot of element \"(.*)\"",
      action: "screenshotElement",
      description: "Take a screenshot of specific element"
    },    
    
    // Page information steps
    {
      id: "page-title-should-be",
      pattern: "the page title should be \"(.*)\"",
      action: "getTitle",
      description: "Get page title"
    },
    {
      id: "current-url-should-be",
      pattern: "the current URL should be \"(.*)\"",
      action: "getUrl",
      description: "Get current URL"
    },
    {
      id: "get-page-source",
      pattern: "I get page source",
      action: "getPageSource",
      description: "Get page HTML source"
    },    
    
    // JavaScript execution steps
    {
      id: "execute-javascript",
      pattern: "I execute JavaScript \"(.*)\"",
      action: "executeJS",
      description: "Execute JavaScript code"
    },
    {
      id: "execute-async-javascript",
      pattern: "I execute async JavaScript \"(.*)\"",
      action: "executeAsyncJS",
      description: "Execute asynchronous JavaScript code"
    },    
    
    // Frame handling steps
    {
      id: "switch-to-frame",
      pattern: "I switch to frame \"(.*)\"",
      action: "switchToFrame",
      description: "Switch to iframe"
    },
    {
      id: "switch-to-main-frame",
      pattern: "I switch to main frame",
      action: "switchToMainFrame",
      description: "Switch back to main frame"
    },
    {
      id: "switch-to-default-content",
      pattern: "I switch to default content",
      action: "switchToMainFrame",
      description: "Switch back to default content"
    },
    {
      id: "get-frame-count",
      pattern: "I get frame count",
      action: "getFrameCount",
      description: "Get number of frames"
    },
    {
      id: "get-frame-names",
      pattern: "I get frame names",
      action: "getFrameNames",
      description: "Get names of all frames"
    },    // Shadow DOM steps
    {
      id: "shadow-dom-query",
      pattern: "I query element in shadow DOM with host \"(.*)\" and selector \"(.*)\"",
      action: "queryInShadowDOM",
      description: "Query element in shadow DOM"
    },
    {
      id: "shadow-dom-click",
      pattern: "I click element in shadow DOM with host \"(.*)\" and selector \"(.*)\"",
      action: "clickInShadowDOM",
      description: "Click element in shadow DOM"
    },
    {
      id: "shadow-dom-type",
      pattern: "I type \"(.*)\" in shadow DOM element with host \"(.*)\" and selector \"(.*)\"",
      action: "typeInShadowDOM",
      description: "Type text in shadow DOM element"
    },    // Window management steps
    {
      id: "set-viewport-size",
      pattern: "I set viewport size to (\\d+)x(\\d+)",
      action: "setViewportSize",
      description: "Set browser viewport size"
    },
    {
      id: "get-viewport-size",
      pattern: "I get viewport size",
      action: "getViewportSize",
      description: "Get current viewport size"
    },
    {
      id: "maximize-window",
      pattern: "I maximize window",
      action: "maximizeWindow",
      description: "Maximize browser window"
    },    // Cookie management steps
    {
      id: "add-cookie",
      pattern: "I add cookie with name \"(.*)\" and value \"(.*)\"",
      action: "addCookie",
      description: "Add a cookie"
    },
    {
      id: "get-all-cookies",
      pattern: "I get all cookies",
      action: "getCookies",
      description: "Get all cookies"
    },
    {
      id: "delete-cookie",
      pattern: "I delete cookie \"(.*)\"",
      action: "deleteCookie",
      description: "Delete a specific cookie"
    },
    {
      id: "delete-all-cookies",
      pattern: "I delete all cookies",
      action: "deleteAllCookies",
      description: "Delete all cookies"
    },    // Storage management steps
    {
      id: "set-local-storage",
      pattern: "I set local storage \"(.*)\" to \"(.*)\"",
      action: "setLocalStorage",
      description: "Set local storage item"
    },
    {
      id: "get-local-storage",
      pattern: "I get local storage \"(.*)\"",
      action: "getLocalStorage",
      description: "Get local storage item"
    },
    {
      id: "remove-local-storage",
      pattern: "I remove local storage \"(.*)\"",
      action: "removeLocalStorage",
      description: "Remove local storage item"
    },
    {
      id: "clear-local-storage",
      pattern: "I clear local storage",
      action: "clearLocalStorage",
      description: "Clear all local storage"
    },
    {
      id: "set-session-storage",
      pattern: "I set session storage \"(.*)\" to \"(.*)\"",
      action: "setSessionStorage",
      description: "Set session storage item"
    },
    {
      id: "get-session-storage",
      pattern: "I get session storage \"(.*)\"",
      action: "getSessionStorage",
      description: "Get session storage item"
    },    // Drag and drop steps
    {
      id: "drag-element-to",
      pattern: "I drag element \"(.*)\" to \"(.*)\"",
      action: "dragAndDrop",
      description: "Drag and drop element"
    },    // Touch gesture steps
    {
      id: "tap-element",
      pattern: "I tap on element \"(.*)\"",
      action: "tap",
      description: "Tap on element (touch gesture)"
    },
    {
      id: "swipe-coordinates", 
      pattern: "I swipe from coordinates ((\\d+),(\\d+)) to ((\\d+),(\\d+))",
      action: "swipe",
      description: "Swipe gesture between coordinates"
    },
    {
      id: "swipe-simple",
      pattern: "I swipe from coordinates \\((\\d+),(\\d+)\\) to \\((\\d+),(\\d+)\\)",
      action: "swipe",
      description: "Swipe gesture between coordinates (simple format)"
    },

    // Alert handling steps
    {
      id: "accept-alert",
      pattern: "I accept alert",
      action: "acceptAlert",
      description: "Accept browser alert"
    },
    {
      id: "dismiss-alert",
      pattern: "I dismiss alert",
      action: "dismissAlert",
      description: "Dismiss browser alert"
    },
    {
      id: "get-alert-text",
      pattern: "I get alert text",
      action: "getAlertText",
      description: "Get text from browser alert"
    },    // Network interception steps (Playwright only)
    {
      id: "intercept-requests",
      pattern: "I intercept requests to \"(.*)\" with response \"(.*)\"",
      action: "interceptRequest",
      description: "Intercept network requests"
    },
    {
      id: "block-urls",
      pattern: "I block URLs matching \"(.*)\"",
      action: "blockUrls",
      description: "Block URLs matching pattern"
    },    
    
    // Assertion steps
    {
      id: "should-see-text-alternative",
      pattern: "I should see text \"(.*)\"",
      action: "assertText",
      description: "Assert that text is visible on page"
    },
    {
      id: "should-see",
      pattern: "I should see \"(.*)\"",
      action: "assertText",
      description: "Assert that text is visible on page"
    },
    {
      id: "should-not-see",
      pattern: "I should not see \"(.*)\"",
      action: "assertNotVisible",
      description: "Assert that text is not visible on page"
    },
    {
      id: "element-should-contain-text",
      pattern: "element \"(.*)\" should contain text \"(.*)\"",
      action: "verifyText",
      description: "Verify element contains specific text"
    },
    {
      id: "element-should-be-visible",
      pattern: "element \"(.*)\" should be visible",
      action: "assertVisible",
      description: "Assert element is visible"
    },
    {
      id: "the-element-should-be-visible",
      pattern: "the \"(.*)\" should be visible",
      action: "assertVisible",
      description: "Assert element is visible"
    },    {
      id: "the-element-should-be-enabled",
      pattern: "the \"(.*)\" should be enabled",
      action: "assertEnabled",
      description: "Assert element is enabled"
    },

    // Complex conditional steps
    {
      id: "conditional-action",
      pattern: "I \"(.*)\" if it exists",
      action: "conditionalAction",
      description: "Perform action only if element exists"
    },
    {
      id: "wait-element-visible-timeout",
      pattern: "I wait for element \"(.*)\" to be visible within (\\d+)ms",
      action: "waitForElementVisible",
      description: "Wait for element with custom timeout"
    },
    {
      id: "wait-text-timeout",
      pattern: "I wait for element \"(.*)\" to contain text \"(.*)\" within (\\d+)ms",
      action: "waitForText",
      description: "Wait for text with custom timeout"
    },
    {
      id: "wait-url-timeout",
      pattern: "I wait for URL to contain \"(.*)\" within (\\d+)ms",
      action: "waitForUrl",
      description: "Wait for URL with custom timeout"
    },

    // Multi-step operations
    {
      id: "basic-web-operations",
      pattern: "I perform basic web operations",
      action: "basicWebOperations",
      description: "Perform a series of basic web operations"
    },
    {
      id: "rapid-click-operations",
      pattern: "I perform (\\d+) rapid click operations",
      action: "rapidClicks",
      description: "Perform multiple rapid clicks"
    },
    {
      id: "rapid-navigation-operations",
      pattern: "I perform (\\d+) rapid navigation operations",
      action: "rapidNavigation",
      description: "Perform multiple rapid navigations"
    },    // Engine-specific steps
    {
      id: "test-playwright-engine",
      pattern: "I test with Playwright engine",
      action: "switchToPlaywright",
      description: "Switch to Playwright engine"
    },
    {
      id: "test-selenium-engine",
      pattern: "I test with Selenium engine",
      action: "switchToSelenium",
      description: "Switch to Selenium engine"
    },
    {
      id: "open-with-playwright",
      pattern: "I open \"(.*)\" with Playwright engine",
      action: "openWithPlaywright",
      description: "Open URL specifically with Playwright"
    },

    // Validation and verification steps
    {
      id: "page-title-contains",
      pattern: "the page title should contain \"(.*)\"",
      action: "titleContains",
      description: "Verify page title contains text"
    },
    {
      id: "url-contains",
      pattern: "the current URL should contain \"(.*)\"",
      action: "urlContains",
      description: "Verify URL contains text"
    },
    {
      id: "page-loaded",
      pattern: "the page should be loaded",
      action: "pageLoaded",
      description: "Verify page is fully loaded"
    },
    {
      id: "interactions-complete",
      pattern: "all interactions should complete successfully",
      action: "verifyInteractions",
      description: "Verify all interactions completed"
    },
    {
      id: "form-correct-values",
      pattern: "the form should have the correct values",
      action: "verifyFormValues",
      description: "Verify form field values"    },
    {
      id: "wait-operations-succeed",
      pattern: "all wait operations should succeed",
      action: "verifyWaitOperations",
      description: "Verify wait operations succeeded"
    },
    {
      id: "screenshots-saved",
      pattern: "screenshots should be saved successfully",
      action: "verifyScreenshots",
      description: "Verify screenshots were saved"
    },
    {
      id: "js-execution-correct",
      pattern: "JavaScript execution should return correct values",
      action: "verifyJSExecution",
      description: "Verify JavaScript execution results"
    },
    {
      id: "frame-operations-correct",
      pattern: "frame operations should work correctly",
      action: "verifyFrameOperations",
      description: "Verify frame operations"
    },
    {
      id: "shadow-dom-correct",
      pattern: "shadow DOM operations should work correctly",
      action: "verifyShadowDOM",
      description: "Verify shadow DOM operations"
    },
    {
      id: "window-operations-correct",
      pattern: "window operations should work correctly",
      action: "verifyWindowOperations",
      description: "Verify window operations"
    },
    {
      id: "cookie-operations-correct",
      pattern: "cookie operations should work correctly",
      action: "verifyCookieOperations",
      description: "Verify cookie operations"
    },
    {
      id: "storage-operations-correct",
      pattern: "storage operations should work correctly",
      action: "verifyStorageOperations",
      description: "Verify storage operations"
    },
    {
      id: "drag-drop-correct",
      pattern: "drag and drop should work correctly",
      action: "verifyDragDrop",
      description: "Verify drag and drop operations"    },
    {
      id: "touch-gestures-correct",
      pattern: "touch gestures should work correctly",
      action: "verifyTouchGestures",
      description: "Verify touch gesture operations"
    },
    {
      id: "alert-handling-correct",
      pattern: "alert handling should work correctly",
      action: "verifyAlertHandling",
      description: "Verify alert handling operations"
    },
    {
      id: "file-upload-correct",
      pattern: "file upload should work correctly",
      action: "verifyFileUpload",
      description: "Verify file upload operations"
    },
    {
      id: "keyboard-ops-correct",
      pattern: "keyboard operations should work correctly",
      action: "verifyKeyboardOps",
      description: "Verify keyboard operations"
    },
    {
      id: "network-ops-correct",
      pattern: "network operations should work correctly",
      action: "verifyNetworkOps",
      description: "Verify network operations"
    },
    {
      id: "all-ops-correct",
      pattern: "all operations should work correctly",
      action: "verifyAllOperations",
      description: "Verify all operations completed successfully"
    },
    {
      id: "performance-acceptable",
      pattern: "performance should be acceptable",
      action: "verifyPerformance",
      description: "Verify performance metrics"
    },
    {
      id: "no-errors-occur",
      pattern: "no errors should occur",
      action: "verifyNoErrors",
      description: "Verify no errors occurred"
    },

    // Error handling steps
    {
      id: "appropriate-error-msg",
      pattern: "I should get appropriate error message",
      action: "verifyErrorMessage",
      description: "Verify appropriate error message"
    },
    {
      id: "handle-error-gracefully",
      pattern: "I should handle the error gracefully",
      action: "verifyErrorHandling",
      description: "Verify graceful error handling"
    },
    {
      pattern: "timeout error should be handled properly",
      action: "verifyTimeoutHandling",
      description: "Verify timeout error handling"
    },

    // Background and setup steps
    {
      pattern: "I have a test website with all features available",
      action: "setupTestWebsite",
      description: "Setup test website with all features"
    },
    {
      pattern: "I open a page with iframes",
      action: "openPageWithIframes",
      description: "Open test page with iframes"
    },
    {
      pattern: "I interact with elements in the frame",
      action: "interactInFrame",
      description: "Interact with elements inside frame"
    },
    {
      pattern: "I open a page with shadow DOM elements",
      action: "openPageWithShadowDOM",
      description: "Open test page with shadow DOM"
    },
    {
      pattern: "I open a page with draggable elements",
      action: "openPageWithDragDrop",
      description: "Open test page with drag and drop"
    },
    {
      pattern: "I open a page with alert dialogs",
      action: "openPageWithAlerts",
      description: "Open test page with alert dialogs"
    },
    {
      pattern: "I trigger an alert",
      action: "triggerAlert",
      description: "Trigger browser alert dialog"
    },
    {
      pattern: "I trigger a confirm dialog",
      action: "triggerConfirm",
      description: "Trigger browser confirm dialog"
    },    // Complex selector steps
    {
      id: "checkbox-not-checked-initially",
      pattern: "checkbox \"(.*)\" should not be checked initially",
      action: "verifyNotChecked",
      description: "Verify checkbox is not checked"
    },
    {
      id: "element-not-hidden",
      pattern: "element \"(.*)\" should not be hidden",
      action: "verifyNotHidden",
      description: "Verify element is not hidden"
    },
    {
      id: "element-not-disabled",
      pattern: "element \"(.*)\" should not be disabled",
      action: "verifyNotDisabled",
      description: "Verify element is not disabled"
    },

    // Additional comprehensive test patterns
    {
      id: "open-comprehensive-test-page",
      pattern: "I open the comprehensive test page",
      action: "openComprehensiveTestPage",
      description: "Open the local comprehensive test page"
    },
    {
      id: "page-should-be-loaded",
      pattern: "the page should be loaded",
      action: "pageLoaded",
      description: "Verify page is fully loaded"
    },
    {
      id: "should-see-text",
      pattern: "I should see \"(.*)\"",
      action: "assertText",
      description: "Assert that text is visible on page"
    },
    {
      id: "all-interactions-complete",
      pattern: "all interactions should complete successfully",
      action: "verifyInteractions",
      description: "Verify all interactions completed"
    },
    {
      id: "form-should-have-correct-values",
      pattern: "the form should have the correct values",
      action: "verifyFormValues",
      description: "Verify form field values"
    },
    {
      id: "should-get-text-from",
      pattern: "I should get text from \"(.*)\"",
      action: "getText",
      description: "Get and verify text from element"
    },
    {
      id: "wait-for-element-visible-timeout",
      pattern: "I wait for element \"(.*)\" to be visible within (\\d+)ms",
      action: "waitForElementVisible",
      description: "Wait for element with custom timeout"
    },
    {
      id: "wait-for-text-timeout",
      pattern: "I wait for element \"(.*)\" to contain text \"(.*)\" within (\\d+)ms",
      action: "waitForText",
      description: "Wait for text with custom timeout"
    },
    {
      id: "wait-for-url-timeout",
      pattern: "I wait for URL to contain \"(.*)\" within (\\d+)ms",
      action: "waitForUrl",
      description: "Wait for URL with custom timeout"
    },
    {
      id: "rapid-clicks-on-element",
      pattern: "I perform (\\d+) rapid clicks on \"(.*)\"",
      action: "rapidClicksOnElement",
      description: "Perform multiple rapid clicks on specific element"
    },
    {
      id: "element-should-not-be-checked",
      pattern: "element \"(.*)\" should not be checked",
      action: "verifyNotChecked",
      description: "Verify element is not checked"
    },
    {
      id: "element-should-not-be-hidden",
      pattern: "element \"(.*)\" should not be hidden",
      action: "verifyNotHidden",
      description: "Verify element is not hidden"    },
    {
      id: "form-validate-correctly",
      pattern: "the form should validate correctly",
      action: "verifyFormValidation",
      description: "Verify form validation"
    },
    {
      id: "all-form-fields-correct",
      pattern: "all form fields should contain the correct values",
      action: "verifyAllFormFields",
      description: "Verify all form fields have correct values"
    },
    {
      id: "element-not-disabled",
      pattern: "element \"(.*)\" should not be disabled",
      action: "verifyNotDisabled",
      description: "Verify element is not disabled"
    },

    // File and resource steps
    {
      id: "conditional-file-upload",
      pattern: "I upload file \"(.*)\" to input \"(.*)\" if it exists",
      action: "conditionalFileUpload",
      description: "Upload file if input exists"
    },
    {
      id: "conditional-focus",
      pattern: "I focus on \"(.*)\" if it exists",
      action: "conditionalFocus",
      description: "Focus on element if it exists"
    },
    {
      id: "conditional-blur",
      pattern: "I blur from \"(.*)\" if it exists",
      action: "conditionalBlur",
      description: "Blur from element if it exists"
    },

    // Advanced interaction steps
    {
      id: "should-get-text",
      pattern: "I should get text from \"(.*)\"",
      action: "getText",
      description: "Get and verify text from element"
    },
    {
      id: "should-get-inner-text",
      pattern: "I should get inner text from \"(.*)\"",
      action: "getInnerText",
      description: "Get and verify inner text from element"
    },
    {
      id: "should-get-inner-html",
      pattern: "I should get inner HTML from \"(.*)\"",
      action: "getInnerHTML",
      description: "Get and verify inner HTML from element"
    },    {
      id: "should-get-attribute",
      pattern: "I should get attribute \"(.*)\" from \"(.*)\"",
      action: "getAttribute",
      description: "Get and verify attribute from element"
    },
    {
      id: "should-get-property", 
      pattern: "I should get property \"(.*)\" from \"(.*)\"",
      action: "getProperty",
      description: "Get and verify property from element"
    },
    {
      id: "should-get-value",
      pattern: "I should get value from \"(.*)\"",
      action: "getValue",
      description: "Get and verify value from element"
    },
    {
      id: "should-get-css-property",
      pattern: "I should get CSS property \"(.*)\" from \"(.*)\"",
      action: "getCSSProperty",
      description: "Get and verify CSS property from element"
    },// Error simulation steps
    {
      id: "interact-non-existent",
      pattern: "I try to interact with non-existent element \"(.*)\"",
      action: "interactWithNonExistent",
      description: "Try to interact with element that doesn't exist"
    },
    {
      id: "navigate-invalid-url",
      pattern: "I try to navigate to invalid URL \"(.*)\"",
      action: "navigateToInvalidURL",
      description: "Try to navigate to invalid URL"
    },
    {
      id: "wait-short-timeout",
      pattern: "I try to wait for element with very short timeout",
      action: "waitWithShortTimeout",
      description: "Wait for element with very short timeout"
    },

    // Performance test steps
    {
      id: "take-multiple-screenshots",
      pattern: "I take multiple screenshots",
      action: "takeMultipleScreenshots",
      description: "Take multiple screenshots for performance testing"
    }
  ];
}

module.exports = { getStepDefinitions };
