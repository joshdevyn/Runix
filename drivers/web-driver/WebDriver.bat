@echo off
setlocal enabledelayedexpansion

REM Get the directory where this batch file is located
set "DRIVER_DIR=%~dp0"

REM Set default port if not provided
set "PORT=8000"
if not "%RUNIX_DRIVER_PORT%"=="" set "PORT=%RUNIX_DRIVER_PORT%"

REM Parse command line arguments for port
:parse_args
if "%~1"=="" goto :start_driver
if "%~1"=="--port" (
    set "PORT=%~2"
    shift
    shift
    goto :parse_args
)
if "%~1" NEQ "" (
    echo %~1 | findstr /r "^--port=" >nul
    if !errorlevel! equ 0 (
        for /f "tokens=2 delims==" %%a in ("%~1") do set "PORT=%%a"
    )
)
shift
goto :parse_args

:start_driver
echo Starting WebDriver on port %PORT%...

REM Try to find Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js not found in PATH
    echo Please install Node.js from https://nodejs.org/
    exit /b 1
)

REM Set environment variables
set "RUNIX_DRIVER_PORT=%PORT%"
set "WEB_DRIVER_ENGINE=selenium"

REM Try different driver implementations in order of preference
if exist "%DRIVER_DIR%lightweight-driver.js" (
    echo Using lightweight driver implementation
    node "%DRIVER_DIR%lightweight-driver.js"
) else if exist "%DRIVER_DIR%driver.js" (
    echo Using main driver implementation
    node "%DRIVER_DIR%driver.js"
) else if exist "%DRIVER_DIR%dist\index.js" (
    echo Using compiled TypeScript driver
    node "%DRIVER_DIR%dist\index.js"
) else (
    echo Error: No driver implementation found
    echo Available files in %DRIVER_DIR%:
    dir /b "%DRIVER_DIR%"
    exit /b 1
)