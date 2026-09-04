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

test("U4: exposedDurationRounds override shortens the broken-window flag (testing knob)", () => {
  // stability 4: r1 no break, r2 breaks. Default 2 keeps the exposed flag through r3
  // (fixed 2-turn rule); an override of 1 clears it at the end of the break round.
  // stability restores at the START of r4 (recovery), and r4 does not re-break.
  const dflt = simulateScenario(scenario({ turns: 4, seed: 2, dummy: { stability: 4 } }));
  const short = simulateScenario(scenario({ turns: 4, seed: 2, dummy: { stability: 4 }, config: { exposedDurationRounds: 1 } }));
  assert.deepEqual(dflt.log.map((e) => e.exposed), [false, true, true, false]);
  assert.deepEqual(short.log.map((e) => e.exposed), [false, true, false, false]);
});

test("warnings mention the broken-window knob only when it is overridden", () => {
  const dflt = simulateScenario(scenario({ turns: 3, dummy: { stability: 5 } }));
  const overridden = simulateScenario(scenario({ turns: 3, dummy: { stability: 5 }, config: { exposedDurationRounds: 3 } }));
  assert.ok(!dflt.warnings.some((w) => w.includes("exposed")));
  assert.ok(overridden.warnings.some((w) => w.includes("exposed")));
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

test("U3 resolved: no universal Exposed damage multiplier — Broken targets take normal damage", () => {
  // stability 2 breaks on round 1; stability 9 never breaks; stability 0 is broken from the start.
  // With no generic Exposed multiplier, all three runs deal identical damage.
  const broken = simulateScenario(scenario({ turns: 5, seed: 5, rotation: ["basic"], dummy: { stability: 2 } }));
  const intact = simulateScenario(scenario({ turns: 5, seed: 5, rotation: ["basic"], dummy: { stability: 9 } }));
  const zeroFromStart = simulateScenario(scenario({ turns: 5, seed: 5, rotation: ["basic"], dummy: { stability: 0 } }));
  assert.ok(broken.log.some((e) => e.exposed === true), "break must occur");
  const dmg = (r: ReturnType<typeof simulateScenario>) => r.log.map((e) => e.finalDamage);
  const red = (r: ReturnType<typeof simulateScenario>) => r.log.map((e) => e.reductionMult);
  assert.deepEqual(dmg(broken), dmg(intact));
  assert.deepEqual(dmg(zeroFromStart), dmg(intact));
  assert.deepEqual(red(broken), red(intact));
});
