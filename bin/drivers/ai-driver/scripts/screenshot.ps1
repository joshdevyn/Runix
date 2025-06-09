# PowerShell Screenshot Script
# Takes a screenshot of the current desktop and saves it to the specified output path

param(
    [string]$OutputPath = "screenshot.png"
)

try {
    # Load required assemblies
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    # Get the screen bounds
    $Screen = [System.Windows.Forms.SystemInformation]::VirtualScreen
    
    # Create a bitmap with the screen dimensions
    $Bitmap = New-Object System.Drawing.Bitmap $Screen.Width, $Screen.Height
    
    # Create graphics object from the bitmap
    $Graphics = [System.Drawing.Graphics]::FromImage($Bitmap)
    
    # Copy the screen to the bitmap
    $Graphics.CopyFromScreen($Screen.X, $Screen.Y, 0, 0, $Bitmap.Size)
    
    # Ensure output directory exists
    $OutputDir = Split-Path $OutputPath -Parent
    if ($OutputDir -and !(Test-Path $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }
    
    # Save the bitmap
    $Bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    # Clean up
    $Graphics.Dispose()
    $Bitmap.Dispose()
    
    Write-Host "Screenshot saved to: $OutputPath"
    exit 0
}
catch {
    Write-Error "Failed to take screenshot: $($_.Exception.Message)"
    exit 1
}
