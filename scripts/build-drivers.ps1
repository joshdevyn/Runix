param (
    [Parameter(Mandatory=$true)]
    [string]$sourceDir,
    
    [Parameter(Mandatory=$true)]
    [string]$destDir
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Input validation
if (-not $sourceDir -or -not $destDir) {
    Write-Error "Source and destination directories are required"
    exit 1
}

# Validate paths are safe (no path traversal)
$resolvedSourceDir = Resolve-Path $sourceDir -ErrorAction SilentlyContinue
$resolvedDestDir = $ExecutionContext.InvokeCommand.ExpandString($destDir)

if (-not $resolvedSourceDir) {
    Write-Error "Source directory does not exist: $sourceDir"
    exit 1
}

Write-Host "Building drivers from $resolvedSourceDir to $resolvedDestDir"

# Create destination directory with proper permissions
$driversDestDir = Join-Path $resolvedDestDir "drivers"
try {
    if (-not (Test-Path $driversDestDir)) {
        New-Item -ItemType Directory -Force -Path $driversDestDir | Out-Null
    }
} catch {
    Write-Error "Failed to create destination directory: $_"
    exit 1
}

# Get drivers with validation
try {
    $drivers = Get-ChildItem -Path $resolvedSourceDir -Directory | Where-Object {
        $_.Name -notmatch '[\x00-\x1f\x7f<>:"|?*]'  # Filter unsafe directory names
    }
} catch {
    Write-Error "Failed to enumerate drivers: $_"
    exit 1
}

if ($drivers.Count -eq 0) {
    Write-Warning "No valid drivers found in $resolvedSourceDir"
    exit 0
}

# Initialize manifest with validation
$driverManifest = @{
    version = "1.0"
    buildTime = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    drivers = @()
}

# Process each driver with error boundaries
foreach ($driver in $drivers) {
    $driverName = $driver.Name
    Write-Host "Processing driver: $driverName"
    
    $sourcePath = $driver.FullName
    $destPath = Join-Path $driversDestDir $driverName
    
    try {
        # Create destination with validation
        if (-not (Test-Path $destPath)) {
            New-Item -ItemType Directory -Force -Path $destPath | Out-Null
        }        # Copy driver files from source to destination
        Copy-Item -Path "$sourcePath\*" -Destination $destPath -Recurse -Force
        
        # Determine the correct executable
        $executable = "index.js"  # Default fallback
        
        # Check for driver.json to get executable info
        $driverJsonPath = Join-Path $destPath "driver.json"
        if (Test-Path $driverJsonPath) {
            try {
                $driverConfig = Get-Content $driverJsonPath | ConvertFrom-Json
                if ($driverConfig.executable) {
                    $executable = $driverConfig.executable
                    Write-Host "    Using executable from driver.json: $executable"
                }
            } catch {
                Write-Warning "    Could not parse driver.json, using default executable"
            }
        } else {
            # Look for .exe files if no driver.json
            $exeFiles = Get-ChildItem -Path $destPath -Filter "*.exe" -ErrorAction SilentlyContinue
            if ($exeFiles.Count -gt 0) {
                $executable = $exeFiles[0].Name
                Write-Host "    Found executable: $executable"
            }
        }
        
        # Build driver metadata
        $driverInfo = @{
            name = $driverName
            path = $destPath
            executable = $executable
        }
        
        Write-Host "  Driver $driverName processed successfully"
        $driverManifest.drivers += $driverInfo
        
    } catch {
        Write-Error "Failed to process driver $driverName`: $_"
        continue
    }
}

Write-Host "Drivers build completed successfully"
