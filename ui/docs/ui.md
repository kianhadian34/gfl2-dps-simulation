# Desktop UI — Developer/Debugging Client (2026)

## Purpose
A desktop debugging/visualization client for the GFL2: Exilium DPS simulator. It is **not** the
final public product and not a website. Its job is developer visibility: configure and run a
simulation with the REAL engine, then inspect exactly what it did. Priority:
**debug visibility > information density > beauty** (with a polished, dark, tactical look).

The engine (`src/`) is the **authoritative** source of simulation behavior. The UI never
duplicates engine logic: no damage formulas, no status logic, no Manhattan-distance/legality
computation, no second copy of the engine.

## Application architecture (ONE window)
There is exactly **one Electron `BrowserWindow`** hosting the whole React application. There are
no OS-level multi-windows.

```
Electron BrowserWindow
└── React application
    ├── Simulation Setup screen
    └── Simulation / Debug view
        ├── Grid panel          (spatial facts)
        ├── Combat Log panel    (primary debug view)
        └── Rotation panel      (scripted rotation state)
```

## Application flow
1. Launch → **Simulation Setup** (no simulation runs automatically).
2. Choose the **simulation target** (Training Dummy — MVP; HP/DEF/Stability/weaknesses configurable).
3. Choose **characters from the engine registry** (the character database is engine-sourced via
   `sim:listCharacters`).
4. Configure the **fixed rotation** per character (Basic / Common Rail / Guide / Ultimate slots)
   and the MVP settings (turns 1–7, seed, optional 15×15 grid layout).
5. **Start Simulation** → the main process runs the real engine (`simulateScenario`).
6. Transition to the **Simulation/Debug view**: Grid, Combat Log and Rotation panels inside the
   same window, all sharing ONE authoritative session.

## Engine / UI boundary
```
React renderer (presentation only)
   ↓  window.sim (preload contextBridge, narrow typed API)
Electron main (session owner)
   ↓  simulateScenario(scenario, REGISTRY)   ← the real engine under src/
SimulationResult / LogEvent[] + engine-computed grid/movement facts
   ↓  session snapshot (typed SessionView)
Setup screen · Grid · Combat Log · Rotation panels
```
- The renderer must **not** import or execute `src/engine/*`; grid geometry, footprint, heights
  and movement costs are computed in the main process via the engine's grid module.
- Engine stays independently testable: its `tsc` build and 244-test suite are untouched.
- Main imports engine sources directly (`../../../src/…`) so UI interactions trace into engine
  TypeScript via source maps/breakpoints.

## IPC (narrow and typed)
- `sim:listCharacters` → registry characters (the database) — engine-sourced.
- `sim:run(scenario)` → validates `version`, runs the engine, returns + broadcasts the session.
- `sim:getSession` / `session:update` → the single authoritative session snapshot.
- `dialog:openScenario` → load a scenario JSON file into the session.
- `contextIsolation` + `sandbox` enabled; no `nodeIntegration`; preload exposes only this API.

## Panel responsibilities
- **Grid**: renders the engine-supplied 15×15 spatial facts — ground/high-ground tiles, blocked
  tiles, ladders, boss 3×3 footprint + center, unit tokens at their placements; highlights the
  acting unit of the selected event. Presentation only.
- **Combat Log** (primary): chronological, full-fidelity rendering of `LogEvent[]` plus warnings
  and totals. Every field the engine emits is exposed in expandable entries (pipeline inputs,
  brackets, provenance, status/resource lifecycle, killing blows, fixed damage, ticks) with icon +
  text hierarchy — never color alone. Movement facts are listed above the events.
- **Rotation**: the scripted rotation per character with completed / current / upcoming states,
  derived only from engine-observed execution, plus selectable Support Action links.

Selection is shared React state inside the single application tree, so all three panels stay
synchronized on the same event.

## Debug visibility requirements
A developer must be able to answer: *"What just happened?"* (Combat Log), *"Where is everyone?"*
(Grid), *"What is the rotation doing?"* (Rotation). Engine state is never hidden behind
simplified UI.

## Development launcher (Windows)
Double-click **`ui/Launch Simulator.bat`** (or run it from any working directory) to start the
development simulator without terminal commands. It resolves the `ui/` folder from the script's
own location, installs `ui` dependencies on first run if missing, uses `npm.cmd` (avoids the
PowerShell/cmd `npm` alias and execution-policy issues), keeps the terminal window open while the
app runs so build/runtime errors remain visible, and pauses on failure. It uses the existing
`electron-vite dev` workflow — no startup logic is duplicated and no packaged build is produced.

## Current scope (v0.1)
Configure a simulation on the Setup screen (target, characters, fixed rotation, settings), run it
with the real engine, and inspect the output across the three debug panels; also load existing
scenario JSON files.

## Explicitly deferred (not implemented)
Public website, cloud/accounts/auth/online features, scenario sharing, cloud saves, advanced
rotation editor, character/weapon builders, optimization algorithms, DPS ranking, charting
dashboard, replay system, advanced terrain editor, full tactical game UI, flanking, AoE
visualization, LOS system, speculative grid mechanics, unresolved gameplay mechanics, packaged
installers beyond plain Windows dev builds, performance optimization beyond necessity.