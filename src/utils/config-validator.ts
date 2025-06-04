import * as fs from 'fs';
import * as path from 'path';

/**
 * Validates Runix configuration
 */
export class ConfigValidator {
  /**
   * Validate environment setup
   */
  static validateEnvironment(): string[] {
    const issues: string[] = [];
    
    // Check for critical directories
    const criticalDirs = ['drivers', 'logs', 'reports'];
    for (const dir of criticalDirs) {
      if (!fs.existsSync(dir)) {
        issues.push(`Missing directory: ${dir}`);
      }
    }
    
    // Check for .env file
    if (!fs.existsSync('.env') && !process.env.RUNIX_DRIVER) {
      issues.push('No .env file found and RUNIX_DRIVER environment variable not set');
    }
    
    // Check for required binaries
    try {
      const nodeVersion = process.version;
      if (!nodeVersion.startsWith('v14') && !nodeVersion.startsWith('v16') && !nodeVersion.startsWith('v18')) {
        issues.push(`Unsupported Node.js version: ${nodeVersion}. Please use Node.js 14, 16, or 18.`);
      }
    } catch (error) {
      issues.push('Failed to check Node.js version');
    }
    
    return issues;
  }
  
  /**
   * Validate driver setup with path sanitization
   */
  static validateDrivers(): string[] {
    const issues: string[] = [];
    const driversDir = path.resolve(process.cwd(), 'drivers'); // Resolve to absolute path
    
    if (!fs.existsSync(driversDir)) {
      issues.push(`Drivers directory not found: ${driversDir}`);
      return issues;
    }
    
    try {
      const driverDirs = fs.readdirSync(driversDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .filter(name => /^[a-zA-Z0-9_-]+$/.test(name)); // Sanitize directory names
        
      if (driverDirs.length === 0) {
        issues.push('No valid drivers found in drivers directory');
      }
      
      for (const driverName of driverDirs) {
        const driverJsonPath = path.join(driversDir, driverName, 'driver.json');
        if (!fs.existsSync(driverJsonPath)) {
          issues.push(`Driver ${driverName} is missing driver.json`);
        } else {
          // Validate driver.json structure
          try {
            const driverConfig = JSON.parse(fs.readFileSync(driverJsonPath, 'utf8'));
            if (!driverConfig.name || !driverConfig.executable) {
              issues.push(`Driver ${driverName} has invalid driver.json structure`);
            }
          } catch (parseError) {
            issues.push(`Driver ${driverName} has malformed driver.json`);
          }
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      issues.push(`Error checking drivers: ${errorMessage}`);
    }
    
    return issues;
  }
  
  /**
   * Run all validations
   */
  static validate(): {valid: boolean, issues: string[]} {
    const envIssues = this.validateEnvironment();
    const driverIssues = this.validateDrivers();
    
    const allIssues = [...envIssues, ...driverIssues];
    return {
      valid: allIssues.length === 0,
      issues: allIssues
    };
  }
}
