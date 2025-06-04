import { Builder, WebDriver, By, until, WebElement, Key } from 'selenium-webdriver';
import { Options as ChromeOptions } from 'selenium-webdriver/chrome';
import { Options as FirefoxOptions } from 'selenium-webdriver/firefox';
import { Options as EdgeOptions } from 'selenium-webdriver/edge';
import * as fs from 'fs';
import * as path from 'path';

// Add local logger implementation for driver
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

  info(message: string, context: any = {}) {
    const caller = this.getCallerInfo();
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} [INFO] [webDriver.ts::WebDriver::${caller.method}] ${message}`, JSON.stringify(context));
  }
  
  error(message: string, context: any = {}) {
    const caller = this.getCallerInfo();
    const timestamp = new Date().toISOString();
    console.error(`${timestamp} [ERROR] [webDriver.ts::WebDriver::${caller.method}] ${message}`, JSON.stringify(context));
  }
}

export interface WebDriverConfig {
  browser?: 'chrome' | 'firefox' | 'edge' | 'safari';
  headless?: boolean;
  timeout?: number;
  windowSize?: { width: number; height: number };
  userAgent?: string;
  proxy?: string;
  downloads?: string;
  extensions?: string[];
  capabilities?: any;
  seleniumHub?: string;
}

export interface ElementSelector {
  type: 'id' | 'name' | 'class' | 'css' | 'xpath' | 'tag' | 'text' | 'partial-text';
  value: string;
}

export class WebDriverAutomation {
  private driver: WebDriver | null = null;
  private config: WebDriverConfig;
  private screenshotCounter = 0;
  private logger = new DriverLogger();

  constructor(config: WebDriverConfig = {}) {
    this.config = {
      browser: 'chrome',
      headless: false,
      timeout: 30000,
      windowSize: { width: 1920, height: 1080 },
      ...config
    };
  }

  async initialize(): Promise<void> {
    const builder = new Builder();

    // Configure browser options
    switch (this.config.browser) {
      case 'chrome':
        const chromeOptions = new ChromeOptions();
        if (this.config.headless) {
          chromeOptions.addArguments('--headless=new');
        }
        chromeOptions.addArguments(
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--allow-running-insecure-content',
          '--disable-features=VizDisplayCompositor',
          `--window-size=${this.config.windowSize!.width},${this.config.windowSize!.height}`
        );
        
        if (this.config.userAgent) {
          chromeOptions.addArguments(`--user-agent=${this.config.userAgent}`);
        }
        
        if (this.config.proxy) {
          chromeOptions.addArguments(`--proxy-server=${this.config.proxy}`);
        }
        
        if (this.config.downloads) {
          chromeOptions.setUserPreferences({
            'download.default_directory': this.config.downloads,
            'download.prompt_for_download': false,
            'download.directory_upgrade': true,
            'safebrowsing.enabled': true
          });
        }

        builder.forBrowser('chrome').setChromeOptions(chromeOptions);
        break;

      case 'firefox':
        const firefoxOptions = new FirefoxOptions();
        if (this.config.headless) {
          firefoxOptions.addArguments('--headless');
        }
        firefoxOptions.addArguments(`--width=${this.config.windowSize!.width}`);
        firefoxOptions.addArguments(`--height=${this.config.windowSize!.height}`);
        
        if (this.config.proxy) {
          firefoxOptions.setPreference('network.proxy.type', 1);
          const [host, port] = this.config.proxy.split(':');
          firefoxOptions.setPreference('network.proxy.http', host);
          firefoxOptions.setPreference('network.proxy.http_port', parseInt(port));
        }

        builder.forBrowser('firefox').setFirefoxOptions(firefoxOptions);
        break;

      case 'edge':
        const edgeOptions = new EdgeOptions();
        if (this.config.headless) {
          edgeOptions.addArguments('--headless=new');
        }
        edgeOptions.addArguments(
          '--no-sandbox',
          '--disable-dev-shm-usage',
          `--window-size=${this.config.windowSize!.width},${this.config.windowSize!.height}`
        );

        builder.forBrowser('MicrosoftEdge').setEdgeOptions(edgeOptions);
        break;
    }

    // Set Selenium Hub if configured
    if (this.config.seleniumHub) {
      builder.usingServer(this.config.seleniumHub);
    }

    // Add custom capabilities
    if (this.config.capabilities) {
      Object.keys(this.config.capabilities).forEach(key => {
        builder.withCapabilities({ [key]: this.config.capabilities![key] });
      });
    }

    this.driver = await builder.build();
    
    // Set timeouts
    await this.driver.manage().setTimeouts({
      implicit: this.config.timeout,
      pageLoad: this.config.timeout! * 2,
      script: this.config.timeout
    });

    this.logger.info(`WebDriver initialized with ${this.config.browser} browser`);
  }

  async navigateTo(url: string): Promise<void> {
    if (!this.driver) throw new Error('Driver not initialized');
    
    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    this.logger.info(`Navigating to: ${url}`);
    await this.driver.get(url);
    
    // Wait for page to load
    await this.driver.wait(until.elementLocated(By.tagName('body')), this.config.timeout!);
  }

  async findElement(selector: string | ElementSelector): Promise<WebElement> {
    if (!this.driver) throw new Error('Driver not initialized');
    
    const parsedSelector = this.parseSelector(selector);
    let locator: By;

    switch (parsedSelector.type) {
      case 'id':
        locator = By.id(parsedSelector.value);
        break;
      case 'name':
        locator = By.name(parsedSelector.value);
        break;
      case 'class':
        locator = By.className(parsedSelector.value);
        break;
      case 'css':
        locator = By.css(parsedSelector.value);
        break;
      case 'xpath':
        locator = By.xpath(parsedSelector.value);
        break;
      case 'tag':
        locator = By.tagName(parsedSelector.value);
        break;
      case 'text':
        locator = By.xpath(`//*[text()='${parsedSelector.value}']`);
        break;
      case 'partial-text':
        locator = By.xpath(`//*[contains(text(),'${parsedSelector.value}')]`);
        break;
      default:
        throw new Error(`Unsupported selector type: ${parsedSelector.type}`);
    }

    return await this.driver.wait(until.elementLocated(locator), this.config.timeout!);
  }

  async click(selector: string | ElementSelector): Promise<void> {
    this.logger.info(`Clicking element: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    await this.driver!.wait(until.elementIsEnabled(element), this.config.timeout!);
    await element.click();
  }

  async doubleClick(selector: string | ElementSelector): Promise<void> {
    this.logger.info(`Double-clicking element: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    const actions = this.driver!.actions();
    await actions.doubleClick(element).perform();
  }

  async rightClick(selector: string | ElementSelector): Promise<void> {
    this.logger.info(`Right-clicking element: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    const actions = this.driver!.actions();
    await actions.contextClick(element).perform();
  }

  async type(selector: string | ElementSelector, text: string, options: { clear?: boolean; append?: boolean } = {}): Promise<void> {
    this.logger.info(`Typing "${text}" into element: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    
    if (options.clear !== false && !options.append) {
      await element.clear();
    }
    
    await element.sendKeys(text);
  }

  async typeSpecialKey(selector: string | ElementSelector, key: string): Promise<void> {
    this.logger.info(`Sending special key "${key}" to element: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    
    const keyMap: { [key: string]: string } = {
      'enter': Key.ENTER,
      'tab': Key.TAB,
      'escape': Key.ESCAPE,
      'space': Key.SPACE,
      'backspace': Key.BACK_SPACE,
      'delete': Key.DELETE,
      'arrowup': Key.ARROW_UP,
      'arrowdown': Key.ARROW_DOWN,
      'arrowleft': Key.ARROW_LEFT,
      'arrowright': Key.ARROW_RIGHT,
      'home': Key.HOME,
      'end': Key.END,
      'pageup': Key.PAGE_UP,
      'pagedown': Key.PAGE_DOWN,
      'f1': Key.F1,
      'f2': Key.F2,
      'f3': Key.F3,
      'f4': Key.F4,
      'f5': Key.F5,
      'f6': Key.F6,
      'f7': Key.F7,
      'f8': Key.F8,
      'f9': Key.F9,
      'f10': Key.F10,
      'f11': Key.F11,
      'f12': Key.F12
    };

    const seleniumKey = keyMap[key.toLowerCase()];
    if (!seleniumKey) {
      throw new Error(`Unsupported special key: ${key}`);
    }

    await element.sendKeys(seleniumKey);
  }

  async hover(selector: string | ElementSelector): Promise<void> {
    this.logger.info(`Hovering over element: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    const actions = this.driver!.actions();
    await actions.move({ origin: element }).perform();
  }

  async dragAndDrop(sourceSelector: string | ElementSelector, targetSelector: string | ElementSelector): Promise<void> {
    this.logger.info(`Dragging from ${JSON.stringify(sourceSelector)} to ${JSON.stringify(targetSelector)}`);
    const source = await this.findElement(sourceSelector);
    const target = await this.findElement(targetSelector);
    const actions = this.driver!.actions();
    await actions.dragAndDrop(source, target).perform();
  }

  async selectOption(selector: string | ElementSelector, option: string, by: 'value' | 'text' | 'index' = 'text'): Promise<void> {
    this.logger.info(`Selecting option "${option}" by ${by} in element: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    
    switch (by) {
      case 'value':
        await element.findElement(By.css(`option[value="${option}"]`)).click();
        break;
      case 'text':
        await element.findElement(By.xpath(`./option[text()="${option}"]`)).click();
        break;
      case 'index':
        const options = await element.findElements(By.tagName('option'));
        const index = parseInt(option);
        if (index >= 0 && index < options.length) {
          await options[index].click();
        } else {
          throw new Error(`Option index ${index} out of range`);
        }
        break;
    }
  }

  async checkCheckbox(selector: string | ElementSelector, checked: boolean = true): Promise<void> {
    this.logger.info(`Setting checkbox ${checked ? 'checked' : 'unchecked'}: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    const isChecked = await element.isSelected();
    
    if (isChecked !== checked) {
      await element.click();
    }
  }

  async selectRadioButton(selector: string | ElementSelector): Promise<void> {
    this.logger.info(`Selecting radio button: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    if (!await element.isSelected()) {
      await element.click();
    }
  }

  async uploadFile(selector: string | ElementSelector, filePath: string): Promise<void> {
    this.logger.info(`Uploading file "${filePath}" to element: ${JSON.stringify(selector)}`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    const element = await this.findElement(selector);
    await element.sendKeys(path.resolve(filePath));
  }

  async scrollTo(selector?: string | ElementSelector, position?: { x: number; y: number }): Promise<void> {
    if (selector) {
      this.logger.info(`Scrolling to element: ${JSON.stringify(selector)}`);
      const element = await this.findElement(selector);
      await this.driver!.executeScript('arguments[0].scrollIntoView(true);', element);
    } else if (position) {
      this.logger.info(`Scrolling to position: ${JSON.stringify(position)}`);
      await this.driver!.executeScript(`window.scrollTo(${position.x}, ${position.y});`);
    } else {
      throw new Error('Either selector or position must be provided for scrollTo');
    }
  }

  async getText(selector: string | ElementSelector): Promise<string> {
    this.logger.info(`Getting text from element: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    return await element.getText();
  }

  async getAttribute(selector: string | ElementSelector, attribute: string): Promise<string | null> {
    this.logger.info(`Getting attribute "${attribute}" from element: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    return await element.getAttribute(attribute);
  }

  async getValue(selector: string | ElementSelector): Promise<string> {
    this.logger.info(`Getting value from element: ${JSON.stringify(selector)}`);
    return await this.getAttribute(selector, 'value') || '';
  }

  async isVisible(selector: string | ElementSelector): Promise<boolean> {
    try {
      const element = await this.findElement(selector);
      return await element.isDisplayed();
    } catch {
      return false;
    }
  }

  async isEnabled(selector: string | ElementSelector): Promise<boolean> {
    try {
      const element = await this.findElement(selector);
      return await element.isEnabled();
    } catch {
      return false;
    }
  }

  async waitForElement(selector: string | ElementSelector, timeout?: number): Promise<WebElement> {
    this.logger.info(`Waiting for element: ${JSON.stringify(selector)}`);
    const waitTime = timeout || this.config.timeout!;
    const parsedSelector = this.parseSelector(selector);
    
    let locator: By;
    switch (parsedSelector.type) {
      case 'id':
        locator = By.id(parsedSelector.value);
        break;
      case 'css':
        locator = By.css(parsedSelector.value);
        break;
      default:
        locator = By.css(parsedSelector.value);
    }

    return await this.driver!.wait(until.elementLocated(locator), waitTime);
  }

  async waitForText(selector: string | ElementSelector, text: string, timeout?: number): Promise<boolean> {
    this.logger.info(`Waiting for text "${text}" in element: ${JSON.stringify(selector)}`);
    const waitTime = timeout || this.config.timeout!;
    
    try {
      await this.driver!.wait(async () => {
        try {
          const element = await this.findElement(selector);
          const elementText = await element.getText();
          return elementText.includes(text);
        } catch {
          return false;
        }
      }, waitTime);
      return true;
    } catch {
      return false;
    }
  }

  async switchToFrame(frameSelector?: string | ElementSelector | number): Promise<void> {
    if (frameSelector === undefined) {
      this.logger.info('Switching to default content');
      await this.driver!.switchTo().defaultContent();
    } else if (typeof frameSelector === 'number') {
      this.logger.info(`Switching to frame by index: ${frameSelector}`);
      await this.driver!.switchTo().frame(frameSelector);
    } else {
      this.logger.info(`Switching to frame: ${JSON.stringify(frameSelector)}`);
      const frameElement = await this.findElement(frameSelector);
      await this.driver!.switchTo().frame(frameElement);
    }
  }

  async switchToWindow(windowHandle?: string): Promise<void> {
    if (windowHandle) {
      this.logger.info(`Switching to window: ${windowHandle}`);
      await this.driver!.switchTo().window(windowHandle);
    } else {
      const handles = await this.driver!.getAllWindowHandles();
      const currentHandle = await this.driver!.getWindowHandle();
      const newHandle = handles.find(h => h !== currentHandle);
      if (newHandle) {
        this.logger.info(`Switching to new window: ${newHandle}`);
        await this.driver!.switchTo().window(newHandle);
      }
    }
  }

  async takeScreenshot(filename?: string): Promise<string> {
    if (!this.driver) throw new Error('Driver not initialized');
    
    const screenshotData = await this.driver.takeScreenshot();
    
    if (filename) {
      const screenshotPath = path.resolve(filename);
      fs.writeFileSync(screenshotPath, screenshotData, 'base64');
      this.logger.info(`Screenshot saved to: ${screenshotPath}`);
      return screenshotPath;
    } else {
      const defaultFilename = `screenshot_${Date.now()}_${++this.screenshotCounter}.png`;
      const screenshotPath = path.resolve(defaultFilename);
      fs.writeFileSync(screenshotPath, screenshotData, 'base64');
      this.logger.info(`Screenshot saved to: ${screenshotPath}`);
      return screenshotPath;
    }
  }

  async executeJavaScript(script: string, ...args: any[]): Promise<any> {
    if (!this.driver) throw new Error('Driver not initialized');
    this.logger.info(`Executing JavaScript: ${script}`);
    return await this.driver.executeScript(script, ...args);
  }

  async getPageTitle(): Promise<string> {
    if (!this.driver) throw new Error('Driver not initialized');
    return await this.driver.getTitle();
  }

  async getCurrentUrl(): Promise<string> {
    if (!this.driver) throw new Error('Driver not initialized');
    return await this.driver.getCurrentUrl();
  }

  async getPageSource(): Promise<string> {
    if (!this.driver) throw new Error('Driver not initialized');
    return await this.driver.getPageSource();
  }

  async refreshPage(): Promise<void> {
    if (!this.driver) throw new Error('Driver not initialized');
    this.logger.info('Refreshing page');
    await this.driver.navigate().refresh();
  }

  async goBack(): Promise<void> {
    if (!this.driver) throw new Error('Driver not initialized');
    this.logger.info('Navigating back');
    await this.driver.navigate().back();
  }

  async goForward(): Promise<void> {
    if (!this.driver) throw new Error('Driver not initialized');
    this.logger.info('Navigating forward');
    await this.driver.navigate().forward();
  }

  async close(): Promise<void> {
    if (this.driver) {
      this.logger.info('Closing WebDriver');
      await this.driver.quit();
      this.driver = null;
    }
  }

  private parseSelector(selector: string | ElementSelector): ElementSelector {
    if (typeof selector === 'string') {
      // Auto-detect selector type
      if (selector.startsWith('#')) {
        return { type: 'id', value: selector.substring(1) };
      } else if (selector.startsWith('.')) {
        return { type: 'class', value: selector.substring(1) };
      } else if (selector.startsWith('//') || selector.includes('/')) {
        return { type: 'xpath', value: selector };
      } else if (selector.includes('[') || selector.includes(':')) {
        return { type: 'css', value: selector };
      } else {
        // Default to ID, then name, then CSS
        return { type: 'id', value: selector };
      }
    }
    return selector;
  }

  async swipe(startSelector: string | ElementSelector, endSelector: string | ElementSelector): Promise<void> {
    this.logger.info(`Swiping from ${JSON.stringify(startSelector)} to ${JSON.stringify(endSelector)}`);
    const startElement = await this.findElement(startSelector);
    const endElement = await this.findElement(endSelector);
    
    const actions = this.driver!.actions();
    await actions.move({ origin: startElement })
      .press()
      .move({ origin: endElement })
      .release()
      .perform();
  }

  async zoomIn(selector: string | ElementSelector): Promise<void> {
    this.logger.info(`Zooming in on element: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    
    // Use JavaScript to zoom in on the element
    await this.driver!.executeScript(`
      const element = arguments[0];
      const currentScale = element.style.transform.match(/scale\\((\\d*\\.?\\d+)\\)/) || [null, '1'];
      const newScale = parseFloat(currentScale[1]) * 1.2;
      element.style.transform = 'scale(' + newScale + ')';
      element.style.transformOrigin = 'center';
    `, element);
  }

  async zoomOut(selector: string | ElementSelector): Promise<void> {
    this.logger.info(`Zooming out on element: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    
    // Use JavaScript to zoom out on the element
    await this.driver!.executeScript(`
      const element = arguments[0];
      const currentScale = element.style.transform.match(/scale\\((\\d*\\.?\\d+)\\)/) || [null, '1'];
      const newScale = parseFloat(currentScale[1]) * 0.8;
      element.style.transform = 'scale(' + newScale + ')';
      element.style.transformOrigin = 'center';
    `, element);
  }

  // Complete missing methods from the comprehensive step definitions

  async clickAndHold(selector: string | ElementSelector): Promise<void> {
    this.logger.info(`Click and hold on element: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    const actions = this.driver!.actions();
    await actions.move({ origin: element }).press().perform();
  }

  async release(selector?: string | ElementSelector): Promise<void> {
    this.logger.info(`Releasing click${selector ? ` on element: ${JSON.stringify(selector)}` : ''}`);
    const actions = this.driver!.actions();
    if (selector) {
      const element = await this.findElement(selector);
      await actions.move({ origin: element }).release().perform();
    } else {
      await actions.release().perform();
    }
  }

  async appendText(selector: string | ElementSelector, text: string): Promise<void> {
    this.logger.info(`Appending text "${text}" to element: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    await element.sendKeys(text);
  }

  async pressKeyCombo(modifier: string, key: string): Promise<void> {
    this.logger.info(`Pressing ${modifier}+${key} key combination`);
    const actions = this.driver!.actions();
    
    const modifierKey = modifier.toLowerCase() === 'ctrl' ? Key.CONTROL :
                       modifier.toLowerCase() === 'alt' ? Key.ALT :
                       modifier.toLowerCase() === 'shift' ? Key.SHIFT :
                       modifier.toLowerCase() === 'cmd' ? Key.COMMAND : Key.CONTROL;
    
    await actions.keyDown(modifierKey).sendKeys(key).keyUp(modifierKey).perform();
  }

  async toggleCheckbox(selector: string | ElementSelector): Promise<void> {
    this.logger.info(`Toggling checkbox: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    await element.click();
  }

  async uploadMultipleFiles(selector: string | ElementSelector, filePaths: string[]): Promise<void> {
    this.logger.info(`Uploading multiple files to element: ${JSON.stringify(selector)}`);
    for (const filePath of filePaths) {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
    }
    
    const element = await this.findElement(selector);
    const absolutePaths = filePaths.map(fp => path.resolve(fp));
    await element.sendKeys(absolutePaths.join('\n'));
  }

  async downloadFile(url: string): Promise<string> {
    this.logger.info(`Downloading file from: ${url}`);
    await this.driver!.get(url);
    return path.join(process.cwd(), 'downloads', path.basename(url));
  }

  async scrollBy(x: number, y: number): Promise<void> {
    this.logger.info(`Scrolling by ${x}, ${y}`);
    await this.driver!.executeScript(`window.scrollBy(${x}, ${y});`);
  }

  async scrollToBottom(): Promise<void> {
    this.logger.info('Scrolling to bottom of page');
    await this.driver!.executeScript('window.scrollTo(0, document.body.scrollHeight);');
  }

  async waitForElementToDisappear(selector: string | ElementSelector, timeout?: number): Promise<void> {
    this.logger.info(`Waiting for element to disappear: ${JSON.stringify(selector)}`);
    const waitTime = timeout || this.config.timeout!;
    const parsedSelector = this.parseSelector(selector);
    
    let locator: By;
    switch (parsedSelector.type) {
      case 'id':
        locator = By.id(parsedSelector.value);
        break;
      case 'css':
        locator = By.css(parsedSelector.value);
        break;
      default:
        locator = By.css(parsedSelector.value);
    }

    await this.driver!.wait(until.stalenessOf(await this.driver!.findElement(locator)), waitTime);
  }

  async waitForVisible(selector: string | ElementSelector, timeout?: number): Promise<void> {
    this.logger.info(`Waiting for element to be visible: ${JSON.stringify(selector)}`);
    const waitTime = timeout || this.config.timeout!;
    const element = await this.findElement(selector);
    await this.driver!.wait(until.elementIsVisible(element), waitTime);
  }

  async waitForHidden(selector: string | ElementSelector, timeout?: number): Promise<void> {
    this.logger.info(`Waiting for element to be hidden: ${JSON.stringify(selector)}`);
    const waitTime = timeout || this.config.timeout!;
    const element = await this.findElement(selector);
    await this.driver!.wait(until.elementIsNotVisible(element), waitTime);
  }

  async waitForEnabled(selector: string | ElementSelector, timeout?: number): Promise<void> {
    this.logger.info(`Waiting for element to be enabled: ${JSON.stringify(selector)}`);
    const waitTime = timeout || this.config.timeout!;
    const element = await this.findElement(selector);
    await this.driver!.wait(until.elementIsEnabled(element), waitTime);
  }

  async waitForDisabled(selector: string | ElementSelector, timeout?: number): Promise<void> {
    this.logger.info(`Waiting for element to be disabled: ${JSON.stringify(selector)}`);
    const waitTime = timeout || this.config.timeout!;
    const element = await this.findElement(selector);
    await this.driver!.wait(until.elementIsDisabled(element), waitTime);
  }

  async waitForTitle(title: string, timeout?: number): Promise<void> {
    this.logger.info(`Waiting for page title: ${title}`);
    const waitTime = timeout || this.config.timeout!;
    await this.driver!.wait(until.titleIs(title), waitTime);
  }

  async waitForUrl(url: string, timeout?: number): Promise<void> {
    this.logger.info(`Waiting for URL to contain: ${url}`);
    const waitTime = timeout || this.config.timeout!;
    await this.driver!.wait(until.urlContains(url), waitTime);
  }

  async switchToParentFrame(): Promise<void> {
    this.logger.info('Switching to parent frame');
    await this.driver!.switchTo().parentFrame();
  }

  async closeWindow(): Promise<void> {
    this.logger.info('Closing current window');
    await this.driver!.close();
  }

  // Shadow DOM operations
  async switchToShadowRoot(selector: string | ElementSelector): Promise<void> {
    this.logger.info(`Switching to shadow root of: ${JSON.stringify(selector)}`);
    const hostElement = await this.findElement(selector);
    const shadowRoot = await this.driver!.executeScript('return arguments[0].shadowRoot', hostElement);
    // Note: WebDriver doesn't have direct shadow root switching
  }

  async findInShadowRoot(hostSelector: string | ElementSelector, shadowSelector: string): Promise<WebElement> {
    this.logger.info(`Finding ${shadowSelector} in shadow root of ${JSON.stringify(hostSelector)}`);
    const hostElement = await this.findElement(hostSelector);
    const shadowElement = await this.driver!.executeScript(
      'return arguments[0].shadowRoot.querySelector(arguments[1])', 
      hostElement, 
      shadowSelector
    );
    return shadowElement as WebElement;
  }

  async clickInShadowRoot(hostSelector: string | ElementSelector, shadowSelector: string): Promise<void> {
    this.logger.info(`Clicking ${shadowSelector} in shadow root of ${JSON.stringify(hostSelector)}`);
    const shadowElement = await this.findInShadowRoot(hostSelector, shadowSelector);
    await shadowElement.click();
  }

  // Alert operations
  async acceptAlert(): Promise<void> {
    this.logger.info('Accepting alert');
    const alert = await this.driver!.switchTo().alert();
    await alert.accept();
  }

  async dismissAlert(): Promise<void> {
    this.logger.info('Dismissing alert');
    const alert = await this.driver!.switchTo().alert();
    await alert.dismiss();
  }

  async sendKeysToAlert(text: string): Promise<void> {
    this.logger.info(`Sending keys to alert: ${text}`);
    const alert = await this.driver!.switchTo().alert();
    await alert.sendKeys(text);
    await alert.accept();
  }

  async getAlertText(): Promise<string> {
    this.logger.info('Getting alert text');
    const alert = await this.driver!.switchTo().alert();
    return await alert.getText();
  }

  // Cookie operations
  async addCookie(name: string, value: string): Promise<void> {
    this.logger.info(`Adding cookie: ${name} = ${value}`);
    await this.driver!.manage().addCookie({ name, value });
  }

  async deleteCookie(name: string): Promise<void> {
    this.logger.info(`Deleting cookie: ${name}`);
    await this.driver!.manage().deleteCookie(name);
  }

  async deleteAllCookies(): Promise<void> {
    this.logger.info('Deleting all cookies');
    await this.driver!.manage().deleteAllCookies();
  }

  async getCookie(name: string): Promise<string | null> {
    this.logger.info(`Getting cookie: ${name}`);
    const cookie = await this.driver!.manage().getCookie(name);
    return cookie ? cookie.value : null;
  }

  // Window operations
  async maximizeWindow(): Promise<void> {
    this.logger.info('Maximizing window');
    await this.driver!.manage().window().maximize();
  }

  async minimizeWindow(): Promise<void> {
    this.logger.info('Minimizing window');
    await this.driver!.manage().window().minimize();
  }

  async setWindowSize(width: number, height: number): Promise<void> {
    this.logger.info(`Setting window size to ${width}x${height}`);
    await this.driver!.manage().window().setRect({ width, height });
  }

  async setWindowPosition(x: number, y: number): Promise<void> {
    this.logger.info(`Setting window position to ${x}, ${y}`);
    await this.driver!.manage().window().setRect({ x, y });
  }

  async openNewTab(): Promise<void> {
    this.logger.info('Opening new tab');
    await this.driver!.executeScript('window.open("", "_blank");');
  }

  async closeCurrentTab(): Promise<void> {
    this.logger.info('Closing current tab');
    await this.driver!.close();
  }

  // Enhanced verification methods
  async isSelected(selector: string | ElementSelector): Promise<boolean> {
    try {
      const element = await this.findElement(selector);
      return await element.isSelected();
    } catch {
      return false;
    }
  }

  async getCssProperty(selector: string | ElementSelector, property: string): Promise<string> {
    this.logger.info(`Getting CSS property "${property}" from element: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    return await element.getCssValue(property);
  }

  async countElements(selector: string | ElementSelector): Promise<number> {
    this.logger.info(`Counting elements matching: ${JSON.stringify(selector)}`);
    const parsedSelector = this.parseSelector(selector);
    
    let locator: By;
    switch (parsedSelector.type) {
      case 'id':
        locator = By.id(parsedSelector.value);
        break;
      case 'css':
        locator = By.css(parsedSelector.value);
        break;
      case 'xpath':
        locator = By.xpath(parsedSelector.value);
        break;
      default:
        locator = By.css(parsedSelector.value);
    }

    const elements = await this.driver!.findElements(locator);
    return elements.length;
  }

  async elementExists(selector: string | ElementSelector): Promise<boolean> {
    try {
      await this.findElement(selector);
      return true;
    } catch {
      return false;
    }
  }

  // Enhanced screenshot methods
  async takeElementScreenshot(selector: string | ElementSelector): Promise<string> {
    this.logger.info(`Taking screenshot of element: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    const screenshotData = await element.takeScreenshot();
    
    const filename = `element_screenshot_${Date.now()}_${++this.screenshotCounter}.png`;
    const screenshotPath = path.resolve(filename);
    fs.writeFileSync(screenshotPath, screenshotData, 'base64');
    this.logger.info(`Element screenshot saved to: ${screenshotPath}`);
    return screenshotPath;
  }

  async takeFullPageScreenshot(): Promise<string> {
    this.logger.info('Taking full page screenshot');
    if (this.config.browser === 'chrome') {
      await this.driver!.executeScript('return document.body.style.transform = "scale(1)"');
    }
    
    const screenshotData = await this.driver!.takeScreenshot();
    const filename = `fullpage_screenshot_${Date.now()}_${++this.screenshotCounter}.png`;
    const screenshotPath = path.resolve(filename);
    fs.writeFileSync(screenshotPath, screenshotData, 'base64');
    this.logger.info(`Full page screenshot saved to: ${screenshotPath}`);
    return screenshotPath;
  }

  // JavaScript execution
  async executeAsyncJavaScript(script: string, ...args: any[]): Promise<any> {
    if (!this.driver) throw new Error('Driver not initialized');
    this.logger.info(`Executing async JavaScript: ${script}`);
    return await this.driver.executeAsyncScript(script, ...args);
  }

  // Touch/Mobile actions
  async touchTap(selector: string | ElementSelector): Promise<void> {
    this.logger.info(`Performing touch tap on: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    const actions = this.driver!.actions();
    await actions.move({ origin: element }).press().release().perform();
  }

  async doubleTap(selector: string | ElementSelector): Promise<void> {
    this.logger.info(`Performing double tap on: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    const actions = this.driver!.actions();
    await actions.move({ origin: element })
      .press().release()
      .pause(100)
      .press().release()
      .perform();
  }

  async longPress(selector: string | ElementSelector, duration: number = 1000): Promise<void> {
    this.logger.info(`Performing long press on: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    const actions = this.driver!.actions();
    await actions.move({ origin: element })
      .press()
      .pause(duration)
      .release()
      .perform();
  }

  async clear(selector: string | ElementSelector): Promise<void> {
    this.logger.info(`Clearing field: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    await element.clear();
  }

  async moveTo(selector: string | ElementSelector): Promise<void> {
    this.logger.info(`Moving mouse to element: ${JSON.stringify(selector)}`);
    const element = await this.findElement(selector);
    const actions = this.driver!.actions();
    await actions.move({ origin: element }).perform();
  }

  async dragByOffset(selector: string | ElementSelector, xOffset: number, yOffset: number): Promise<void> {
    this.logger.info(`Dragging element ${JSON.stringify(selector)} by offset ${xOffset}, ${yOffset}`);
    const element = await this.findElement(selector);
    const actions = this.driver!.actions();
    await actions.dragAndDrop(element, { x: xOffset, y: yOffset }).perform();
  }

  async moveByOffset(xOffset: number, yOffset: number): Promise<void> {
    this.logger.info(`Moving by offset (${xOffset}, ${yOffset})`);
    const actions = this.driver!.actions();
    await actions.move({ x: xOffset, y: yOffset }).perform();
  }

  // Remove duplicate method implementations that were causing the TypeScript errors
  // Keep only the original implementations above and remove any duplicates below this point
}
