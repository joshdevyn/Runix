export abstract class RunixError extends Error {
  abstract readonly type: string;
  readonly context: any;
  readonly cause?: Error;

  constructor(message: string, context: any = {}, cause?: Error) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    this.cause = cause;
  }
}

export abstract class DriverError extends RunixError {
  abstract readonly type: string;
  readonly driverId: string;

  constructor(message: string, driverId: string, context: any = {}, cause?: Error) {
    super(message, context, cause);
    this.driverId = driverId;
  }
}

export class DriverStartupError extends DriverError {
  readonly type = 'DRIVER_STARTUP_ERROR' as const;

  constructor(driverId: string, context: any = {}, cause?: Error) {
    super(`Failed to start driver: ${driverId}`, driverId, context, cause);
  }
}

export class DriverCommunicationError extends DriverError {
  readonly type = 'DRIVER_COMMUNICATION_ERROR' as const;

  constructor(driverId: string, operation: string, context: any = {}, cause?: Error) {
    super(`Driver communication failed for ${driverId} during ${operation}`, driverId, context, cause);
  }
}

export class StepExecutionError extends RunixError {
  readonly type = 'STEP_EXECUTION_ERROR';

  constructor(message: string, context: any = {}, cause?: Error) {
    super(message, context, cause);
  }
}

export class ConfigurationError extends RunixError {
  readonly type = 'CONFIGURATION_ERROR';

  constructor(message: string, context: any = {}, cause?: Error) {
    super(message, context, cause);
  }
}

export class FeatureParsingError extends RunixError {
  readonly type = 'FEATURE_PARSING_ERROR';

  constructor(message: string, context: any = {}, cause?: Error) {
    super(message, context, cause);
  }
}
