@echo off
setlocal

cd /d "%~dp0"

echo === FotoScanSend wird gestartet ===

where node >nul 2>&1
if errorlevel 1 (
  echo Fehler: Node.js ist nicht installiert oder nicht im PATH.
  echo Bitte Node.js installieren: https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Abhaengigkeiten werden installiert ...
  call npm install
  if errorlevel 1 (
    echo Fehler bei npm install.
    pause
    exit /b 1
  )
)

echo Starte App auf http://localhost:3000 ...
call npm start

if errorlevel 1 (
  echo App wurde mit Fehler beendet.
  pause
  exit /b 1
)

endlocal
