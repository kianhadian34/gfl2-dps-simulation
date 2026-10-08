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
if errorlevel 1 (
  echo [launcher] Windows PowerShell was not found; it is required to set up Node.js.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ensure-node.ps1" -CacheRoot "%GFL2_CACHE%"
if errorlevel 1 (
  echo [launcher] Could not set up Node.js automatically. See the messages above.
  pause
  exit /b 1
)

set "GFL2_NODE_DIR="
if exist "%GFL2_NODE_DIR_FILE%" set /p GFL2_NODE_DIR=<"%GFL2_NODE_DIR_FILE%"
if not defined GFL2_NODE_DIR (
  echo [launcher] Could not determine where Node.js was placed.
  pause
  exit /b 1
)
set "PATH=%GFL2_NODE_DIR%;%PATH%"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [launcher] npm was not found even after setting up Node.js ^(%GFL2_NODE_DIR%^).
  pause
  exit /b 1
)

rem ---------------------------------------------------------------------------
rem 2) First-run dependency install.
rem ---------------------------------------------------------------------------
if not exist "%~dp0node_modules" (
  echo [launcher] ui dependencies not found - installing (first run; this may take a few minutes)...
  call npm.cmd install
  if errorlevel 1 (
    echo [launcher] dependency install failed. See the errors above.
    pause
    exit /b 1
  )
)

echo [launcher] Starting the simulation debugger (single Electron window)...
call npm.cmd run dev

rem Keep errors visible after the app exits.
if errorlevel 1 (
  echo [launcher] the development simulator exited with an error. See the output above.
  pause
  exit /b 1
)

endlocal
