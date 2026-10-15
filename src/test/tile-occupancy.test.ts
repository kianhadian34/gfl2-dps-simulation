import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGrid,
  occupantsAtTile,
  occupantsInArea,
  occupantsOnTiles,
  tilesOccupiedBy,
} from "../engine/grid.js";
import type { GridState } from "../engine/grid.js";
import type { GridConfig, GridCoord } from "../model/grid.js";

/**
 * ELEMENTAL TILES — M2: the UNIT-ON-TILE QUERY (2026).
 *
 * Tile rules are entirely about WHO is standing where ("units that remain on the area after ending
 * their action", "while on a Burn tile"). This slice adds the pure query that answers it, covering
 * all THREE kinds of occupant, because they live in three different places:
 *
 *  - ally        → `placements` / `allyTiles`  (1×1)
 *  - grid enemy  → `enemyUnits[].coord`        (1×1 line props, FK4)
 *  - boss/dummy  → `boss.center` + footprint   (1×1 or 3×3)  ← NOT in `placements`
 *
 * The boss case is the whole reason the slice exists: a `placements`-only lookup silently misses
 * the dummy, which is the ONLY enemy the MVP is observable against. These tests pin that, the
 * footprint-awareness, the reverse direction, de-duplication, and stability.
 *
 * Nothing here is `Validated` — this is pure geometry over the model; the tile RULES that consume
 * it remain `[SOURCE]` (`docs/research.md` §3.23).
 */

const at = (x: number, y: number): GridCoord => ({ x, y });

/** Two allies, one grid enemy, and a 3×3 boss — the general case. */
function grid(over: Partial<GridConfig> = {}): GridState {
  return buildGrid({
    size: 15,
    units: [
      { unitId: "qiongjiu", coord: at(3, 3) },
      { unitId: "vector", coord: at(4, 3) },
    ],
    boss: { center: at(7, 7), footprintSide: 3 },
    enemyUnits: [{ unitId: "line_enemy", coord: at(10, 10), defense: 100 }],
    ...over,
  });
}

// ------------------------------------------------------------ the three cases

test("M2: an ALLY standing on a tile is found", () => {
  assert.deepEqual(occupantsAtTile(grid(), at(3, 3)), [{ kind: "ally", unitId: "qiongjiu" }]);
  assert.deepEqual(occupantsAtTile(grid(), at(4, 3)), [{ kind: "ally", unitId: "vector" }]);
});

test("M2: a grid ENEMY (line prop) standing on a tile is found", () => {
  assert.deepEqual(occupantsAtTile(grid(), at(10, 10)), [{ kind: "enemy", unitId: "line_enemy" }]);
});

test("M2: an EMPTY tile yields NO occupants", () => {
  assert.deepEqual(occupantsAtTile(grid(), at(0, 0)), [], "plain terrain has nobody on it");
});

test("M2: the BOSS is found even though it is NOT in `placements` — the regression this slice exists for", () => {
  const g = grid();
  // The boss is stationary enemy terrain, not a placed doll: `placements` holds the two dolls only.
  assert.equal(g.placements.size, 2, "placements holds the two allies — the boss is not a placement");
  assert.equal(g.placements.has("boss"), false);
  // A placements-only scan therefore MISSES it; the query must reach `boss.center` + footprint.
  assert.deepEqual(occupantsAtTile(g, at(7, 7)), [{ kind: "boss" }], "found via boss.center (no unitId)");
});

// ------------------------------------------------------------ footprint awareness

test("M2: the boss is FOOTPRINT-AWARE — every footprint tile reports it, not just the center", () => {
  const g = grid(); // 3×3 centered at (7,7)
  for (let y = 6; y <= 8; y++) {
    for (let x = 6; x <= 8; x++) {
      assert.deepEqual(
        occupantsAtTile(g, at(x, y)),
        [{ kind: "boss" }],
        `footprint tile (${x},${y}) reports the boss`,
      );
    }
  }
  // Just outside the footprint is empty.
  assert.deepEqual(occupantsAtTile(g, at(5, 7)), [], "one tile left of the footprint is empty");
  assert.deepEqual(occupantsAtTile(g, at(9, 7)), [], "one tile right of the footprint is empty");
});

test("M2: a 1×1 boss occupies ONLY its center tile", () => {
  const g = grid({ boss: { center: at(7, 7), footprintSide: 1 } });
  assert.deepEqual(occupantsAtTile(g, at(7, 7)), [{ kind: "boss" }]);
  assert.deepEqual(occupantsAtTile(g, at(8, 7)), [], "no footprint: the neighbour is empty");
});

test("M2: out-of-bounds tiles yield no occupants (never throws)", () => {
  const g = grid();
  assert.deepEqual(occupantsAtTile(g, at(99, 99)), []);
  assert.deepEqual(occupantsAtTile(g, at(-1, -1)), []);
});

// ------------------------------------------------------------ the reverse direction

test("M2: tilesOccupiedBy — allies and enemies cover ONE tile; the boss covers its FULL footprint", () => {
  const g = grid();
  assert.deepEqual(tilesOccupiedBy(g, { kind: "ally", unitId: "qiongjiu" }), [at(3, 3)]);
  assert.deepEqual(tilesOccupiedBy(g, { kind: "enemy", unitId: "line_enemy" }), [at(10, 10)]);
  const boss = tilesOccupiedBy(g, { kind: "boss" });
  assert.equal(boss.length, 9, "a 3×3 boss physically covers nine tiles");
  assert.ok(
    boss.some((t) => t.x === 7 && t.y === 7),
    "the center tile is among them",
  );
});

test("M2: tilesOccupiedBy — a 1×1 boss is a single tile", () => {
  const g = grid({ boss: { center: at(7, 7), footprintSide: 1 } });
  assert.deepEqual(tilesOccupiedBy(g, { kind: "boss" }), [at(7, 7)]);
});

test("M2: tilesOccupiedBy — an unknown/unplaced id returns empty, never throws", () => {
  const g = grid();
  assert.deepEqual(tilesOccupiedBy(g, { kind: "ally", unitId: "nobody" }), []);
  assert.deepEqual(tilesOccupiedBy(g, { kind: "enemy", unitId: "nobody" }), []);
});

test("M2: occupancy is NOT the range origin — a 3×3 boss covers 9 tiles but its origin is the center", () => {
  // `docs/grid.md`: a 3×3 boss's range origin is its CENTER tile. Occupancy (this slice) and origin
  // (existing `unitDistance`) answer different questions; keep them apart.
  const g = grid();
  const tiles = tilesOccupiedBy(g, { kind: "boss" });
  assert.equal(tiles.length, 9, "occupancy spans the footprint");
  assert.deepEqual(g.boss.center, at(7, 7), "the range origin stays the center tile");
});

// ------------------------------------------------------------ sets, de-duplication, order

test("M2: occupantsOnTiles reports the boss ONCE however many footprint tiles are in the set", () => {
  const g = grid();
  const found = occupantsOnTiles(g, [at(6, 7), at(7, 7), at(8, 7)]); // three footprint tiles
  assert.deepEqual(found, [{ kind: "boss" }], "de-duplicated — not one entry per tile");
});

test("M2: order is stable — allies (placement order), then enemies (config order), then the boss", () => {
  const g = grid();
  const found = occupantsOnTiles(g, [at(7, 7), at(10, 10), at(4, 3), at(3, 3)]);
  assert.deepEqual(
    found,
    [
      { kind: "ally", unitId: "qiongjiu" },
      { kind: "ally", unitId: "vector" },
      { kind: "enemy", unitId: "line_enemy" },
      { kind: "boss" },
    ],
    "ordering does not depend on the order of the input tiles",
  );
});

test("M2: an empty tile set yields no occupants", () => {
  assert.deepEqual(occupantsOnTiles(grid(), []), []);
});

// ------------------------------------------------------------ areas

test("M2: occupantsInArea picks up everyone inside a MANHATTAN (diamond) area", () => {
  const g = grid();
  // Diamond radius 1 around the boss center = center + 4 orthogonal, all footprint tiles.
  assert.deepEqual(occupantsInArea(g, at(7, 7), "manhattan", 1), [{ kind: "boss" }]);
  // Radius 0 = the origin tile only.
  assert.deepEqual(occupantsInArea(g, at(3, 3), "manhattan", 0), [{ kind: "ally", unitId: "qiongjiu" }]);
});

test("M2: the area SHAPE changes the answer — diamond vs 3×3 (the `AreaShape` vocabulary is shared)", () => {
  // Center (4,3). `a_orthogonal` at (3,3) is Manhattan 1 from it; `b_diagonal` at (3,4) is
  // Manhattan 2 but Chebyshev 1 — so only the `square` shape reaches the diagonal neighbour.
  const g = buildGrid({
    size: 15,
    units: [
      { unitId: "a_orthogonal", coord: at(3, 3) },
      { unitId: "b_diagonal", coord: at(3, 4) },
    ],
    boss: { center: at(12, 12), footprintSide: 1 },
  });
  assert.deepEqual(
    occupantsInArea(g, at(4, 3), "manhattan", 1),
    [{ kind: "ally", unitId: "a_orthogonal" }],
    "diamond excludes the diagonal neighbour",
  );
  assert.deepEqual(
    occupantsInArea(g, at(4, 3), "square", 1),
    [
      { kind: "ally", unitId: "a_orthogonal" },
      { kind: "ally", unitId: "b_diagonal" },
    ],
    "the 3×3 block includes it",
  );
});

test("M2: an out-of-bounds area origin matches nothing (clamped, never throws)", () => {
  assert.deepEqual(occupantsInArea(grid(), at(-5, -5), "manhattan", 1), []);
  assert.deepEqual(occupantsInArea(grid(), at(14, 14), "manhattan", 0), [], "corner is empty terrain");
});

// ------------------------------------------------------------ purity

test("M2: the queries are PURE — they create no tiles and mutate no state", () => {
  const g: GridState = grid();
  const before = g.tiles.size;
  occupantsAtTile(g, at(7, 7));
  occupantsOnTiles(g, [at(3, 3), at(10, 10)]);
  occupantsInArea(g, at(7, 7), "square", 2);
  tilesOccupiedBy(g, { kind: "boss" });
  assert.equal(g.tiles.size, before, "the query never generates or removes tile effects");
  assert.equal(g.tiles.size, 0, "no tile effects exist yet — generation is T3");
  assert.equal(g.placements.size, 2, "placements are untouched");
});
