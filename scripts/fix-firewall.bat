@echo off
echo 🔥 Fixing Windows Firewall rules for Node.js...
echo.

echo Removing existing Node.js firewall rules...
netsh advfirewall firewall delete rule name="Node.js: Server-side JavaScript" >nul 2>&1
netsh advfirewall firewall delete rule name="Node.js" >nul 2>&1

echo Adding new firewall rules for Node.js...
netsh advfirewall firewall add rule name="Node.js: Server-side JavaScript" dir=in action=allow program="%ProgramFiles%\nodejs\node.exe" enable=yes
netsh advfirewall firewall add rule name="Node.js: Server-side JavaScript" dir=out action=allow program="%ProgramFiles%\nodejs\node.exe" enable=yes

echo.
echo ✅ Firewall rules updated! 
echo 📋 Node.js should now be able to create network connections.
echo.
echo 🚀 Try running 'task quickstart' again!
pause
