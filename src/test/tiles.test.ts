import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGrid, tileKey } from "../engine/grid.js";
import { AREA_SHAPES } from "../model/grid.js";
import type { GridConfig, GridCoord, TileEffect } from "../model/grid.js";

/**
 * ELEMENTAL TILES — M1 (storage + identity ONLY), 2026.
 *
 * M1 gives tiles somewhere to live: the `TileEffect` type and `GridState.tiles`. It deliberately
 * implements NO rules — no generation, no upgrade, no fusion, no triggers, no duration ticking
 * (those are slices T3+ in `docs/tiles.md`; the RULES are owned by `docs/research.md` §3.23).
 *
 * So these tests pin the SHAPE and the STORAGE contract, not any game behaviour:
 *  - a built grid starts with an EMPTY tile map;
 *  - the map is keyed by the engine's existing `tileKey` convention;
 *  - the map is PER-GRID-STATE (two grids never share one);
 *  - `TileEffect` can express both a base tile and a fusion tile, all three versions, and the two
 *    INDEPENDENT duration values the conflicting sources require.
 *
 * Nothing here is `Validated` — the underlying rules are `[SOURCE]` (community guide, level 5).
 */

const at = (x: number, y: number): GridCoord => ({ x, y });

function baseGrid(over: Partial<GridConfig> = {}): GridConfig {
  return { size: 15, units: [], boss: { center: at(7, 7), footprintSide: 3 }, ...over };
}

/** A minimal well-formed record — the fields M1 is responsible for. */
const aTile = (over: Partial<TileEffect> = {}): TileEffect => ({
  elements: ["burn"],
  level: 1,
  durationLeft: 2,
  initialRounds: 2,
  resetRounds: 3,
  version: "allied",
  generatedBy: "vector",
  ...over,
});

// ------------------------------------------------------------ storage

test("M1: a freshly built grid has an EMPTY tile map (no tiles are pre-placed)", () => {
  const g = buildGrid(baseGrid());
  assert.ok(g.tiles instanceof Map, "tiles is a Map");
  assert.equal(g.tiles.size, 0, "no tile effects exist until generation (T3) creates them");
});

test("M1: the tile map is keyed by the engine's existing tileKey convention", () => {
  const g = buildGrid(baseGrid());
  g.tiles.set(tileKey(3, 4), aTile());
  assert.equal(g.tiles.size, 1);
  assert.ok(g.tiles.has("3,4"), "keyed `x,y` — the same convention as heights/blocked/allyTiles");
  assert.deepEqual(g.tiles.get("3,4")!.elements, ["burn"]);
});

test("M1: the tile map is PER-GRID-STATE — two grids never share one", () => {
  const a = buildGrid(baseGrid());
  const b = buildGrid(baseGrid());
  a.tiles.set(tileKey(1, 1), aTile());
  assert.equal(a.tiles.size, 1, "grid A has the tile");
  assert.equal(b.tiles.size, 0, "grid B is UNAFFECTED (no shared module-level map)");
  assert.notEqual(a.tiles, b.tiles, "distinct Map instances");
});

test("M1: tiles live on the RUNTIME grid, independent of static terrain", () => {
  // heights/blocked/enemyTiles are fixed at build; `tiles` starts empty and is meant to mutate.
  const g = buildGrid(baseGrid({ blockedTiles: [{ coord: at(0, 0) }], highTiles: [at(1, 1)] }));
  assert.equal(g.blocked.size, 1, "static terrain is populated at build time");
  assert.equal(g.tiles.size, 0, "effect tiles are NOT static terrain");
  // Adding an effect tile does not disturb the terrain sets.
  g.tiles.set(tileKey(0, 0), aTile());
  assert.ok(g.blocked.has("0,0"), "the blocked tile is unchanged by an effect tile on it");
  assert.equal(g.tiles.size, 1);
});

// ------------------------------------------------------------ identity expressibility

test("M1: a BASE tile carries ONE element; a FUSION tile carries TWO", () => {
  const base = aTile({ elements: ["burn"] });
  const fusion = aTile({ elements: ["burn", "hydro"] });
  assert.equal(base.elements.length, 1, "base tile = 1 element");
  assert.equal(fusion.elements.length, 2, "fusion tile = 2 elements (fusion is NOT 'last element wins')");
  // Order is not significant — the type stores a set-like list.
  assert.deepEqual([...fusion.elements].sort(), ["burn", "hydro"]);
});

test("M1: all THREE levels and all THREE versions are expressible", () => {
  for (const level of [1, 2, 3] as const) {
    assert.equal(aTile({ level }).level, level, `level ${level}`);
  }
  for (const version of ["allied", "enemy", "neutral"] as const) {
    assert.equal(aTile({ version }).version, version, `version ${version}`);
  }
});

test("M1: a tile records WHO generated it (drives version/provenance)", () => {
  assert.equal(aTile({ generatedBy: "vector" }).generatedBy, "vector");
  assert.equal(aTile({ generatedBy: "other_doll" }).generatedBy, "other_doll");
});

// ------------------------------------------------------------ the duration conflict

test("M1: the TWO duration values are independent (the sources conflict by one round)", () => {
  // Generation says "2 turns" (Searing Finale, FK1); upgrade/fusion "resets to 3 rounds".
  // M1 keeps BOTH so neither reading is silently chosen.
  const t = aTile({ initialRounds: 2, resetRounds: 3, durationLeft: 2 });
  assert.equal(t.initialRounds, 2, "fresh generation duration (source: \"2 turns\")");
  assert.equal(t.resetRounds, 3, "upgrade/fusion reset duration (source: \"resets to 3 rounds\")");
  assert.equal(t.durationLeft, 2, "the live counter may differ from EITHER constant");
  // They must be settable to DIFFERENT values — collapsing them is the failure this pins.
  assert.notEqual(t.initialRounds, t.resetRounds, "the two values are genuinely separate");
});

test("M1: durationLeft is a live counter, distinct from the constants", () => {
  const t = aTile({ durationLeft: 1, initialRounds: 2, resetRounds: 3 });
  assert.equal(t.durationLeft, 1, "a tile mid-life can hold any value");
});

// ------------------------------------------------------------ non-goals / fixture guards

test("M1: no tile RULES exist yet — the type is storage only", async () => {
  // Guard against scope creep: M1 ships no generation/upgrade/fusion helpers.
  const grid = await import("../engine/grid.js");
  const suspicious = Object.keys(grid).filter((k) => /^(generateTile|upgradeTile|fuseTile|tickTiles)/.test(k));
  assert.deepEqual(suspicious, [], "M1 adds NO tile-rule functions (those are T3+ in docs/tiles.md)");
});

test("M1: the area vocabulary from slice 9 is still intact (tiles will reuse it)", () => {
  // Tile generation targets an AREA ("generates tiles within N tiles"), so `AreaShape` must remain
  // available — this pins that M1 did not disturb it.
  assert.deepEqual([...AREA_SHAPES].sort(), ["manhattan", "square"]);
});
