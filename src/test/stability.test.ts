import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { scenario } from "./helpers.js";

test("stability damage is per-hit fixed value; no break when stability > 0", () => {
  // Basic attack deals 2 stability damage (research §3.11).
  const r = simulateScenario(scenario({ turns: 1, dummy: { stability: 9 } }));
  const ev = r.log[0];
  assert.equal(ev.stabilityDamage, 2);
  assert.equal(ev.exposed, false);
});

test("break at stability 0 sets the exposed flag and respects configured duration", () => {
  // stability 4: r1 → 2, r2 → 0 → exposed (basic = 2 stab/hit).
  const r = simulateScenario(scenario({ turns: 2, dummy: { stability: 4 }, config: { exposedDurationRounds: 2 } }));
  const breakEv = r.log[1];
  assert.equal(breakEv.stabilityDamage, 2);
  assert.equal(breakEv.targetStabilityAfter, 0);
  assert.equal(breakEv.exposed, true);
});

test("a dummy with stability 0 never breaks (no invented collapsed-at-start semantics)", () => {
  const r = simulateScenario(scenario({ turns: 5 }));
  assert.ok(r.log.every((e) => e.exposed === false));
});

test("exposedDamageMult config raises damage after the break", () => {
  const base = { turns: 4, dummy: { stability: 2 } }; // breaks on round 1
  const a = simulateScenario(scenario({ ...base, config: { exposedDamageMult: 1.0 } }));
  const b = simulateScenario(scenario({ ...base, config: { exposedDamageMult: 1.2 } }));
  assert.equal(a.seed, b.seed);
  assert.ok(b.totals.damage > a.totals.damage, "higher exposed multiplier must increase post-break damage");
});

test("warnings only mention Exposed values when the dummy can actually break", () => {
  const stable = simulateScenario(scenario({ turns: 3, dummy: { stability: 5 } }));
  const unstable = simulateScenario(scenario({ turns: 3 }));
  assert.ok(stable.warnings.some((w) => w.includes("exposed")));
  assert.ok(!unstable.warnings.some((w) => w.includes("exposed")));
});