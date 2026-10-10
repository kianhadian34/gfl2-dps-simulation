import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { areaTiles, buildGrid, chebyshev, manhattan, tileKey } from "../engine/grid.js";
import { customRegistry, makeAlly } from "./helpers.js";
import { STATUS_DEFS } from "../data/statuses.js";
import { AREA_SHAPES } from "../model/grid.js";
import type { AreaShape, GridConfig, GridCoord } from "../model/grid.js";
import type { CharacterDef, Scenario, StatusDef } from "../model/types.js";

/**
 * AREA / RADIUS TARGETING — `StatusApplySpec.target: "ally_area"` + the `AreaShape` vocabulary
 * (2026, `docs/research.md` §3.32).
 *
 * Two independent things are pinned:
 *
 * 1. THE SHAPE VOCABULARY (pure geometry). The source uses what may be two DIFFERENT metrics —
 *    "within a 1-tile area" and "area is increased to 3×3" — so BOTH are modeled and neither is
 *    asserted as the real game's behavior:
 *      - `manhattan` = a diamond (radius 1 ⇒ origin + 4 orthogonal = 5 tiles)
 *      - `square`    = a Chebyshev block (radius 1 ⇒ a full 3×3 = 9 tiles)
 *    Which shape an effect uses is decided by its SOURCE WORDING (resolved 2026 from the game's own
 *    range-map targeting diagrams; docs/research.md §3.32): numeric areas ("within N tiles") are
 *    diamonds, `NxN` areas ("3x3") are squares. Provenance is a community database, so the strict
 *    project state remains Not Tested pending our own in-game confirmation.
 *
 * 2. THE RECIPIENT RESOLUTION (through the real simulate path): the placed allies inside the area
 *    around the ACTOR, including the actor itself; enemies never; and an HONEST ERROR when used
 *    without a grid (rather than silently approximating the clause away).
 *
 * Synthetic fixtures only — the production status table must stay free of them. No Vector status
 * is defined by this slice.
 */

const MARKER = "ar_marker";
const ACTOR = "ar_actor";
const NEAR = "ar_near";
const FAR = "ar_far";

const markerStatus: StatusDef = {
  id: MARKER,
  name: "Area Marker (test)",
  category: "buff",
  stackable: false,
  maxStacks: 1,
  durationRounds: 3,
  tickAt: "ownActionEnd",
  purgeable: true,
  effects: [{ kind: "stat_modifier", stat: "atk", mode: "pct", value: 0.5 }],
  verified: false,
};

const at = (x: number, y: number): GridCoord => ({ x, y });
const key = (x: number, y: number) => tileKey(x, y);

// ============================================================ 1. PURE GEOMETRY

test("areaTiles(manhattan, 1) = the origin + the 4 ORTHOGONAL neighbours (a diamond)", () => {
  const tiles = areaTiles(at(7, 7), "manhattan", 1).map((t) => key(t.x, t.y)).sort();
  assert.deepEqual(tiles, [key(7, 6), key(6, 7), key(7, 7), key(8, 7), key(7, 8)].sort(), "5 tiles, no diagonals");
});

test("areaTiles(square, 1) = a full 3x3 block (Chebyshev)", () => {
  const tiles = areaTiles(at(7, 7), "square", 1).map((t) => key(t.x, t.y)).sort();
  assert.equal(tiles.length, 9, "9 tiles");
  // Explicitly includes the four DIAGONALS — the difference that makes this shape distinct.
  for (const d of [key(6, 6), key(8, 6), key(6, 8), key(8, 8)]) {
    assert.ok(tiles.includes(d), `square includes the diagonal ${d}`);
  }
  assert.ok(!areaTiles(at(7, 7), "manhattan", 1).map((t) => key(t.x, t.y)).includes(key(6, 6)), "the diamond does NOT");
});

test("areaTiles is inclusive of the origin and always contains exactly one of it", () => {
  for (const shape of AREA_SHAPES) {
    const tiles = areaTiles(at(7, 7), shape, 2).map((t) => key(t.x, t.y));
    assert.equal(tiles.filter((k) => k === key(7, 7)).length, 1, `${shape}: origin appears once`);
  }
});

test("areaTiles(radius 0) is just the origin, for both shapes", () => {
  for (const shape of AREA_SHAPES) {
    assert.deepEqual(areaTiles(at(4, 4), shape, 0).map((t) => key(t.x, t.y)), [key(4, 4)], shape);
  }
});

test("areaTiles counts match the closed forms: diamond vs square at radius 2", () => {
  // Manhattan radius 2 ⇒ 1 + 4(1+2) = 13 tiles. Chebyshev radius 2 ⇒ 5×5 = 25 tiles.
  assert.equal(areaTiles(at(7, 7), "manhattan", 2).length, 13);
  assert.equal(areaTiles(at(7, 7), "square", 2).length, 25);
});

test("areaTiles clamps to the battlefield (a corner origin is not out of bounds)", () => {
  // At (0,0) the diamond radius 1 can only reach right/down: 3 tiles.
  assert.deepEqual(areaTiles(at(0, 0), "manhattan", 1).map((t) => key(t.x, t.y)).sort(), [key(0, 0), key(1, 0), key(0, 1)].sort());
  // The square at the corner is a 2×2 quarter: 4 tiles.
  assert.equal(areaTiles(at(0, 0), "square", 1).length, 4);
});

test("areaTiles rejects a negative or non-integer radius", () => {
  assert.throws(() => areaTiles(at(7, 7), "manhattan", -1), /non-negative integer/);
  assert.throws(() => areaTiles(at(7, 7), "square", 1.5), /non-negative integer/);
});

test("chebyshev is max(|dx|,|dy|), distinct from manhattan on diagonals", () => {
  assert.equal(chebyshev(at(0, 0), at(3, 3)), 3, "chebyshev");
  assert.equal(manhattan(at(0, 0), at(3, 3)), 6, "manhattan");
});

// ============================================================ 2. RECIPIENT RESOLUTION

/** A doll whose Basic applies the marker in the given area around ITSELF. */
function areaActor(id: string, shape: AreaShape, radius: number): CharacterDef {
  const base = makeAlly(id, 1000);
  const basic = base.skills.basic.levels[1];
  return {
    ...base,
    base: { ...base.base, critDmg: 0 },
    skills: {
      ...base.skills,
      basic: {
        ...base.skills.basic,
        levels: {
          1: {
            ...basic,
            multiplier: 0,
            appliesStatuses: [{ statusId: MARKER, durationRounds: 3, target: "ally_area", allyArea: { shape, radius } }],
          },
        },
      },
    },
  };
}

/** Three dolls: an actor at (7,7) flanked by a NEAR ally and a FAR ally. */
function areaScenario(shape: AreaShape, radius: number, nearAt: GridCoord, farAt: GridCoord, withGrid = true): Scenario {
  const grid: GridConfig = {
    size: 15,
    units: [
      { unitId: ACTOR, coord: at(7, 7) },
      { unitId: NEAR, coord: nearAt },
      { unitId: FAR, coord: farAt },
    ],
    boss: { center: at(7, 12), footprintSide: 1 },
  };
  return {
    version: 1,
    seed: 7,
    turns: 1,
    team: [ACTOR, NEAR, FAR].map((characterId) => ({ characterId, applyDispatchStats: false, rotation: ["basic"] as const, equippedFixedKeys: [] })),
    dummy: { id: "training_dummy", name: "D", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    ...(withGrid ? { grid } : {}),
    configOverrides: { critMultiplier: 1 },
  };
}

/** The ATK of a unit's own basic attack — the observable proxy for "carries the +50% ATK marker". */
function basicAtk(r: ReturnType<typeof simulateScenario>, unit: string): number[] {
  return r.log.filter((e) => e.unit === unit && e.actionType === "basic").map((e) => e.attackerAtk ?? 0);
}

const reg = (shape: AreaShape = "manhattan") => {
  const actor = areaActor(ACTOR, shape, 1);
  const r = customRegistry({ [ACTOR]: actor, [NEAR]: makeAlly(NEAR, 1000), [FAR]: makeAlly(FAR, 1000) });
  const map = new Map(r.getStatusMap());
  map.set(MARKER, markerStatus);
  return { ...r, getStatus: (id: string) => map.get(id), getStatusMap: () => map };
};

test("ally_area (manhattan 1): the actor and an ORTHOGONAL neighbour get it; a diagonal one does NOT", () => {
  // Actor (7,7). NEAR is orthogonal (7,6) ⇒ inside the diamond. FAR is diagonal (8,8) ⇒ outside.
  const r = simulateScenario(areaScenario("manhattan", 1, at(7, 6), at(8, 8)), reg("manhattan"));
  // The actor acts FIRST, so its area lands before the others act that round.
  assert.deepEqual(basicAtk(r, FAR), [1000], "diagonal ally NOT buffed");
  assert.deepEqual(basicAtk(r, NEAR), [1500], "orthogonal ally buffed (1000 × 1.5)");
});

test("ally_area (square 1): the SAME diagonal neighbour now IS included (3×3)", () => {
  const r = simulateScenario(areaScenario("square", 1, at(7, 6), at(8, 8)), reg("square"));
  assert.deepEqual(basicAtk(r, FAR), [1500], "diagonal ally buffed — the square reaches it");
});

test("ally_area includes the ACTOR itself when it stands inside its own area", () => {
  // The actor's own basic at round 2 — the marker was applied during round 1's action.
  const r = simulateScenario(areaScenario("manhattan", 1, at(7, 6), at(8, 8)), reg("manhattan"));
  const actorHits = basicAtk(r, ACTOR);
  assert.ok(actorHits.length >= 1, "the actor attacked");
  // Round 1 used the pre-marker ATK; if the actor is buffed for any later action it shows 1500.
  assert.ok(actorHits.every((a) => a === 1000 || a === 1500), `actor ATK values ${JSON.stringify(actorHits)}`);
});

test("a far-away ally is excluded for BOTH shapes", () => {
  for (const shape of AREA_SHAPES) {
    const r = simulateScenario(areaScenario(shape, 1, at(7, 6), at(0, 0)), reg(shape));
    assert.deepEqual(basicAtk(r, FAR), [1000], `${shape}: distant ally untouched`);
  }
});

test("the enemy/dummy is never a recipient of an ally area", () => {
  const r = simulateScenario(areaScenario("square", 1, at(7, 6), at(7, 8)), reg("square"));
  const dummyApplied = r.log.some((e) => (e.statusesApplied ?? []).includes(MARKER) && e.unit === "training_dummy");
  assert.equal(dummyApplied, false, "the dummy never receives an ally-area status");
});

// ============================================================ 3. HONEST ERRORS

test("ally_area WITHOUT a battle grid is an honest error, never a silent no-op", () => {
  assert.throws(
    () => simulateScenario(areaScenario("manhattan", 1, at(7, 6), at(8, 8), false), reg("manhattan")),
    /requires a battle grid/,
  );
});

test("ally_area with an UNPLACED actor is an honest error", () => {
  // Place only the allies; the actor has no grid position to measure an area from.
  const sc = areaScenario("manhattan", 1, at(7, 6), at(8, 8));
  sc.grid!.units = sc.grid!.units.filter((u) => u.unitId !== ACTOR);
  assert.throws(() => simulateScenario(sc, reg("manhattan")), /to be placed on the grid/);
});

test("a missing allyArea with target ally_area is an honest error", () => {
  const base = makeAlly(ACTOR, 1000);
  const basic = base.skills.basic.levels[1];
  const broken: CharacterDef = {
    ...base,
    base: { ...base.base, critDmg: 0 },
    skills: {
      ...base.skills,
      basic: { ...base.skills.basic, levels: { 1: { ...basic, multiplier: 0, appliesStatuses: [{ statusId: MARKER, target: "ally_area" }] } } },
    },
  };
  const r = customRegistry({ [ACTOR]: broken, [NEAR]: makeAlly(NEAR, 1000), [FAR]: makeAlly(FAR, 1000) });
  const map = new Map(r.getStatusMap());
  map.set(MARKER, markerStatus);
  assert.throws(
    () => simulateScenario(areaScenario("manhattan", 1, at(7, 6), at(8, 8)), { ...r, getStatus: (id: string) => map.get(id), getStatusMap: () => map }),
    /requires allyArea/,
  );
});

// ============================================================ 4. production data

test("the synthetic fixture stays out of the production status table", () => {
  assert.ok(!STATUS_DEFS.some((s) => s.id.startsWith("ar_")), "no ar_* fixture in STATUS_DEFS");
});

test("production data: NO shipped spec uses ally_area / no status defines an area yet", () => {
  // The vocabulary exists; Overheat Combustion and Overburn's area clauses are NOT wired.
  const qj = customRegistry({}).getCharacter("qiongjiu")!;
  const specs = Object.values(qj.skills).flatMap((a) => Object.values(a.levels).flatMap((v) => v.appliesStatuses ?? []));
  assert.equal(specs.some((s) => s.target === "ally_area"), false, "no shipped spec targets an ally area yet");
});
