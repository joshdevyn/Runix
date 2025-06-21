import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5,
  SILENT = 6
}

export interface LogContext {
  file?: string;
  class?: string;
  method?: string;
  traceId?: string;
  [key: string]: any;
}

export interface LoggerConfig {
  level?: LogLevel;
  filePath?: string;
  console?: boolean;
  enableTracing?: boolean;
  context?: LogContext;
}

// Global registry to handle module reloading in Jest environment
interface GlobalLoggerRegistry {
  loggerInstance?: Logger;
}

declare global {
  var __RUNIX_LOGGER_REGISTRY__: GlobalLoggerRegistry | undefined;
}

const globalRegistry = (() => {
  if (typeof globalThis !== 'undefined') {
    if (!globalThis.__RUNIX_LOGGER_REGISTRY__) {
      globalThis.__RUNIX_LOGGER_REGISTRY__ = {};
    }
    return globalThis.__RUNIX_LOGGER_REGISTRY__;
  }
  return {} as GlobalLoggerRegistry;
})();

export class Logger {
  private static instance: Logger;
  private static instanceCount = 0;
  private instanceId: number;
  private level: LogLevel = LogLevel.INFO;
  private filePath?: string;
  private consoleEnabled: boolean = true;
  private tracingEnabled: boolean = true;
  private context: LogContext = {};
  private traceStack: Map<string, { start: number; context: LogContext }> = new Map();

  private constructor(config: LoggerConfig = {}) {
    this.instanceId = ++Logger.instanceCount;
    this.level = config.level ?? LogLevel.INFO;
    this.filePath = config.filePath;
    this.consoleEnabled = config.console ?? true;
    this.tracingEnabled = config.enableTracing ?? true;
    this.context = config.context ?? {};
    
    if (this.filePath) {
      this.ensureLogDirectory();
    }
  }

  public static getInstance(config?: LoggerConfig): Logger {
    // Try to get instance from global registry first (for Jest environment)
    if (globalRegistry.loggerInstance && typeof globalRegistry.loggerInstance.createChildLogger === 'function') {
      if (config) {
        globalRegistry.loggerInstance.updateConfig(config);
      }
      return globalRegistry.loggerInstance;
    }

    // Fallback to static instance
    if (!Logger.instance || typeof Logger.instance.createChildLogger !== 'function') {
      Logger.instance = new Logger(config);
      // Store in global registry
      globalRegistry.loggerInstance = Logger.instance;
    } else if (config) {
      Logger.instance.updateConfig(config);
    }
    
    return Logger.instance;
  }

  private updateConfig(config: LoggerConfig): void {
    if (config.level !== undefined) this.level = config.level;
    if (config.filePath !== undefined) this.filePath = config.filePath;
    if (config.console !== undefined) this.consoleEnabled = config.console;
    if (config.enableTracing !== undefined) this.tracingEnabled = config.enableTracing;
    if (config.context !== undefined) this.context = { ...this.context, ...config.context };
    
    if (this.filePath) {
      this.ensureLogDirectory();
    }
  }

  private ensureLogDirectory(): void {
    if (this.filePath) {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  private getCallerInfo(): LogContext {
    const stack = new Error().stack;
    if (!stack) return {};

    const lines = stack.split('\n');
    // Find the first stack frame that's not from this logger file
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('logger.ts') || line.includes('Logger.')) continue;
      
      // Enhanced regex to capture more detailed info
      const match = line.match(/at\s+(?:(?:async\s+)?(?:(\w+)\.)?(\w+)(?:\s+\[as\s+(\w+)\])?)?\s*\(([^:]+):(\d+):(\d+)\)/);
      if (match) {
        const [, className, methodName, aliasName, filePath, lineNumber, columnNumber] = match;
        return {
          file: path.basename(filePath),
          class: className || 'Global',
          method: aliasName || methodName || 'anonymous',
          line: parseInt(lineNumber),
          column: parseInt(columnNumber),
          fullPath: filePath
        };
      }
      
      // Fallback for different stack formats
      const simpleMatch = line.match(/at\s+([^(]+)\s*\(([^)]+)\)/);
      if (simpleMatch) {
        const [, functionName, location] = simpleMatch;
        const locationMatch = location.match(/([^:]+):(\d+):(\d+)/);
        if (locationMatch) {
          const [, filePath, lineNumber, columnNumber] = locationMatch;
          return {
            file: path.basename(filePath),
            class: 'Unknown',
            method: functionName.trim(),
            line: parseInt(lineNumber),
            column: parseInt(columnNumber),
            fullPath: filePath
          };
        }
      }
    }
    return {};
  }
  private formatMessage(level: string, message: string, context: LogContext, data?: any): string {
    const timestamp = new Date().toISOString();
    const callerInfo = this.getCallerInfo();
    const combinedContext = { ...this.context, ...callerInfo, ...context };
    
    let logLine = `${timestamp} [${level}]`;
    
    if (combinedContext.file) {
      logLine += ` [${combinedContext.file}`;
      if (combinedContext.class && combinedContext.class !== 'Global') {
        logLine += `::${combinedContext.class}`;
      }
      if (combinedContext.method) {
        logLine += `::${combinedContext.method}`;
      }
      logLine += `]`;
    }
    
    if (combinedContext.traceId) {
      logLine += ` [trace:${combinedContext.traceId}]`;
    }
    
    logLine += ` ${message}`;
    
    if (data !== undefined) {
      let dataToLog;
      if (data instanceof Error) {
        dataToLog = { name: data.name, message: data.message };
        if (data.stack) {
          (dataToLog as any).stack = data.stack;
        }
        // Add custom enumerable properties from the error instance
        for (const key of Object.keys(data)) {
          if (!(key in dataToLog)) { // Avoid overwriting name/message if they were enumerable
             (dataToLog as any)[key] = (data as any)[key];
          }
        }
      } else {
        dataToLog = data;
      }

      if (typeof dataToLog === 'object' && dataToLog !== null) {
        try {
          // Truncate base64 content before stringifying
          const processedData = this.truncateBase64Content(dataToLog);
          
          // Handle BigInts and other potential stringify issues
          const serializedData = JSON.stringify(processedData, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value
          );
          logLine += ` ${serializedData}`;
        } catch (e) {
          logLine += ` [UnserializableObject]`;
        }
      } else if (dataToLog !== undefined) { // Append primitives directly
        logLine += ` ${dataToLog}`;
      }
    }
    
    return logLine;
  }

  private truncateBase64Content(obj: any, maxLength: number = 100): any {
    // Check environment variable for full base64 logging
    const showFullBase64 = process.env.RUNIX_LOG_FULL_BASE64 === 'true';
    
    if (showFullBase64) {
      return obj;
    }

    if (typeof obj === 'string') {
      // Check if string looks like base64 data
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
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Check for common base64 field names
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

  private isBase64String(str: string): boolean {
    // Basic heuristics for base64 detection
    if (str.length < 50) return false; // Too short to be meaningful base64
    if (str.startsWith('data:image/')) return true; // Data URL
    
    // Check if string matches base64 pattern and is reasonably long
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Regex.test(str) && str.length > 100;
  }

  private isBase64Field(fieldName: string): boolean {
    const base64FieldNames = [
      'image', 'screenshot', 'data', 'content', 'base64', 'src', 
      'imageData', 'screenshotData', 'capturedImage', 'blob'
    ];
    const lowerFieldName = fieldName.toLowerCase();
    return base64FieldNames.some(name => lowerFieldName.includes(name));
  }  private writeLog(level: string, message: string, context: LogContext = {}, data?: any): void {
    const formattedMessage = this.formatMessage(level, message, context, data);
    
    if (this.consoleEnabled) {
      if (level === 'ERROR' || level === 'FATAL') {
        console.error(formattedMessage);
      } else if (level === 'WARN') {
        console.warn(formattedMessage);
      } else {
        console.log(formattedMessage);
      }
    }
    
    if (this.filePath) {
      try {
        // Debug: Log file writing details
        // console.log(`[DEBUG] Logger attempting to write to: ${this.filePath}`);
        // console.log(`[DEBUG] File exists: ${fs.existsSync(this.filePath)}`);
        // console.log(`[DEBUG] Directory exists: ${fs.existsSync(path.dirname(this.filePath))}`);
        // console.log(`[DEBUG] Working directory: ${process.cwd()}`);
        
        // Write to main log file (append)
        fs.appendFileSync(this.filePath, formattedMessage + '\n');
        // console.log(`[DEBUG] Successfully wrote to main log file`);
        
        // Also write to latest log file (creates a fresh log for each session)
        const latestLogPath = this.getLatestLogPath(this.filePath);
        if (latestLogPath) {
          // console.log(`[DEBUG] Attempting to write to latest log: ${latestLogPath}`);
          fs.appendFileSync(latestLogPath, formattedMessage + '\n');
          // console.log(`[DEBUG] Successfully wrote to latest log file`);        
        }
      } catch (error) {
        // console.error(`[DEBUG] Failed to write to log file: ${error}`);
        // console.error(`[DEBUG] Error details:`, error);
      }
    }
  }

  private getLatestLogPath(originalPath: string): string | null {
    try {
      const dir = path.dirname(originalPath);
      const ext = path.extname(originalPath);
      const baseName = path.basename(originalPath, ext);
      
      // Create latest log filename: runix-dev.log -> runix-dev-latest.log
      const latestLogPath = path.join(dir, `${baseName}-latest${ext}`);
      return latestLogPath;
    } catch (error) {
      console.error(`Failed to generate latest log path: ${error}`);
      return null;
    }
  }

  public startNewSession(): void {
    // Clear the latest log file to start fresh for this session
    if (this.filePath) {
      const latestLogPath = this.getLatestLogPath(this.filePath);
      if (latestLogPath) {
        try {
          fs.writeFileSync(latestLogPath, ''); // Clear the file
          this.info('New logging session started', { sessionType: 'latest' });
        } catch (error) {
          this.error('Failed to clear latest log file', {}, error);
        }
      }
    }
  }

  public trace(message: string, context: LogContext = {}, data?: any): void {
    if (this.level <= LogLevel.TRACE) {
      this.writeLog('TRACE', message, context, data);
    }
  }

  public debug(message: string, context: LogContext = {}, data?: any): void {
    if (this.level <= LogLevel.DEBUG) {
      this.writeLog('DEBUG', message, context, data);
    }
  }

  public info(message: string, context: LogContext = {}, data?: any): void {
    if (this.level <= LogLevel.INFO) {
      this.writeLog('INFO', message, context, data);
    }
  }

  public warn(message: string, context: LogContext = {}, data?: any): void {
    if (this.level <= LogLevel.WARN) {
      this.writeLog('WARN', message, context, data);
    }
  }

  public error(message: string, context: LogContext = {}, data?: any): void {
    if (this.level <= LogLevel.ERROR) {
      this.writeLog('ERROR', message, context, data);
    }
  }

  public fatal(message: string, context: LogContext = {}, data?: any): void {
    if (this.level <= LogLevel.FATAL) {
      this.writeLog('FATAL', message, context, data);
    }
  }

  public startTrace(operation: string, context: LogContext = {}): string {
    if (!this.tracingEnabled) return '';
    
    const traceId = Math.random().toString(36).substring(2, 10);
    const startTime = Date.now();
    
    this.traceStack.set(traceId, { start: startTime, context });
    this.trace(`Starting ${operation}`, { ...context, traceId });
    
    return traceId;
  }

  public endTrace(traceId: string, context: LogContext = {}): void {
    if (!this.tracingEnabled || !traceId) return;
    
    const traceInfo = this.traceStack.get(traceId);
    if (traceInfo) {
      const duration = Date.now() - traceInfo.start;
      this.trace(`Completed operation`, { 
        ...traceInfo.context, 
        ...context, 
        traceId, 
        duration: `${duration}ms` 
      });
      this.traceStack.delete(traceId);
    }
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  public setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  public createChildLogger(context: LogContext): Logger {
    const childConfig: LoggerConfig = {
      level: this.level,
      filePath: this.filePath,
      console: this.consoleEnabled,
      enableTracing: this.tracingEnabled,
      context: { ...this.context, ...context }
    };
    return new Logger(childConfig);
  }

  public logMethodEntry(methodName: string, context: LogContext = {}, args?: any[]): string {
    const traceId = this.startTrace(`${methodName}-execution`, context);
    const argsInfo = args ? { args: args.map(arg => this.sanitizeForLogging(arg)) } : {};
    
    this.trace(`⮕ Entering ${methodName}`, context, argsInfo);
    return traceId;
  }

  public logMethodExit(methodName: string, traceId: string, context: LogContext = {}, result?: any): void {
    const resultInfo = result !== undefined ? { result: this.sanitizeForLogging(result) } : {};
    this.trace(`⮖ Exiting ${methodName}`, { ...context, traceId }, resultInfo);
    this.endTrace(traceId, context);
  }

  public logMethodError(methodName: string, traceId: string, error: Error, context: LogContext = {}): void {
    this.error(`💥 Error in ${methodName}`, { ...context, traceId }, {
      error: error.message,
      stack: error.stack,
      name: error.name,
      ...((error as any).context || {})
    });
    this.endTrace(traceId, { ...context, error: true });
  }

  private sanitizeForLogging(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') return obj;
    if (obj instanceof Error) {
      return {
        name: obj.name,
        message: obj.message,
        stack: obj.stack?.split('\n').slice(0, 5).join('\n') // Limit stack trace
      };
    }
    if (Array.isArray(obj)) {
      return obj.slice(0, 10).map(item => this.sanitizeForLogging(item)); // Limit array size
    }
    if (typeof obj === 'object') {
      const sanitized: any = {};
      let count = 0;
      for (const [key, value] of Object.entries(obj)) {
        if (count >= 20) { // Limit object properties
          sanitized['...'] = `${Object.keys(obj).length - count} more properties`;
          break;
        }
        // Avoid logging sensitive data
        if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('token')) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitizeForLogging(value);
        }
        count++;
      }
      return sanitized;
    }
    return String(obj);
  }
}

// Export a default instance for convenience
export const logger = Logger.getInstance();
