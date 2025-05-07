param (
    [string]$sourceDir = "drivers",
    [string]$destDir = "bin"
)

$ErrorActionPreference = "Stop"
Write-Host "Building drivers from $sourceDir to $destDir"

# Create destination directory if it doesn't exist
$driversDestDir = Join-Path $destDir "drivers"
if (-not (Test-Path $driversDestDir)) {
    New-Item -ItemType Directory -Path $driversDestDir | Out-Null
}

# Get all drivers
$drivers = Get-ChildItem -Path $sourceDir -Directory

# Initialize an array to hold driver metadata
$driverManifest = @{
    drivers = @()
}

# Process each driver
foreach ($driver in $drivers) {
    $driverName = $driver.Name
    Write-Host "Processing driver: $driverName"
    
    $sourcePath = $driver.FullName
    $destPath = Join-Path $driversDestDir $driverName
    
    # Create destination directory
    if (-not (Test-Path $destPath)) {
        New-Item -ItemType Directory -Path $destPath | Out-Null
    }
    
    # Copy all files
    Copy-Item -Path "$sourcePath\*" -Destination $destPath -Recurse -Force
    
    # Default driver executable name based on driver name
    $executableName = "$driverName.exe"
    $executableRelPath = $executableName
    
    # Look for package.json to build node drivers
    $packageJsonPath = Join-Path $sourcePath "package.json"
    if (Test-Path $packageJsonPath) {
        Write-Host "  Found package.json, compiling NodeJS driver"
        
        # Install dependencies and compile
        Push-Location $destPath
        try {
            # Install production dependencies
            npm install --production --no-package-lock | Out-Null
            
            # Create a path for the driver.js file that will be our main entry point for packaging
            $driverJsPath = Join-Path $destPath "driver.js"
            
            # Create a simple wrapper that loads index.js
            @"
const path = require('path');
const port = process.env.RUNIX_DRIVER_PORT || process.argv[2]?.replace('--port=', '') || process.argv[3] || 8000;

// Set port in environment
process.env.RUNIX_DRIVER_PORT = port;

// Load the actual driver implementation
require('./index.js');
"@ | Set-Content -Path $driverJsPath
            
            # Create a temporary package.json for pkg if it doesn't exist
            $packageJsonForPkg = Join-Path $destPath "package.json"
            if (-not (Test-Path $packageJsonForPkg)) {
                @"
{
  "name": "${driverName}",
  "version": "1.0.0",
  "bin": "driver.js",
  "pkg": {
    "assets": ["**/*", "!node_modules/pkg/**/*"],
    "targets": ["node18-win-x64"]
  }
}
"@ | Set-Content -Path $packageJsonForPkg
            } else {
                # Read existing package.json
                $packageJson = Get-Content $packageJsonForPkg | ConvertFrom-Json
                
                # Add pkg configuration if it doesn't exist
                if (-not $packageJson.pkg) {
                    $packageJson | Add-Member -NotePropertyName "pkg" -NotePropertyValue @{
                        assets = @("**/*", "!node_modules/pkg/**/*")
                        targets = @("node18-win-x64")
                    }
                    
                    # Write back to file
                    $packageJson | ConvertTo-Json -Depth 4 | Set-Content -Path $packageJsonForPkg
                }
                
                # Ensure bin entry points to driver.js
                if (-not $packageJson.bin) {
                    $packageJson | Add-Member -NotePropertyName "bin" -NotePropertyValue "driver.js"
                    $packageJson | ConvertTo-Json -Depth 4 | Set-Content -Path $packageJsonForPkg
                }
            }
            
            # Compile with pkg
            $pkgPath = "node_modules\.bin\pkg"
            if (Test-Path $pkgPath) {
                Write-Host "  Creating standalone executable with pkg"
                & $pkgPath . --output $executableName | Out-Null
                if (Test-Path $executableName) {
                    Write-Host "  Successfully created $executableName"
                } else {
                    Write-Host "  Failed to create executable. Using Node.js fallback." -ForegroundColor Yellow
                    $executableRelPath = "driver.js"
                }
            } else {
                # Try global pkg
                try {
                    & npx pkg . --output $executableName | Out-Null
                    if (Test-Path $executableName) {
                        Write-Host "  Successfully created $executableName using npx pkg"
                    } else {
                        Write-Host "  Failed to create executable. Using Node.js fallback." -ForegroundColor Yellow
                        $executableRelPath = "driver.js"
                    }
                } catch {
                    Write-Host "  pkg not found. Using Node.js fallback." -ForegroundColor Yellow
                    $executableRelPath = "driver.js"
                }
            }
        }
        catch {
            Write-Host "  Error during driver compilation: $_" -ForegroundColor Red
            $executableRelPath = "index.js"  # Fallback to index.js
        }
        finally {
            Pop-Location
        }
    } else {
        # No package.json found, just use index.js
        Write-Host "  No package.json found, using direct JS execution"
        $executableRelPath = "index.js"
    }
    
    # Add driver to manifest with appropriate executable
    $driverInfo = @{
        name = $driverName
        path = $destPath
        executable = $executableRelPath
        transport = "websocket"
    }
    
    # Check for driver.json to get metadata
    $driverJsonPath = Join-Path $destPath "driver.json"
    if (Test-Path $driverJsonPath) {
        try {
            $driverConfig = Get-Content $driverJsonPath | ConvertFrom-Json
            # Update name from driver.json if available
            if ($driverConfig.name) { $driverInfo.name = $driverConfig.name }
            # Don't overwrite our executable path
            # if ($driverConfig.executable) { $driverInfo.executable = $driverConfig.executable }
            if ($driverConfig.transport) { $driverInfo.transport = $driverConfig.transport }
            if ($driverConfig.protocol) { $driverInfo.protocol = $driverConfig.protocol }
        }
        catch {
            Write-Host "  Error parsing driver.json: $_" -ForegroundColor Yellow
        }
    }
    
    # Always use our compiled executable
    $driverInfo.executable = $executableRelPath
    
    $driverManifest.drivers += $driverInfo
    
    Write-Host "  Processed $driverName driver files to $destPath"
}

# Save driver manifest
$manifestPath = Join-Path $destDir "driver-manifest.json"
$driverManifest | ConvertTo-Json -Depth 4 | Set-Content -Path $manifestPath
Write-Host "Created driver manifest at $manifestPath"

Write-Host "Driver build completed successfully"
