import * as fs from 'fs';
import * as path from 'path';

/**
 * Find an executable in a given directory
 */
export function findExecutable(driverPath: string, executableName?: string): string | undefined {
  if (!fs.existsSync(driverPath)) {
    return undefined;
  }

  // If specific executable is provided, check for it
  if (executableName) {
    const executablePath = path.join(driverPath, executableName);
    if (fs.existsSync(executablePath)) {
      return executableName; // Return relative path
    }
  }

  // Common executable patterns to search for
  const patterns = [
    'index.js',
    'driver.js',
    'main.js',
    'server.js',
    '*.exe',
    'driver.exe',
    'index.exe'
  ];

  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      // Handle wildcard patterns
      const extension = pattern.replace('*', '');
      const files = fs.readdirSync(driverPath).filter(file => file.endsWith(extension));
      if (files.length > 0) {
        return files[0];
      }
    } else {
      const fullPath = path.join(driverPath, pattern);
      if (fs.existsSync(fullPath)) {
        return pattern;
      }
    }
  }

  return undefined;
}

/**
 * Check if a path is executable
 */
export function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    const stats = fs.statSync(filePath);
    
    // On Windows, check if it's an .exe file or has executable extension
    if (process.platform === 'win32') {
      return path.extname(filePath).toLowerCase() === '.exe' || 
             path.extname(filePath).toLowerCase() === '.bat' ||
             path.extname(filePath).toLowerCase() === '.cmd';
    }
    
    // On Unix-like systems, check if it has execute permissions
    return (stats.mode & parseInt('111', 8)) !== 0;
  } catch {
    return false;
  }
}
