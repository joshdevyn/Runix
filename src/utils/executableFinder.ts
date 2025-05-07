import * as fs from 'fs';
import * as path from 'path';

/**
 * Find an executable file in the given directory or its subdirectories
 * 
 * @param name Name of the executable file to find
 * @param baseDir Base directory to start searching from
 * @returns Full path to the executable if found, undefined otherwise
 */
export function findExecutable(name: string, baseDir: string): string | undefined {
  // Check if the file exists directly in the base directory
  const directPath = path.join(baseDir, name);
  if (fs.existsSync(directPath) && isExecutable(directPath)) {
    return directPath;
  }
  
  // Check in bin directory if it exists (common convention)
  const binPath = path.join(baseDir, 'bin', name);
  if (fs.existsSync(binPath) && isExecutable(binPath)) {
    return binPath;
  }

  // Look in node_modules/.bin for npm-installed drivers
  const nodeModulesBinPath = path.join(baseDir, 'node_modules', '.bin', name);
  if (fs.existsSync(nodeModulesBinPath) && isExecutable(nodeModulesBinPath)) {
    return nodeModulesBinPath;
  }

  // Search in subdirectories (limited depth for performance)
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && 
          entry.name !== 'node_modules' && 
          entry.name !== '.git') {
        const subDir = path.join(baseDir, entry.name);
        const result = findExecutableInDirectory(name, subDir, 2); // Limit depth to 2
        if (result) {
          return result;
        }
      }
    }
  } catch (err) {
    console.error(`Error searching for executable in ${baseDir}:`, err);
  }
  
  return undefined;
}

/**
 * Helper function to search for executable with depth limit
 */
function findExecutableInDirectory(name: string, dir: string, maxDepth: number): string | undefined {
  if (maxDepth <= 0) return undefined;
  
  const filePath = path.join(dir, name);
  if (fs.existsSync(filePath) && isExecutable(filePath)) {
    return filePath;
  }
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && 
          entry.name !== 'node_modules' && 
          entry.name !== '.git') {
        const subDir = path.join(dir, entry.name);
        const result = findExecutableInDirectory(name, subDir, maxDepth - 1);
        if (result) {
          return result;
        }
      }
    }
  } catch (err) {
    // Silently ignore permission errors in subdirectories
  }
  
  return undefined;
}

/**
 * Check if a file is executable
 */
function isExecutable(filePath: string): boolean {
  try {
    const stats = fs.statSync(filePath);
    
    // On Windows, we just check if file exists
    if (process.platform === 'win32') {
      return stats.isFile();
    }
    
    // On Unix, check executable permissions
    return (
      stats.isFile() && 
      ((stats.mode & fs.constants.S_IXUSR) !== 0 || // Owner can execute
       (stats.mode & fs.constants.S_IXGRP) !== 0 || // Group can execute
       (stats.mode & fs.constants.S_IXOTH) !== 0)   // Others can execute
    );
  } catch (err) {
    return false;
  }
}
