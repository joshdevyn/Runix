import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { env } from './env';

/**
 * Log levels in order of verbosity
 */
export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5,
  SILENT = 6
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  levelName: string;
  message: string;
  context?: Record<string, any>;
  traceId?: string;
  parentTraceId?: string;
  taskId?: string;
  source?: string;
  stackTrace?: string;
}

export interface LoggerOptions {
  level?: LogLevel;
  filePath?: string;
  console?: boolean;
  enableTracing?: boolean;
  context?: Record<string, any>;
  timestampFormat?: string;
}

/**
 * Advanced logger with tracing capabilities for Runix
 */
export class Logger {
  private static instance: Logger;
  private level: LogLevel;
  private filePath?: string;
  private enableConsole: boolean;
  private enableTracing: boolean;
  private globalContext: Record<string, any>;
  private activeTraces: Map<string, { startTime: number, data: Record<string, any> }> = new Map();
  private timestampFormat: string;
  
  // Thread/task specific context using AsyncLocalStorage could be added here for Node 12+
  
  private constructor(options: LoggerOptions = {}) {
    // Check environment variables first, then fall back to passed options
    this.level = options.level ?? 
      this.parseLogLevel(env.get('LOG_LEVEL')) ?? 
      LogLevel.INFO;
    
    this.filePath = options.filePath ?? 
      env.get('LOG_FILE') ?? 
      env.get('LOG_PATH');
    
    this.enableConsole = options.console ?? 
      env.getBoolean('LOG_CONSOLE', true) ?? 
      true;
    
    this.enableTracing = options.enableTracing ?? 
      env.getBoolean('LOG_TRACING', true) ?? 
      true;
    
    this.globalContext = options.context ?? {};
    
    this.timestampFormat = options.timestampFormat ?? 
      env.get('LOG_TIMESTAMP_FORMAT', 'ISO') ?? 
      'ISO';
    
    // Ensure log directory exists if file logging is enabled
    if (this.filePath) {
      const logDir = path.dirname(this.filePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }
  }
  
  /**
   * Get or create logger instance (singleton)
   */
  public static getInstance(options?: LoggerOptions): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(options);
    }
    return Logger.instance;
  }
  
  /**
   * Configure the logger with new options
   */
  public configure(options: LoggerOptions): void {
    if (options.level !== undefined) this.level = options.level;
    if (options.filePath !== undefined) this.filePath = options.filePath;
    if (options.console !== undefined) this.enableConsole = options.console;
    if (options.enableTracing !== undefined) this.enableTracing = options.enableTracing;
    if (options.context !== undefined) this.globalContext = { ...this.globalContext, ...options.context };
    if (options.timestampFormat !== undefined) this.timestampFormat = options.timestampFormat;
  }
  
  /**
   * Start a trace section for detailed performance tracking
   */
  public startTrace(name: string, initialData: Record<string, any> = {}): string {
    if (!this.enableTracing) return '';
    
    const traceId = uuidv4();
    this.activeTraces.set(traceId, {
      startTime: performance.now(),
      data: { name, ...initialData }
    });
    
    this.debug(`Started trace: ${name}`, { traceId });
    return traceId;
  }
  
  /**
   * End a trace section and log duration
   */
  public endTrace(traceId: string, additionalData: Record<string, any> = {}): void {
    if (!this.enableTracing || !traceId) return;
    
    const trace = this.activeTraces.get(traceId);
    if (!trace) {
      this.warn(`Cannot end trace: trace ID ${traceId} not found`);
      return;
    }
    
    const duration = performance.now() - trace.startTime;
    const { name } = trace.data;
    
    this.debug(`Ended trace: ${name}`, {
      traceId,
      durationMs: duration.toFixed(2),
      ...trace.data,
      ...additionalData
    });
    
    this.activeTraces.delete(traceId);
  }
  
  /**
   * Add data to an active trace
   */
  public addTraceData(traceId: string, data: Record<string, any>): void {
    if (!this.enableTracing || !traceId) return;
    
    const trace = this.activeTraces.get(traceId);
    if (trace) {
      trace.data = { ...trace.data, ...data };
    }
  }
  
  /**
   * Create a child logger with inherited settings but separate context
   */
  public createChildLogger(context: Record<string, any>): Logger {
    const childLogger = new Logger({
      level: this.level,
      filePath: this.filePath,
      console: this.enableConsole,
      enableTracing: this.enableTracing,
      context: { ...this.globalContext, ...context },
      timestampFormat: this.timestampFormat
    });
    return childLogger;
  }
  
  /**
   * Format a timestamp based on configured format
   */
  private formatTimestamp(): string {
    const now = new Date();
    
    switch (this.timestampFormat) {
      case 'ISO':
        return now.toISOString();
      case 'locale':
        return now.toLocaleString();
      case 'epoch':
        return now.getTime().toString();
      case 'simple':
        return `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}.${now.getMilliseconds()}`;
      default:
        return now.toISOString();
    }
  }
  
  /**
   * Check if a log message should be output based on current log level
   */
  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }
  
  /**
   * Convert log level to string representation
   */
  private logLevelToString(level: LogLevel): string {
    switch (level) {
      case LogLevel.TRACE: return 'TRACE';
      case LogLevel.DEBUG: return 'DEBUG';
      case LogLevel.INFO: return 'INFO';
      case LogLevel.WARN: return 'WARN';
      case LogLevel.ERROR: return 'ERROR';
      case LogLevel.FATAL: return 'FATAL';
      default: return 'UNKNOWN';
    }
  }
  
  /**
   * Write a log entry to configured outputs
   */
  private writeLogEntry(entry: LogEntry): void {
    // Add as structured JSON to log file if configured
    if (this.filePath) {
      try {
        fs.appendFileSync(
          this.filePath, 
          JSON.stringify(entry) + '\n'
        );
      } catch (err) {
        // If file logging fails, at least try to log to console
        console.error('Failed to write to log file:', err);
      }
    }
    
    // Write to console if enabled
    if (this.enableConsole) {
      const timestamp = entry.timestamp;
      const level = entry.levelName.padEnd(5);
      const message = entry.message;
      const context = entry.context ? `- ${JSON.stringify(entry.context)}` : '';
      const traceInfo = entry.traceId ? `[Trace: ${entry.traceId}]` : '';
      const taskInfo = entry.taskId ? `[Task: ${entry.taskId}]` : '';
      
      let consoleMethod;
      switch (entry.level) {
        case LogLevel.TRACE:
        case LogLevel.DEBUG:
          consoleMethod = console.debug;
          break;
        case LogLevel.INFO:
          consoleMethod = console.info;
          break;
        case LogLevel.WARN:
          consoleMethod = console.warn;
          break;
        case LogLevel.ERROR:
        case LogLevel.FATAL:
          consoleMethod = console.error;
          break;
        default:
          consoleMethod = console.log;
      }
      
      consoleMethod(`${timestamp} [${level}] ${taskInfo}${traceInfo} ${message} ${context}`);
      
      // If there's a stack trace, log it with indentation
      if (entry.stackTrace) {
        console.debug(entry.stackTrace.split('\n').map(line => `  ${line}`).join('\n'));
      }
    }
  }
  
  /**
   * Create a log entry
   */
  private createLogEntry(
    level: LogLevel, 
    message: string, 
    context?: Record<string, any>,
    traceId?: string,
    includeStack?: boolean
  ): LogEntry {
    // Capture stack trace if requested
    let stackTrace;
    if (includeStack) {
      const err = new Error();
      stackTrace = err.stack?.split('\n').slice(3).join('\n'); // Remove this function from stack
    }
    
    return {
      timestamp: this.formatTimestamp(),
      level,
      levelName: this.logLevelToString(level),
      message,
      context: context ? { ...this.globalContext, ...context } : this.globalContext,
      traceId,
      source: 'runix-engine',
      taskId: process.pid?.toString(),
      stackTrace
    };
  }
  
  /**
   * Log a message at specified level
   */
  public log(level: LogLevel, message: string, context?: Record<string, any>, traceId?: string): void {
    if (!this.shouldLog(level)) return;
    
    const entry = this.createLogEntry(level, message, context, traceId);
    this.writeLogEntry(entry);
  }
  
  // Convenience logging methods
  
  public trace(message: string, context?: Record<string, any>, traceId?: string): void {
    this.log(LogLevel.TRACE, message, context, traceId);
  }
  
  public debug(message: string, context?: Record<string, any>, traceId?: string): void {
    this.log(LogLevel.DEBUG, message, context, traceId);
  }
  
  public info(message: string, context?: Record<string, any>, traceId?: string): void {
    this.log(LogLevel.INFO, message, context, traceId);
  }
  
  public warn(message: string, context?: Record<string, any>, traceId?: string): void {
    this.log(LogLevel.WARN, message, context, traceId);
  }
  
  public error(message: string, context?: Record<string, any>, traceId?: string, includeStack = true): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    const entry = this.createLogEntry(LogLevel.ERROR, message, context, traceId, includeStack);
    this.writeLogEntry(entry);
  }
  
  public fatal(message: string, context?: Record<string, any>, traceId?: string): void {
    if (!this.shouldLog(LogLevel.FATAL)) return;
    
    const entry = this.createLogEntry(LogLevel.FATAL, message, context, traceId, true);
    this.writeLogEntry(entry);
  }

  /**
   * Parse log level from string
   */
  private parseLogLevel(levelStr?: string): LogLevel | undefined {
    if (!levelStr) return undefined;
    
    switch (levelStr.toUpperCase()) {
      case 'TRACE': return LogLevel.TRACE;
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      case 'FATAL': return LogLevel.FATAL;
      case 'SILENT': return LogLevel.SILENT;
      default: return undefined;
    }
  }
}
