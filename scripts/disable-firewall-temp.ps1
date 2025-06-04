# Temporarily disable Windows Firewall (run as Administrator)
Write-Host "🔥 Temporarily disabling Windows Firewall for testing..." -ForegroundColor Yellow
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False

Write-Host "✅ Firewall disabled. Run your tests now." -ForegroundColor Green
Write-Host "⚠️  Don't forget to re-enable it!" -ForegroundColor Red

Read-Host "Press Enter when done with testing..."

Write-Host "🔥 Re-enabling Windows Firewall..." -ForegroundColor Yellow
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True
Write-Host "✅ Firewall re-enabled." -ForegroundColor Green
