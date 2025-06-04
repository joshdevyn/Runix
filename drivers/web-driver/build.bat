@echo off
echo Building Web Driver...
call npm install
if errorlevel 1 (
    echo Failed to install dependencies
    exit /b 1
)

call node build.js
if errorlevel 1 (
    echo Build failed
    exit /b 1
)

echo Web Driver build complete!
