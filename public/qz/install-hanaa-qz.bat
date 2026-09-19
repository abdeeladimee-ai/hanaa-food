@echo off
setlocal
title Hanaa Food - QZ Trust Installer

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "QZDIR=%ProgramFiles%\QZ Tray"
set "DEST=%QZDIR%\override.crt"
set "TMPFILE=%TEMP%\hanaa-qz-override.crt"

if not exist "%QZDIR%" (
  echo QZ Tray ma l9inahch f: %QZDIR%
  echo Install QZ Tray awalan.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri 'https://hanaa-food.vercel.app/qz/override.crt' -OutFile '%TMPFILE%'"
if errorlevel 1 (
  echo Download dyal certificat fchel.
  pause
  exit /b 1
)

copy /Y "%TMPFILE%" "%DEST%" >nul
if errorlevel 1 (
  echo Ma9drnach nktbo override.crt.
  pause
  exit /b 1
)

del /Q "%TMPFILE%" >nul 2>&1
echo.
echo ============================================
echo   HANAA FOOD QZ TRUST: INSTALLED OK
echo ============================================
echo.
echo Daba sedd QZ Tray b Exit, 3awed 7ellou,
echo w refresh Hanaa Food f Chrome.
echo.
pause
