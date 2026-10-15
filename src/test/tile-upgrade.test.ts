import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGrid, tileKey } from "../engine/grid.js";
import {
  generateTiles,
  isFusiblePair,
  TILE_BASE_LEVEL,
  TILE_INITIAL_ROUNDS,
  TILE_MAX_LEVEL,
  TILE_RESET_ROUNDS,
} from "../engine/tiles.js";
import type { GridState } from "../engine/grid.js";
import type { GridConfig, GridCoord, TileEffect } from "../model/grid.js";
import type { Element } from "../model/types.js";

/**
 * ELEMENTAL TILES — T5/M5: TILE UPGRADE + POLYPHASE FUSION (2026).
 *
 * Generating tiles *onto a tile that already exists*. Per the project owner (2026) the two halves
 * were merged into ONE slice rather than splitting fusion into T7: they share the same core rule and
 * the same call site, so separating them would have meant implementing the addition rule twice.
 *
 * The rule (`docs/research.md` §3.23.1, §3.23.4; transcribed from the guide's own text and its
 * "Polyphase Fusion List"):
 *  - **shared element** → LEVEL UP (Base → Lv2 → Lv3); at Lv3 only the duration refreshes;
 *  - **fusion tile** → never overwritten by a third element; either fused element levels it;
 *  - **fusible different element** → POLYPHASE FUSION carrying BOTH, at the tile's EXISTING level;
 *  - **non-fusible different element** → an UPGRADED tile is protected, a base tile is REPLACED;
 *  - **every** addition resets duration to 3.
 *
 * NOTHING here is `Validated`: the feature exists on global (project owner, level 1) but every
 * rule VALUE is `[SOURCE]` (community guide, level 5) and **Not Tested**. The rule VALUES are the
 * guide's; only the non-fusible REPLACEMENT's level/duration is an inference (owner decision,
 * §7 decision 7) and it is called out where tested.
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

const K = tileKey(7, 7);
const tileOf = (g: GridState): TileEffect => g.tiles.get(K)!;

/** Generate ONE element (or a set) onto (7,7) and return the outcome. */
function gen(g: GridState, elements: Element[], specOver: Partial<{ generatedBy: string; version: "allied" | "enemy" | "neutral" }> = {}) {
  const results = generateTiles(g, {
    origin: at(7, 7),
    shape: "manhattan",
    radius: 0,
    elements,
    generatedBy: specOver.generatedBy ?? "vector",
    version: specOver.version,
  });
  assert.equal(results.length, 1, "a radius-0 generation acts on exactly one tile");
  return results[0];
}

/** A grid seeded with a base tile of `elements`, level 1. */
function seeded(elements: Element[] = ["burn"]): GridState {
  const g = grid();
  gen(g, elements);
  return g;
}

// ============================================================ the fusible-pair data

test("T5: the guide's Polyphase Fusion List — all EIGHT fusible pairs, order-insensitively", () => {
  // Transcribed from the guide's own "Polyphase Fusion List" (research.md §3.23.4): the four Burn
  // pairs plus the four non-Burn ones the repo had NOT previously recorded.
  const pairs: [Element, Element][] = [
    ["burn", "freeze"], // Smoldering Suspire
    ["burn", "hydro"], // Scalding Vapors
    ["burn", "electric"], // Crackling Flare
    ["burn", "corrosion"], // Venomfire
    ["corrosion", "electric"],
    ["corrosion", "hydro"],
    ["electric", "hydro"],
    ["freeze", "hydro"],
  ];
  for (const [a, b] of pairs) {
    assert.equal(isFusiblePair(a, b), true, `${a}+${b} is fusible`);
    assert.equal(isFusiblePair(b, a), true, `${b}+${a} — the pair is order-insensitive`);
  }
});

test("T5: the pairs the guide does NOT list are NOT fusible (no pair is inferred)", () => {
  // The guide lists 8 pairs; of the 10 possible it omits exactly these two.
  assert.equal(isFusiblePair("electric", "freeze"), false);
  assert.equal(isFusiblePair("corrosion", "freeze"), false);
});

test("T5: like-with-like is an UPGRADE, never a fusion (a pair needs two DIFFERENT elements)", () => {
  for (const e of ["burn", "hydro", "freeze", "electric", "corrosion"] as Element[]) {
    assert.equal(isFusiblePair(e, e), false, `${e}+${e} is not a fusion pair`);
  }
});

// ============================================================ case 1 — level up

test("T5: the SAME element levels the tile — base → Lv2, reported as `upgraded`", () => {
  const g = seeded(["burn"]);
  assert.equal(tileOf(g).level, TILE_BASE_LEVEL);

  const r = gen(g, ["burn"]);
  assert.equal(r.outcome, "upgraded");
  assert.equal(tileOf(g).level, 2);
  assert.deepEqual(tileOf(g).elements, ["burn"], "the element set is unchanged by a level-up");
});

test("T5: Lv2 → Lv3, and the level is CAPPED at 3", () => {
  const g = seeded(["burn"]);
  gen(g, ["burn"]); // → 2
  gen(g, ["burn"]); // → 3
  assert.equal(tileOf(g).level, TILE_MAX_LEVEL);

  const r = gen(g, ["burn"]); // at Lv3
  assert.equal(r.outcome, "upgraded");
  assert.equal(tileOf(g).level, TILE_MAX_LEVEL, "further additions do NOT level past 3");
});

test("T5: at Lv3 an addition 'will just refresh its duration' — the level holds, the clock resets", () => {
  const g = seeded(["burn"]);
  gen(g, ["burn"]);
  gen(g, ["burn"]); // Lv3
  tileOf(g).durationLeft = 1; // about to expire

  gen(g, ["burn"]);
  assert.equal(tileOf(g).level, 3, "still Lv3 — the cap held");
  assert.equal(tileOf(g).durationLeft, TILE_RESET_ROUNDS, "refreshed to 3");
});

test("T5: a level-up RESETS the duration to 3 — the slice composes T4's resetTileDuration", () => {
  const g = seeded(["burn"]);
  tileOf(g).durationLeft = 1;
  gen(g, ["burn"]);
  assert.equal(tileOf(g).durationLeft, TILE_RESET_ROUNDS);
});

test("T5: a level-up records the LATEST generator as provenance", () => {
  const g = seeded(["burn"]);
  gen(g, ["burn"], { generatedBy: "later_unit" });
  assert.equal(tileOf(g).generatedBy, "later_unit", "the last generator is recorded");
});

test("T5: levelling preserves initialRounds/resetRounds (the duration RULE's two values)", () => {
  const g = seeded(["burn"]);
  gen(g, ["burn"]);
  assert.equal(tileOf(g).initialRounds, TILE_INITIAL_ROUNDS, "the creation constant is not rewritten");
  assert.equal(tileOf(g).resetRounds, TILE_RESET_ROUNDS);
});

// ============================================================ case 3 — Polyphase Fusion

test("T5: a FUSIBLE different element fuses — the tile carries BOTH elements, reported as `fused`", () => {
  const g = seeded(["burn"]);
  const r = gen(g, ["hydro"]);
  assert.equal(r.outcome, "fused");
  assert.deepEqual(tileOf(g).elements, ["burn", "hydro"], "both elements are carried");
});

test("T5: fusion PRESERVES the tile's existing level ('start at the existing tile's upgrade level')", () => {
  // A Lv2 base tile fused with a partner starts at Lv2 — fusing costs no level and grants no level.
  const g = seeded(["burn"]);
  gen(g, ["burn"]); // burn tile → Lv2
  assert.equal(tileOf(g).level, 2);

  const r = gen(g, ["freeze"]); // burn+freeze = Smoldering Suspire
  assert.equal(r.outcome, "fused");
  assert.equal(tileOf(g).level, 2, "the fusion started at the existing level");
  assert.deepEqual(tileOf(g).elements, ["burn", "freeze"]);
});

test("T5: fusion from a BASE tile starts at Lv1", () => {
  const g = seeded(["burn"]);
  gen(g, ["hydro"]);
  assert.equal(tileOf(g).level, TILE_BASE_LEVEL);
});

test("T5: fusion resets the duration to 3 (`each time an upgrade or fusion occurs`)", () => {
  const g = seeded(["burn"]);
  tileOf(g).durationLeft = 1;
  gen(g, ["hydro"]);
  assert.equal(tileOf(g).durationLeft, TILE_RESET_ROUNDS);
});

test("T5: EITHER fused element levels a fusion tile — both paths reach Lv3", () => {
  const viaFirst = seeded(["burn"]);
  gen(viaFirst, ["hydro"]); // [burn, hydro] @ Lv1
  gen(viaFirst, ["burn"]); // via the ORIGINAL element
  assert.equal(tileOf(viaFirst).level, 2, "the original element levels it");
  gen(viaFirst, ["burn"]);
  assert.equal(tileOf(viaFirst).level, 3);

  const viaSecond = seeded(["burn"]);
  gen(viaSecond, ["hydro"]); // [burn, hydro] @ Lv1
  gen(viaSecond, ["hydro"]); // via the NEWLY FUSED element
  assert.equal(tileOf(viaSecond).level, 2, "the fused element levels it too");
  gen(viaSecond, ["hydro"]);
  assert.equal(tileOf(viaSecond).level, 3);
});

test("T5: levelling a fusion tile does NOT change its element set (still both elements)", () => {
  const g = seeded(["burn"]);
  gen(g, ["hydro"]);
  gen(g, ["hydro"]);
  gen(g, ["burn"]);
  assert.deepEqual(tileOf(g).elements, ["burn", "hydro"], "the fused pair is stable");
  assert.equal(tileOf(g).level, 3);
});

test("T5: a fusion tile is NOT overwritten by a THIRD element — `protected`, nothing changes", () => {
  const g = seeded(["burn"]);
  gen(g, ["hydro"]); // [burn, hydro]
  const before = { ...tileOf(g), elements: [...tileOf(g).elements] };

  // Corrosion IS fusible with burn, and IS one of the five phases — but this tile is already fused,
  // and the rule is unconditional: "won't be overwritten if there is an attempt to generate a third
  // element on them."
  const r = gen(g, ["corrosion"]);
  assert.equal(r.outcome, "protected");
  assert.deepEqual(tileOf(g).elements, before.elements, "still exactly the two fused elements");
  assert.equal(tileOf(g).level, before.level, "level untouched");
  assert.equal(tileOf(g).durationLeft, before.durationLeft, "and NOT even the clock is reset");
});

test("T5: fusion is order-preserving — the existing element stays first for a deterministic result", () => {
  // Element ORDER is not significant (`TileEffect` doc), but the engine must be deterministic.
  const g = seeded(["hydro"]);
  gen(g, ["burn"]);
  assert.deepEqual(tileOf(g).elements, ["hydro", "burn"], "existing first, incoming second");
});

// ============================================================ case 4 — non-fusible replacement / protection

test("T5: a NON-FUSIBLE element on a BASE tile REPLACES it (owner decision: Lv1 + duration 3)", () => {
  // The guide: "A tile that has been UPGRADED is also protected from being replaced by new elemental
  // tiles that cannot fuse" — so a non-upgraded tile is NOT protected and IS replaced. Its resulting
  // level is unspecified by the guide; the project owner chose Lv1 (§7 decision 7). NOT Tested.
  const g = seeded(["electric"]);
  assert.equal(isFusiblePair("electric", "freeze"), false, "the pair is genuinely non-fusible");

  const r = gen(g, ["freeze"]);
  assert.equal(r.outcome, "replaced");
  assert.deepEqual(tileOf(g).elements, ["freeze"], "the incoming element takes over");
  assert.equal(tileOf(g).level, TILE_BASE_LEVEL, "at Lv1 (inferred — the guide gives no level)");
  assert.equal(tileOf(g).durationLeft, TILE_RESET_ROUNDS, "and the addition resets the clock");
  assert.equal(tileOf(g).initialRounds, TILE_INITIAL_ROUNDS, "the creation constant is untouched");
});

test("T5: the OTHER non-fusible pair (corrosion+freeze) also replaces a base tile", () => {
  const g = seeded(["corrosion"]);
  const r = gen(g, ["freeze"]);
  assert.equal(r.outcome, "replaced");
  assert.deepEqual(tileOf(g).elements, ["freeze"]);
});

test("T5: an UPGRADED tile is PROTECTED from a non-fusible element (the guide's own clause)", () => {
  const g = seeded(["electric"]);
  gen(g, ["electric"]); // → Lv2: now "upgraded"
  assert.equal(tileOf(g).level, 2);
  const before = { ...tileOf(g) };

  const r = gen(g, ["freeze"]); // non-fusible with electric
  assert.equal(r.outcome, "protected");
  assert.deepEqual(tileOf(g).elements, before.elements, "still Electric");
  assert.equal(tileOf(g).level, before.level, "still Lv2");
  assert.equal(tileOf(g).durationLeft, before.durationLeft, "untouched — not even the clock");
});

test("T5: protection scales with level — Lv3 is protected too (same clause)", () => {
  const g = seeded(["corrosion"]);
  gen(g, ["corrosion"]);
  gen(g, ["corrosion"]); // Lv3
  assert.equal(tileOf(g).level, 3);
  const r = gen(g, ["freeze"]);
  assert.equal(r.outcome, "protected");
  assert.deepEqual(tileOf(g).elements, ["corrosion"]);
});

test("T5: replacement is NOT fusion — the replaced tile carries ONE element, never two", () => {
  const g = seeded(["electric"]);
  gen(g, ["freeze"]);
  assert.equal(tileOf(g).elements.length, 1, "a replacement is a base tile, not a fusion tile");
});

test("T5: a replaced tile can then be levelled normally by its own element", () => {
  const g = seeded(["electric"]);
  gen(g, ["freeze"]); // replaced → Freeze @ Lv1
  const r = gen(g, ["freeze"]); // now same-element
  assert.equal(r.outcome, "upgraded");
  assert.equal(tileOf(g).level, 2, "the replacement behaved like any other base tile");
});

// ============================================================ determinism / integration

test("T5: outcomes are reported PER TILE across an AREA that mixes cases", () => {
  const g = grid();
  // Seed three tiles of a diamond so the second generation hits a mix of positions.
  generateTiles(g, { origin: at(7, 7), shape: "manhattan", radius: 1, elements: ["burn"], generatedBy: "v" });

  // A radius-0 hydro generation onto (7,7) — burn+hydro → fused, and nothing else is touched.
  const results = generateTiles(g, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["hydro"], generatedBy: "v2" });
  assert.equal(results.length, 1);
  assert.equal(results[0].outcome, "fused");
  assert.deepEqual(results[0].tile, at(7, 7));
  assert.equal(g.tiles.size, 5, "the other four seeded tiles are untouched");
});

test("T5: an empty position still CREATES (the addition rule only applies to occupied positions)", () => {
  const g = seeded(["burn"]);
  const results = generateTiles(g, { origin: at(9, 9), shape: "manhattan", radius: 0, elements: ["hydro"], generatedBy: "v" });
  assert.equal(results[0].outcome, "created", "no tile there → created, not fused");
  assert.equal(g.tiles.get(tileKey(9, 9))!.level, TILE_BASE_LEVEL);
  assert.equal(g.tiles.get(tileKey(9, 9))!.durationLeft, TILE_INITIAL_ROUNDS, "a CREATED tile gets the initial 2");
});

test("T5: repeated generation onto ONE position is deterministic and reaches a stable end state", () => {
  const g = seeded(["burn"]);
  gen(g, ["burn"]); // Lv2
  gen(g, ["burn"]); // Lv3
  gen(g, ["burn"]); // refresh only
  gen(g, ["burn"]); // refresh only
  assert.equal(tileOf(g).level, 3);
  assert.deepEqual(tileOf(g).elements, ["burn"]);
  assert.equal(g.tiles.size, 1, "still exactly one tile");
});

test("T5: every mutation path resets the duration (nothing leaves a stale clock)", () => {
  // Each case is a DIFFERENT element relationship, so all three reset paths are exercised.
  const cases: { label: string; seed: Element; incoming: Element }[] = [
    { label: "level up (same element)", seed: "burn", incoming: "burn" },
    { label: "fusion (fusible pair)", seed: "burn", incoming: "hydro" },
    { label: "replacement (non-fusible pair)", seed: "electric", incoming: "freeze" },
  ];
  for (const c of cases) {
    const g = seeded([c.seed]);
    tileOf(g).durationLeft = 1;
    gen(g, [c.incoming]);
    assert.equal(tileOf(g).durationLeft, TILE_RESET_ROUNDS, `${c.label} resets the duration`);
  }
});

// ============================================================ scope guard

test("T5: the triggers (T8) are still absent (scope guard)", async () => {
  // `isFusiblePair` is T5's. `tileVersionFor` was in this "must not exist" list while T5 was the
  // newest slice; **T6 now owns it**, so the guard is advanced deliberately rather than loosened —
  // the T6 versioning tests assert it DOES exist, so it cannot silently vanish either.
  const tiles = await import("../engine/tiles.js");
  assert.equal(typeof tiles.isFusiblePair, "function", "T5 delivers the fusible-pair predicate");
  const suspicious = Object.keys(tiles).filter((k) => /^(applyTileTrigger|advanceTiles)/.test(k));
  assert.deepEqual(suspicious, [], "T5 adds upgrade + fusion ONLY — triggers are still T8");
});
