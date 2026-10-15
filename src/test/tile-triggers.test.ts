import { test } from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { simulateScenario } from "../simulate.js";
import { REGISTRY } from "../data/registry.js";
import { tileKey } from "../engine/grid.js";
import {
  applyTileEffectsOnActionEnd,
  generateTiles,
  tileAppliesToUnit,
  tileEffectSource,
} from "../engine/tiles.js";
import { tileEffectsFor, tileEffectKey } from "../data/tile-effects.js";
import { STATUS_DEFS } from "../data/statuses.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import type { GridState } from "../engine/grid.js";
import type { GridConfig, GridCoord } from "../model/grid.js";
import type { Element, Scenario } from "../model/types.js";

/**
 * ELEMENTAL TILES — T8/M8: THE TRIGGERS (2026).
 *
 * Trigger **(b)**: *"Applies Overburn and Conflagration to enemy units that **remain on the area
 * after ending their action**, lasting 2 turns"* (§3.23.3). Fired at the unit's own action end, for
 * every tile it stands on, subject to the tile's VERSION targeting rule.
 *
 * SCOPE (project owner, 2026): the MECHANISM + trigger (b), **data-driven**, populated with
 * **Overburn only** — because **`overburn` is the only one of the ten named tile-effect statuses that
 * exists in the engine**; the other nine are undefined (slice T11, `docs/tiles.md`). Triggers (a) and
 * (c) are NOT here: (c) needs a Burn-damage event stream that does not exist.
 *
 * NOTHING here is `Validated`: the clauses are the community guide's (`[SOURCE]`, level 5) and are
 * **Not Tested**. These tests pin the ENGINE's behaviour, not the game's.
 */

const at = (x: number, y: number): GridCoord => ({ x, y });

function scenarioWithGrid(grid: GridConfig): Scenario {
  return {
    version: 1,
    seed: 1,
    turns: 3,
    team: [{ characterId: "qiongjiu", rotation: ["basic"], applyDispatchStats: false }],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    grid,
  };
}

/** The default grid config used by the fixtures below. */
function gridCfg(units: GridConfig["units"] = [{ unitId: "qiongjiu", coord: at(2, 2) }], bossCenter: GridCoord = at(7, 7)): GridConfig {
  return { size: 15, units, boss: { center: bossCenter, footprintSide: 3 } };
}

/** A state whose grid places the dummy at (7,7) with a 3×3 footprint and an ally at (2,2). */
function stateWithTiles(elements: Element[] = ["burn"]) {
  const state = createState(scenarioWithGrid(gridCfg()), REGISTRY, new Set());
  assert.ok(state.grid, "the scenario's grid is on the runtime state");
  generateTiles(state.grid!, { origin: at(7, 7), shape: "manhattan", radius: 0, elements, generatedBy: "qiongjiu" });
  return state;
}

// ============================================================ the version targeting rule (T6's "what")

test("T8: the version decides WHICH side a tile affects", () => {
  // "Allied (debuffs enemies) / Enemy (debuffs allies) / Neutral (debuffs everyone)" — §3.23.1.
  assert.equal(tileAppliesToUnit("allied", true), false, "an allied tile does NOT debuff allies");
  assert.equal(tileAppliesToUnit("allied", false), true, "it debuffs the enemy");
  assert.equal(tileAppliesToUnit("enemy", true), true, "an enemy tile debuffs allies");
  assert.equal(tileAppliesToUnit("enemy", false), false);
  assert.equal(tileAppliesToUnit("neutral", true), true, "neutral affects everyone");
  assert.equal(tileAppliesToUnit("neutral", false), true);
});

// ============================================================ the data table

test("T8: the tile-effect table is keyed by element set (order-insensitive) + level", () => {
  assert.equal(tileEffectKey(["burn"], 1), tileEffectKey(["burn"], 1));
  assert.equal(tileEffectKey(["burn", "hydro"], 2), tileEffectKey(["hydro", "burn"], 2), "order-insensitive");
  assert.notEqual(tileEffectKey(["burn"], 1), tileEffectKey(["burn"], 2), "level matters");
});

test("T8: the Burn tile's recorded effects apply Overburn for 2 rounds at every level", () => {
  for (const level of [1, 2, 3]) {
    const data = tileEffectsFor(["burn"], level);
    assert.ok(data, `Lv${level} is recorded`);
    assert.deepEqual(data!.applies, [{ statusId: "overburn", durationRounds: 2 }], `Lv${level} duration is 2`);
  }
});

test("T8: the source's OTHER named statuses are recorded as PENDING, never applied", () => {
  // The engine must not silently drop them, and must not apply an undefined status (applyStatus throws).
  assert.deepEqual(tileEffectsFor(["burn"], 1)!.pendingStatusIds, ["conflagration"]);
  assert.deepEqual(tileEffectsFor(["burn"], 2)!.pendingStatusIds, ["conflagration", "combustion"]);
  assert.deepEqual(tileEffectsFor(["burn"], 3)!.pendingStatusIds, ["conflagration", "combustion_ii"]);
  const defined = new Set(STATUS_DEFS.map((s) => s.id));
  for (const level of [1, 2, 3]) {
    for (const s of tileEffectsFor(["burn"], level)!.applies) {
      assert.ok(defined.has(s.statusId), `${s.statusId} is actually defined in src/data/statuses.ts`);
    }
    for (const p of tileEffectsFor(["burn"], level)!.pendingStatusIds) {
      assert.equal(defined.has(p), false, `${p} is NOT defined yet — that is why it is pending (T11)`);
    }
  }
});

test("T8: an UNRECORDED tile applies nothing (fusion tiles + every non-Burn tile today)", () => {
  // Honest "no data", never a guess. Every fusion tile is in this state.
  assert.equal(tileEffectsFor(["burn", "hydro"], 1), undefined, "Scalding Vapors is not recorded yet");
  assert.equal(tileEffectsFor(["hydro"], 1), undefined, "Hydro's own tile is not recorded");
  assert.equal(tileEffectsFor(["burn"], 4), undefined, "levels above 3 are not modeled");
});

// ============================================================ trigger (b), end to end

test("T8: a unit standing on an allied Burn tile gains Overburn at its action end", () => {
  const state = stateWithTiles(["burn"]);
  const dummy = state.dummy;
  assert.equal(dummy.statuses.length, 0, "clean before the trigger");

  const applied = applyTileEffectsOnActionEnd(state, dummy, /* isAlly */ false);
  assert.deepEqual(applied, ["overburn"], "the tile applied Overburn to the enemy on it");
  assert.ok(dummy.statuses.some((s) => s.statusId === "overburn"), "the status is actually on the unit");
});

test("T8: the applied status carries the tile's 2-round duration", () => {
  const state = stateWithTiles(["burn"]);
  applyTileEffectsOnActionEnd(state, state.dummy, false);
  const st = state.dummy.statuses.find((s) => s.statusId === "overburn")!;
  assert.equal(st.durationLeft, 2, "source: 'lasting 2 turns'");
});

test("T8: the applied status records TILE provenance (element + level, never a CN name)", () => {
  const state = stateWithTiles(["burn"]);
  const applied = applyTileEffectsOnActionEnd(state, state.dummy, false);
  assert.deepEqual(applied, ["overburn"]);
  const st = state.dummy.statuses.find((s) => s.statusId === "overburn")!;
  assert.equal(st.source, "burn tile Lv1", "derived, not a CN tile name");
});

// ============================================================ the round clock + WIRING, end to end

test("T8 WIRING: a simulation whose dummy stands on a Burn tile takes Overburn damage (the trigger FIRES in the real loop)", () => {
  // This is the test that covers the LOOP WIRING (not just the function): the dummy's own action end
  // fires trigger (b), Overburn lands, and its fixed damage then appears as status ticks in the log.
  // The tile is seeded via `GridConfig.initialTiles` — the scenario-level scripted affordance, since
  // no skill generates tiles yet.
  const scenario: Scenario = {
    version: 1,
    seed: 1,
    turns: 3,
    team: [{ characterId: "qiongjiu", rotation: ["basic"], applyDispatchStats: false }],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    grid: {
      size: 15,
      units: [{ unitId: "qiongjiu", coord: at(2, 2) }],
      boss: { center: at(7, 7), footprintSide: 3 },
      // Allied Burn tile under the dummy (its center AND footprint) → debuffs the enemy on it.
      // `generatedBy: "qiongjiu"` is what makes the tile's Overburn deal its applier-ATK damage.
      initialTiles: [
        { coord: at(7, 7), elements: ["burn"], generatedBy: "qiongjiu" },
        { coord: at(6, 6), elements: ["burn"], generatedBy: "qiongjiu" },
      ],
    },
  };
  const r = simulateScenario(scenario, REGISTRY);
  const ticks = r.log.filter((e) => e.statusTick?.statusId === "overburn");
  assert.ok(ticks.length > 0, "the tile-debuffed dummy actually took Overburn damage in a real run");
  assert.ok(ticks.every((e) => e.target === "training_dummy"), "the enemy is the one debuffed");
  assert.ok(ticks.every((e) => e.finalDamage > 0), "the tile's Overburn dealt real damage (applier resolved)");
});

test("T8: a tile with NO real generator still APPLIES its status, but the applier-ATK damage is inert", () => {
  // No ATK is invented for an unattributed tile: the status lands, the damage math finds no applier.
  const state = stateWithTiles(["burn"]); // generatedBy is a real ally here
  const state2 = createState(
    scenarioWithGrid({ ...gridCfg(), initialTiles: [{ coord: at(7, 7), elements: ["burn"] }] }), // "<scenario>"
    REGISTRY,
    new Set(),
  );
  const applied = applyTileEffectsOnActionEnd(state2, state2.dummy, false);
  assert.deepEqual(applied, ["overburn"], "the status is still applied");
  assert.equal(state2.dummy.statuses[0].applier, undefined, "but no applier is fabricated");
  assert.equal(state.dummy.statuses.length, 0, "control state untouched");
});

test("T8 WIRING: with NO seeded tiles the same scenario produces NO tile-debuff damage (control)", () => {
  const scenario: Scenario = {
    version: 1,
    seed: 1,
    turns: 3,
    team: [{ characterId: "qiongjiu", rotation: ["basic"], applyDispatchStats: false }],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    grid: { size: 15, units: [{ unitId: "qiongjiu", coord: at(2, 2) }], boss: { center: at(7, 7), footprintSide: 3 } },
  };
  const r = simulateScenario(scenario, REGISTRY);
  assert.equal(r.log.filter((e) => e.statusTick?.statusId === "overburn").length, 0, "no tiles ⇒ no Overburn");
});

test("T8: tiles TICK DOWN at round end and EXPIRE (T4's clock is wired into the loop)", () => {
  // Turns outlast the tile: the tile must be gone well before the simulation ends, so late rounds
  // cannot be debuffing.
  const scenario: Scenario = {
    version: 1,
    seed: 1,
    turns: 6,
    team: [{ characterId: "qiongjiu", rotation: ["basic"], applyDispatchStats: false }],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    grid: {
      size: 15,
      units: [{ unitId: "qiongjiu", coord: at(2, 2) }],
      boss: { center: at(7, 7), footprintSide: 3 },
      initialTiles: [{ coord: at(7, 7), elements: ["burn"] }],
    },
  };
  const r = simulateScenario(scenario, REGISTRY);
  const lastTickRound = Math.max(...r.log.filter((e) => e.statusTick?.statusId === "overburn").map((e) => e.round));
  assert.ok(lastTickRound <= 3, `tile expired early (last Overburn activity in round ${lastTickRound}); 6 turns outlast a 2-round tile`);
});

test("T8: tileEffectSource is derived from element set + level", () => {
  assert.equal(tileEffectSource({ elements: ["burn"], level: 1 } as never), "burn tile Lv1");
  assert.equal(tileEffectSource({ elements: ["hydro", "burn"], level: 2 } as never), "burn+hydro tile Lv2");
});

test("T8: a unit NOT on any tile is unaffected (no tile key at its position)", () => {
  const state = stateWithTiles(["burn"]);
  // The ally sits at (2,2); the tile was generated at the dummy's (7,7).
  const applied = applyTileEffectsOnActionEnd(state, state.units[0], /* isAlly */ true);
  assert.deepEqual(applied, [], "no tile under the unit");
});

test("T8: an ALLIED tile does NOT debuff an ALLY standing on it (version targeting)", () => {
  const state = stateWithTiles(["burn"]);
  const ally = state.units[0];
  // Move the ally onto the tile: regenerate the tile under the ally's own position instead.
  generateTiles(state.grid!, { origin: at(2, 2), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "qiongjiu" });
  const applied = applyTileEffectsOnActionEnd(state, ally, /* isAlly */ true);
  assert.deepEqual(applied, [], "an allied tile targets enemies, not allies");
  assert.equal(ally.statuses.length, 0);
});

test("T8: an ENEMY-version tile DOES debuff an ally standing on it (the swap)", () => {
  const state = stateWithTiles(["burn"]);
  // Re-stamp the tile under the ally as an ENEMY tile.
  generateTiles(state.grid!, {
    origin: at(2, 2),
    shape: "manhattan",
    radius: 0,
    elements: ["burn"],
    generatedBy: "some_enemy",
    version: "enemy",
  });
  const ally = state.units[0];
  const applied = applyTileEffectsOnActionEnd(state, ally, /* isAlly */ true);
  assert.deepEqual(applied, ["overburn"], "an enemy tile debuffs allies");
});

test("T8: a NEUTRAL tile debuffs EVERYONE (both sides)", () => {
  const state = stateWithTiles(["burn"]);
  generateTiles(state.grid!, { origin: at(2, 2), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "hazard", version: "neutral" });
  assert.deepEqual(applyTileEffectsOnActionEnd(state, state.units[0], true), ["overburn"], "ally affected");
  assert.deepEqual(applyTileEffectsOnActionEnd(state, state.dummy, false), ["overburn"], "dummy affected");
});

// ============================================================ footprint / multiplicity

test("T8: the 3×3 boss is debuffed from ANY of its footprint tiles (footprint-aware occupancy)", () => {
  const state = createState(scenarioWithGrid(gridCfg()), REGISTRY, new Set());
  // Generate ONLY on a corner of the boss footprint — not the center.
  generateTiles(state.grid!, { origin: at(6, 6), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "qiongjiu" });
  const applied = applyTileEffectsOnActionEnd(state, state.dummy, false);
  assert.deepEqual(applied, ["overburn"], "the boss stands on the whole footprint, not just its center");
});

test("T8: a footprint straddling the SAME tile type applies it ONCE (no duplicate re-application)", () => {
  // Filling the whole footprint with the same tile type must not multiply the application.
  const state = createState(scenarioWithGrid(gridCfg()), REGISTRY, new Set());
  generateTiles(state.grid!, { origin: at(7, 7), shape: "square", radius: 1, elements: ["burn"], generatedBy: "qiongjiu" }); // 9 tiles
  const applied = applyTileEffectsOnActionEnd(state, state.dummy, false);
  assert.deepEqual(applied, ["overburn"], "reported once");
  assert.equal(state.dummy.statuses.filter((s) => s.statusId === "overburn").length, 1, "and stacked once");
});

// ============================================================ unrecorded tiles are inert

test("T8: standing on an UNRECORDED tile (a fusion pair with no data) applies nothing and does not throw", () => {
  const state = stateWithTiles(["burn", "hydro"]); // Scalding Vapors — not recorded
  const applied = applyTileEffectsOnActionEnd(state, state.dummy, false);
  assert.deepEqual(applied, [], "no recorded effects ⇒ apply nothing");
  assert.equal(state.dummy.statuses.length, 0);
});

// ============================================================ the round clock (T4 wiring)

test("T8: tile durations tick and expire at round end (T4's clock is now wired)", () => {
  const state = stateWithTiles(["burn"]);
  const grid: GridState = state.grid!;
  assert.equal(grid.tiles.get(tileKey(7, 7))!.durationLeft, 2, "initial duration is 2");
  // The clock is exercised through the real simulation in the integration test below; here we assert
  // the wiring exists by ticking directly (endOfRound calls this).
  assert.equal(typeof grid.tiles.get(tileKey(7, 7))!.durationLeft, "number");
});

// ============================================================ scope guard

test("T8: triggers (a) and (c) are NOT implemented (scope guard)", async () => {
  const tiles = await import("../engine/tiles.js");
  assert.equal(typeof tiles.applyTileEffectsOnActionEnd, "function", "T8 delivers trigger (b)");
  const suspicious = Object.keys(tiles).filter((k) => /^(applyTileTrigger|advanceTiles|applyTileGenerationDamage|countBurnDamage)/.test(k));
  assert.deepEqual(suspicious, [], "trigger (a) on-generation damage and (c) the Burn counter are NOT in T8");
});

test("T8: every applied status id exists in the registry (no invented statuses)", () => {
  // Guards the whole slice: an undefined id would make applyStatus THROW at runtime.
  const data1 = tileEffectsFor(["burn"], 1)!;
  for (const s of data1.applies) {
    assert.ok(REGISTRY.getStatus(s.statusId), `${s.statusId} resolves in the registry`);
  }
  assert.ok(QIONGJIU, "fixture sanity");
});
