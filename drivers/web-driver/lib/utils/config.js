// Configuration management for unified web driver

class WebDriverConfig {
  constructor(manifest = {}) {
    this.defaults = {
      engine: 'playwright', // 'playwright' or 'selenium'
      browserType: 'chromium',
      headless: false,
      timeout: 30000,
      screenshotDir: 'screenshots',
      windowSize: { width: 1280, height: 720 },
      retries: 3,
      retryDelay: 2000
    };
    
    this.current = { ...this.defaults, ...manifest.config };
  }

  merge(newConfig) {
    this.current = { ...this.current, ...newConfig };
    return this.current;
  }

  get(key) {
    return this.current[key];
  }

  set(key, value) {
    this.current[key] = value;
  }

  getAll() {
    return { ...this.current };
  }

  validate() {
    const errors = [];

    if (!['playwright', 'selenium'].includes(this.current.engine)) {
      errors.push(`Invalid engine: ${this.current.engine}. Must be 'playwright' or 'selenium'`);
    }

    if (this.current.engine === 'playwright') {
      if (!['chromium', 'firefox', 'webkit'].includes(this.current.browserType)) {
        errors.push(`Invalid browserType for Playwright: ${this.current.browserType}. Must be 'chromium', 'firefox', or 'webkit'`);
      }
    } else if (this.current.engine === 'selenium') {
      if (!['chrome', 'firefox', 'edge', 'safari'].includes(this.current.browserType)) {
        errors.push(`Invalid browserType for Selenium: ${this.current.browserType}. Must be 'chrome', 'firefox', 'edge', or 'safari'`);
      }
    }

    if (this.current.timeout < 1000 || this.current.timeout > 300000) {
      errors.push(`Invalid timeout: ${this.current.timeout}. Must be between 1000ms and 300000ms`);
    }

    return errors;
  }

  isValid() {
    return this.validate().length === 0;
  }
}

// Factory function to create and return a config object
function loadConfig(manifest = {}) {
  const configInstance = new WebDriverConfig(manifest);
  const config = configInstance.getAll();
  
  // Add utility methods to the config object
  config.merge = (newConfig) => configInstance.merge(newConfig);
  config.validate = () => configInstance.validate();
  config.isValid = () => configInstance.isValid();
  
  return config;
}

module.exports = { WebDriverConfig, loadConfig };
