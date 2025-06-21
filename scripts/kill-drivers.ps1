# scripts/kill-drivers.ps1
param([string]$BinDir = 'bin')

Write-Host '⚠️ Killing Runix driver processes...' -ForegroundColor Red

# Kill all runix-related processes first
Get-Process -Name "runix*" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "*Driver*" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Node.js drivers
Get-Process -Name node -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*driver*' -or $_.CommandLine -like '*runix*' } |
  Stop-Process -Force -ErrorAction SilentlyContinue

# Compiled executables - check if directories exist first
if (Test-Path "$BinDir\drivers") {
  Get-ChildItem "$BinDir\drivers\*.exe" -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Name $_.BaseName -Force -ErrorAction SilentlyContinue }
}

if (Test-Path "$BinDir") {
  Get-ChildItem "$BinDir\*.exe" -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Name $_.BaseName -Force -ErrorAction SilentlyContinue }
}

if (Test-Path "drivers") {
  Get-ChildItem "drivers\*.exe" -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Name $_.BaseName -Force -ErrorAction SilentlyContinue }
}

# Ports 9000–9999
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -ge 9000 -and $_.LocalPort -le 9999 } |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

# Wait a moment for handles to release
Start-Sleep -Milliseconds 500

# Force garbage collection to release any lingering file handles
[System.GC]::Collect()
[System.GC]::WaitForPendingFinalizers()

# Additional cleanup for stubborn file locks
$directoriesToClean = @("$BinDir", "drivers")
foreach ($dir in $directoriesToClean) {
    if (Test-Path $dir) {
        # Find all .exe files in driver directories
        $exeFiles = Get-ChildItem -Path $dir -Recurse -Filter "*.exe" -ErrorAction SilentlyContinue
        
        foreach ($file in $exeFiles) {
            try {
                # Try to release file handles using handle.exe if available
                try {
                    $handleOutput = & handle.exe $file.FullName 2>$null
                    if ($handleOutput) {
                        $handleOutput | ForEach-Object {
                            if ($_ -match "pid: (\d+)") {
                                Stop-Process -Id $matches[1] -Force -ErrorAction SilentlyContinue
                                Write-Host "🔓 Killed process $($matches[1]) holding $($file.Name)" -ForegroundColor Cyan
                            }
                        }
                    }
                } catch {
                    # handle.exe not available, continue
                }
                
                # Try multiple methods to unlock the file
                $attempts = 0
                $maxAttempts = 3
                $removed = $false
                
                while ($attempts -lt $maxAttempts -and -not $removed) {
                    try {
                        # Method 1: Direct removal
                        Remove-Item $file.FullName -Force -ErrorAction Stop
                        Write-Host "✅ Removed locked file: $($file.FullName)" -ForegroundColor Yellow
                        $removed = $true
                    } catch {
                        $attempts++
                        if ($attempts -lt $maxAttempts) {
                            # Method 2: Try to take ownership and then delete
                            try {
                                takeown /f $file.FullName 2>$null | Out-Null
                                icacls $file.FullName /grant "$($env:USERNAME):F" 2>$null | Out-Null
                                Start-Sleep -Milliseconds 200
                            } catch {
                                # Continue to next attempt
                            }
                        } else {
                            Write-Host "⚠️ Could not remove after $maxAttempts attempts: $($file.FullName)" -ForegroundColor Yellow
                        }
                    }
                }
            } catch {
                Write-Host "⚠️ Error processing file: $($file.FullName)" -ForegroundColor Yellow
            }
        }
    }
}

# Also clean specific problematic files
$problematicFiles = @("$BinDir\runix-linux", "$BinDir\runix-macos", "$BinDir\runix.exe")
foreach ($file in $problematicFiles) {
    if (Test-Path $file) {
        try {
            Remove-Item $file -Force -ErrorAction Stop
            Write-Host "✅ Removed locked file: $file" -ForegroundColor Yellow
        } catch {
            Write-Host "⚠️ Could not remove: $file (may be in use)" -ForegroundColor Yellow
        }
    }
}

# Wait longer for handles to fully release
Start-Sleep -Seconds 2

Write-Host '✅ Process cleanup complete' -ForegroundColor Green
