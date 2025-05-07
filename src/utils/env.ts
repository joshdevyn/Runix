import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Environment configuration for Runix
 */
export class Environment {
  private static instance: Environment;
  private envVariables: Map<string, string> = new Map();
  private envFilePath: string | null = null;
  
  private constructor() {
    // Load environment variables from .env files
    this.loadEnvFiles();
    
    // Process variable templates like ${TIMESTAMP}
    this.processTemplateVariables();
  }
  
  /**
   * Get the Environment singleton instance
   */
  public static getInstance(): Environment {
    if (!Environment.instance) {
      Environment.instance = new Environment();
    }
    return Environment.instance;
  }
  
  /**
   * Load environment variables from .env files in different locations
   */
  private loadEnvFiles(): void {
    // Try loading from current directory first
    const envPaths = [
      path.join(process.cwd(), '.env'),
      path.join(process.cwd(), '.env.local'),
      path.join(process.cwd(), '.env.' + (process.env.NODE_ENV || 'development')),
    ];
    
    // Add user home directory if available
    if (process.env.HOME || process.env.USERPROFILE) {
      const homedir = process.env.HOME || process.env.USERPROFILE;
      if (homedir) {
        envPaths.push(path.join(homedir, '.runix.env'));
      }
    }
    
    // Try loading from executable directory if running from binary
    if (process.execPath && !process.execPath.includes('node')) {
      const execDir = path.dirname(process.execPath);
      envPaths.push(path.join(execDir, '.env'));
    }
    
    // Load the first .env file found
    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        const result = dotenv.config({ path: envPath });
        if (!result.error) {
          this.envFilePath = envPath;
          console.log(`Loaded environment from ${envPath}`);
          break;
        }
      }
    }
    
    // Load all environment variables into our map
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        this.envVariables.set(key, value);
      }
    }
  }
  
  /**
   * Process any template variables in the environment values
   * Supports: ${TIMESTAMP}, ${UUID}, ${ENV:name}
   */
  private processTemplateVariables(): void {
    for (const [key, value] of this.envVariables.entries()) {
      if (typeof value === 'string' && value.includes('${')) {
        // Process timestamp placeholders
        let processedValue = value.replace(/\${TIMESTAMP}/g, Date.now().toString());
        
        // Process date placeholders
        processedValue = processedValue.replace(/\${DATE}/g, 
          new Date().toISOString().split('T')[0]);
        
        // Process UUID placeholders if uuid is available
        try {
          if (processedValue.includes('${UUID}')) {
            const { v4: uuidv4 } = require('uuid');
            processedValue = processedValue.replace(/\${UUID}/g, uuidv4());
          }
        } catch (err) {
          // UUID not available, leave as is
        }
        
        // Process references to other environment variables ${ENV:VAR_NAME}
        processedValue = processedValue.replace(/\${ENV:([^}]+)}/g, (match, envName) => {
          const envValue = process.env[envName] || this.envVariables.get(envName);
          return envValue !== undefined ? envValue : match;
        });
        
        // Update the processed value
        this.envVariables.set(key, processedValue);
        process.env[key] = processedValue;
      }
    }
  }
  
  /**
   * Load a specific environment configuration
   * @param envName Environment name (e.g., 'production', 'test', 'development')
   * @returns true if environment was loaded, false otherwise
   */
  public loadEnvironment(envName: string): boolean {
    const envFile = path.join(process.cwd(), `.env.${envName}`);
    
    if (fs.existsSync(envFile)) {
      const result = dotenv.config({ path: envFile, override: true });
      
      if (!result.error) {
        this.envFilePath = envFile;
        console.log(`Loaded environment from ${envFile}`);
        
        // Reload all environment variables into our map
        this.envVariables.clear();
        for (const [key, value] of Object.entries(process.env)) {
          if (value !== undefined) {
            this.envVariables.set(key, value);
          }
        }
        
        // Process template variables
        this.processTemplateVariables();
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Get an environment variable value
   * @param key The environment variable key
   * @param defaultValue Default value to return if the key is not found
   * @returns The value of the environment variable or the default value
   */
  public get(key: string, defaultValue?: string): string | undefined {
    const prefixedKey = `RUNIX_${key.toUpperCase()}`;
    
    // Check for prefixed key first (RUNIX_KEY_NAME)
    if (this.envVariables.has(prefixedKey)) {
      return this.envVariables.get(prefixedKey);
    }
    
    // Then check for regular key
    if (this.envVariables.has(key)) {
      return this.envVariables.get(key);
    }
    
    return defaultValue;
  }
  
  /**
   * Get an environment variable as a number
   * @param key The environment variable key
   * @param defaultValue Default value to return if the key is not found or not a valid number
   * @returns The numeric value or default
   */
  public getNumber(key: string, defaultValue?: number): number | undefined {
    const value = this.get(key);
    if (value === undefined) {
      return defaultValue;
    }
    
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  
  /**
   * Get an environment variable as a boolean
   * @param key The environment variable key
   * @param defaultValue Default value to return if the key is not found
   * @returns The boolean value or default
   */
  public getBoolean(key: string, defaultValue?: boolean): boolean | undefined {
    const value = this.get(key);
    if (value === undefined) {
      return defaultValue;
    }
    
    const lowerValue = value.toLowerCase();
    if (lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes') {
      return true;
    }
    if (lowerValue === 'false' || lowerValue === '0' || lowerValue === 'no') {
      return false;
    }
    
    return defaultValue;
  }
  
  /**
   * Get an environment variable as a JSON object
   * @param key The environment variable key
   * @param defaultValue Default value to return if the key is not found or not valid JSON
   * @returns The parsed object or default
   */
  public getJSON<T = any>(key: string, defaultValue?: T): T | undefined {
    const value = this.get(key);
    if (value === undefined) {
      return defaultValue;
    }
    
    try {
      return JSON.parse(value) as T;
    } catch (err) {
      return defaultValue;
    }
  }
  
  /**
   * Get the path to the loaded .env file, if any
   */
  public getEnvFilePath(): string | null {
    return this.envFilePath;
  }
  
  /**
   * Set an environment variable (memory only, does not modify .env file)
   */
  public set(key: string, value: string): void {
    this.envVariables.set(key, value);
    process.env[key] = value; 
  }
  
  /**
   * Clear all loaded environment variables
   */
  public clear(): void {
    this.envVariables.clear();
    this.envFilePath = null;
  }
}

// Export a singleton instance
export const env = Environment.getInstance();
