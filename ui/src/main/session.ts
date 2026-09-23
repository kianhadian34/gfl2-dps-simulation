import { BrowserWindow, dialog, ipcMain } from "electron";
import { readFileSync } from "node:fs";
import { broadcast } from "./windows.js";

/**
 * SESSION — the single authoritative simulation/debug session in the main process.
 *
 * The engine is invoked HERE, from the real sources under ../src (bundled by
 * electron-vite, source-mapped). The renderer never imports or runs engine code;
 * it receives `SessionView` snapshots (typed in ../shared/engine-types.ts).
 */
import { simulateScenario } from "../../../src/simulate.ts";
import { REGISTRY } from "../../../src/data/registry.ts";
import { WEAPONS } from "../../../src/data/weapons.ts";
import { COMMON_KEYS } from "../../../src/data/common-keys.ts";
import { MAX_COMMON_KEYS } from "../../../src/engine/state.ts";
import { buildWeaponViews, buildCommonKeyViews, buildCharacterMetaView } from "../shared/lists.js";
import { buildGrid, moveCost, tileHeightAt, tileKey, bossFootprintTiles } from "../../../src/engine/grid.ts";
import type { ScenarioView, SessionView, MovementFactView, GridCellFactsView, EffectSourceInfoView } from "../shared/engine-types.js";

let current: SessionView | null = null;
let runCounter = 0;

/** Engine-computed grid facts (geometry/legality come from src/engine/grid.ts — never the renderer). */
function computeGridFacts(session: SessionView): GridCellFactsView | null {
  const gridCfg = session.scenario.grid;
  if (!gridCfg) return null;
  try {
    const grid = buildGrid({ ...gridCfg, size: 15 });
    const cells: GridCellFactsView["cells"] = {};
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        const k = tileKey(x, y);
        cells[k] = { height: tileHeightAt(grid, x, y), blocked: grid.blocked.has(k), boss: grid.enemyTiles.has(k) };
      }
    }
    void bossFootprintTiles; // used implicitly by buildGrid; kept for clarity of the fact source
    return {
      cells,
      tokens: (gridCfg.units ?? []).map((u) => ({ unitId: u.unitId, coord: u.coord, height: u.height ?? "ground" })),
      bossCenter: gridCfg.boss.center,
      bossFootprintSide: gridCfg.boss.footprintSide,
      ladders: (gridCfg.ladders ?? []).map((l) => ({ ground: l.ground, high: l.high })),
      size: 15,
    };
  } catch {
    return null; // malformed grid config: the engine will surface its own validation error
  }
}

/** Engine-computed movement facts (legality/cost come from src/engine/grid.ts — never the renderer). */
function computeMovements(session: SessionView): MovementFactView[] {
  const gridCfg = session.scenario.grid;
  if (!gridCfg) return [];
  try {
    const grid = buildGrid({ ...gridCfg, size: 15 });
    const facts: MovementFactView[] = [];
    const lastByUnit = new Map<string, { x: number; y: number }>();
    for (const u of gridCfg.units ?? []) lastByUnit.set(u.unitId, u.coord);
    for (const m of gridCfg.moves ?? []) {
      const from = lastByUnit.get(m.unitId) ?? { x: 0, y: 0 };
      const cost = moveCost(grid, from, m.to);
      facts.push({ round: m.round, unitId: m.unitId, from, to: m.to, cost, endTurnWithoutAction: m.endTurnWithoutAction });
      lastByUnit.set(m.unitId, m.to);
    }
    return facts;
  } catch {
    return []; // malformed grid config: the engine will surface its own validation error
  }
}

export function runSession(scenario: ScenarioView): SessionView {
  if (scenario.version !== 1) throw new Error(`Unsupported scenario version: ${String(scenario.version)} (expected 1)`);
  const result = simulateScenario(scenario as never, REGISTRY);
  const session: SessionView = {
    runId: `run-${++runCounter}`,
    scenario,
    result: result as never,
    movements: [],
    facts: null,
    statuses: buildStatusCatalog(),
    effectSourceCatalog: buildEffectSourceCatalog(),
  };
  session.movements = computeMovements(session);
  session.facts = computeGridFacts(session);
  current = session;
  broadcast("session:update", session);
  return session;
}

/** Authoritative status catalog for Combat Log tooltips — sourced from the engine registry (data only). */
function buildStatusCatalog(): Record<string, import("../shared/engine-types.js").StatusInfoView> {
  const catalog: Record<string, import("../shared/engine-types.js").StatusInfoView> = {};
  for (const [id, def] of REGISTRY.getStatusMap()) {
    catalog[id] = {
      id,
      name: def.name,
      category: def.category,
      // PLAYER-FACING ONLY: description comes from `playerDescription`; the internal
      // `note`/evidence field is deliberately NOT shipped to the renderer.
      description: (def as { playerDescription?: string }).playerDescription,
      durationRounds: def.durationRounds,
      stackable: def.stackable,
      maxStacks: def.maxStacks,
      purgeable: def.purgeable,
      consumeOneOnUse: def.consumeOneOnUse,
    };
  }
  return catalog;
}

/**
 * EFFECT-SOURCE DEFINITION CATALOG (2026): resolves each structured `EffectSourceRef` to the
 * real player-facing definition from the engine registry. Keys:
 *   status:{statusId}     → StatusDef (existing StatusInfoView.playerDescription)
 *   passive:{char}:{passiveId} → PassiveDef.playerDescription
 *   ability:{char}:{abilityId} → AbilityDef.playerDescription
 *   target                → the DummyConfig target-passive entry (name only; no fabricated text)
 * Engine-origin only — the renderer resolves refs against this catalog and never parses labels
 * when a structured ref exists.
 */
function buildEffectSourceCatalog(): Record<string, EffectSourceInfoView> {
  const catalog: Record<string, EffectSourceInfoView> = { target: { name: "Target passive (DummyConfig)" } };
  for (const [id, def] of REGISTRY.getStatusMap()) {
    const pd = (def as { playerDescription?: string }).playerDescription;
    catalog[`status:${id}`] = { name: def.name, ...(pd ? { description: pd } : {}) };
  }
  for (const charId of REGISTRY.characterIds()) {
    const c = REGISTRY.getCharacter(charId);
    if (!c) continue;
    if (c.passive.playerDescription) catalog[`passive:${charId}:${c.passive.id}`] = { name: c.passive.name, description: c.passive.playerDescription };
    for (const slot of ["basic", "active1", "active2", "ultimate", "support"] as const) {
      const ability = c.skills[slot];
      if (ability && ability.playerDescription) catalog[`ability:${charId}:${ability.id}`] = { name: ability.name, description: ability.playerDescription };
    }
  }
  return catalog;
}

export function registerSimHandlers(): void {
  ipcMain.handle("sim:getSession", () => current);

  /** Characters available from the engine registry (the database) — engine-sourced. */
  ipcMain.handle("sim:listCharacters", () =>
    REGISTRY.characterIds().map((id) => {
      const def = REGISTRY.getCharacter(id);
      return buildCharacterMetaView({
        id,
        name: def?.name ?? id,
        ...(def && def.mobility !== undefined ? { mobility: def.mobility } : {}),
        ...(def
          ? {
              fixedKeys: def.fixedKeys.map((k) => ({ id: k.id, name: k.name })),
              ...(def.expansionKey ? { expansionKey: { id: def.expansionKey.id, name: def.expansionKey.name } } : {}),
              ...(def.affinityKey ? { affinityKey: { id: def.affinityKey.id, name: def.affinityKey.name } } : {}),
            }
          : {}),
      });
    }),
  );

  /** Weapons available from the engine data (src/data/weapons.ts) — engine-sourced, never duplicated. */
  ipcMain.handle("sim:listWeapons", () => buildWeaponViews(WEAPONS));

  /** Common Keys available from the engine data (+ the engine-enforced 3-slot maximum). */
  ipcMain.handle("sim:listCommonKeys", () => buildCommonKeyViews(COMMON_KEYS, MAX_COMMON_KEYS));

  ipcMain.handle("sim:run", (_event, scenario: unknown) => {
    if (typeof scenario !== "object" || scenario === null) throw new Error("sim:run expects a scenario object");
    return runSession(scenario as ScenarioView);
  });

  ipcMain.handle("dialog:openScenario", async () => {
    const win = BrowserWindow.getFocusedWindow();
    const opts: Electron.OpenDialogOptions = {
      title: "Open scenario JSON",
      filters: [{ name: "Scenario JSON", extensions: ["json"] }],
      properties: ["openFile"],
    };
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (res.canceled || res.filePaths.length === 0) return null;
    const path = res.filePaths[0];
    const scenario = JSON.parse(readFileSync(path, "utf8")) as ScenarioView;
    return runSession(scenario);
  });
}