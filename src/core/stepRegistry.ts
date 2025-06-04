import { Logger } from '../utils/logger';
import { StepDefinition } from '../drivers/driverRegistry';

export interface StepMatch {
  driverId: string;
  step: StepDefinition;
}

/**
 * Registry for managing step definitions from drivers
 */
export class StepRegistry {
  private static instance: StepRegistry;
  private steps: Map<string, Map<string, StepDefinition>> = new Map();
  private log: Logger;
  
  private constructor() {
    this.log = Logger.getInstance().createChildLogger({ 
      component: 'StepRegistry'
    });
  }
  
  public static getInstance(): StepRegistry {
    if (!StepRegistry.instance) {
      StepRegistry.instance = new StepRegistry();
    }
    return StepRegistry.instance;
  }
  
  /**
   * Initialize the step registry
   */
  public async initialize(): Promise<void> {
    this.log.debug('Step registry initialized');
  }
  
  /**
   * Register steps for a driver
   */
  public registerSteps(driverId: string, steps: StepDefinition[]): void {
    if (!this.steps.has(driverId)) {
      this.steps.set(driverId, new Map());
    }
    
    const driverSteps = this.steps.get(driverId)!;
    
    for (const step of steps) {
      driverSteps.set(step.id, step);
      this.log.debug(`Registered step: ${step.pattern} for driver ${driverId}`);
    }
  }
  
  /**
   * Find a matching step for the given step text
   */
  public findMatchingStep(stepText: string): StepMatch | null {
    for (const [driverId, driverSteps] of this.steps.entries()) {
      for (const [stepId, step] of driverSteps.entries()) {
        if (this.matchesPattern(stepText, step.pattern)) {
          return { driverId, step };
        }
      }
    }
    
    this.log.warn(`No matching step found for: "${stepText}"`);
    return null;
  }
  
  /**
   * Check if step text matches a pattern
   */
  private matchesPattern(stepText: string, pattern: string): boolean {
    try {
      // If pattern already contains regex syntax, use it directly
      let regexPattern = pattern;
      
      // If pattern uses simple parentheses notation, convert to regex
      if (!pattern.includes('\\') && pattern.includes('(') && pattern.includes(')')) {
        regexPattern = pattern.replace(/\(([^)]+)\)/g, '(.+?)');
      }
      
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      const matches = regex.test(stepText);
      
      this.log.trace(`Pattern matching: "${stepText}" against "${pattern}"`, {
        originalPattern: pattern,
        regexPattern,
        matches
      });
      
      return matches;
    } catch (error) {
      this.log.error(`Error in pattern matching for pattern: ${pattern}`, { stepText }, error);
      return false;
    }
  }
  
  /**
   * Get all registered steps for a driver
   */
  public getDriverSteps(driverId: string): StepDefinition[] {
    const driverSteps = this.steps.get(driverId);
    if (!driverSteps) {
      return [];
    }
    
    return Array.from(driverSteps.values());
  }
  
  /**
   * Get all registered drivers
   */
  public getRegisteredDrivers(): string[] {
    return Array.from(this.steps.keys());
  }
  
  /**
   * Clear all steps for a driver
   */
  public clearDriverSteps(driverId: string): void {
    this.steps.delete(driverId);
    this.log.debug(`Cleared steps for driver: ${driverId}`);
  }
  
  /**
   * Clear all steps
   */
  public clearAllSteps(): void {
    this.steps.clear();
    this.log.debug('Cleared all steps');
  }
}