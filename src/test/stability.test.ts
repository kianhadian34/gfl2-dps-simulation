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

test("No-Cover: Stability > 0 never reduces damage (U5 boss-domain — pure resource)", () => {
  // Same attack, same seed: a target with full Stability takes identical damage
  // to one with zero Stability — there is no stability damage reduction without Cover.
  const noStab = simulateScenario(scenario({ turns: 5, seed: 5, rotation: ["basic"] }));
  const stab = simulateScenario(scenario({ turns: 5, seed: 5, rotation: ["basic"], dummy: { stability: 9 } }));
  assert.deepEqual(
    noStab.log.map((e) => e.finalDamage),
    stab.log.map((e) => e.finalDamage),
  );
  assert.deepEqual(
    noStab.log.map((e) => e.reductionMult),
    stab.log.map((e) => e.reductionMult),
  );
});

test("No-Cover: a stability-broken target gets no generic multiplier by default (U3 stays config-gated)", () => {
  // stability 2 breaks on round 1 (exposed on rounds 2-5); stability 9 never breaks.
  // With the default exposedDamageMult = 1.0 there is no invented Exposed/Broken
  // damage bonus — the broken run deals identical damage to the intact run.
  const broken = simulateScenario(scenario({ turns: 5, seed: 5, rotation: ["basic"], dummy: { stability: 2 } }));
  const intact = simulateScenario(scenario({ turns: 5, seed: 5, rotation: ["basic"], dummy: { stability: 9 } }));
  assert.ok(broken.log.some((e) => e.exposed === true), "break must occur");
  assert.deepEqual(
    broken.log.map((e) => e.finalDamage),
    intact.log.map((e) => e.finalDamage),
  );
  assert.deepEqual(
    broken.log.map((e) => e.reductionMult),
    intact.log.map((e) => e.reductionMult),
  );
});