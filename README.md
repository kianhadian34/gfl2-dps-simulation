# gfl2-dps-simulation
A data-driven combat simulator and damage optimizer for Girls' Frontline 2: Exilium.

## Running the simulator UI (Windows)

Double-click **`ui/Launch Simulator.bat`**.

That is the only step. **You do not need to install Node.js, npm, or anything else yourself** — the launcher handles all of it. On the first run it:

1. **Makes sure Node.js is available.** If the PC already has Node.js 22 or newer, it uses it. If not, it downloads the official **portable** Node.js build and extracts it into a private per-user folder (`%LOCALAPPDATA%\gfl2-sim\node`) — **no admin rights**, nothing installed system-wide, and nothing added to the system `PATH`. (Requires an internet connection the first time; afterwards the private copy is reused.)
2. Installs the UI dependencies (`npm install`) if `ui/node_modules` is missing — this takes a few minutes on the first run.
3. Starts the simulator.

The terminal window stays open while the simulator runs, so any build/runtime error stays visible. If a step fails, the window pauses with an explanation.

### Troubleshooting

- **"Could not set up Node.js automatically"** — the download was blocked (no internet, a proxy, or a firewall). *Only in this case* install Node.js 22+ from <https://nodejs.org> and run the launcher again; it will then use that install instead of downloading.
- **Node.js version errors** — the launcher reuses an existing Node.js only when it is **v22 or newer**. An older version is ignored and the portable copy is used instead.
- **A specific Node.js version is wanted** — set `GFL2_NODE_VERSION` (e.g. `v22.23.3`) before running; the launcher downloads that version of the portable build.
- **To force a re-download** of the private Node.js copy, run:

  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File "ui\ensure-node.ps1" -Force
  ```
