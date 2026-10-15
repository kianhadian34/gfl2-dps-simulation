import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGrid, tileKey } from "../engine/grid.js";
import {
  generateTiles,
  TILE_BASE_LEVEL,
  TILE_INITIAL_ROUNDS,
  TILE_RESET_ROUNDS,
} from "../engine/tiles.js";
import type { GridState } from "../engine/grid.js";
import type { GridConfig, GridCoord } from "../model/grid.js";

/**
 * ELEMENTAL TILES — T3/M3: TILE GENERATION (2026).
 *
 * The entry point for every tile clause (*"generates … tiles within a N-tile radius"*). It creates
 * tile effects across an AREA, seeding each new tile with the owner-stated initial duration, and
 * returns what it created.
 *
 * NOTHING here is `Validated`. The feature's existence on global is confirmed by the project owner
 * (2026, direct in-game evidence), but every RULE VALUE is still `[SOURCE]` — a community guide,
 * hierarchy level 5 — and **Not Tested** (`docs/research.md` §3.23). These tests pin the ENGINE's
 * behaviour, not the game's.
 */

const at = (x: number, y: number): GridCoord => ({ x, y });

function grid(over: Partial<GridConfig> = {}): GridState {
  return buildGrid({
    size: 15,
    units: [{ unitId: "vector", coord: at(5, 5) }],
    boss: { center: at(11, 11), footprintSide: 3 },
    blockedTiles: [{ coord: at(2, 2) }],
    ...over,
  });
}

const keys = (tiles: { tile: GridCoord }[]): string[] => tiles.map((r) => tileKey(r.tile.x, r.tile.y)).sort();
const coords = (results: { tile: GridCoord }[]): GridCoord[] => results.map((r) => r.tile);

// ------------------------------------------------------------ the basics

test("T3: a radius-0 area generates exactly the origin tile", () => {
  const g = grid();
  const created = generateTiles(g, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "vector" });
  assert.deepEqual(coords(created), [at(7, 7)]);
  assert.deepEqual(created[0].outcome, "created");
  assert.equal(g.tiles.size, 1, "one tile stored");
  assert.ok(g.tiles.has(tileKey(7, 7)));
});

test("T3: a NUMERIC area is a DIAMOND — radius 1 creates 5 tiles (origin + 4 orthogonal)", () => {
  const g = grid();
  const created = generateTiles(g, { origin: at(7, 7), shape: "manhattan", radius: 1, elements: ["burn"], generatedBy: "vector" });
  assert.deepEqual(keys(created), ["6,7", "7,6", "7,7", "7,8", "8,7"]);
  assert.ok(!g.tiles.has(tileKey(6, 6)), "the diagonal neighbour is NOT in a diamond");
});

test("T3: an NxN area is a SQUARE — radius 1 creates the full 3×3 block", () => {
  const g = grid();
  const created = generateTiles(g, { origin: at(7, 7), shape: "square", radius: 1, elements: ["burn"], generatedBy: "vector" });
  assert.equal(created.length, 9);
  for (let y = 6; y <= 8; y++) for (let x = 6; x <= 8; x++) assert.ok(g.tiles.has(tileKey(x, y)), `(${x},${y})`);
});

test("T3: the SHAPE choice changes the generated set (diamond ≠ square, same origin+radius)", () => {
  const diamond = generateTiles(grid(), { origin: at(7, 7), shape: "manhattan", radius: 1, elements: ["burn"], generatedBy: "v" });
  const square = generateTiles(grid(), { origin: at(7, 7), shape: "square", radius: 1, elements: ["burn"], generatedBy: "v" });
  assert.notDeepEqual(keys(diamond), keys(square), "the shape decides which tiles exist");
  assert.ok(keys(square).includes("6,6") && !keys(diamond).includes("6,6"), "only the square reaches the corner");
});

// ------------------------------------------------------------ the created tile's shape (duration, level, identity)

test("T3: duration init — a NEW tile gets initialRounds (2) and carries resetRounds (3)", () => {
  const g = grid();
  generateTiles(g, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "vector" });
  const t = g.tiles.get(tileKey(7, 7))!;
  assert.equal(t.durationLeft, TILE_INITIAL_ROUNDS, "a first-creation tile starts at its INITIAL duration");
  assert.equal(t.initialRounds, TILE_INITIAL_ROUNDS);
  assert.equal(t.resetRounds, TILE_RESET_ROUNDS, "the reset value is stored for the upgrade slices (T5/T7)");
  assert.equal(t.durationLeft, 2, "owner-stated initial duration");
  assert.equal(t.resetRounds, 3, "owner-stated reset duration");
});

test("T3: a freshly generated tile is the BASE level (1) — level-ups are T5/T7", () => {
  const g = grid();
  generateTiles(g, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "vector" });
  assert.equal(g.tiles.get(tileKey(7, 7))!.level, TILE_BASE_LEVEL);
  assert.equal(TILE_BASE_LEVEL, 1);
});

test("T3: version defaults to `allied` (the only reachable version) and is overridable", () => {
  const a = grid();
  generateTiles(a, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "vector" });
  assert.equal(a.tiles.get(tileKey(7, 7))!.version, "allied", "no enemy generator exists in the MVP");

  const b = grid();
  generateTiles(b, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "someone", version: "neutral" });
  assert.equal(b.tiles.get(tileKey(7, 7))!.version, "neutral", "the version is data (T6)");
});

test("T3: provenance — `generatedBy` is recorded", () => {
  const g = grid();
  generateTiles(g, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "vector" });
  assert.equal(g.tiles.get(tileKey(7, 7))!.generatedBy, "vector");
});

test("T3: elements are recorded — 1 element is a base tile, 2 is a fusion tile", () => {
  const base = grid();
  generateTiles(base, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "v" });
  assert.deepEqual(base.tiles.get(tileKey(7, 7))!.elements, ["burn"]);

  const fusion = grid();
  generateTiles(fusion, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn", "hydro"], generatedBy: "v" });
  assert.deepEqual(fusion.tiles.get(tileKey(7, 7))!.elements, ["burn", "hydro"]);
});

test("T3: the stored element list is a COPY — mutating the caller's array does not touch the tile", () => {
  const g = grid();
  const elements: ("burn" | "hydro")[] = ["burn"];
  generateTiles(g, { origin: at(7, 7), shape: "manhattan", radius: 0, elements, generatedBy: "v" });
  elements.push("hydro");
  assert.deepEqual(g.tiles.get(tileKey(7, 7))!.elements, ["burn"], "the tile must not alias the caller's array");
});

// ------------------------------------------------------------ the return value / boundary

test("T3: the return value is ONLY the tiles this call acted on", () => {
  const g = grid();
  const first = generateTiles(g, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "v" });
  assert.deepEqual(coords(first), [at(7, 7)]);
  const second = generateTiles(g, { origin: at(9, 9), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "v" });
  assert.deepEqual(coords(second), [at(9, 9)], "not the earlier tile");
  assert.equal(g.tiles.size, 2, "generation accumulates on the state's tile map");
});

test("T3 → T5 SUPERSEDED: an occupied tile is now acted on by the addition rule (was left untouched)", () => {
  // T3's slice boundary was "generation never writes a tile twice". T5 implemented the rule that
  // boundary deferred, so this test now pins the NEW contract: an occupied tile IS acted on, and the
  // outcome is reported. T3's other guarantees (below this test) are untouched.
  const g = grid();
  generateTiles(g, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "vector" });

  const again = generateTiles(g, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "other" });

  assert.equal(again.length, 1, "the occupied tile IS acted on now (T5)");
  assert.equal(again[0].outcome, "upgraded", "same element → level up (the T5 rule)");
  assert.equal(g.tiles.size, 1, "no second entry — still one tile");
  assert.equal(g.tiles.get(tileKey(7, 7))!.level, 2, "levelled");
  assert.equal(g.tiles.get(tileKey(7, 7))!.durationLeft, TILE_RESET_ROUNDS, "duration reset to 3 (T4's reset)");
});

// ------------------------------------------------------------ bounds / terrain

test("T3: an out-of-bounds origin creates nothing", () => {
  const g = grid();
  assert.deepEqual(generateTiles(g, { origin: at(99, 99), shape: "manhattan", radius: 1, elements: ["burn"], generatedBy: "v" }), []);
  assert.deepEqual(generateTiles(g, { origin: at(-3, -3), shape: "square", radius: 2, elements: ["burn"], generatedBy: "v" }), []);
  assert.equal(g.tiles.size, 0);
});

test("T3: an area clipped by the grid edge creates ONLY the in-bounds tiles", () => {
  const g = grid();
  const created = generateTiles(g, { origin: at(0, 0), shape: "manhattan", radius: 1, elements: ["burn"], generatedBy: "v" });
  assert.deepEqual(keys(created), ["0,0", "0,1", "1,0"], "the two off-grid arms of the diamond are dropped");
  assert.equal(created.length, 3);
});

test("T3: NO terrain filter — generation lands on a BLOCKED tile and on the BOSS FOOTPRINT", () => {
  // The source restricts generation by the AREA only; no terrain filter is invented (§7 decision 6).
  // Whether generation *should* skip impassable terrain is Not Tested — flagged, not guessed.
  const g = grid();
  generateTiles(g, { origin: at(2, 2), shape: "square", radius: 0, elements: ["burn"], generatedBy: "v" });
  assert.ok(g.tiles.has(tileKey(2, 2)), "a blocked (impassable) tile can still be generated on");

  generateTiles(g, { origin: at(11, 11), shape: "square", radius: 0, elements: ["burn"], generatedBy: "v" });
  assert.ok(g.tiles.has(tileKey(11, 11)), "the boss footprint tile can still be generated on");
});

test("T3: an empty element set is rejected (a tile with no element has no meaning)", () => {
  assert.throws(
    () => generateTiles(grid(), { origin: at(7, 7), shape: "manhattan", radius: 0, elements: [], generatedBy: "v" }),
    /at least one element/,
  );
  assert.equal(grid().tiles.size, 0, "nothing is created when the spec is invalid");
});

// ------------------------------------------------------------ fixture guards

test("T3: the duration constants are the owner-stated initial 2 / reset 3", () => {
  assert.equal(TILE_INITIAL_ROUNDS, 2);
  assert.equal(TILE_RESET_ROUNDS, 3);
  assert.notEqual(TILE_INITIAL_ROUNDS, TILE_RESET_ROUNDS, "two values for two EVENTS — never collapsed");
});

test("T3: no UPGRADE/FUSION/trigger functions exist yet (scope guard)", async () => {
  // Guard against scope creep: T3 ships generation only. Upgrade is T5, versioning T6, fusion T7,
  // triggers T8 — none of them may appear before its slice.
  //
  // `tickTiles` / `resetTileDuration` were in this list while T3 was the newest slice; **T4 now owns
  // them** and the guard is advanced deliberately rather than loosened — the T4 lifecycle tests assert
  // those two DO exist, so they cannot silently vanish either.
  const tiles = await import("../engine/tiles.js");
  const suspicious = Object.keys(tiles).filter((k) => /^(upgradeTile|fuseTile|applyTileTrigger|advanceTiles)/.test(k));
  assert.deepEqual(suspicious, [], "generation + lifecycle only so far (docs/tiles.md slice plan)");
});
