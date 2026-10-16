@echo off
setlocal
cd /d "%~dp0"
set "NODE_EXE="
where node.exe >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node.exe"
if not defined NODE_EXE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined NODE_EXE (
  echo Node.js est introuvable sur ce PC.
  echo Installez Node.js ou ouvrez ce projet dans Codex pour le lancer.
  pause
  exit /b 1
)
"%NODE_EXE%" scripts\local.mjs --open --port=4281
if errorlevel 1 pause
