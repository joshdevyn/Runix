@echo off
echo Installing WebDriver dependencies...

echo Installing Node.js dependencies...
call npm install
if errorlevel 1 (
    echo Failed to install Node.js dependencies
    exit /b 1
)

echo Installing browser drivers...
echo Note: Make sure you have Chrome, Firefox, or Edge installed for selenium-webdriver to work properly

echo Downloading ChromeDriver...
call npx selenium-webdriver chromedriver
if errorlevel 1 (
    echo Warning: ChromeDriver installation failed - Chrome automation may not work
)

echo Downloading GeckoDriver (Firefox)...
call npx selenium-webdriver geckodriver
if errorlevel 1 (
    echo Warning: GeckoDriver installation failed - Firefox automation may not work
)

echo Dependencies installation complete!
echo You can now build the driver with: npm run build
echo Or run in development mode with: npm run dev
