import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';

/**
 * Environment configuration for Runix
 */
export class EnvManager {
  private static instance: EnvManager;
  private env: Map<string, string> = new Map();
  private envFilePath?: string;
  private logger = Logger.getInstance();

  private constructor() {
    // Load environment variables from .env files
    this.loadEnvironment();
  }

  /**
   * Get the Environment singleton instance
   */
  public static getInstance(): EnvManager {
    if (!EnvManager.instance) {
      EnvManager.instance = new EnvManager();
    }
    return EnvManager.instance;
  }

  /**
   * Load environment variables from .env files in different locations
   */
  private loadEnvironment(): void {
    // Load from process.env first
    Object.entries(process.env).forEach(([key, value]) => {
      if (value !== undefined) {
        this.env.set(key, value);
      }
    });

    // Try to find and load .env file
    const possiblePaths = [
      path.join(process.cwd(), '.env'),
    ];

    for (const envPath of possiblePaths) {
      if (fs.existsSync(envPath)) {
        this.loadEnvFile(envPath);
        this.envFilePath = envPath;
        break;
      }
    }
  }

  private loadEnvFile(filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').replace(/^["']|["']$/g, '');
            this.env.set(key.trim(), value);
          }
        }
      }

      this.logger.debug(`Loaded environment from ${filePath}`, { envFile: filePath });
    } catch (error) {
      this.logger.warn(`Failed to load environment file ${filePath}`, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Get an environment variable value
   * @param key The environment variable key
   * @param defaultValue Default value to return if the key is not found
   * @returns The value of the environment variable or the default value
   */
  public get(key: string, defaultValue?: string): string | undefined {
    return this.env.get(key) ?? defaultValue;
  }
  
  /**
   * Get an environment variable as a boolean
   * @param key The environment variable key
   * @param defaultValue Default value to return if the key is not found
   * @returns The boolean value or default
   */
  public getBoolean(key: string, defaultValue: boolean = false): boolean {
    const value = this.get(key);
    if (value === undefined) return defaultValue;
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }
  
  /**
   * Get an environment variable as a number
   * @param key The environment variable key
   * @param defaultValue Default value to return if the key is not found or not a valid number
   * @returns The numeric value or default
   */
  public getNumber(key: string, defaultValue?: number): number | undefined {
    const value = this.get(key);
    if (value === undefined) return defaultValue;
    const num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
  }
  
  /**
   * Get the path to the loaded .env file, if any
   */
  public getEnvFilePath(): string | undefined {
    return this.envFilePath;
  }
  
  /**
   * Set an environment variable (memory only, does not modify .env file)
   */
  public set(key: string, value: string): void {
    this.env.set(key, value);
    process.env[key] = value;
  }
  
  /**
   * Check if an environment variable is defined
   */
  public has(key: string): boolean {
    return this.env.has(key);
  }
}

// Export a singleton instance
export const env = EnvManager.getInstance();
