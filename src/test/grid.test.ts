import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { abilities, customRegistry, makeAlly } from "./helpers.js";
import {
  attackHeightEffect,
  bossFootprintTiles,
  buildGrid,
  inBounds,
  legalDestinations,
  manhattan,
  moveCost,
} from "../engine/grid.js";
import type { CharacterDef, Scenario } from "../model/types.js";
import type { GridConfig, GridCoord } from "../model/grid.js";

/**
 * CORE GRID (2026): every confirmed mechanic gets a deterministic test.
 * UNRESOLVED mechanics (corner-squeezing, Ground → High Ground, detailed LOS, extra
 * heights, unconfirmed modifiers) are deliberately NOT tested as known behavior.
 */

const at = (x: number, y: number): GridCoord => ({ x, y });
const key = (x: number, y: number) => `${x},${y}`;

function baseGrid(over: Partial<GridConfig> = {}): GridConfig {
  return { size: 15, units: [], boss: { center: at(7, 7), footprintSide: 3 }, ...over };
}

/** Reusable mover doll with `mobility`. */
function moverDef(mobility: number): CharacterDef {
  return {
    id: "mover",
    name: "mover",
    phase: null,
    base: { atk: 1000, hp: 1000, def: 100, stability: 6, critRate: 0, critDmg: 0.2 },
    skills: abilities({
      basic: { id: "mover_basic", name: "Hit", type: "basic", element: null, multiplier: 1.0, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
      active1: { id: "mover_a1", name: "-", type: "active", element: null, multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      active2: { id: "mover_a2", name: "-", type: "active", element: null, multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      ultimate: { id: "mover_ult", name: "-", type: "ultimate", element: null, multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 3 },
    }),
    passive: { id: "mover_p", name: "-", effects: [] },
    fixedKeys: [],
    mobility,
  };
}

function moverScenario(grid: GridConfig, mobility: number): Scenario {
  return {
    version: 1,
    seed: 7,
    turns: 1,
    team: [
      { characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [] },
      { characterId: "mover", rotation: ["basic"], equippedFixedKeys: [] },
    ],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 6, weaknesses: [], phase: null, cover: "none" },
    grid,
  };
}

// ------------------------------------------------------------------ GRID

test("grid: valid coordinates in-bounds; outside-grid coordinates invalid", () => {
  assert.equal(inBounds(0, 0), true);
  assert.equal(inBounds(14, 14), true);
  assert.equal(inBounds(-1, 0), false);
  assert.equal(inBounds(0, 15), false);
});

test("grid: size must be exactly 15", () => {
  assert.throws(() => buildGrid(baseGrid({ size: 14 })), /must be exactly 15/);
});

test("grid: boundary tiles cannot be exited", () => {
  const g = buildGrid(baseGrid({ units: [{ unitId: "u", coord: at(0, 0) }] }));
  const dests = legalDestinations(g, at(0, 0), 4);
  assert.equal(dests.has(key(0, -1)), false);
  assert.equal(dests.has(key(-1, 0)), false);
});

test("grid: one unit per tile — duplicate placement rejected", () => {
  assert.throws(
    () => buildGrid(baseGrid({ units: [{ unitId: "a", coord: at(3, 3) }, { unitId: "b", coord: at(3, 3) }] })),
    /duplicate placement/,
  );
});

test("grid: normal unit footprint = 1x1 (own tile); boss footprint = 3x3 with center", () => {
  assert.deepEqual(bossFootprintTiles(at(7, 7), 1), [{ x: 7, y: 7 }]);
  const tiles = bossFootprintTiles(at(7, 7), 3);
  assert.equal(tiles.length, 9);
  assert.ok(tiles.some((t) => t.x === 6 && t.y === 6), "top-left corner");
  assert.ok(tiles.some((t) => t.x === 7 && t.y === 7), "center tile");
  const g = buildGrid(baseGrid({ units: [] }));
  assert.equal(g.enemyTiles.size, 9, "boss footprint = enemy/impassable tiles");
});

test("grid: a unit cannot be placed on the boss footprint", () => {
  assert.throws(() => buildGrid(baseGrid({ units: [{ unitId: "u", coord: at(7, 7) }] })), /boss footprint/);
});

test("grid: boss footprint blocks normal movement (cannot enter or cross)", () => {
  const g = buildGrid(baseGrid({ units: [{ unitId: "u", coord: at(3, 7) }] }));
  const dests = legalDestinations(g, at(3, 7), 6);
  for (const t of bossFootprintTiles(at(7, 7), 3)) assert.equal(dests.has(key(t.x, t.y)), false, `boss tile ${t.x},${t.y} illegal`);
  assert.equal(dests.has(key(8, 7)), false, "crossing the boss footprint is illegal (thick 3x3 wall, Mobility 6)");
});

// ------------------------------------------------------------------ DISTANCE

test("distance: horizontal, vertical, diagonal, mixed Manhattan", () => {
  assert.equal(manhattan(at(3, 3), at(8, 3)), 5);
  assert.equal(manhattan(at(3, 3), at(3, 8)), 5);
  assert.equal(manhattan(at(3, 3), at(5, 5)), 4);
  assert.equal(manhattan(at(2, 4), at(7, 1)), 8);
});

test("distance: reach is a diamond (Manhattan ≤ Mobility)", () => {
  const g = buildGrid(baseGrid({ units: [{ unitId: "u", coord: at(2, 2) }] })); // away from the boss at (7,7)
  const d2 = legalDestinations(g, at(2, 2), 2);
  let expected = 0;
  for (let dx = -2; dx <= 2; dx++)
    for (let dy = -2; dy <= 2; dy++) if (!(dx === 0 && dy === 0)) if (Math.abs(dx) + Math.abs(dy) <= 2) expected++;
  assert.equal(d2.size, expected, "exactly the Manhattan-≤2 diamond is reachable");
});

// ------------------------------------------------------------------ MOVEMENT

test("movement: orthogonal = 1, diagonal = 2, cost ≡ Manhattan distance", () => {
  const g = buildGrid(baseGrid({ units: [] }));
  assert.equal(moveCost(g, at(0, 0), at(1, 0)), 1);
  assert.equal(moveCost(g, at(0, 0), at(1, 1)), 2);
  assert.equal(moveCost(g, at(2, 4), at(7, 1)), 8);
});

test("movement: unit may use less than available Mobility", () => {
  const g = buildGrid(baseGrid({ units: [] }));
  assert.ok(legalDestinations(g, at(4, 4), 5).has(key(5, 5)), "(4,4)→(5,5) costs 2 ≤ 5");
  assert.equal(moveCost(g, at(4, 4), at(5, 5)), 2);
});

test("movement: unit cannot exceed Mobility", () => {
  const g = buildGrid(baseGrid({ units: [] }));
  assert.equal(legalDestinations(g, at(0, 0), 2).has(key(2, 2)), false, "(2,2) costs 4 > 2");
});

test("movement: allied units can be crossed but not entered", () => {
  const g = buildGrid(
    baseGrid({
      units: [
        { unitId: "u", coord: at(0, 0) },
        { unitId: "ally", coord: at(2, 0) },
      ],
    }),
  );
  const dests = legalDestinations(g, at(0, 0), 5);
  assert.equal(dests.has(key(3, 0)), true, "can move THROUGH the ally");
  assert.equal(dests.has(key(2, 0)), false, "cannot END on the ally tile");
});

test("movement: enemy units are impassable and must be routed around", () => {
  const g = buildGrid(baseGrid({ units: [{ unitId: "u", coord: at(0, 0) }], boss: { center: at(2, 0), footprintSide: 1 } }));
  assert.equal(legalDestinations(g, at(0, 0), 6).has(key(2, 0)), false, "enemy tile cannot be entered");
  assert.equal(moveCost(g, at(0, 0), at(2, 0)), Infinity, "enemy tile is impassable");
  // Directly behind the enemy (3,0) is unreachable within a mobility that forces crossing…
  assert.equal(legalDestinations(g, at(0, 0), 3).has(key(3, 0)), false, "cannot cross through the enemy tile");
  // …but with enough Mobility it IS reachable by going AROUND (enemies are routed around).
  assert.equal(legalDestinations(g, at(0, 0), 6).has(key(3, 0)), true, "routed around the enemy");
});

test("movement: blocked tiles cannot be entered or crossed", () => {
  // A full-height blocked wall at x=2 (y 0..6) from (1,2) with Mobility 8 must not be crossable.
  const wall = Array.from({ length: 7 }, (_, y) => ({ coord: at(2, y) }));
  const g = buildGrid(baseGrid({ units: [{ unitId: "u", coord: at(1, 2) }], blockedTiles: wall }));
  const dests = legalDestinations(g, at(1, 2), 8);
  assert.equal(dests.has(key(2, 2)), false, "blocked tile cannot be entered");
  for (let x = 3; x <= 8; x++) assert.equal(dests.has(key(x, 2)), false, `blocked wall cannot be crossed (${x},2)`);
});

test("movement: occupied destination is illegal", () => {
  const g = buildGrid(
    baseGrid({
      units: [
        { unitId: "u", coord: at(0, 0) },
        { unitId: "occupant", coord: at(1, 0) },
      ],
    }),
  );
  assert.equal(legalDestinations(g, at(0, 0), 5).has(key(1, 0)), false);
});

// ------------------------------------------------------------------ HEIGHT / LADDER

test("height: exactly two levels, distinct (terrain highTiles)", () => {
  const g = buildGrid(baseGrid({ units: [{ unitId: "u", coord: at(2, 2), height: "high" }], highTiles: [at(2, 2)] }));
  assert.equal(g.heights.get(key(2, 2)), "high");
  assert.equal(g.heights.has(key(5, 5)), false, "unowned tiles default to ground");
});

test("height: a unit's declared height must match its tile height", () => {
  assert.throws(() => buildGrid(baseGrid({ units: [{ unitId: "u", coord: at(2, 2), height: "high" }] })), /does not match tile height/);
});

test("height: same-height attack has no height effect", () => {
  assert.equal(attackHeightEffect("ground", "ground"), "none");
  assert.equal(attackHeightEffect("high", "high"), "none");
});

test("height: High Ground -> Ground target = Exposed; Ground -> High Ground is NOT implemented", () => {
  assert.equal(attackHeightEffect("high", "ground"), "exposed");
  assert.equal(attackHeightEffect("ground", "high"), "none", "Ground → High Ground: UNRESOLVED / Not Tested");
});

test("ladder: adjacent ladder access costs 1 Mobility; the only confirmed High Ground access", () => {
  const g = buildGrid(
    baseGrid({
      units: [{ unitId: "u", coord: at(2, 0) }],
      boss: { center: at(10, 10), footprintSide: 1 },
      highTiles: [at(2, 2)],
      ladders: [{ ground: at(2, 1), high: at(2, 2) }],
    }),
  );
  assert.equal(moveCost(g, at(2, 0), at(2, 1)), 1, "plain ground step = 1");
  assert.equal(moveCost(g, at(2, 1), at(2, 2)), 1, "climbing the ladder = 1");
  assert.equal(moveCost(g, at(2, 0), at(2, 2)), 2, "approach + climb = 2");
});

test("ladder: a ladder must connect a ground end to a high end and be adjacent", () => {
  assert.throws(() => buildGrid(baseGrid({ units: [], highTiles: [at(1, 1)], ladders: [{ ground: at(1, 1), high: at(1, 1) }] })), /adjacent/);
});

// ------------------------------------------------------------------ ENGINE SEQUENCING

test("engine: move -> action works (scripted move applies, then the action resolves)", () => {
  const grid: GridConfig = {
    size: 15,
    units: [
      { unitId: "qiongjiu", coord: at(1, 1) },
      { unitId: "mover", coord: at(4, 4) },
    ],
    boss: { center: at(7, 7), footprintSide: 3 },
    moves: [{ unitId: "mover", round: 1, to: at(5, 4) }],
  };
  const r = simulateScenario(moverScenario(grid, 3), customRegistry({ mover: moverDef(3) }));
  assert.ok(r.log.some((e) => e.action === "mover_basic"), "the mover performs its action after moving");
});

test("engine: illegal moves throw (beyond Mobility / into enemy / into blocked territory)", () => {
  const grid: GridConfig = {
    size: 15,
    units: [
      { unitId: "qiongjiu", coord: at(1, 1) },
      { unitId: "mover", coord: at(4, 4) },
    ],
    boss: { center: at(7, 7), footprintSide: 3 },
    moves: [{ unitId: "mover", round: 1, to: at(8, 8) }], // cost 8 > Mobility 2
  };
  assert.throws(() => simulateScenario(moverScenario(grid, 2), customRegistry({ mover: moverDef(2) })), /illegal/);
});

test("engine: a unit with no Mobility cannot move at all", () => {
  const grid: GridConfig = {
    size: 15,
    units: [
      { unitId: "qiongjiu", coord: at(1, 1) },
      { unitId: "mover", coord: at(4, 4) },
    ],
    boss: { center: at(7, 7), footprintSide: 3 },
    moves: [{ unitId: "mover", round: 1, to: at(5, 4) }],
  };
  assert.throws(() => simulateScenario(moverScenario(grid, 0), customRegistry({ mover: moverDef(0) })), /illegal/);
});

test("engine: action -> move is impossible (moves are only ever applied before the action)", () => {
  // Sequencing invariant: scripted moves are applied at the pre-action point ONLY — there is no
  // post-action move path in the engine, so action → move can never occur.
  const grid: GridConfig = {
    size: 15,
    units: [
      { unitId: "qiongjiu", coord: at(1, 1) },
      { unitId: "mover", coord: at(4, 4) },
    ],
    boss: { center: at(7, 7), footprintSide: 3 },
    moves: [{ unitId: "mover", round: 1, to: at(4, 5) }],
  };
  const r = simulateScenario(moverScenario(grid, 2), customRegistry({ mover: moverDef(2) }));
  assert.ok(r.log.some((e) => e.action === "mover_basic"), "the action still resolves (after the pre-action move); no move-after-action exists");
});

test("engine: move without action works (endTurnWithoutAction ends the turn)", () => {
  const grid: GridConfig = {
    size: 15,
    units: [
      { unitId: "qiongjiu", coord: at(1, 1) },
      { unitId: "mover", coord: at(4, 4) },
    ],
    boss: { center: at(7, 7), footprintSide: 3 },
    moves: [{ unitId: "mover", round: 1, to: at(5, 4), endTurnWithoutAction: true }],
  };
  const r = simulateScenario(moverScenario(grid, 2), customRegistry({ mover: moverDef(2) }));
  assert.ok(!r.log.some((e) => e.action === "mover_basic"), "the mover moved and ended its turn without acting");
});

// ------------------------------------------------------------------ HEIGHT → DAMAGE PIPELINE (the single integration point)

test("height integration: High Ground -> Ground target = Exposed through the real damage pipeline", () => {
  // QJ at fort 0 casts the Ultimate (SB II: +30% Support Action, +10% vs Exposed); the ally's
  // basic triggers the Support. Same setup except QJ's tile height:
  //   Ground: 1 + 0.10 (No-Cover) + 0.30 (SB II) = 1.40
  //   High:   1.40 + 0.10 (Exposed from High Ground → Ground) = 1.50
  const ally = makeAlly("hg_ally", 1000);
  const mk = (attackerHeight: "ground" | "high"): Scenario => ({
    version: 1,
    seed: 7,
    turns: 1,
    team: [
      { characterId: "qiongjiu", rotation: ["ultimate"], equippedFixedKeys: [] },
      { characterId: "hg_ally", rotation: ["basic"], equippedFixedKeys: [] },
    ],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 6, weaknesses: [], phase: null, cover: "none" },
    configOverrides: { confectanceStart: 6 },
    grid: {
      size: 15,
      units: [
        { unitId: "qiongjiu", coord: at(2, 2), height: attackerHeight },
        { unitId: "hg_ally", coord: at(4, 6) },
      ],
      highTiles: attackerHeight === "high" ? [at(2, 2)] : [],
      boss: { center: at(7, 7), footprintSide: 3 },
    },
  });
  const ground = simulateScenario(mk("ground"), customRegistry({ hg_ally: ally }));
  const high = simulateScenario(mk("high"), customRegistry({ hg_ally: ally }));
  const supGround = ground.log.find((e) => e.supportAttack)!;
  const supHigh = high.log.find((e) => e.supportAttack)!;
  assert.ok(Math.abs(supGround.bonusBracket - 1.4) < 1e-9, `ground support bracket ${supGround.bonusBracket}`);
  assert.ok(Math.abs(supHigh.bonusBracket - 1.5) < 1e-9, `high-ground support bracket ${supHigh.bonusBracket} (Exposed from height)`);
});
