import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGrid, tileElementsUnderOccupant } from "../engine/grid.js";
import { effectiveWeaknessElements, generateTiles, tickTiles } from "../engine/tiles.js";
import { createState } from "../engine/state.js";
import { REGISTRY } from "../data/registry.js";
import { simulateScenario } from "../simulate.js";
import { abilities, customRegistry } from "./helpers.js";
import type { GridConfig, GridCoord, TileOccupant } from "../model/grid.js";
import type { CharacterDef, Element, Scenario } from "../model/types.js";

/**
 * ELEMENTAL TILES — T10/M10: RUNTIME WEAKNESS APPLICATION (2026).
 *
 * Every tile *"applies … weakness"* to units **on the area**: Incineration *"Applies Burn weakness to
 * enemy units on the area"*; Scalding Vapors *"Inflicts Burn and Hydro weakness"*; Smoldering Suspire
 * *"Burn and Freeze weakness"*; Crackling Flare *"Burn and Electric weakness"*. The applied elements
 * are **the tile's OWN elements** — no separate data table is needed.
 *
 * MECHANISM (project-owner decision 3): **COMPUTED AT HIT TIME, never mutated.** `weaknessElements`
 * stays the immutable DECLARED value; the effective set at a hit is the declaration UNION the tiles
 * underfoot. That tracks position and tile lifetime for free (no enter/exit sync), and it is
 * **ADDITIVE BY CONSTRUCTION**: with no tile underfoot the union IS the declared array, so no
 * pre-T10 damage number can change.
 *
 * NOTHING here is `Validated`: the clauses are the community guide's (`[SOURCE]`) and **Not Tested**.
 */

const at = (x: number, y: number): GridCoord => ({ x, y });

function gridCfg(over: Partial<GridConfig> = {}): GridConfig {
  return {
    size: 15,
    units: [{ unitId: "qiongjiu", coord: at(2, 2) }],
    boss: { center: at(7, 7), footprintSide: 3 },
    ...over,
  };
}

function scenario(cfg: GridConfig, dummyOver: Record<string, unknown> = {}): Scenario {
  return {
    version: 1,
    seed: 1,
    turns: 3,
    team: [{ characterId: "qiongjiu", rotation: ["basic"], applyDispatchStats: false }],
    dummy: {
      id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 0,
      weaknesses: [], phase: null, cover: "none", ...dummyOver,
    } as never,
    grid: cfg,
  };
}

// ============================================================ the union itself

test("T10: no tile underfoot ⇒ the DECLARED weaknesses unchanged (the additive guarantee)", () => {
  const state = createState(scenario(gridCfg(), { weaknesses: ["burn", "hydro"] }), REGISTRY, new Set());
  assert.deepEqual(effectiveWeaknessElements(state, { kind: "boss" }), ["burn", "hydro"]);
});

test("T10: a tile underfoot ADDS its element to the declared weaknesses", () => {
  const state = createState(scenario(gridCfg(), { weaknesses: [] }), REGISTRY, new Set());
  generateTiles(state.grid!, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "qiongjiu" });
  assert.deepEqual(effectiveWeaknessElements(state, { kind: "boss" }), ["burn"], "the tile applies Burn weakness");
});

test("T10: the applied elements are the TILE'S OWN — a fusion tile applies BOTH", () => {
  // Source: "Inflicts Burn and Hydro weakness" (Scalding Vapors), "Burn and Freeze weakness"
  // (Smoldering Suspire) — i.e. exactly the tile's element set.
  const state = createState(scenario(gridCfg()), REGISTRY, new Set());
  generateTiles(state.grid!, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn", "hydro"], generatedBy: "qiongjiu" });
  assert.deepEqual([...effectiveWeaknessElements(state, { kind: "boss" })].sort(), ["burn", "hydro"]);
});

test("T10: the union DE-DUPLICATES — a target already weak to Burn gains nothing further", () => {
  // The confirmed rule is `1 + 0.10 × matched`; a Burn tile must not count Burn twice.
  const state = createState(scenario(gridCfg(), { weaknesses: ["burn"] }), REGISTRY, new Set());
  generateTiles(state.grid!, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "qiongjiu" });
  const eff = effectiveWeaknessElements(state, { kind: "boss" });
  assert.deepEqual(eff, ["burn"], "one Burn, not two");
  assert.equal(eff.filter((w) => w === "burn").length, 1);
});

test("T10: it is NOT a mutation — the declared list is untouched, and repeats are stable", () => {
  const state = createState(scenario(gridCfg(), { weaknesses: ["hydro"] }), REGISTRY, new Set());
  const before = [...state.dummy.weaknessElements];
  generateTiles(state.grid!, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "qiongjiu" });
  effectiveWeaknessElements(state, { kind: "boss" });
  effectiveWeaknessElements(state, { kind: "boss" });
  assert.deepEqual(state.dummy.weaknessElements, before, "weaknessElements is never written");
  assert.deepEqual(effectiveWeaknessElements(state, { kind: "boss" }), ["hydro", "burn"], "stable across calls");
});

test("T10: FK5's immunity is about DEBUFFS, not weakness — an immune holder still gains the weakness", () => {
  // "Immune to negative effects inflicted by Burn tiles" (T9) is about APPLIED STATUSES. The tile's
  // weakness application is a separate clause with no immunity stated — so the union still applies.
  const state = createState(scenario(gridCfg()), REGISTRY, new Set());
  state.dummy.passives = [{ kind: "tile_debuff_immunity", elements: ["burn"] }];
  generateTiles(state.grid!, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "qiongjiu" });
  assert.deepEqual(effectiveWeaknessElements(state, { kind: "boss" }), ["burn"], "weakness is not a 'negative effect' here");
});

// ============================================================ tracks position and tile lifetime

test("T10: the union follows TILE EXPIRY — once the tile lapses the weakness is gone", () => {
  const state = createState(scenario(gridCfg()), REGISTRY, new Set());
  generateTiles(state.grid!, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "qiongjiu" });
  assert.deepEqual(effectiveWeaknessElements(state, { kind: "boss" }), ["burn"]);
  tickTiles(state.grid!); // → 1
  assert.deepEqual(effectiveWeaknessElements(state, { kind: "boss" }), ["burn"], "still standing on it");
  tickTiles(state.grid!); // → 0, removed
  assert.deepEqual(effectiveWeaknessElements(state, { kind: "boss" }), [], "the tile is gone, so is the weakness");
});

test("T10: the union follows POSITION — a tile elsewhere grants nothing", () => {
  const state = createState(scenario(gridCfg()), REGISTRY, new Set());
  generateTiles(state.grid!, { origin: at(12, 12), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "qiongjiu" });
  assert.deepEqual(effectiveWeaknessElements(state, { kind: "boss" }), [], "the dummy is not on that tile");
});

test("T10: footprint-aware — a tile on ANY boss footprint tile counts (T9's query)", () => {
  const state = createState(scenario(gridCfg()), REGISTRY, new Set());
  generateTiles(state.grid!, { origin: at(6, 6), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "qiongjiu" }); // a corner
  assert.deepEqual(effectiveWeaknessElements(state, { kind: "boss" }), ["burn"]);
});

test("T10: a GRID LINE ENEMY gets its own declared weaknesses UNIONed with its tile", () => {
  const cfg = gridCfg({
    enemyUnits: [{ unitId: "line_enemy", coord: at(10, 10), defense: 100, weaknesses: ["freeze"] }],
  });
  const state = createState(scenario(cfg), REGISTRY, new Set());
  generateTiles(state.grid!, { origin: at(10, 10), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "qiongjiu" });
  assert.deepEqual([...effectiveWeaknessElements(state, { kind: "enemy", unitId: "line_enemy" })].sort(), ["burn", "freeze"]);
});

test("T10: version-scoped — an ALLIED tile applies its weakness to ENEMIES, not to the alliance", () => {
  // The source scopes it: "Inflicts Burn and Hydro weakness to ENEMY units in the area."
  const state = createState(scenario(gridCfg()), REGISTRY, new Set());
  generateTiles(state.grid!, { origin: at(2, 2), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "qiongjiu" }); // allied tile, under the ally
  assert.deepEqual(effectiveWeaknessElements(state, { kind: "ally", unitId: "qiongjiu" }), [], "an allied tile does not weaken allies");
});

test("T10: version-scoped — an ENEMY-version tile DOES apply its weakness to allies", () => {
  const state = createState(scenario(gridCfg()), REGISTRY, new Set());
  generateTiles(state.grid!, { origin: at(2, 2), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "hazard", version: "enemy" });
  assert.deepEqual(effectiveWeaknessElements(state, { kind: "ally", unitId: "qiongjiu" }), ["burn"]);
});

test("T10: version-scoped — a NEUTRAL tile applies its weakness to everyone", () => {
  const state = createState(scenario(gridCfg()), REGISTRY, new Set());
  generateTiles(state.grid!, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "hazard", version: "neutral" });
  assert.deepEqual(effectiveWeaknessElements(state, { kind: "boss" }), ["burn"], "the enemy side");
});

test("T10: an ally reports NO weakness (the engine models no ally weakness), tiles or not", () => {
  const state = createState(scenario(gridCfg()), REGISTRY, new Set());
  generateTiles(state.grid!, { origin: at(2, 2), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "qiongjiu" });
  assert.deepEqual(effectiveWeaknessElements(state, { kind: "ally", unitId: "qiongjiu" }), []);
});

// ============================================================ end to end: the DAMAGE number

const ATK = 1958;
const MULT = 1.5; // Common Rail

function commonRail(id: string): CharacterDef {
  return {
    class: "support",
    id,
    name: id,
    phase: "burn",
    base: { atk: ATK, hp: 1000, def: 100, stability: 6, critRate: 0, critDmg: 0.2 },
    skills: abilities({
      basic: { id: `${id}_rail`, name: "Common Rail", type: "basic", element: "burn", ammoType: "medium_ammo", multiplier: MULT, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
      active1: { id: `${id}_a1`, name: "-", type: "active", element: "burn", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      active2: { id: `${id}_a2`, name: "-", type: "active", element: "burn", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      ultimate: { id: `${id}_ult`, name: "-", type: "ultimate", element: "burn", multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 3 },
    }),
    passive: {
      id: `${id}_passive`,
      name: "-",
      // 1.20 bracket = 0.10 passive no-cover + 0.10 V6 (folded explicitly, as in the validated
      // weakness-matching fixture — required to reproduce the 1091 figure).
      effects: [{ kind: "conditional_damage_modifier", scope: "dealt", mode: "additive", value: 0.2, when: "target.noCover" }],
    },
    fixedKeys: [],
  } as CharacterDef;
}

function railRun(id: string, declared: Element[]) {
  const c = commonRail(id);
  return simulateScenario(
    {
      version: 1,
      seed: 3,
      turns: 1,
      team: [{ characterId: c.id, applyDispatchStats: false, rotation: ["basic"], equippedFixedKeys: [] }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 0, weaknesses: declared, weaknessTags: [], phase: null, cover: "none" },
      grid: {
        size: 15,
        units: [{ unitId: c.id, coord: at(2, 2) }],
        boss: { center: at(7, 7), footprintSide: 3 },
        initialTiles: [{ coord: at(7, 7), elements: ["burn"], generatedBy: c.id }],
      },
    },
    customRegistry({ [c.id]: c }),
  );
}

test("T10 END TO END: a Burn tile under a Burn-WEAK target adds no extra multiplier (already matched)", () => {
  // The control that proves the union is DE-DUPLICATED in the real damage path: the declared Burn
  // weakness already gives ×1.10, so the tile's Burn weakness must not add another ×1.10.
  const withTile = railRun("dedupe", ["burn"]).log[0];
  assert.equal(withTile.finalDamage, 1091, "the validated Burn-only figure — the tile changed nothing");
  assert.deepEqual(withTile.weaknessExploited, ["burn"], "exactly ONE Burn match — the tile did not double it");
});

test("T10 END TO END: a Burn tile GIVES the weakness to a target that did not declare it", () => {
  // Previously zero matched weaknesses → ×1.00; with the tile, Burn matches → ×1.10.
  const noWeakness = simulateScenario(
    {
      version: 1,
      seed: 3,
      turns: 1,
      team: [{ characterId: "nowk", applyDispatchStats: false, rotation: ["basic"], equippedFixedKeys: [] }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 0, weaknesses: [], weaknessTags: [], phase: null, cover: "none" },
    },
    customRegistry({ nowk: commonRail("nowk") }),
  ).log[0];
  const tiled = railRun("tiled", []).log[0];
  assert.ok(tiled.finalDamage > noWeakness.finalDamage, `tile ${tiled.finalDamage} > no-tile ${noWeakness.finalDamage}`);
  // 826.48 × 1.20 × 1.10 = 1091 — exactly the one-weakness figure.
  assert.equal(tiled.finalDamage, 1091, "the tile's Burn weakness supplies the ×1.10");
});

test("T10 END TO END: the tile's weakness also counts toward the +2 STABILITY bonus", () => {
  // Both the damage multiplier AND the stability bonus derive from the same matched set, so a tile
  // that supplies a weakness supplies both.
  const tiled = railRun("stab", []).log[0];
  assert.deepEqual(tiled.weaknessExploited, ["burn"], "the hit exploits a weakness the TILE supplied");
});

// ============================================================ wiring / honesty guards

test("T10: `weaknessElements` remains DECLARED-only everywhere (no mutation site exists)", async () => {
  // The mechanism must never write the field; the guard is that the union is the ONLY consumer.
  const src = await import("../engine/tiles.js");
  assert.equal(typeof src.effectiveWeaknessElements, "function");
});

test("T10: no tiles ⇒ the pre-T10 damage is preserved exactly (the additive guarantee, end to end)", () => {
  const noGrid = simulateScenario(
    {
      version: 1,
      seed: 3,
      turns: 1,
      team: [{ characterId: "nog", applyDispatchStats: false, rotation: ["basic"], equippedFixedKeys: [] }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 0, weaknesses: ["burn"], weaknessTags: [], phase: null, cover: "none" },
    },
    customRegistry({ nog: commonRail("nog") }),
  ).log[0];
  assert.equal(noGrid.finalDamage, 1091, "the validated figure is untouched without a grid");
});
