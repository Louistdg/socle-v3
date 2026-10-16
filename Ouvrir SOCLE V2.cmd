@echo off
setlocal
cd /d "%~dp0"
set "NODE_EXE="
where node.exe >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node.exe"
if not defined NODE_EXE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined NODE_EXE (
  echo Node.js est introuvable sur ce PC.
  pause
  exit /b 1
)
echo SOCLE V2 - simulation locale BatiNova
echo Conservez cette fenetre ouverte tant que vous utilisez le site.
"%NODE_EXE%" scripts\local.mjs --open --port=4294
if errorlevel 1 pause
