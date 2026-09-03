import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { DEFAULT_CONFIG } from "../engine/state.js";
import { scenario } from "./helpers.js";

// U9 CONFIRMED in-game (2026-09-03, docs/research.md §3.12/§4):
// - Qiongjiu starts battle with 3 Confectance (no keys equipped)
// - maximum Confectance = 6
// - each Basic Attack damage event increases Confectance by 1
// - Pressing the Momentum (Ultimate) shows Confectance Cost: 3
// - training dummy unchanged, No Cover
// Engine defaults: confectanceStart = 3, confectanceMax = 6; gain (+1/damage
// event) and cost (3) live in Qiongjiu's passive/skill data, not the engine.

test("battle start Confectance = 3 (confirmed, no keys)", () => {
  const r = simulateScenario(scenario({ turns: 1, rotation: ["basic"], keys: [] }));
  assert.deepEqual(r.log[0].confectance, { before: 3, after: 4, cost: 0 });
});

test("maximum Confectance = 6 and gains clamp at the cap", () => {
  const r = simulateScenario(scenario({ turns: 7, rotation: ["basic"], keys: [] }));
  // r1: 3→4, r2: 4→5, r3: 5→6, r4..r7: 6→6 (clamped).
  for (const e of r.log.slice(3)) {
    assert.deepEqual(e.confectance, { before: 6, after: 6, cost: 0 });
  }
  assert.equal(DEFAULT_CONFIG.confectanceStart, 3);
  assert.equal(DEFAULT_CONFIG.confectanceMax, 6);
});

test("each damage event gains exactly +1 Confectance", () => {
  const r = simulateScenario(scenario({ turns: 3, rotation: ["basic"], keys: [] }));
  assert.deepEqual(r.log.map((e) => e.confectance!.before), [3, 4, 5]);
});

test("Ultimate costs exactly 3 Confectance, settled after the cast", () => {
  const r = simulateScenario(scenario({ turns: 1, rotation: ["ultimate"], keys: [] }));
  assert.deepEqual(r.log[0].confectance, { before: 3, after: 0, cost: 3 });
});

test("FK1 (+3) stacks onto the confirmed start of 3 → 6 (clamped at max)", () => {
  const withKey = simulateScenario(scenario({ turns: 1, rotation: ["ultimate"], keys: ["qiongjiu_fk1_concentration"] }));
  assert.deepEqual(withKey.log[0].confectance, { before: 6, after: 3, cost: 3 });
});