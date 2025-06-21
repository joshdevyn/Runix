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

  // Base64 truncation utilities
  isBase64String(str) {
    if (typeof str !== 'string' || str.length < 50) return false;
    if (str.startsWith('data:image/')) return true;
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Regex.test(str) && str.length > 100;
  }

  isBase64Field(fieldName) {
    const base64FieldNames = [
      'image', 'screenshot', 'data', 'content', 'base64', 'src', 
      'imageData', 'screenshotData', 'capturedImage', 'blob'
    ];
    const lowerFieldName = fieldName.toLowerCase();
    return base64FieldNames.some(name => lowerFieldName.includes(name));
  }

  truncateBase64Content(obj, maxLength = 100) {
    // Check environment variable for full base64 logging
    const showFullBase64 = process.env.RUNIX_LOG_FULL_BASE64 === 'true';
    
    if (showFullBase64) {
      return obj;
    }

    if (typeof obj === 'string') {
      if (this.isBase64String(obj)) {
        return obj.length > maxLength 
          ? `${obj.substring(0, maxLength)}...[truncated base64, ${obj.length} chars total]`
          : obj;
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.truncateBase64Content(item, maxLength));
    }

    if (obj && typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && this.isBase64Field(key) && this.isBase64String(value)) {
          result[key] = value.length > maxLength 
            ? `${value.substring(0, maxLength)}...[truncated base64, ${value.length} chars total]`
            : value;
        } else {
          result[key] = this.truncateBase64Content(value, maxLength);
        }
      }
      return result;
    }

    return obj;
  }

  log(message, data = {}) {
    const caller = this.getCallerInfo();
    const timestamp = new Date().toISOString();
    let dataStr = '';
    if (Object.keys(data).length > 0) {
      try {
        const processedData = this.truncateBase64Content(data);
        dataStr = ` ${JSON.stringify(processedData)}`;
      } catch (e) {
        dataStr = ' [UnserializableObject]';
      }
    }
    console.log(`${timestamp} [INFO] [index.js::${this.driverName}::${caller}] ${message}${dataStr}`);
  }

  error(message, data = {}) {
    const caller = this.getCallerInfo();
    const timestamp = new Date().toISOString();
    let dataStr = '';
    if (Object.keys(data).length > 0) {
      try {
        const processedData = this.truncateBase64Content(data);
        dataStr = ` ${JSON.stringify(processedData)}`;
      } catch (e) {
        dataStr = ' [UnserializableObject]';
      }
    }
    console.error(`${timestamp} [ERROR] [index.js::${this.driverName}::${caller}] ${message}${dataStr}`);
  }

  warn(message, data = {}) {
    const caller = this.getCallerInfo();
    const timestamp = new Date().toISOString();
    let dataStr = '';
    if (Object.keys(data).length > 0) {
      try {
        const processedData = this.truncateBase64Content(data);
        dataStr = ` ${JSON.stringify(processedData)}`;
      } catch (e) {
        dataStr = ' [UnserializableObject]';
      }
    }
    console.warn(`${timestamp} [WARN] [index.js::${this.driverName}::${caller}] ${message}${dataStr}`);
  }

  debug(message, data = {}) {
    if (process.env.DEBUG === 'true') {
      const caller = this.getCallerInfo();
      const timestamp = new Date().toISOString();
      let dataStr = '';
      if (Object.keys(data).length > 0) {
        try {
          const processedData = this.truncateBase64Content(data);
          dataStr = ` ${JSON.stringify(processedData)}`;
        } catch (e) {
          dataStr = ' [UnserializableObject]';
        }
      }
      console.debug(`${timestamp} [DEBUG] [index.js::${this.driverName}::${caller}] ${message}${dataStr}`);
    }
  }
}

// Factory function to create logger instances
function createLogger(driverName = 'UnifiedWebDriver') {
  return new DriverLogger(driverName);
}

module.exports = { DriverLogger, createLogger };
