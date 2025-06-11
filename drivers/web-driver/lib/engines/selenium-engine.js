const fs = require('fs');
const path = require('path');

// Try to load selenium-webdriver dependencies with error handling
let seleniumWebDriver, By, until, Select, ActionChains;
try {
  seleniumWebDriver = require('selenium-webdriver');
  By = seleniumWebDriver.By;
  until = seleniumWebDriver.until;
  ActionChains = seleniumWebDriver.ActionChains;
  
  try {
    const selectModule = require('selenium-webdriver/lib/select');
    Select = selectModule.Select;
  } catch (selectError) {
    console.warn('Warning: selenium-webdriver Select class not available');
  }
} catch (seleniumError) {
  console.warn('Warning: selenium-webdriver not available, Selenium engine will not work');
}

// Selenium Engine wrapper
class SeleniumEngine {
  constructor(driver, config = {}) {
    this.driver = driver;
    this.config = config;
    this.type = 'selenium';
    
    if (!seleniumWebDriver) {
      throw new Error('Selenium WebDriver is not available. Please install selenium-webdriver package.');
    }
  }

  // Basic navigation
  async navigate(url) {
    await this.driver.get(url);
  }

  async goBack() {
    await this.driver.navigate().back();
  }

  async goForward() {
    await this.driver.navigate().forward();
  }

  async reload() {
    await this.driver.navigate().refresh();
  }

  // Element interaction
  async click(selector, options = {}) {
    const element = await this.findElement(selector);
    await element.click();
  }

  async doubleClick(selector) {
    const element = await this.findElement(selector);
    const actions = this.driver.actions();
    await actions.doubleClick(element).perform();
  }

  async rightClick(selector) {
    const element = await this.findElement(selector);
    const actions = this.driver.actions();
    await actions.contextClick(element).perform();
  }

  async hover(selector) {
    const element = await this.findElement(selector);
    const actions = this.driver.actions();
    await actions.move({ origin: element }).perform();
  }

  async focus(selector) {
    const element = await this.findElement(selector);
    await this.driver.executeScript('arguments[0].focus();', element);
  }

  async blur(selector) {
    const element = await this.findElement(selector);
    await this.driver.executeScript('arguments[0].blur();', element);
  }

  // Text input  
  async type(text, selector, options = {}) {
    const element = await this.findElement(selector);
    await element.clear();
    if (options.delay) {
      for (const char of text) {
        await element.sendKeys(char);
        await this.driver.sleep(options.delay);
      }
    } else {
      await element.sendKeys(text);
    }
  }

  async clear(selector) {
    const element = await this.findElement(selector);
    await element.clear();
  }
  async pressKey(key) {
    const Key = seleniumWebDriver.Key;
    const actions = this.driver.actions();
    await actions.sendKeys(Key[key.toUpperCase()] || key).perform();
  }

  async pressKeys(keys) {
    for (const key of keys) {
      await this.pressKey(key);
    }
  }

  // Element properties and attributes
  async getText(selector) {
    const element = await this.findElement(selector);
    return await element.getText();
  }

  async getInnerText(selector) {
    const element = await this.findElement(selector);
    return await this.driver.executeScript('return arguments[0].innerText;', element);
  }

  async getInnerHTML(selector) {
    const element = await this.findElement(selector);
    return await this.driver.executeScript('return arguments[0].innerHTML;', element);
  }
  async getAttribute(attribute, selector) {
    const element = await this.findElement(selector);
    return await element.getAttribute(attribute);
  }

  async getProperty(property, selector) {
    const element = await this.findElement(selector);
    return await this.driver.executeScript(`return arguments[0].${property};`, element);
  }

  async getValue(selector) {
    const element = await this.findElement(selector);
    return await element.getAttribute('value');
  }

  async getCSSProperty(property, selector) {
    const element = await this.findElement(selector);
    return await element.getCssValue(property);
  }

  // Element state checks
  async isVisible(selector) {
    try {
      const element = await this.findElement(selector);
      return await element.isDisplayed();
    } catch (err) {
      return false;
    }
  }

  async isHidden(selector) {
    return !(await this.isVisible(selector));
  }

  async isEnabled(selector) {
    try {
      const element = await this.findElement(selector);
      return await element.isEnabled();
    } catch (err) {
      return false;
    }
  }

  async isDisabled(selector) {
    return !(await this.isEnabled(selector));
  }

  async isChecked(selector) {
    try {
      const element = await this.findElement(selector);
      return await element.isSelected();
    } catch (err) {
      return false;
    }
  }

  async isEditable(selector) {
    try {
      const element = await this.findElement(selector);
      const tagName = await element.getTagName();
      const readOnly = await element.getAttribute('readonly');
      const disabled = await element.getAttribute('disabled');
      return (tagName === 'input' || tagName === 'textarea') && !readOnly && !disabled;    } catch (err) {
      return false;
    }
  }

  // Form interactions
  async selectOption(value, selector) {
    const element = await this.findElement(selector);
    if (!Select) {
      throw new Error('Selenium Select class is not available');
    }
    const select = new Select(element);
    
    if (typeof value === 'string') {
      try {
        await select.selectByVisibleText(value);
      } catch (err) {
        await select.selectByValue(value);
      }
    } else if (typeof value === 'number') {
      await select.selectByIndex(value);
    }
  }

  async check(selector) {
    const element = await this.findElement(selector);
    const isChecked = await element.isSelected();
    if (!isChecked) {
      await element.click();
    }
  }

  async uncheck(selector) {
    const element = await this.findElement(selector);
    const isChecked = await element.isSelected();
    if (isChecked) {
      await element.click();
    }
  }
  async uploadFile(filePath, selector) {
    const element = await this.findElement(selector);
    await element.sendKeys(path.resolve(filePath));
  }
  // Screenshots and media
  async screenshot(options = {}) {
    const screenshotDir = this.config.screenshotDir || 'screenshots';
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    
    const filename = options.filename || `screenshot_${Date.now()}.png`;
    const filepath = path.join(screenshotDir, filename);
    
    const screenshot = await this.driver.takeScreenshot();
    fs.writeFileSync(filepath, screenshot, 'base64');
    return filepath;
  }

  async screenshotElement(selector, options = {}) {
    const element = await this.findElement(selector);
    const filename = options.filename || `element_screenshot_${Date.now()}.png`;
    const screenshotDir = this.config.screenshotDir || 'screenshots';
    const filepath = path.join(screenshotDir, filename);
    
    const screenshot = await element.takeScreenshot();
    fs.writeFileSync(filepath, screenshot, 'base64');
    return filepath;
  }  // Wait operations
  async waitForElement(selector, timeout) {
    const defaultTimeout = this.config.timeout || 30000;
    const timeoutValue = timeout ? parseInt(timeout) : defaultTimeout;
    await this.driver.wait(until.elementLocated(this.parseSelector(selector)), timeoutValue);
  }

  async waitForElementVisible(selector, timeout) {
    const defaultTimeout = this.config.timeout || 30000;
    const timeoutValue = timeout ? parseInt(timeout) : defaultTimeout;
    const locator = this.parseSelector(selector);
    await this.driver.wait(until.elementIsVisible(this.driver.findElement(locator)), timeoutValue);
  }

  async waitForElementHidden(selector, timeout) {
    const defaultTimeout = this.config.timeout || 30000;
    const timeoutValue = timeout ? parseInt(timeout) : defaultTimeout;
    const locator = this.parseSelector(selector);
    await this.driver.wait(until.elementIsNotVisible(this.driver.findElement(locator)), timeoutValue);
  }

  async waitForText(selector, text, timeout) {
    const defaultTimeout = this.config.timeout || 30000;
    const timeoutValue = timeout ? parseInt(timeout) : defaultTimeout;
    await this.driver.wait(until.elementTextContains(this.driver.findElement(this.parseSelector(selector)), text), timeoutValue);
  }

  async waitForUrl(url, timeout) {
    const defaultTimeout = this.config.timeout || 30000;
    const timeoutValue = timeout ? parseInt(timeout) : defaultTimeout;
    await this.driver.wait(until.urlContains(url), timeoutValue);
  }

  async waitForLoadState(state = 'complete') {
    await this.driver.wait(until.ableToSwitchToWindow(''), timeout);
    await this.driver.executeAsyncScript(`
      var callback = arguments[arguments.length - 1];
      if (document.readyState === 'complete') {
        callback();
      } else {
        window.addEventListener('load', callback);
      }
    `);
  }

  // Page information
  async getTitle() {
    return await this.driver.getTitle();
  }

  async getUrl() {
    return await this.driver.getCurrentUrl();
  }

  async getPageSource() {
    return await this.driver.getPageSource();
  }

  // JavaScript execution
  async executeJS(script, ...args) {
    return await this.driver.executeScript(script, ...args);
  }

  async executeAsyncJS(script, ...args) {
    return await this.driver.executeAsyncScript(script, ...args);
  }

  // Frame handling
  async switchToFrame(selector) {
    if (typeof selector === 'string') {
      const frame = await this.findElement(selector);
      await this.driver.switchTo().frame(frame);
    } else if (typeof selector === 'number') {
      await this.driver.switchTo().frame(selector);
    } else {
      await this.driver.switchTo().frame(selector);
    }
    return this.driver;
  }

  async switchToMainFrame() {
    await this.driver.switchTo().defaultContent();
    return this.driver;
  }

  async getFrameCount() {
    return await this.driver.executeScript('return window.frames.length;');
  }

  async getFrameNames() {
    return await this.driver.executeScript(`
      var names = [];
      for (var i = 0; i < window.frames.length; i++) {
        try {
          names.push(window.frames[i].name || 'frame_' + i);
        } catch (e) {
          names.push('frame_' + i);
        }
      }
      return names;
    `);
  }

  // Shadow DOM support
  async queryInShadowDOM(hostSelector, shadowSelector) {
    return await this.driver.executeScript(`
      var hostElement = document.querySelector(arguments[0]);
      if (!hostElement || !hostElement.shadowRoot) return null;
      return hostElement.shadowRoot.querySelector(arguments[1]);
    `, hostSelector, shadowSelector);
  }

  async clickInShadowDOM(hostSelector, shadowSelector) {
    await this.driver.executeScript(`
      var hostElement = document.querySelector(arguments[0]);
      if (hostElement && hostElement.shadowRoot) {
        var shadowElement = hostElement.shadowRoot.querySelector(arguments[1]);
        if (shadowElement) shadowElement.click();
      }
    `, hostSelector, shadowSelector);
  }

  async typeInShadowDOM(hostSelector, shadowSelector, text) {
    await this.driver.executeScript(`
      var hostElement = document.querySelector(arguments[0]);
      if (hostElement && hostElement.shadowRoot) {
        var shadowElement = hostElement.shadowRoot.querySelector(arguments[1]);
        if (shadowElement) {
          shadowElement.value = arguments[2];
          shadowElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    `, hostSelector, shadowSelector, text);
  }

  // Window management
  async setViewportSize(width, height) {
    await this.driver.manage().window().setRect({ width, height });
  }

  async getViewportSize() {
    const rect = await this.driver.manage().window().getRect();
    return { width: rect.width, height: rect.height };
  }

  async maximizeWindow() {
    await this.driver.manage().window().maximize();
  }

  // Cookie management
  async addCookie(cookie) {
    await this.driver.manage().addCookie(cookie);
  }

  async getCookies() {
    return await this.driver.manage().getCookies();
  }

  async deleteCookie(name) {
    await this.driver.manage().deleteCookie(name);
  }

  async deleteAllCookies() {
    await this.driver.manage().deleteAllCookies();
  }

  // Local/Session storage
  async setLocalStorage(key, value) {
    await this.driver.executeScript('localStorage.setItem(arguments[0], arguments[1]);', key, value);
  }

  async getLocalStorage(key) {
    return await this.driver.executeScript('return localStorage.getItem(arguments[0]);', key);
  }

  async removeLocalStorage(key) {
    await this.driver.executeScript('localStorage.removeItem(arguments[0]);', key);
  }

  async clearLocalStorage() {
    await this.driver.executeScript('localStorage.clear();');
  }

  async setSessionStorage(key, value) {
    await this.driver.executeScript('sessionStorage.setItem(arguments[0], arguments[1]);', key, value);
  }

  async getSessionStorage(key) {
    return await this.driver.executeScript('return sessionStorage.getItem(arguments[0]);', key);
  }

  async removeSessionStorage(key) {
    await this.driver.executeScript('sessionStorage.removeItem(arguments[0]);', key);
  }

  async clearSessionStorage() {
    await this.driver.executeScript('sessionStorage.clear();');
  }

  // Drag and drop
  async dragAndDrop(sourceSelector, targetSelector) {
    const source = await this.findElement(sourceSelector);
    const target = await this.findElement(targetSelector);
    const actions = this.driver.actions();
    await actions.dragAndDrop(source, target).perform();
  }

  // Mobile/touch gestures (limited support in Selenium)
  async tap(selector) {
    const element = await this.findElement(selector);
    await element.click();
  }

  async swipe(startX, startY, endX, endY) {
    const actions = this.driver.actions();
    await actions
      .move({ x: startX, y: startY })
      .press()
      .move({ x: endX, y: endY })
      .release()
      .perform();
  }

  // Alert handling
  async acceptAlert() {
    const alert = await this.driver.switchTo().alert();
    await alert.accept();
  }

  async dismissAlert() {
    const alert = await this.driver.switchTo().alert();
    await alert.dismiss();
  }

  async getAlertText() {
    const alert = await this.driver.switchTo().alert();
    const text = await alert.getText();
    await alert.dismiss();
    return text;
  }

  // Network interception (limited in Selenium WebDriver)
  async interceptRequest(urlPattern, response) {
    // Note: Selenium has limited network interception capabilities
    // This would require browser-specific extensions or CDP for Chrome
    console.warn('Network interception is limited in Selenium WebDriver');
  }

  async blockUrls(urlPatterns) {
    // Note: Selenium has limited URL blocking capabilities
    console.warn('URL blocking is limited in Selenium WebDriver');
  }

  // Helper methods
  async findElement(selector) {
    return await this.driver.findElement(this.parseSelector(selector));
  }

  async findElements(selector) {
    return await this.driver.findElements(this.parseSelector(selector));
  }

  parseSelector(selector) {    // Enhanced selector parsing
    if (selector.startsWith('#')) {
      return By.id(selector.substring(1));
    } else if (selector.startsWith('.')) {
      return By.className(selector.substring(1));
    } else if (selector.startsWith('//')) {
      return By.xpath(selector);
    } else if (selector.includes('[') && selector.includes(']')) {
      return By.css(selector);
    } else if (selector.includes('=')) {
      // Link text or partial link text
      if (selector.startsWith('link=')) {
        return By.linkText(selector.substring(5));
      } else if (selector.startsWith('partialLink=')) {
        return By.partialLinkText(selector.substring(12));
      }
    } else if (selector.includes(':')) {
      return By.css(selector);
    } else {
      // Try as tag name first, then CSS
      try {
        return By.tagName(selector);
      } catch (err) {
        return By.css(selector);
      }
    }
  }
  // Cleanup
  async close() {
    if (this.driver) {
      await this.driver.quit();
    }
  }
}

module.exports = SeleniumEngine;
