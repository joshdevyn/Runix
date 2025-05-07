# Set execution permissions for the batch file
$batFilePath = Join-Path $PSScriptRoot "..\bin\runix.bat"

if (Test-Path $batFilePath) {
    # Get the current ACL
    $acl = Get-Acl $batFilePath
    
    # Set the file to be executable
    $acl.SetAccessRuleProtection($false, $true)
    
    # Add execution permission
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        "Everyone", 
        "ReadAndExecute", 
        "Allow"
    )
    $acl.AddAccessRule($rule)
    
    # Apply the new ACL
    Set-Acl $batFilePath $acl
    
    Write-Host "Permissions set successfully for $batFilePath" -ForegroundColor Green
} else {
    Write-Host "Batch file not found at $batFilePath" -ForegroundColor Red
    exit 1
}
