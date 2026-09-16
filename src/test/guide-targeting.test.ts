import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGrid, isCardinalDirection, resolveCardinalRayTarget, tileKey } from "../engine/grid.js";
import { simulateScenario } from "../simulate.js";
import { customRegistry } from "./helpers.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import type { GridConfig } from "../model/grid.js";

/**
 * GUIDE TO VICTORY targeting (VALIDATED 2026, screenshot + tooltip):
 *  - One cardinal direction (up/down/left/right) — diagonals are NOT valid.
 *  - Range 1 (descriptive); Effective Area 8 along the direction.
 *  - The FIRST enemy within those 8 tiles is the target; search stops at the first enemy.
 * This is SELECTION only — `damageCategory: "aoe"` and the damage pipeline are unchanged.
 */

function gridWithEnemy(caster: { x: number; y: number }, enemy: { x: number; y: number }): GridConfig {
  return {
    size: 15,
    units: [{ unitId: "gj", coord: caster }],
    boss: { center: enemy, footprintSide: 1 },
    blockedTiles: [],
    moves: [],
  };
}

test("targeting: each of the four cardinal directions resolves its enemy", () => {
  const cases: Array<{ direction: "up" | "down" | "left" | "right"; at: { x: number; y: number } }> = [
    { direction: "up", at: { x: 7, y: 3 } },
    { direction: "down", at: { x: 7, y: 11 } },
    { direction: "left", at: { x: 3, y: 7 } },
    { direction: "right", at: { x: 11, y: 7 } },
  ];
  for (const { direction, at } of cases) {
    const grid = buildGrid(gridWithEnemy({ x: 7, y: 7 }, at));
    const t = resolveCardinalRayTarget(grid, { x: 7, y: 7 }, direction, 8);
    assert.deepEqual(t, at, `direction ${direction} selects the enemy at its tile`);
  }
});

test("targeting: effective area is 8 tiles inclusive; no enemy inside → no target", () => {
  // Enemy exactly 8 tiles below (7,7) → (7,15), the last in-bounds tile (15-grid 0..14):
  const gAt8 = buildGrid(gridWithEnemy({ x: 7, y: 6 }, { x: 7, y: 14 }));
  assert.deepEqual(resolveCardinalRayTarget(gAt8, { x: 7, y: 6 }, "down", 8), { x: 7, y: 14 }, "enemy at the 8th tile IS selected (inclusive)");
  // Enemy on a DIFFERENT ray ((7,3) = up) while casting down → nothing within the down field:
  const gWrongRay = buildGrid(gridWithEnemy({ x: 7, y: 7 }, { x: 7, y: 3 }));
  assert.equal(resolveCardinalRayTarget(gWrongRay, { x: 7, y: 7 }, "down", 8), undefined, "no enemy within 8 tiles down");
});

test("targeting: the FIRST enemy on the ray is selected, never one behind it", () => {
  const grid = buildGrid(gridWithEnemy({ x: 7, y: 7 }, { x: 7, y: 12 })); // boss at d=5 from (7,7)
  // Add a second enemy tile FURTHER along the same ray (simulating an enemy behind the first):
  grid.enemyTiles.add(tileKey(7, 14));
  const t = resolveCardinalRayTarget(grid, { x: 7, y: 7 }, "down", 8);
  assert.deepEqual(t, { x: 7, y: 12 }, "the nearer enemy (d=5) is selected, not the one at d=7");
});

test("targeting: diagonal directions are invalid (rejected defensively)", () => {
  assert.equal(isCardinalDirection("up"), true);
  assert.equal(isCardinalDirection("down"), true);
  assert.equal(isCardinalDirection("left"), true);
  assert.equal(isCardinalDirection("right"), true);
  for (const diag of ["up-right", "down-left", "north-east", "diagonal"]) {
    assert.equal(isCardinalDirection(diag), false, `${diag} is not a cardinal direction`);
  }
  const grid = buildGrid(gridWithEnemy({ x: 7, y: 7 }, { x: 7, y: 3 }));
  assert.throws(() => resolveCardinalRayTarget(grid, { x: 7, y: 7 }, "up-right" as never, 8), /invalid cardinal direction/);
});

test("targeting: grid-enabled Guide Lv1 damage is UNCHANGED when the same target is selected", () => {
  // QJ at (7,7), dummy at (7,15) — exactly 8 tiles down, inside the effective area. The
  // controlled Lv1 validation value (1962 ATK → 803, V6 No-Cover, Burn-weak) must match.
  const def = structuredClone(QIONGJIU);
  def.id = "gj";
  def.base = { ...def.base, atk: 1962, critRate: 0 };
  def.weapon = { ...def.weapon, atkLvl1: 0, atkLvl60: 0, subStats: [] };
  const r = simulateScenario(
    {
      version: 1,
      seed: 7,
      turns: 1,
      team: [{ characterId: "gj", rotation: ["active2"], equippedFixedKeys: [] }],
      dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: ["burn"], phase: null, cover: "none" },
      configOverrides: { fortificationLevel: 6 }, // V6 No-Cover as a single +20% total
      grid: gridWithEnemy({ x: 7, y: 6 }, { x: 7, y: 14 }),
    },
    customRegistry({ gj: def }),
  );
  const ev = r.log.find((e) => e.action === "qiongjiu_guide_to_victory")!;
  assert.equal(ev.critical, false);
  assert.equal(ev.finalDamage, 803, "grid-enabled Guide with the target on the ray keeps the validated 803");
});

test("targeting: no enemy on the selected ray → honest error (no silent retarget)", () => {
  const grid = gridWithEnemy({ x: 7, y: 7 }, { x: 7, y: 3 }); // enemy is UP, cast is DOWN
  const def = structuredClone(QIONGJIU);
  def.id = "gj";
  def.base = { ...def.base, atk: 1962, critRate: 0 };
  const r = () =>
    simulateScenario(
      {
        version: 1,
        seed: 7,
        turns: 1,
        team: [{ characterId: "gj", rotation: ["active2"], equippedFixedKeys: [] }],
        dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" },
        configOverrides: { fortificationLevel: 2 },
        grid,
      },
      customRegistry({ gj: def }),
    );
  assert.throws(r, /no enemy target within 8 tiles down of gj/);
});