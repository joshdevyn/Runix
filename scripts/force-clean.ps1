# scripts/force-clean.ps1
# Force clean all build artifacts with better file handle management

param([string]$MaxRetries = 3)

Write-Host '🧹 Force cleaning build artifacts...' -ForegroundColor Yellow

function Remove-WithRetry {
    param([string]$Path, [int]$Retries = 3)
    
    for ($i = 1; $i -le $Retries; $i++) {
        try {
            if (Test-Path $Path) {
                Write-Host "  Attempting to remove $Path (attempt $i/$Retries)"
                Remove-Item -Recurse -Force $Path -ErrorAction Stop
                Write-Host "  ✅ Removed $Path" -ForegroundColor Green
                return $true
            }
            return $true
        }
        catch {
            Write-Host "  ⚠️ Attempt $i failed: $($_.Exception.Message)" -ForegroundColor Yellow
            if ($i -lt $Retries) {
                Write-Host "  Waiting 2 seconds before retry..." -ForegroundColor Gray
                Start-Sleep -Seconds 2
                
                # Force garbage collection
                [System.GC]::Collect()
                [System.GC]::WaitForPendingFinalizers()
            }
        }
    }
    Write-Host "  ❌ Failed to remove $Path after $Retries attempts" -ForegroundColor Red
    return $false
}

# Kill all processes first
& "$PSScriptRoot\kill-drivers.ps1" -BinDir 'bin'

# Wait for processes to fully terminate
Start-Sleep -Seconds 1

# Remove build directories with retry logic
$directories = @('dist', 'bin', 'temp', 'coverage', 'reports')

foreach ($dir in $directories) {
    Remove-WithRetry -Path $dir -Retries $MaxRetries
}

# Extra cleanup for stubborn files
if (Test-Path 'bin') {
    Write-Host "🔨 Forcing removal of remaining bin files..." -ForegroundColor Yellow
    Get-ChildItem 'bin' -Recurse -Force -ErrorAction SilentlyContinue | 
        ForEach-Object { 
            try { 
                $_.Delete() 
            } catch { 
                # Ignore individual file errors 
            }
        }
    Remove-WithRetry -Path 'bin' -Retries 1
}

Write-Host '✅ Force clean complete!' -ForegroundColor Green
