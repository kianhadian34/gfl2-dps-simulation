@echo off
setlocal
rem ============================================================================
rem  GFL2: Exilium DPS Simulator - UI launcher (Windows)
rem
rem  - Resolves the ui/ directory from THIS file's location (works from any
rem    working directory / double-clicked in File Explorer).
rem  - Ensures Node.js is available BEFORE anything else: if the PC has no
rem    suitable Node.js, a private portable copy is downloaded and extracted for
rem    the current user (ensure-node.ps1) - no admin rights, nothing installed
rem    system-wide and nothing added to the system PATH.
rem  - Uses npm.cmd (not npm) to avoid PowerShell/cmd alias and execution-policy
rem    issues.
rem  - Installs ui dependencies on first run if node_modules is missing.
rem  - Keeps this terminal window open while the development simulator runs so
rem    runtime/build errors stay visible; pauses if anything fails.
rem  - Uses the existing electron-vite "dev" workflow - no startup logic is
rem    duplicated and no packaged build is produced.
rem
rem  NOTE ON STYLE: error handling uses single-line `if ... goto :label` and every
rem  message avoids unescaped parentheses. Parentheses INSIDE a multi-line
rem  if ( ... ) block are parsed as block syntax by cmd and abort the script with
rem  "... was unexpected at this time." - which showed up as a blank console.
rem ============================================================================

rem Working directory = the folder containing this launcher (no assumption about CWD).
cd /d "%~dp0"

rem ---------------------------------------------------------------------------
rem 1) Node.js: reuse the one on this PC, else install a private portable copy.
rem ---------------------------------------------------------------------------
set "GFL2_CACHE=%LOCALAPPDATA%\gfl2-sim"
set "GFL2_NODE_DIR_FILE=%GFL2_CACHE%\node-dir.txt"
if exist "%GFL2_NODE_DIR_FILE%" del "%GFL2_NODE_DIR_FILE%" >nul 2>nul

where powershell.exe >nul 2>nul
if errorlevel 1 goto :no_powershell

echo [launcher] Checking for Node.js...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ensure-node.ps1" -CacheRoot "%GFL2_CACHE%"
if errorlevel 1 goto :node_setup_failed

set "GFL2_NODE_DIR="
if exist "%GFL2_NODE_DIR_FILE%" set /p GFL2_NODE_DIR=<"%GFL2_NODE_DIR_FILE%"
if not defined GFL2_NODE_DIR goto :node_dir_unresolved
set "PATH=%GFL2_NODE_DIR%;%PATH%"

where npm.cmd >nul 2>nul
if errorlevel 1 goto :npm_missing

rem ---------------------------------------------------------------------------
rem 2) First-run dependency install.
rem ---------------------------------------------------------------------------
if exist "%~dp0node_modules" goto :deps_ready

echo [launcher] ui dependencies not found - installing. First run only; this can take a few minutes...
call npm.cmd install --no-audit --no-fund
if errorlevel 1 goto :install_failed

:deps_ready

rem ---------------------------------------------------------------------------
rem 3) Start the simulator.
rem ---------------------------------------------------------------------------
echo [launcher] Starting the simulation debugger - single Electron window...
call npm.cmd run dev
if errorlevel 1 goto :dev_failed

endlocal
exit /b 0

rem ---------------------------------------------------------------------------
rem Error paths - each PAUSES so the window never closes on a blank screen.
rem ---------------------------------------------------------------------------
:no_powershell
echo [launcher] Windows PowerShell was not found; it is required to set up Node.js.
pause
exit /b 1

:node_setup_failed
echo [launcher] Could not set up Node.js automatically. See the messages above.
echo [launcher] If the download was blocked, install Node.js 22 or newer from https://nodejs.org and run this again.
pause
exit /b 1

:node_dir_unresolved
echo [launcher] Could not determine where Node.js was placed.
pause
exit /b 1

:npm_missing
echo [launcher] npm was not found even after setting up Node.js: %GFL2_NODE_DIR%
pause
exit /b 1

:install_failed
echo [launcher] dependency install failed. See the errors above.
pause
exit /b 1

:dev_failed
echo [launcher] the development simulator exited with an error. See the output above.
pause
exit /b 1
