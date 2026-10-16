@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est requis pour lancer la simulation BatiNova.
  pause
  exit /b 1
)

echo.
echo === SOCLE - BatiNova Script n°2 ===
echo La simulation est idempotente : une seconde execution ne duplique pas les donnees.
echo.

call npm run simulate:batinova
if errorlevel 1 (
  echo.
  echo La simulation a rencontre une erreur. SOCLE n'est pas lance pour eviter de masquer le probleme.
  pause
  exit /b 1
)

echo.
echo Simulation appliquee. Demarrage de SOCLE...
node scripts/local.mjs --port=4294 --open

endlocal
