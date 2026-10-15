import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGrid, tileKey } from "../engine/grid.js";
import {
  generateTiles,
  resetTileDuration,
  tickTiles,
  TILE_INITIAL_ROUNDS,
  TILE_RESET_ROUNDS,
} from "../engine/tiles.js";
import type { GridState } from "../engine/grid.js";
import type { GridConfig, GridCoord, TileEffect } from "../model/grid.js";

/**
 * ELEMENTAL TILES — T4/M4: THE LIFECYCLE (2026).
 *
 * A tile's duration clock: it counts ROUNDS down and the tile is removed when it elapses
 * (`tickTiles`), plus the duration REFRESH (`resetTileDuration`) the duration rule describes —
 * *"resets to 3"* on a subsequent addition, which at **Lv3** is *"only refreshes duration"*.
 *
 * SCOPE — this slice owns the TIME dimension only. Two things are deliberately NOT here:
 *  - **what a tile DEBUFFS** — the trigger slices (T8/T9). `tickTiles` never decides who a tile
 *    affects; it only ages tiles.
 *  - **leveling** — the *"the SAME element levels it up"* half of the layer's rule needs the
 *    element-matching question answered, which is the UPGRADE slice (T5). T4 supplies the duration
 *    reset that T5 composes with a level bump.
 *
 * NOTHING here is `Validated`: the feature's existence on global is confirmed by the project owner
 * (2026, level 1), but the tile RULES — including that the clock counts rounds and that expiry
 * removes the tile — remain `[SOURCE]` (community guide, level 5) and **Not Tested**.
 */

const at = (x: number, y: number): GridCoord => ({ x, y });

function grid(over: Partial<GridConfig> = {}): GridState {
  return buildGrid({
    size: 15,
    units: [{ unitId: "vector", coord: at(5, 5) }],
    boss: { center: at(11, 11), footprintSide: 3 },
    ...over,
  });
}

/** A grid with one freshly generated tile at (7,7). */
function withTile(elements: ("burn" | "hydro")[] = ["burn"]): GridState {
  const g = grid();
  generateTiles(g, { origin: at(7, 7), shape: "manhattan", radius: 0, elements, generatedBy: "vector" });
  return g;
}

const K = tileKey(7, 7);
const tileOf = (g: GridState): TileEffect => g.tiles.get(K)!;

// ------------------------------------------------------------ ticking

test("T4: a tick decrements every tile's duration by one round", () => {
  const g = withTile();
  assert.equal(tileOf(g).durationLeft, TILE_INITIAL_ROUNDS);
  tickTiles(g);
  assert.equal(tileOf(g).durationLeft, TILE_INITIAL_ROUNDS - 1, "one round elapsed");
  tickTiles(g);
  assert.equal(g.tiles.size, 0, "the second tick elapses the initial 2-round duration");
});

test("T4: the tick counts ROUNDS — each call is one round, regardless of any unit's turn", () => {
  // Like `endOfRoundStability`, the tile clock is round-scoped, not holder-action-scoped: a tile is
  // terrain with its own clock.
  const g = withTile();
  for (let round = 1; round <= TILE_INITIAL_ROUNDS - 1; round++) {
    tickTiles(g);
    assert.equal(g.tiles.size, 1, `still alive after ${round} of ${TILE_INITIAL_ROUNDS} rounds`);
  }
  tickTiles(g);
  assert.equal(g.tiles.size, 0, `expires after exactly ${TILE_INITIAL_ROUNDS} rounds`);
});

// ------------------------------------------------------------ expiry

test("T4: a tile that reaches 0 is REMOVED from the tile map", () => {
  const g = withTile();
  tickTiles(g); // -> 1
  assert.ok(g.tiles.has(K), "not yet");
  tickTiles(g); // -> 0 -> removed
  assert.equal(g.tiles.has(K), false, "an elapsed tile leaves no entry — the map stays sparse");
  assert.equal(g.tiles.size, 0);
});

test("T4: tickTiles returns ONLY the keys that expired on THIS tick", () => {
  const g = grid();
  // A long-lived tile and a fresh one, so they expire on different ticks.
  generateTiles(g, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "v" });
  generateTiles(g, { origin: at(9, 9), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "v" });
  g.tiles.get(tileKey(9, 9))!.durationLeft = 5; // the (9,9) tile outlives the (7,7) one

  const first = tickTiles(g);
  assert.equal(first.length, 0, "neither has expired yet");

  g.tiles.get(K)!.durationLeft = 1; // (7,7) is about to elapse
  const second = tickTiles(g);
  assert.deepEqual(second, [K], "only the tile that actually expired is reported");
  assert.ok(g.tiles.has(tileKey(9, 9)), "the longer-lived tile is untouched");
});

test("T4: an empty tile map ticks to nothing (no tiles, no expiries)", () => {
  const g = grid();
  assert.deepEqual(tickTiles(g), []);
  assert.equal(g.tiles.size, 0);
});

test("T4: tiles expire INDEPENDENTLY — one tile's expiry does not disturb another's clock", () => {
  const g = grid();
  generateTiles(g, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "v" });
  generateTiles(g, { origin: at(9, 9), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "v" });
  g.tiles.get(K)!.durationLeft = 1; // (7,7) expires next tick
  g.tiles.get(tileKey(9, 9))!.durationLeft = 3;

  const expired = tickTiles(g);
  assert.deepEqual(expired, [K]);
  assert.equal(g.tiles.get(tileKey(9, 9))!.durationLeft, 2, "the survivor ticked down normally");
});

// ------------------------------------------------------------ the full initial lifetime (evidence)

test("T4: an initial tile lives exactly 2 rounds — generate → 1 tick alive → 1 tick expired", () => {
  const g = withTile();
  assert.equal(tileOf(g).initialRounds, 2, "owner-stated initial duration");
  assert.equal(tickTiles(g).length, 0, "round 1 ends: alive");
  assert.equal(tileOf(g).durationLeft, 1, "one round consumed of the initial 2");
  assert.equal(tickTiles(g).length, 1, "round 2 ends: expired");
  assert.equal(g.tiles.size, 0);
});

// ------------------------------------------------------------ the duration REFRESH

test("T4: resetTileDuration sets durationLeft to `resetRounds` (3)", () => {
  const g = withTile();
  tickTiles(g); // -> 1
  resetTileDuration(tileOf(g));
  assert.equal(tileOf(g).durationLeft, TILE_RESET_ROUNDS);
  assert.equal(tileOf(g).durationLeft, 3, "owner-stated reset duration");
});

test("T4: the refresh is driven by the tile's OWN `resetRounds` field, not a hard-coded 3", () => {
  const g = withTile();
  tileOf(g).resetRounds = 7; // a hypothetical future tile type
  resetTileDuration(tileOf(g));
  assert.equal(tileOf(g).durationLeft, 7, "the stored field is the authority");
});

test("T4: the refresh PROLONGS life — a tile the tick would have killed survives it", () => {
  const g = withTile();
  tickTiles(g); // -> 1 (about to expire on the next tick)
  resetTileDuration(tileOf(g)); // -> 3
  assert.equal(tickTiles(g).length, 0, "the refresh kept it alive");
  assert.equal(tileOf(g).durationLeft, 2);
  assert.equal(tickTiles(g).length, 0, "and it still has life");
  assert.equal(tileOf(g).durationLeft, 1);
  assert.equal(tickTiles(g).length, 1, "3 rounds after the refresh, it expires");
});

test("T4: the reset does NOT change the LEVEL — leveling is the UPGRADE slice (T5)", () => {
  const g = withTile();
  tileOf(g).level = 2;
  resetTileDuration(tileOf(g));
  assert.equal(tileOf(g).level, 2, "T4 owns the clock only; the level bump is T5's rule");
});

test("T4: at LV3 the reset is exactly the 'only refreshes duration' case — clock resets, level stays 3", () => {
  // §3.23.1: "At Lv3, further generation only refreshes duration." A Lv3 tile cannot level past 3,
  // so the whole effect of a further addition is the duration reset T4 provides.
  const g = withTile();
  const t = tileOf(g);
  t.level = 3;
  t.durationLeft = 1;
  resetTileDuration(t);
  assert.equal(t.level, 3, "still Lv3 — the cap held");
  assert.equal(t.durationLeft, TILE_RESET_ROUNDS, "strengthened/refreshed, exactly as the rule says");
  assert.equal(tickTiles(g).length, 0, "so the tile survives the tick that would have removed it");
});

test("T4: a refresh also applies to a FUSION tile (2 elements) without disturbing its element set (T7)", () => {
  const g = withTile(["burn", "hydro"]);
  tickTiles(g);
  resetTileDuration(tileOf(g));
  assert.deepEqual(tileOf(g).elements, ["burn", "hydro"], "T4 never rewrites identity");
  assert.equal(tileOf(g).durationLeft, 3);
});

// ------------------------------------------------------------ scope / purity

test("T4: ticking touches ONLY the tile map — unit placement is untouched", () => {
  const g = withTile();
  const placementsBefore = [...g.placements.entries()];
  const allyTilesBefore = [...g.allyTiles.entries()];
  tickTiles(g);
  assert.deepEqual([...g.placements.entries()], placementsBefore, "placements unchanged");
  assert.deepEqual([...g.allyTiles.entries()], allyTilesBefore, "allyTiles unchanged");
  assert.equal(g.blocked.size, 0, "static terrain untouched");
});

test("T4: ticking CREATES nothing — it only ages and removes", () => {
  const g = withTile();
  tickTiles(g);
  assert.equal(g.tiles.size, 1, "no new tile appeared");
  tickTiles(g);
  assert.equal(g.tiles.size, 0, "and the map is not refilled");
});

test("T4: T4 ships the clock — and NO upgrade/fusion/trigger function (scope guard)", async () => {
  // `tickTiles` is now OWNED by T4 (it was asserted absent in T3's guard). The rest must still not
  // exist: upgrade T5, versioning T6, fusion T7, triggers T8.
  const tiles = await import("../engine/tiles.js");
  assert.equal(typeof tiles.tickTiles, "function", "T4 DELIVERS the lifecycle tick");
  assert.equal(typeof tiles.resetTileDuration, "function", "T4 delivers the duration refresh");
  const suspicious = Object.keys(tiles).filter((k) => /^(upgradeTile|fuseTile|applyTileTrigger|advanceTiles)/.test(k));
  assert.deepEqual(suspicious, [], "leveling (T5), fusion (T7) and triggers (T8) are NOT in T4");
});
