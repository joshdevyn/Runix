// Engine factory for unified web driver - handles both Playwright and Selenium
const PlaywrightEngine = require('./engines/playwright-engine');
const SeleniumEngine = require('./engines/selenium-engine');

class EngineFactory {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async createEngine() {
    this.logger.log(`Initializing ${this.config.engine} automation engine`);
    
    if (this.config.engine === 'playwright') {
      return await this.initializePlaywright();
    } else if (this.config.engine === 'selenium') {
      return await this.initializeSelenium();
    } else {
      throw new Error(`Unsupported engine: ${this.config.engine}`);
    }
  }

  // Initialize Playwright
  async initializePlaywright() {
    try {
      const { chromium, firefox, webkit } = require('playwright');
      
      let browserLauncher;
      switch (this.config.browserType) {
        case 'firefox':
          browserLauncher = firefox;
          break;
        case 'webkit':
          browserLauncher = webkit;
          break;
        case 'chromium':
        default:
          browserLauncher = chromium;
          break;
      }
      
      const browserOptions = {
        headless: this.config.headless,
        timeout: this.config.timeout
      };
      
      if (this.config.playwright?.channel) {
        browserOptions.channel = this.config.playwright.channel;
      }
      
      const browser = await browserLauncher.launch(browserOptions);
      const context = await browser.newContext({
        viewport: this.config.windowSize
      });      const page = await context.newPage();
      page.setDefaultTimeout(this.config.timeout);

      return new PlaywrightEngine(browser, context, page, this.config);
    } catch (err) {
      this.logger.error('Failed to initialize Playwright:', err);
      throw err;
    }
  }

  // Initialize Selenium
  async initializeSelenium() {
    try {
      const { Builder } = require('selenium-webdriver');
      const chrome = require('selenium-webdriver/chrome');
      const firefox = require('selenium-webdriver/firefox');
      const edge = require('selenium-webdriver/edge');
      
      let builder = new Builder();
      
      // Configure browser options
      switch (this.config.browserType) {
        case 'chrome':
          const chromeOptions = new chrome.Options();
          if (this.config.headless) {
            chromeOptions.addArguments('--headless=new');
          }
          chromeOptions.addArguments(
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            `--window-size=${this.config.windowSize.width},${this.config.windowSize.height}`
          );
          builder = builder.forBrowser('chrome').setChromeOptions(chromeOptions);
          break;
          
        case 'firefox':
          const firefoxOptions = new firefox.Options();
          if (this.config.headless) {
            firefoxOptions.addArguments('--headless');
          }
          firefoxOptions.setPreference('dom.disable_beforeunload', true);
          builder = builder.forBrowser('firefox').setFirefoxOptions(firefoxOptions);
          break;
          
        case 'edge':
          const edgeOptions = new edge.Options();
          if (this.config.headless) {
            edgeOptions.addArguments('--headless=new');
          }
          edgeOptions.addArguments('--no-sandbox', '--disable-dev-shm-usage');
          builder = builder.forBrowser('MicrosoftEdge').setEdgeOptions(edgeOptions);
          break;
          
        default:
          throw new Error(`Unsupported browser type for Selenium: ${this.config.browserType}`);
      }
      
      // Set Selenium Hub URL if provided
      if (this.config.seleniumHub) {
        builder = builder.usingServer(this.config.seleniumHub);
      }
        const driver = await builder.build();
      await driver.manage().setTimeouts({ implicit: this.config.timeout });
      
      return new SeleniumEngine(driver, this.config);
    } catch (err) {
      this.logger.error('Failed to initialize Selenium:', err);
      throw err;
    }
  }
}

// Factory function to create engine factory instances
function createEngineFactory(config, logger) {
  return new EngineFactory(config, logger);
}

module.exports = {
  EngineFactory,
  createEngineFactory
};
