// Logger utility for unified web driver

class DriverLogger {
  constructor(driverName = 'UnifiedWebDriver') {
    this.driverName = driverName;
  }

  getCallerInfo() {
    const stack = new Error().stack;
    if (!stack) return 'unknown';
    
    const lines = stack.split('\n');
    for (let i = 3; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/at\s+(\w+)\s*\(/);
      if (match && match[1] !== 'log' && match[1] !== 'error') return match[1];
    }
    return 'unknown';
  }

  log(message, data = {}) {
    const caller = this.getCallerInfo();
    const timestamp = new Date().toISOString();
    const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
    console.log(`${timestamp} [INFO] [index.js::${this.driverName}::${caller}] ${message}${dataStr}`);
  }

  error(message, data = {}) {
    const caller = this.getCallerInfo();
    const timestamp = new Date().toISOString();
    const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
    console.error(`${timestamp} [ERROR] [index.js::${this.driverName}::${caller}] ${message}${dataStr}`);
  }

  warn(message, data = {}) {
    const caller = this.getCallerInfo();
    const timestamp = new Date().toISOString();
    const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
    console.warn(`${timestamp} [WARN] [index.js::${this.driverName}::${caller}] ${message}${dataStr}`);
  }

  debug(message, data = {}) {
    if (process.env.DEBUG === 'true') {
      const caller = this.getCallerInfo();
      const timestamp = new Date().toISOString();
      const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      console.debug(`${timestamp} [DEBUG] [index.js::${this.driverName}::${caller}] ${message}${dataStr}`);
    }
  }
}

// Factory function to create logger instances
function createLogger(driverName = 'UnifiedWebDriver') {
  return new DriverLogger(driverName);
}

module.exports = { DriverLogger, createLogger };
