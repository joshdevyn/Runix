@echo off
setlocal

REM Get the directory where this batch file is located
set "SCRIPT_DIR=%~dp0"

REM Try to find the runix executable in various locations
set "RUNIX_EXE="

REM Look for the executable in the expected locations with correct naming
if exist "%SCRIPT_DIR%runix\runix-win.exe" (
    set "RUNIX_EXE=%SCRIPT_DIR%runix\runix-win.exe"
) else if exist "%SCRIPT_DIR%..\bin\runix\runix-win.exe" (
    set "RUNIX_EXE=%SCRIPT_DIR%..\bin\runix\runix-win.exe"
) else if exist "%SCRIPT_DIR%runix-win.exe" (
    set "RUNIX_EXE=%SCRIPT_DIR%runix-win.exe"
) else if exist "%SCRIPT_DIR%..\bin\runix-win.exe" (
    set "RUNIX_EXE=%SCRIPT_DIR%..\bin\runix-win.exe"
)

if "%RUNIX_EXE%"=="" (
    echo Runix executable not found. Tried:
    echo   %SCRIPT_DIR%runix\runix-win.exe
    echo   %SCRIPT_DIR%..\bin\runix\runix-win.exe
    echo   %SCRIPT_DIR%runix-win.exe
    echo   %SCRIPT_DIR%..\bin\runix-win.exe
    exit /b 1
)

REM Execute the runix binary with all passed arguments
"%RUNIX_EXE%" %*
