import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { scenario } from "./helpers.js";

// U15 — weakness stability damage (validated in-game, 2026).
// Total Stability Damage = Attack Base Stability Damage + (2 × # weaknesses exploited)
//   — element AND ammo-tag matches both count into the # exploited (generic across
//   Physical/Phase; independent of the damage multiplier). AWU stays a separate
//   Physical-only damage mechanic and is NOT mixed into this stability calculation.
//
// Validated examples (target stability starts at 65; QJ base values: Basic = 2,
// Common Rail Lv.2 = 3):
//   1. Basic, 0 exploited           → 2  (65 → 63)
//   2. Basic, 1 (Ammo) exploited    → 4  (65 → 61)
//   3. Common Rail, 1 (Burn)        → 5  (65 → 60)
//   4. Common Rail, 2 (Burn + Ammo) → 7  (65 → 58)

test("stab: Basic, 0 exploited weaknesses → total 2 (65→63, validated)", () => {
  const r = simulateScenario(scenario({ turns: 1, seed: 5, rotation: ["basic"], dummy: { stability: 65 } }));
  const ev = r.log[0];
  assert.equal(ev.stabilityDamage, 2);
  assert.equal(ev.targetStabilityAfter, 63);
});

test("stab: Basic, 1 Ammo weakness exploited → total 4 (65→61, validated)", () => {
  const r = simulateScenario(
    scenario({ turns: 1, seed: 5, rotation: ["basic"], dummy: { stability: 65, weaknessTags: ["assault_rifle_ammo"] } }),
  );
  const ev = r.log[0];
  assert.equal(ev.stabilityDamage, 4); // 2 base + 2 × 1 (ammo tag)
  assert.equal(ev.targetStabilityAfter, 61);
});

test("stab: Common Rail (Burn), 1 Burn weakness exploited → total 5 (65→60, validated)", () => {
  const r = simulateScenario(
    scenario({ turns: 1, seed: 5, rotation: ["active1"], dummy: { stability: 65, weaknesses: ["burn"] } }),
  );
  const ev = r.log[0];
  assert.equal(ev.stabilityDamage, 5); // 3 base + 2 × 1 (burn element)
  assert.equal(ev.targetStabilityAfter, 60);
});

test("stab: Common Rail (Burn), 2 exploited (Burn + Ammo) → total 7 (65→58, validated rule)", () => {
  const r = simulateScenario(
    scenario({
      turns: 1,
      seed: 5,
      rotation: ["active1"],
      dummy: { stability: 65, weaknesses: ["burn"], weaknessTags: ["assault_rifle_ammo"] },
    }),
  );
  const ev = r.log[0];
  assert.equal(ev.stabilityDamage, 7); // 3 base + 2 × 2 (burn element + ammo tag)
  assert.equal(ev.targetStabilityAfter, 58);
});

test("stab: AWU does NOT affect the stability calculation (stacks present → stab still base + 2 × matched)", () => {
  // Build 5 AWU stacks on the target via Physical basics (each exploits the ammo
  // tag: 2 base + 2 = 4 stab each → 65 − 20 = 45), then a Burn+ammo Common Rail.
  const r = simulateScenario(
    scenario({
      turns: 6,
      seed: 9,
      rotation: ["basic", "basic", "basic", "basic", "basic", "active1"],
      dummy: {
        stability: 65,
        weaknesses: ["burn"],
        weaknessTags: ["assault_rifle_ammo"],
        passives: [{ id: "awu", name: "AWU trigger", effects: [{ kind: "grant_stacks_on_weakness_exploit", weaknessTag: "assault_rifle_ammo", statusId: "ammo_weakness_upgrade", firstGain: 2, gainPerEvent: 1, maxStacks: 5, requiresElements: ["physical"] }] }],
      },
    }),
  );
  // Last event is the Common Rail (Burn): AWU at 5 stacks, but stab is purely
  // base + 2 × exploited (burn element + ammo tag = 2) → 3 + 4 = 7.
  const last = r.log[r.log.length - 1];
  assert.equal(last.action, "qiongjiu_common_rail");
  // AWU is at 5 stacks from the Physical basics, but the Burn hit neither advances
  // it nor feeds it into stability: stab = base + 2 × exploited (burn + ammo = 2).
  assert.deepEqual(last.upgradeStacks, [{ statusId: "ammo_weakness_upgrade", stacks: 5 }]);
  assert.equal(last.stabilityDamage, 7, "AWU stacks do not enter the stability calculation");
  assert.equal(last.targetStabilityAfter, 45 - 7);
});