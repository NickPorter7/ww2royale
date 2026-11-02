@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required. Install it from https://nodejs.org/
  pause
  exit /b 1
)
echo Starting WW2 Royale 1.10...
echo Open http://localhost:3000 in your web browser.
echo Close this window to stop the game server.
node server/index.js
pause
