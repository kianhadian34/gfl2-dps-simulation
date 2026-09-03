import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { scenario } from "./helpers.js";

test("Confectance gains +1 per damage event and clamps at the configured cap", () => {
  // Start 3 (confirmed); hits clamp at cap 6: r1 3→4, r2 4→5, r3+ 6→6.
  const r = simulateScenario(scenario({ turns: 7, rotation: ["basic"], keys: [] }));
  const last = r.log[r.log.length - 1];
  assert.deepEqual(last.confectance, { before: 6, after: 6, cost: 0 });
});

test("Confectance cost is settled after the cast (research §3.12)", () => {
  const r = simulateScenario(scenario({ turns: 1, rotation: ["ultimate"], keys: [], config: { confectanceStart: 3 } }));
  const ev = r.log[0];
  assert.equal(ev.action, "qiongjiu_pressing_momentum");
  assert.deepEqual(ev.confectance, { before: 3, after: 0, cost: 3 });
});

test("FK1 (Concentration) stacks +3 onto the confirmed battle-start of 3", () => {
  // Confirmed start = 3; FK1 +3 → 6 (clamped at max); ultimate costs 3 → after = 3.
  const withKey = simulateScenario(scenario({ turns: 1, rotation: ["ultimate"], keys: ["qiongjiu_fk1_concentration"] }));
  assert.deepEqual(withKey.log[0].confectance, { before: 6, after: 3, cost: 3 });
  const without = simulateScenario(scenario({ turns: 1, rotation: ["ultimate"], keys: [] }));
  assert.deepEqual(without.log[0].confectance, { before: 3, after: 0, cost: 3 });
});

test("ultimate at max Confectance grants its extra stack and support quota (data hook)", () => {
  const r = simulateScenario(scenario({ turns: 1, rotation: ["ultimate"], keys: [], config: { confectanceStart: 6 } }));
  const ev = r.log[0];
  assert.deepEqual(ev.confectance, { before: 6, after: 3, cost: 3 }); // at cap → extra effects applied, cost still 3
  // 3 base + 1 extra Support Boost II stack: two applications (stacks 3 + 1).
  const boosts = ev.statusesApplied.filter((s) => s === "support_boost_ii");
  assert.equal(boosts.length, 2);
});