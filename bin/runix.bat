@echo off
setlocal

REM Get the directory where this batch file is located
set "SCRIPT_DIR=%~dp0"

REM Try to find the runix executable in various locations
set "RUNIX_EXE="

REM Look for the executable in the expected locations with correct naming
if exist "%SCRIPT_DIR%runix\runix.exe" (
    set "RUNIX_EXE=%SCRIPT_DIR%runix\runix.exe"
) else if exist "%SCRIPT_DIR%..\bin\runix\runix.exe" (
    set "RUNIX_EXE=%SCRIPT_DIR%..\bin\runix\runix.exe"
) else if exist "%SCRIPT_DIR%runix.exe" (
    set "RUNIX_EXE=%SCRIPT_DIR%runix.exe"
) else if exist "%SCRIPT_DIR%..\bin\runix.exe" (
    set "RUNIX_EXE=%SCRIPT_DIR%..\bin\runix.exe"
)

if "%RUNIX_EXE%"=="" (
    echo Runix executable not found. Tried:
    echo   %SCRIPT_DIR%runix\runix.exe
    echo   %SCRIPT_DIR%..\bin\runix\runix.exe
    echo   %SCRIPT_DIR%runix.exe
    echo   %SCRIPT_DIR%..\bin\runix.exe
    exit /b 1
)

REM Execute the runix binary with all passed arguments
"%RUNIX_EXE%" %*
