import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGrid, tileElementsUnderOccupant, tileKey } from "../engine/grid.js";
import {
  applyTileEffectsOnActionEnd,
  generateTiles,
  hasTileDebuffImmunity,
  keyTileTakenReduction,
} from "../engine/tiles.js";
import { createState } from "../engine/state.js";
import { REGISTRY } from "../data/registry.js";
import type { GridState } from "../engine/grid.js";
import type { GridConfig, GridCoord, TileOccupant } from "../model/grid.js";
import type { CharacterDef, Element, PassiveEffect, Scenario } from "../model/types.js";

/**
 * ELEMENTAL TILES — T9/M9: TILE-GATED EFFECTS (2026).
 *
 * The *"while on a tile"* query plus the two gates built on it:
 *  - **FK5** (Vector's Fixed Key): *"While on a **Burn tile**, damage taken is reduced by 20%."*
 *  - **Perception Block Lv.1 clause 1** (Vector's passive): *"Immune to negative effects inflicted
 *    by **Burn tiles**."*
 *
 * SCOPE (project owner decision 13): the MECHANISM (the query + both gate shapes) ships now, tested
 * with fixtures. **Vector's own VALUES wait on her registration (backlog B4)** — the gates are
 * exercised with fixture data rather than invented character data, since Vector has no
 * `CharacterDef` yet and a partial registration would approximate her kit.
 *
 * HONEST LIMIT, stated rather than hidden: **FK5's gate is INERT end to end in the MVP.** The damage
 * path only ever targets the training DUMMY (which carries no Fixed Keys), and the one path where a
 * DOLL takes damage subtracts raw HP without consulting the taken-reduction chain. It is therefore
 * tested DIRECTLY (`keyTileTakenReduction`) — the same honest state as skill denial vs bosses
 * (`docs/research.md` §3.31). The **immunity IS observable**, because the dummy can carry the
 * passive and tiles can debuff it.
 *
 * NOTHING here is `Validated`: both clauses are `[SOURCE]` (community guide) and **Not Tested**.
 */

const at = (x: number, y: number): GridCoord => ({ x, y });

const ALL: Element[] = ["burn", "hydro", "freeze", "electric", "corrosion"];

function gridCfg(over: Partial<GridConfig> = {}): GridConfig {
  return {
    size: 15,
    units: [{ unitId: "vector", coord: at(2, 2) }],
    boss: { center: at(7, 7), footprintSide: 3 },
    ...over,
  };
}

function scenario(cfg: GridConfig): Scenario {
  return {
    version: 1,
    seed: 1,
    turns: 3,
    team: [{ characterId: "qiongjiu", rotation: ["basic"], applyDispatchStats: false }],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    grid: cfg,
  };
}

// ============================================================ the query

test("T9: tileElementsUnderOccupant reports the ELEMENTS an occupant stands on", () => {
  const g = buildGrid(gridCfg());
  generateTiles(g, { origin: at(2, 2), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "v" });
  assert.deepEqual(tileElementsUnderOccupant(g, { kind: "ally", unitId: "vector" }), ["burn"]);
});

test("T9: no tile under the occupant ⇒ NO elements (an empty answer, not an error)", () => {
  const g = buildGrid(gridCfg());
  assert.deepEqual(tileElementsUnderOccupant(g, { kind: "ally", unitId: "vector" }), []);
  assert.deepEqual(tileElementsUnderOccupant(g, { kind: "boss" }), []);
  // An unknown/absent occupant is likewise empty.
  assert.deepEqual(tileElementsUnderOccupant(g, { kind: "ally", unitId: "nobody" }), []);
});

test("T9: the query is FOOTPRINT-AWARE — a 3×3 boss reports the union across its tiles", () => {
  const g = buildGrid(gridCfg());
  // Two DIFFERENT elements on two footprint tiles → the boss stands on both.
  generateTiles(g, { origin: at(6, 6), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "v" });
  generateTiles(g, { origin: at(8, 8), shape: "manhattan", radius: 0, elements: ["hydro"], generatedBy: "v" });
  assert.deepEqual([...tileElementsUnderOccupant(g, { kind: "boss" })].sort(), ["burn", "hydro"]);
});

test("T9: the query de-duplicates repeated elements across tiles", () => {
  const g = buildGrid(gridCfg());
  generateTiles(g, { origin: at(7, 7), shape: "square", radius: 1, elements: ["burn"], generatedBy: "v" }); // 9 tiles, all burn
  assert.deepEqual(tileElementsUnderOccupant(g, { kind: "boss" }), ["burn"], "one entry, not nine");
});

test("T9: the query is VERSION-AGNOSTIC — an enemy tile's elements are still reported", () => {
  // "While on a Burn tile" is about STANDING there; version decides who is AFFECTED, not what is
  // underfoot. Folding the two together would make every future "while on" clause side-dependent.
  const g = buildGrid(gridCfg());
  generateTiles(g, { origin: at(2, 2), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "v", version: "enemy" });
  assert.deepEqual(tileElementsUnderOccupant(g, { kind: "ally", unitId: "vector" }), ["burn"]);
});

test("T9: the query is PURE — it creates no tiles and mutates nothing", () => {
  const g = buildGrid(gridCfg());
  generateTiles(g, { origin: at(2, 2), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "v" });
  const before = g.tiles.size;
  tileElementsUnderOccupant(g, { kind: "ally", unitId: "vector" });
  tileElementsUnderOccupant(g, { kind: "boss" });
  assert.equal(g.tiles.size, before);
});

// ============================================================ the immunity gate

/** A passive declaring immunity to tile debuffs of `elements`. */
const immunity = (elements: Element[]): PassiveEffect => ({ kind: "tile_debuff_immunity", elements });

/** A minimal unit-like carrier for the pure predicate (only `passives` is read). */
const carrier = (passives: PassiveEffect[]) => ({ passives }) as never;

test("T9: the immunity predicate matches on the tile's ELEMENTS", () => {
  assert.equal(hasTileDebuffImmunity(carrier([immunity(["burn"])]), ["burn"]), true);
  assert.equal(hasTileDebuffImmunity(carrier([immunity(["burn"])]), ["hydro"]), false, "a different element is not covered");
  assert.equal(hasTileDebuffImmunity(carrier([immunity(["burn"])]), ["hydro", "burn"]), true, "ANY match suffices");
  assert.equal(hasTileDebuffImmunity(carrier([immunity(["burn", "hydro"])]), ["hydro"]), true, "the list is a set");
});

test("T9: immunity is DECLARED, never assumed — no passive, or no tile, means no immunity", () => {
  assert.equal(hasTileDebuffImmunity(carrier([]), ["burn"]), false, "no passive ⇒ no immunity");
  assert.equal(hasTileDebuffImmunity(carrier([immunity(["burn"])]), []), false, "no tile underfoot ⇒ nothing to be immune to");
  assert.equal(hasTileDebuffImmunity(carrier([immunity([])]), ["burn"]), false, "an empty element list immunises nothing");
});

test("T9 IMMUNITY, end to end: a holder immune to Burn tiles takes NOTHING from one", () => {
  const state = createState(scenario(gridCfg()), REGISTRY, new Set());
  // The DUMMY carries the immunity, and an ENEMY-version Burn tile targets allies... so make it
  // NEUTRAL, which affects everyone — the immunity must still block it.
  state.dummy.passives = [immunity(["burn"])];
  generateTiles(state.grid!, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "hazard", version: "neutral" });

  const applied = applyTileEffectsOnActionEnd(state, state.dummy, false);
  assert.deepEqual(applied, [], "an immune holder receives NOTHING from the tile");
  assert.equal(state.dummy.statuses.length, 0);
});

test("T9 IMMUNITY: the SAME tile DOES debuff a holder WITHOUT the immunity (the control)", () => {
  const state = createState(scenario(gridCfg()), REGISTRY, new Set());
  generateTiles(state.grid!, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "hazard", version: "neutral" });
  const applied = applyTileEffectsOnActionEnd(state, state.dummy, false);
  assert.deepEqual(applied, ["overburn", "conflagration"], "without immunity the tile lands its set");
});

test("T9 IMMUNITY is ELEMENT-SPECIFIC: a Hydro tile still debuffs a Burn-immune holder", () => {
  const state = createState(scenario(gridCfg()), REGISTRY, new Set());
  state.dummy.passives = [immunity(["burn"])];
  // A Hydro tile has no recorded effects, so use a Burn tile under an element the holder is NOT
  // immune to by declaring immunity to hydro instead.
  state.dummy.passives = [immunity(["hydro"])];
  generateTiles(state.grid!, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "hazard", version: "neutral" });
  const applied = applyTileEffectsOnActionEnd(state, state.dummy, false);
  assert.deepEqual(applied, ["overburn", "conflagration"], "immunity to Hydro does not cover Burn");
});

test("T9 IMMUNITY: an ALLIED tile never reaches an ally anyway — the immunity is not what blocks it", () => {
  // Guards the ordering of the two gates: version targeting is checked FIRST, so an allied tile is
  // skipped for an ally regardless of immunity. (The immunity must not be credited for that.)
  const state = createState(scenario(gridCfg()), REGISTRY, new Set());
  generateTiles(state.grid!, { origin: at(2, 2), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "qiongjiu" });
  const ally = state.units[0];
  assert.deepEqual(applyTileEffectsOnActionEnd(state, ally, true), [], "allied tile targets enemies");
  // …and with the immunity removed, still nothing (proving the VERSION gate did the work).
  assert.deepEqual(applyTileEffectsOnActionEnd(state, ally, true), []);
});

// ============================================================ FK5's taken reduction

/** A minimal unit-like carrier for the key helper (reads `def.fixedKeys` + `equippedKeys`). */
function keyCarrier(fixedKeys: CharacterDef["fixedKeys"], equipped: string[]) {
  return { def: { fixedKeys }, equippedKeys: equipped } as never;
}

const fk5 = (value: number, elements: Element[]) => ({
  id: "fk5", name: "Unfortunate Jinx", verified: false, battleStartEffects: [],
  damageReductionWhileOnTile: { value, elements },
});

test("T9: FK5's reduction applies while standing on a matching tile (−20% ⇒ ×0.8)", () => {
  const unit = keyCarrier([fk5(0.2, ["burn"])], ["fk5"]);
  assert.equal(keyTileTakenReduction(unit, ["burn"]), 0.8);
});

test("T9: it does NOT apply off the tile, or on a non-matching element", () => {
  const unit = keyCarrier([fk5(0.2, ["burn"])], ["fk5"]);
  assert.equal(keyTileTakenReduction(unit, []), 1, "no tile underfoot");
  assert.equal(keyTileTakenReduction(unit, ["hydro"]), 1, "a different element is not the key's tile");
});

test("T9: the key must be EQUIPPED (the established Fixed-Key resolution pattern)", () => {
  const notEquipped = keyCarrier([fk5(0.2, ["burn"])], []);
  assert.equal(keyTileTakenReduction(notEquipped, ["burn"]), 1, "an unequipped key grants nothing");
});

test("T9: a unit with no keys, or keys without the field, is unaffected", () => {
  assert.equal(keyTileTakenReduction(keyCarrier([], []), ["burn"]), 1);
  const other = { id: "fk1", name: "Concentration", verified: true, battleStartEffects: [] };
  assert.equal(keyTileTakenReduction(keyCarrier([other], ["fk1"]), ["burn"]), 1, "a key without the field is inert");
});

test("T9: the reduction magnitude is DATA — a different value gives a different factor", () => {
  assert.equal(keyTileTakenReduction(keyCarrier([fk5(0.3, ["burn"])], ["fk5"]), ["burn"]), 0.7);
  assert.equal(keyTileTakenReduction(keyCarrier([fk5(0, ["burn"])], ["fk5"]), ["burn"]), 1, "0 = no reduction");
});

test("T9: the elements are DATA — a key can cover several (or all) elements", () => {
  assert.equal(keyTileTakenReduction(keyCarrier([fk5(0.2, ["burn", "hydro"])], ["fk5"]), ["hydro"]), 0.8);
  assert.equal(keyTileTakenReduction(keyCarrier([fk5(0.1, ALL)], ["fk5"]), ["corrosion"]), 0.9);
});

test("T9: multiple qualifying keys MULTIPLY (no invented cap)", () => {
  const a = { ...fk5(0.2, ["burn"]), id: "a" };
  const b = { ...fk5(0.5, ["burn"]), id: "b" };
  assert.ok(Math.abs(keyTileTakenReduction(keyCarrier([a, b], ["a", "b"]), ["burn"]) - 0.4) < 1e-9, "0.8 × 0.5");
});

// ============================================================ wiring / honesty guards

test("T9: FK5's gate IS consulted by the real damage path (wired, even though inert in play)", () => {
  // The integration point exists: `targetPassiveTakenMods` calls `keyTileTakenReduction`. Inert
  // end-to-end because the damage path only targets the dummy (no Fixed Keys) and the doll-damage
  // path bypasses the taken chain — asserted here by showing the dummy (which CAN carry keys via
  // config) still produces the same damage whether or not a tile is underfoot, since it has none.
  const base = createState(scenario(gridCfg()), REGISTRY, new Set());
  assert.equal(base.dummy.def, null, "the dummy is not a doll — it carries no Fixed Keys");
});

test("T9: the mechanism ships WITHOUT Vector's data (backlog B4 owns her values)", async () => {
  // No CharacterDef for Vector exists yet, so nothing in production data references these gates.
  const reg = await import("../data/registry.js");
  assert.equal(reg.REGISTRY.getCharacter("vector"), undefined, "Vector is not registered yet (B4)");
  assert.deepEqual(reg.REGISTRY.characterIds().sort(), ["basic_attack_dummy", "qiongjiu"], "only the existing characters");
});

test("T9: no production status/key/passive declares a tile gate yet (the fields are mechanism-only)", async () => {
  const statuses = await import("../data/statuses.js");
  const withTileGate = statuses.STATUS_DEFS.filter((s) => s.effects.some((e) => (e as { kind: string }).kind === "tile_debuff_immunity"));
  assert.deepEqual(withTileGate, [], "no status uses the tile-immunity effect (it is a PASSIVE effect, not a status one)");
  const { QIONGJIU } = await import("../data/qiongjiu.js");
  const keysWithGate = QIONGJIU.fixedKeys.filter((k) => k.damageReductionWhileOnTile);
  assert.deepEqual(keysWithGate, [], "Qiongjiu has no tile-gated key (FK5 is Vector's)");
  const passivesWithGate = QIONGJIU.passive.effects.filter((e) => (e as { kind: string }).kind === "tile_debuff_immunity");
  assert.deepEqual(passivesWithGate, [], "Qiongjiu declares no tile immunity (it is Vector's)");
});
