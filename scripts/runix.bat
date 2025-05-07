@echo off
SET SCRIPT_DIR=%~dp0
SET RUNIX_PATH=%SCRIPT_DIR%..\bin\runix\runix-win.exe

IF EXIST "%RUNIX_PATH%" (
  "%RUNIX_PATH%" %*
) ELSE (
  echo Runix executable not found at: %RUNIX_PATH%
  exit /b 1
)
