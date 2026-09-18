import { test } from "node:test";
import { customRegistry } from "./helpers.js";
import assert from "node:assert/strict";
import { finalStat } from "../engine/stats.js";
import { computePanel } from "../engine/state.js";
import { simulateScenario } from "../simulate.js";
import { REGISTRY } from "../data/registry.js";
import { QIONGJIU } from "../data/qiongjiu.js";

/**
 * FINAL STAT rounding: Final Stat = ceil((Initial + Flat) × (1 + Stat%)).
 * Evidence: integer DISPLAY Validated (the game shows final stats as integers); the ceil
 * formula is **Mathematically Proven** by these deterministic regressions and the established
 * stat formula; the exact hidden rounding method is **Not Tested** (the game never exposes the
 * fractional intermediate). Exactly one production point (computePanel) for ATK/DEF/HP;
 * downstream consumers receive the integer values. Intermediate damage math is NOT affected.
 */

const scenarioFor = (rotation: string[]): Parameters<typeof simulateScenario>[0] => ({
  version: 1,
  seed: 7,
  turns: 1,
  team: [{ characterId: "qiongjiu", rotation: rotation as never, equippedFixedKeys: [], weaponId: "weapon_qj_panel_test" }],
  dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 6, weaknesses: [], phase: null, cover: "none" },
});

test("finalStat: integer result stays unchanged", () => {
  assert.equal(finalStat(1200, 300, 0.05), 1575); // 1500 × 1.05 = 1575 (already integer)
  assert.equal(finalStat(1000, 0, 0), 1000); // zero pct, zero flat
});

test("finalStat: fractional result is ceiling-rounded", () => {
  assert.equal(finalStat(1224, 369, 0.15), 1832); // 1593 × 1.15 = 1831.95 → 1832 (QJ ATK)
  assert.equal(finalStat(333, 0, 0.5), 500); // 499.5 → 500 (fractional percentage result)
});

test("finalStat: flat + percentage combined", () => {
  assert.equal(finalStat(800, 200, 0.1), 1100); // 1000 × 1.1
  assert.equal(finalStat(95, 10, 0.5), 158); // 105 × 1.5 = 157.5 → 158
});

test("finalStat: zero percentage and zero flat", () => {
  assert.equal(finalStat(600, 50, 0), 650); // flat only, zero pct
  assert.equal(finalStat(600, 0, 0.17), 702); // 600 × 1.17 = 702 (integer exact)
});

test("finalStat: multiple % modifiers sum into one Stat% term", () => {
  // 0.10 + 0.05 + 0.05 = 0.20 → 1000 × 1.20 = 1200.
  assert.equal(finalStat(1000, 0, 0.1 + 0.05 + 0.05), 1200);
  // (300 + 100) × (1 + 0.10 + 0.05) = 400 × 1.15 = 460.
  assert.equal(finalStat(300, 100, 0.1 + 0.05), 460);
});

test("computePanel: ATK/DEF/HP are integer final stats (Qiongjiu, equipped Golden Melody)", () => {
  const p = computePanel(QIONGJIU, REGISTRY.getWeapon("jinshizou")!);
  assert.equal(Number.isInteger(p.atk), true);
  assert.equal(Number.isInteger(p.hp), true);
  assert.equal(Number.isInteger(p.def), true);
  assert.equal(p.atk, 1832, "ceil((1224 + 369) × 1.15) = ceil(1831.95) = 1832");
  assert.equal(p.hp, 2494); // 2494 × 1.0 (already integer)
  assert.equal(p.def, 695);
});

test("downstream: damage consumes the ROUNDED attacker ATK (Qiongjiu Basic, DEF 5000)", () => {
  // ATK 1832 (integer final stat) → ratio = 1832/6832 = 0.2681499;
  // base = 1832 × 0.8 × 0.2681499 = 393.00; bracket = 1.10 (No-Cover).
  // seed 7 ⇒ this hit crits (CDMG 1.20 applies to the unrounded value before the final ceil):
  //   ceil(393.00 × 1.10 × 1.20) = ceil(518.76) = 519.
  const r = simulateScenario(scenarioFor(["basic"]), customRegistry({}));
  const ev = r.log.find((e) => e.action === "qiongjiu_basic")!;
  assert.equal(ev.attackerAtk, 1832, "integer final ATK reaches the damage pipeline");
  assert.equal(ev.finalDamage, 519);
});

test("downstream: target DEF is consumed as the integer final stat", () => {
  const r = simulateScenario(scenarioFor(["basic"]), customRegistry({}));
  const ev = r.log.find((e) => e.action === "qiongjiu_basic")!;
  assert.equal(ev.targetDef, 5000, "integer target DEF consumed by damage");
});



