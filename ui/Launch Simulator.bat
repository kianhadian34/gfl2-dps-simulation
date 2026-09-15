@echo off
setlocal
rem ============================================================================
rem  GFL2: Exilium DPS Simulator - Developer UI launcher (Windows)
rem
rem  - Resolves the ui/ directory from THIS file's location (works from any
rem    working directory / double-clicked in File Explorer).
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

rem First-run dependency install.
if not exist "%~dp0node_modules" (
  echo [launcher] ui dependencies not found - installing...
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