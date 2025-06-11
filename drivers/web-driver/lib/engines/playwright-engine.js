const fs = require('fs');
const path = require('path');

// Playwright Engine wrapper
class PlaywrightEngine {  constructor(browser, context, page, config = {}) {
    this.browser = browser;
    this.context = context;
    this.page = page;
    this.config = config;
    this.engineType = 'playwright';  // Renamed to avoid conflict with type() method    this.currentFrame = null; // Track current frame context
  }

  // Helper to get current page context (frame or main page)
  getPageContext() {
    return this.currentFrame || this.page;
  }

  // Basic navigation
  async navigate(url) {
    await this.page.goto(url);
  }

  async goBack() {
    await this.page.goBack();
  }

  async goForward() {
    await this.page.goForward();
  }

  async reload() {
    await this.page.reload();
  }
  // Element interaction
  async click(selector, options = {}) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      await context.locator(selector).click(options);
    } else {
      await this.page.click(selector, options);
    }
  }

  async doubleClick(selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      await context.locator(selector).dblclick();
    } else {
      await this.page.dblclick(selector);
    }
  }

  async rightClick(selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      await context.locator(selector).click({ button: 'right' });
    } else {
      await this.page.click(selector, { button: 'right' });
    }
  }

  async hover(selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      await context.locator(selector).hover();
    } else {
      await this.page.hover(selector);
    }
  }

  async focus(selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      await context.locator(selector).focus();
    } else {
      await this.page.focus(selector);
    }
  }
    async blur(selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      await context.locator(selector).blur();
    } else {
      await this.page.locator(selector).blur();
    }
  }
  
  // Text input
  async type(text, selector, options = {}) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      await context.locator(selector).fill(text);
      if (options.delay) {
        await context.locator(selector).pressSequentially(text, { delay: options.delay });
      }
    } else {
      await this.page.fill(selector, text);
      if (options.delay) {
        await this.page.type(selector, text, { delay: options.delay });
      }
    }
  }

  async clear(selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      await context.locator(selector).fill('');
    } else {
      await this.page.fill(selector, '');
    }
  }

  async pressKey(key) {
    await this.page.keyboard.press(key);
  }

  async pressKeys(keys) {
    for (const key of keys) {
      await this.page.keyboard.press(key);
    }
  }
  // Element properties and attributes
  async getText(selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      return await context.locator(selector).textContent();
    } else {
      return await this.page.textContent(selector);
    }
  }

  async getInnerText(selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      return await context.locator(selector).innerText();
    } else {
      return await this.page.innerText(selector);
    }
  }

  async getInnerHTML(selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      return await context.locator(selector).innerHTML();
    } else {
      return await this.page.innerHTML(selector);
    }
  }
  
  async getAttribute(attribute, selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      return await context.locator(selector).getAttribute(attribute);
    } else {
      return await this.page.getAttribute(selector, attribute);
    }
  }

  async getProperty(property, selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      return await context.evaluate((sel, prop) => {
        return document.querySelector(sel)[prop];
      }, selector, property);
    } else {
      return await this.page.evaluate((sel, prop) => {
        return document.querySelector(sel)[prop];
      }, selector, property);
    }
  }
  async getValue(selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      return await context.locator(selector).inputValue();
    } else {
      return await this.page.inputValue(selector);
    }
  }

  async getCSSProperty(property, selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      return await context.evaluate((sel, prop) => {
        return window.getComputedStyle(document.querySelector(sel))[prop];
      }, selector, property);
    } else {
      return await this.page.evaluate((sel, prop) => {
        return window.getComputedStyle(document.querySelector(sel))[prop];
      }, selector, property);
    }
  }

  // Element state checks
  async isVisible(selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      return await context.locator(selector).isVisible();
    } else {
      return await this.page.isVisible(selector);
    }
  }

  async isHidden(selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      return await context.locator(selector).isHidden();
    } else {
      return await this.page.isHidden(selector);
    }
  }

  async isEnabled(selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      return await context.locator(selector).isEnabled();
    } else {
      return await this.page.isEnabled(selector);
    }
  }

  async isDisabled(selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      return await context.locator(selector).isDisabled();
    } else {
      return await this.page.isDisabled(selector);
    }
  }

  async isChecked(selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      return await context.locator(selector).isChecked();
    } else {
      return await this.page.isChecked(selector);
    }
  }

  async isEditable(selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      return await context.locator(selector).isEditable();
    } else {
      return await this.page.isEditable(selector);
    }
  }  // Form interactions
  async selectOption(value, selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      await context.locator(selector).selectOption(value);
    } else {
      await this.page.selectOption(selector, value);
    }
  }

  async check(selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      await context.locator(selector).check();
    } else {
      await this.page.check(selector);
    }
  }

  async uncheck(selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      await context.locator(selector).uncheck();
    } else {
      await this.page.uncheck(selector);
    }
  }
  
  async uploadFile(filePath, selector) {
    const context = this.getPageContext();
    if (this.currentFrame) {
      await context.locator(selector).setInputFiles(filePath);
    } else {
      await this.page.setInputFiles(selector, filePath);
    }
  }
  // Screenshots and media
  async screenshot(options = {}) {
    const screenshotDir = this.config.screenshotDir || 'screenshots';
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    
    const filename = options.filename || `screenshot_${Date.now()}.png`;
    const filepath = path.join(screenshotDir, filename);
    
    await this.page.screenshot({ 
      path: filepath, 
      fullPage: options.fullPage || false,
      clip: options.clip
    });
    return filepath;
  }
  async screenshotElement(selector, options = {}) {
    const element = await this.page.locator(selector);
    const filename = options.filename || `element_screenshot_${Date.now()}.png`;
    const screenshotDir = this.config.screenshotDir || 'screenshots';
    const filepath = path.join(screenshotDir, filename);
    
    await element.screenshot({ path: filepath });
    return filepath;
  }
  // Wait operations
  async waitForElement(selector, timeout) {
    const defaultTimeout = this.config.timeout || 30000;
    const timeoutValue = timeout ? parseInt(timeout) : defaultTimeout;
    const context = this.getPageContext();
    if (this.currentFrame) {
      await context.locator(selector).waitFor({ timeout: timeoutValue });
    } else {
      await this.page.waitForSelector(selector, { timeout: timeoutValue });
    }
  }

  async waitForElementVisible(selector, timeout) {
    const defaultTimeout = this.config.timeout || 30000;
    const timeoutValue = timeout ? parseInt(timeout) : defaultTimeout;
    const context = this.getPageContext();
    if (this.currentFrame) {
      await context.locator(selector).waitFor({ state: 'visible', timeout: timeoutValue });
    } else {
      await this.page.waitForSelector(selector, { state: 'visible', timeout: timeoutValue });
    }
  }

  async waitForElementHidden(selector, timeout) {
    const defaultTimeout = this.config.timeout || 30000;
    const timeoutValue = timeout ? parseInt(timeout) : defaultTimeout;
    const context = this.getPageContext();
    if (this.currentFrame) {
      await context.locator(selector).waitFor({ state: 'hidden', timeout: timeoutValue });
    } else {
      await this.page.waitForSelector(selector, { state: 'hidden', timeout: timeoutValue });
    }
  }
  async waitForText(selector, text, timeout) {
    const defaultTimeout = this.config.timeout || 30000;
    const timeoutValue = timeout ? parseInt(timeout) : defaultTimeout;
    const context = this.getPageContext();
    if (this.currentFrame) {
      await context.waitForFunction((sel, txt) => {
        const element = document.querySelector(sel);
        return element && element.textContent.includes(txt);
      }, [selector, text], { timeout: timeoutValue });
    } else {
      await this.page.waitForFunction((sel, txt) => {
        const element = document.querySelector(sel);
        return element && element.textContent.includes(txt);
      }, [selector, text], { timeout: timeoutValue });
    }
  }

  async waitForUrl(url, timeout) {
    const defaultTimeout = this.config.timeout || 30000;
    const timeoutValue = timeout ? parseInt(timeout) : defaultTimeout;
    await this.page.waitForURL(url, { timeout: timeoutValue });
  }

  async waitForLoadState(state = 'load') {
    await this.page.waitForLoadState(state);
  }

  // Page information
  async getTitle() {
    return await this.page.title();
  }

  async getUrl() {
    return this.page.url();
  }

  async getPageSource() {
    return await this.page.content();
  }
  // JavaScript execution
  async executeJS(script, ...args) {
    return await this.page.evaluate(script, ...args);
  }

  async executeAsyncJS(script, ...args) {
    return await this.page.evaluate(script, ...args);
  }
  // Frame handling
  async switchToFrame(selector) {
    // Handle both name and CSS selector for iframe
    let frame;
    
    if (selector.startsWith('#') || selector.startsWith('.') || selector.includes('[')) {
      // CSS selector - find the iframe element and get the frame
      const frameElement = await this.page.locator(selector);
      const frameName = await frameElement.getAttribute('name');
      const frameSrc = await frameElement.getAttribute('src');
      
      // Try to find frame by name first, then by URL/src
      if (frameName) {
        frame = this.page.frame({ name: frameName });
      }
      
      if (!frame && frameSrc) {
        frame = this.page.frames().find(f => f.url().includes(frameSrc));
      }
      
      // If still not found, wait for the frame to load
      if (!frame) {
        await this.page.waitForSelector(selector);
        frame = this.page.frameLocator(selector);
      }
    } else {
      // Assume it's a frame name
      frame = this.page.frame({ name: selector });
    }
    
    if (!frame) {
      throw new Error(`Frame not found: ${selector}`);
    }
    
    // Store the current frame context for subsequent operations
    this.currentFrame = frame;
    return frame;
  }

  async switchToMainFrame() {
    this.currentFrame = null;
    return this.page.mainFrame();
  }

  async getFrameCount() {
    return this.page.frames().length;
  }

  async getFrameNames() {
    return this.page.frames().map(frame => frame.name());
  }

  // Shadow DOM support
  async queryInShadowDOM(hostSelector, shadowSelector) {
    return await this.page.evaluate(({ host, shadow }) => {
      const hostElement = document.querySelector(host);
      if (!hostElement || !hostElement.shadowRoot) return null;
      return hostElement.shadowRoot.querySelector(shadow);
    }, { host: hostSelector, shadow: shadowSelector });
  }

  async clickInShadowDOM(hostSelector, shadowSelector) {
    await this.page.evaluate(({ host, shadow }) => {
      const hostElement = document.querySelector(host);
      if (hostElement && hostElement.shadowRoot) {
        const shadowElement = hostElement.shadowRoot.querySelector(shadow);
        if (shadowElement) shadowElement.click();
      }
    }, { host: hostSelector, shadow: shadowSelector });
  }

  async typeInShadowDOM(hostSelector, shadowSelector, text) {
    await this.page.evaluate(({ host, shadow, txt }) => {
      const hostElement = document.querySelector(host);
      if (hostElement && hostElement.shadowRoot) {
        const shadowElement = hostElement.shadowRoot.querySelector(shadow);
        if (shadowElement) {
          shadowElement.value = txt;
          shadowElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }, { host: hostSelector, shadow: shadowSelector, txt: text });
  }

  // Window management
  async setViewportSize(width, height) {
    await this.page.setViewportSize({ width, height });
  }

  async getViewportSize() {
    return await this.page.viewportSize();
  }

  async maximizeWindow() {
    // Playwright doesn't have direct maximize, simulate with large viewport
    await this.setViewportSize(1920, 1080);
  }

  // Cookie management
  async addCookie(cookie) {
    // Ensure cookie has proper domain/path for file:// URLs
    var currentUrl = this.page.url();
    if (!cookie.domain && !cookie.url) {
      if (currentUrl.startsWith('file://')) {
        cookie.url = currentUrl;
      } else {
        const url = new URL(currentUrl);
        cookie.domain = url.hostname;
        cookie.path = cookie.path || '/';
      }
    }
    await this.context.addCookies([cookie]);
  }

  async getCookies() {
    return await this.context.cookies();
  }

  async deleteCookie(name) {
    const cookies = await this.getCookies();
    const filteredCookies = cookies.filter(cookie => cookie.name !== name);
    await this.context.clearCookies();
    if (filteredCookies.length > 0) {
      await this.context.addCookies(filteredCookies);
    }
  }

  async deleteAllCookies() {
    await this.context.clearCookies();
  }

  // Network interception
  async interceptRequest(urlPattern, response) {
    await this.page.route(urlPattern, route => {
      route.fulfill(response);
    });
  }

  async blockUrls(urlPatterns) {
    for (const pattern of urlPatterns) {
      await this.page.route(pattern, route => route.abort());
    }
  }

  // Storage operations
  async setLocalStorage(key, value) {
    await this.page.evaluate(({ key, value }) => {
      localStorage.setItem(key, value);
    }, { key, value });
  }

  async getLocalStorage(key) {
    return await this.page.evaluate((key) => {
      return localStorage.getItem(key);
    }, key);
  }

  async removeLocalStorage(key) {
    await this.page.evaluate((key) => {
      localStorage.removeItem(key);
    }, key);
  }

  async clearLocalStorage() {
    await this.page.evaluate(() => {
      localStorage.clear();
    });
  }

  async setSessionStorage(key, value) {
    await this.page.evaluate(({ key, value }) => {
      sessionStorage.setItem(key, value);
    }, { key, value });
  }

  async getSessionStorage(key) {
    return await this.page.evaluate((key) => {
      return sessionStorage.getItem(key);
    }, key);
  }

  async removeSessionStorage(key) {
    await this.page.evaluate((key) => {
      sessionStorage.removeItem(key);
    }, key);
  }

  async clearSessionStorage() {
    await this.page.evaluate(() => {
      sessionStorage.clear();
    });
  }

  // Drag and drop
  async dragAndDrop(sourceSelector, targetSelector) {
    await this.page.dragAndDrop(sourceSelector, targetSelector);
  }

  // Mobile/touch gestures
  async tap(selector) {
    await this.page.tap(selector);
  }
  async swipe(startX, startY, endX, endY) {
    await this.page.touchscreen.tap(startX, startY);
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(endX, endY);
    await this.page.mouse.up();
  }  // Alert handling
  async acceptAlert() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('No alert dialog found to accept'));
      }, 5000);
      
      this.page.once('dialog', async (dialog) => {
        try {
          clearTimeout(timeout);
          await dialog.accept();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  async dismissAlert() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('No alert dialog found to dismiss'));
      }, 5000);
      
      this.page.once('dialog', async (dialog) => {
        try {
          clearTimeout(timeout);
          await dialog.dismiss();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  async getAlertText() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('No alert dialog found to get text from'));
      }, 5000);
      
      this.page.once('dialog', async (dialog) => {
        try {
          clearTimeout(timeout);
          const message = dialog.message();
          await dialog.dismiss();
          resolve(message);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  // Cleanup
  async close() {
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
  }
}

module.exports = PlaywrightEngine;
