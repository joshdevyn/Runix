export interface ErrorContext {
  operation?: string;
  driverId?: string;
  stepText?: string;
  featurePath?: string;
  traceId?: string;
  timestamp?: string;
  stackTrace?: string;
  port?: number;
  additionalData?: Record<string, any>;
}

export class RunixError extends Error {
  public readonly context: ErrorContext;
  public readonly originalError?: Error;
  public readonly errorCode: string;

  constructor(message: string, errorCode: string, context: ErrorContext = {}, originalError?: Error) {
    super(message);
    this.name = this.constructor.name;
    this.errorCode = errorCode;
    this.context = {
      ...context,
      timestamp: new Date().toISOString(),
      stackTrace: this.stack
    };
    this.originalError = originalError;

    // Maintain proper error chain
    if (originalError && originalError.stack) {
      this.stack = `${this.stack}\nCaused by: ${originalError.stack}`;
    }
  }

  public toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      errorCode: this.errorCode,
      context: this.context,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack
      } : undefined
    };
  }
}

export class DriverError extends RunixError {
  constructor(message: string, driverId: string, context: ErrorContext = {}, originalError?: Error) {
    super(message, 'DRIVER_ERROR', { ...context, driverId }, originalError);
  }
}

export class DriverStartupError extends DriverError {
  constructor(driverId: string, context: ErrorContext = {}, originalError?: Error) {
    super(`Failed to start driver: ${driverId}`, driverId, { ...context, operation: 'driver_startup' }, originalError);
  }
}

export class DriverCommunicationError extends DriverError {
  constructor(driverId: string, operation: string, context: ErrorContext = {}, originalError?: Error) {
    super(`Driver communication failed: ${operation}`, driverId, { ...context, operation }, originalError);
  }
}

export class StepExecutionError extends RunixError {
  constructor(stepText: string, context: ErrorContext = {}, originalError?: Error) {
    super(`Step execution failed: ${stepText}`, 'STEP_EXECUTION_ERROR', { ...context, stepText, operation: 'step_execution' }, originalError);
  }
}

export class FeatureParsingError extends RunixError {
  constructor(featurePath: string, context: ErrorContext = {}, originalError?: Error) {
    super(`Failed to parse feature file: ${featurePath}`, 'FEATURE_PARSING_ERROR', { ...context, featurePath, operation: 'feature_parsing' }, originalError);
  }
}

export class ConfigurationError extends RunixError {
  constructor(message: string, context: ErrorContext = {}, originalError?: Error) {
    super(message, 'CONFIGURATION_ERROR', { ...context, operation: 'configuration' }, originalError);
  }
}
