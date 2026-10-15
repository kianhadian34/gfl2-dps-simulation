import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGrid, tileKey } from "../engine/grid.js";
import { generateTiles, tileVersionFor } from "../engine/tiles.js";
import { TILE_VERSIONS } from "../model/grid.js";
import type { TileVersion } from "../model/grid.js";
import type { GridState } from "../engine/grid.js";
import type { GridConfig, GridCoord, TileEffect } from "../model/grid.js";
import type { Element } from "../model/types.js";

/**
 * ELEMENTAL TILES — T6/M6: VERSIONING (2026).
 *
 * A tile's VERSION says which SIDE its effects land on, and the source ties it to the generator:
 * *"These correspond to the source that created the tile"* / *"set by whichever unit last generated
 * onto the tile"* (§3.23.1).
 *
 * SCOPE — T6 determines the LABEL. What a version actually DOES (*"Enemy versions swap which units
 * are targeted; neutral versions apply all effects"*) is applying the tile's debuffs, which is the
 * TRIGGER slices' work (T8/T9). Nothing here applies an effect to anyone.
 *
 * OWNER DECISION (2026, this slice): the version is **derived from the generator's SIDE** —
 * `tileVersionFor` reads the engine's existing structural split (`grid.placements` = allied,
 * `grid.enemyUnits` = enemy) rather than inventing an affiliation field on `UnitState`. An explicit
 * `spec.version` remains as an override for a generator that is not a placed unit (a terrain effect).
 *
 * NOTHING here is `Validated`: the feature exists on global (level 1), but *which* version a
 * generator produces is the guide's rule (`[SOURCE]`, level 5) and **Not Tested**.
 */

const at = (x: number, y: number): GridCoord => ({ x, y });

function grid(over: Partial<GridConfig> = {}): GridState {
  return buildGrid({
    size: 15,
    units: [{ unitId: "vector", coord: at(5, 5) }],
    boss: { center: at(11, 11), footprintSide: 3 },
    enemyUnits: [{ unitId: "line_enemy", coord: at(13, 13), defense: 100 }],
    ...over,
  });
}

const K = tileKey(7, 7);
const tileOf = (g: GridState): TileEffect => g.tiles.get(K)!;

function gen(g: GridState, specOver: Partial<{ elements: Element[]; generatedBy: string; version: TileVersion }> = {}) {
  const results = generateTiles(g, {
    origin: at(7, 7),
    shape: "manhattan",
    radius: 0,
    elements: specOver.elements ?? ["burn"],
    generatedBy: specOver.generatedBy ?? "vector",
    version: specOver.version,
  });
  assert.equal(results.length, 1);
  return results[0];
}

// ============================================================ the vocabulary

test("T6: the three versions are modeled — Allied / Enemy / Neutral", () => {
  assert.deepEqual([...TILE_VERSIONS].sort(), ["allied", "enemy", "neutral"]);
});

// ============================================================ derivation from the generator's side

test("T6: a PLACED ALLY generator → the tile is `allied` (debuffs enemies)", () => {
  const g = grid();
  assert.equal(tileVersionFor(g, "vector"), "allied", "vector is in grid.placements");
  gen(g, { generatedBy: "vector" });
  assert.equal(tileOf(g).version, "allied");
});

test("T6: a GRID ENEMY generator → the tile is `enemy` (debuffs allies)", () => {
  const g = grid();
  assert.equal(tileVersionFor(g, "line_enemy"), "enemy", "line_enemy is in grid.enemyUnits");

  gen(g, { generatedBy: "line_enemy" });
  assert.equal(tileOf(g).version, "enemy", "an enemy generator produces an enemy-version tile");
  assert.equal(tileOf(g).generatedBy, "line_enemy");
});

test("T6: an UNKNOWN generator id derives NO version (caller falls back, nothing invented)", () => {
  const g = grid();
  assert.equal(tileVersionFor(g, "nobody"), undefined, "the grid does not know this unit");
  // The engine falls back to the T3–T5 default rather than inventing an affiliation.
  gen(g, { generatedBy: "nobody" });
  assert.equal(tileOf(g).version, "allied", "fallback keeps the pre-T6 behaviour");
});

test("T6: the boss has NO id and is NOT a derivable generator (no id is invented for it)", () => {
  const g = grid();
  // `BossPlacement` carries no unitId (TileOccupant doc), so there is nothing to look up; the grid
  // must not synthesise one. If the boss ever generates, the caller states the version explicitly.
  for (const guess of ["boss", "dummy", "", "0"]) {
    assert.equal(tileVersionFor(g, guess), undefined, `no version is derived for "${guess}"`);
  }
});

test("T6: the derivation reads the CURRENT grid, not a snapshot (an enemy id is enemy by structure)", () => {
  // A doll id and an enemy id differ ONLY by which collection holds them — that is the rule.
  const g = buildGrid({
    size: 15,
    units: [{ unitId: "unit_a", coord: at(5, 5) }],
    boss: { center: at(11, 11), footprintSide: 3 },
    enemyUnits: [{ unitId: "unit_b", coord: at(13, 13), defense: 100 }],
  });
  assert.equal(tileVersionFor(g, "unit_a"), "allied");
  assert.equal(tileVersionFor(g, "unit_b"), "enemy");
});

// ============================================================ the explicit override

test("T6: an EXPLICIT version overrides the derivation (the terrain/off-grid generator case)", () => {
  const g = grid();
  // A generator that is not a placed unit at all — e.g. a terrain effect, which the source allows to
  // create tiles. Neutral = "debuffs everyone".
  gen(g, { generatedBy: "terrain_hazard", version: "neutral" });
  assert.equal(tileOf(g).version, "neutral");
});

test("T6: the override wins even when the id WOULD derive a different version", () => {
  const g = grid();
  gen(g, { generatedBy: "vector", version: "enemy" }); // ally id, forced to enemy
  assert.equal(tileOf(g).version, "enemy", "the explicit value is authoritative");
});

test("T6: overriding to each of the three versions works (the type is not narrower than the model)", () => {
  for (const v of TILE_VERSIONS) {
    const g = grid();
    gen(g, { generatedBy: "terrain_hazard", version: v });
    assert.equal(tileOf(g).version, v);
  }
});

// ============================================================ the LAST generator wins

test("T6: the version follows the LAST generator — an ally re-generating over an enemy tile flips it", () => {
  // "An Enemy Polyphase Fusion Tile can become the allied version if you generate one of the two
  // polyphase elements onto that tile area." The same change-of-source rule is unconditional.
  const g = grid();
  gen(g, { generatedBy: "line_enemy" });
  assert.equal(tileOf(g).version, "enemy");

  gen(g, { generatedBy: "vector" }); // same element → level up, new source
  assert.equal(tileOf(g).version, "allied", "the LAST generator decided it");
  assert.equal(tileOf(g).generatedBy, "vector");
});

test("T6: and the reverse — an enemy re-generating over an ally tile makes it `enemy`", () => {
  const g = grid();
  gen(g, { generatedBy: "vector" });
  assert.equal(tileOf(g).version, "allied");
  gen(g, { generatedBy: "line_enemy" });
  assert.equal(tileOf(g).version, "enemy");
});

test("T6: EVERY mutating addition updates the version (level up / fusion / replacement)", () => {
  // Same element, fusible pair, and non-fusible replacement are the three mutating paths.
  const paths: { label: string; seed: Element; incoming: Element }[] = [
    { label: "level up", seed: "burn", incoming: "burn" },
    { label: "fusion", seed: "burn", incoming: "hydro" },
    { label: "replacement", seed: "electric", incoming: "freeze" },
  ];
  for (const p of paths) {
    const g = grid();
    gen(g, { elements: [p.seed], generatedBy: "vector" }); // allied
    assert.equal(tileOf(g).version, "allied");
    gen(g, { elements: [p.incoming], generatedBy: "line_enemy" }); // enemy source
    assert.equal(tileOf(g).version, "enemy", `${p.label} adopts the new generator's version`);
  }
});

test("T6: a PROTECTED tile keeps its version (nothing happened, so nothing changed)", () => {
  // Protection means the tile was left untouched — including its version and provenance.
  const g = grid();
  gen(g, { elements: ["electric"], generatedBy: "vector" }); // Lv1, allied
  gen(g, { elements: ["electric"], generatedBy: "vector" }); // → Lv2 (upgraded, still allied)

  const r = gen(g, { elements: ["freeze"], generatedBy: "line_enemy" }); // non-fusible vs upgraded
  assert.equal(r.outcome, "protected");
  assert.equal(tileOf(g).version, "allied", "the protected tile kept its version");
  assert.equal(tileOf(g).generatedBy, "vector", "and its provenance");
});

test("T6: a fusion tile's version also follows the last generator", () => {
  const g = grid();
  gen(g, { elements: ["burn"], generatedBy: "vector" });
  gen(g, { elements: ["hydro"], generatedBy: "vector" }); // fused
  assert.deepEqual(tileOf(g).elements, ["burn", "hydro"]);
  assert.equal(tileOf(g).version, "allied");

  gen(g, { elements: ["hydro"], generatedBy: "line_enemy" }); // levels the fusion, enemy source
  assert.equal(tileOf(g).version, "enemy", "levelling via a fused element still re-stamps the version");
});

// ============================================================ area-wide behaviour

test("T6: a generation across an AREA stamps the SAME version on every tile it acted on", () => {
  const g = grid();
  const results = generateTiles(g, {
    origin: at(7, 7),
    shape: "square",
    radius: 1,
    elements: ["burn"],
    generatedBy: "line_enemy", // derived → enemy
  });
  assert.equal(results.length, 9);
  for (const r of results) {
    const t = g.tiles.get(tileKey(r.tile.x, r.tile.y))!;
    assert.equal(t.version, "enemy", `tile (${r.tile.x},${r.tile.y}) carries the generator's version`);
  }
});

// ============================================================ scope guard

test("T6: T6 determines the LABEL only — no GENERATION-side trigger exists (scope guard)", async () => {
  // `tileVersionFor` is T6's. `applyTileEffectsOnActionEnd` (trigger (b)) was later added by **T8**,
  // which is exactly where "what a version DOES" belongs — so the guard is advanced deliberately
  // rather than loosened, and T8's own tests assert it exists.
  const tiles = await import("../engine/tiles.js");
  assert.equal(typeof tiles.tileVersionFor, "function", "T6 delivers the version derivation");
  const suspicious = Object.keys(tiles).filter((k) => /^(applyTileTrigger|advanceTiles|tileTargetsFor|fuseTiles)/.test(k));
  assert.deepEqual(suspicious, [], "the remaining trigger/effect surface is not here");
});
