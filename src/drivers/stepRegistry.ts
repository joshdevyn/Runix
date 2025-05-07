import { StepDefinition } from './driverRegistry';
import { DriverIntrospectionService } from '../lsp/driverIntrospection';

/**
 * Central registry for mapping steps to their respective drivers
 */
export class StepRegistry {
  private static instance: StepRegistry;
  private stepMap: Map<string, { driverId: string, step: StepDefinition }> = new Map();
  private patternCache: Map<string, RegExp> = new Map(); // Cache compiled regexes for performance
  
  private constructor() {
    // Private constructor for singleton pattern
  }
  
  public static getInstance(): StepRegistry {
    if (!StepRegistry.instance) {
      StepRegistry.instance = new StepRegistry();
    }
    return StepRegistry.instance;
  }
  
  /**
   * Initialize the registry by loading all step definitions from all drivers
   */
  public async initialize(): Promise<void> {
    const introspectionService = DriverIntrospectionService.getInstance();
    const allSteps = await introspectionService.getAllStepDefinitions();
    
    console.log(`Loaded ${allSteps.length} step definitions from introspection service`);
    
    // Clear existing mappings
    this.stepMap.clear();
    this.patternCache.clear();
    
    // Register each step with its associated driver
    for (const driver of introspectionService.getDriversWithSteps()) {
      console.log(`Registering ${driver.steps.length} steps from driver ${driver.name}`);
      for (const step of driver.steps) {
        this.registerStep(step, driver.id);
      }
    }
  }
  
  /**
   * Register a step definition with its associated driver
   */
  public registerStep(step: StepDefinition, driverId: string): void {
    // Use step pattern as the key for the mapping
    this.stepMap.set(step.pattern, { driverId, step });
    
    // Pre-compile regex for this pattern
    this.patternCache.set(step.pattern, this.convertPatternToRegex(step.pattern));
    console.log(`Registered step pattern: "${step.pattern}" for driver: ${driverId}`);
  }

  /**
   * Register multiple step definitions for a driver
   */
  public registerSteps(driverId: string, steps: StepDefinition[]): void {
    // Correct parameter order: step first, then driverId
    steps.forEach(step => this.registerStep(step, driverId));
  }
  
  /**
   * Find the driver and step definition that matches a given step text
   */
  public findMatchingStep(stepText: string): { driverId: string, step: StepDefinition } | undefined {
    // Look through all registered steps to find a match
    for (const [pattern, value] of this.stepMap.entries()) {
      const regex = this.patternCache.get(pattern) || this.convertPatternToRegex(pattern);
      
      console.log(`Testing step: "${stepText}" against pattern: "${pattern}"`);
      if (regex.test(stepText)) {
        console.log(`Match found for step: "${stepText}" with pattern: "${pattern}"`);
        return value;
      }
    }
    
    console.log(`No matching step found for: "${stepText}"`);
    return undefined;
  }
  
  /**
   * Convert a step pattern to a regex for matching
   */
  private convertPatternToRegex(pattern: string): RegExp {
    // Enhanced conversion logic for robust matching
    let regexPattern = pattern
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\./g, '\\.')
      .replace(/\?/g, '\\?')
      .replace(/\+/g, '\\+')
      .replace(/\*/g, '\\*')
      .replace(/\$/g, '\\$')
      .replace(/\^/g, '\\^');

    // Replace parameter placeholders with regex patterns
    // This matches any content within parentheses
    regexPattern = regexPattern.replace(/\\\((.*?)\\\)/g, '(.+?)');

    console.log(`Converted pattern: "${pattern}" to regex: "${regexPattern}"`);
    return new RegExp(`^${regexPattern}$`);
  }
}
