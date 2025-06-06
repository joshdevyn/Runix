@echo off
echo Building Web Driver...

echo Installing dependencies...
call npm install
if errorlevel 1 (
    echo Failed to install dependencies
    exit /b 1
)

echo Compiling TypeScript and building executable...
call node build.js
if errorlevel 1 (
    echo Build failed
    exit /b 1
)

echo Web Driver build complete!
