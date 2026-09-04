import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { customRegistry } from "./helpers.js";
import type { CharacterDef, PassiveDef, Scenario } from "../model/types.js";

// U5 boss Stability damage reduction (CONFIRMED in-game boss tooltip):
//   "When stability is greater than 0 points, damage taken is reduced by 80%."
// → incoming damage × 0.20 while Stability > 0; the condition is inactive when
//   Stability = 0. Fully generic/data-driven: the passive is declared on the
//   target (boss) config via DummyConfig.passives — no boss ID is hardcoded.
// Boss-tooltip secondary effects (Deep Freeze, no-restore, restore-after-2)
// are explicitly OUT of generic U5 scope. U6 recovery is untouched.
// Fixed Damage bypasses the passive (U21: fixed components are post-chain).

function bossPassive(value: number): PassiveDef {
  return {
    id: `boss_stability_guard_${value}`,
    name: `Stability Guard (x${value})`,
    effects: [
      { kind: "conditional_damage_modifier", scope: "taken", when: "target.stabilityAboveZero", mode: "multiplicative", value },
    ],
  };
}

function makePlainChar(id: string): CharacterDef {
  return {
    id,
    name: id,
    phase: "physical",
    base: { atk: 1000, hp: 1000, def: 100, stability: 6, critRate: 0, critDmg: 0.2 },
    weapon: { id: `${id}_w`, name: "w", rarity: "standard", atkLvl1: 0, atkLvl60: 0, level: 60, subStats: [] },
    skills: {
      basic: { id: `${id}_basic`, name: "Hit", type: "basic", element: "physical", multiplier: 1.0, stabDamage: 2, cooldown: 0, confectanceCost: 0 },
      active1: { id: `${id}_a1`, name: "-", type: "active", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      active2: { id: `${id}_a2`, name: "-", type: "active", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      ultimate: { id: `${id}_ult`, name: "-", type: "ultimate", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 3 },
    },
    passive: { id: `${id}_passive`, name: "-", effects: [] },
    fixedKeys: [],
  };
}

function makeFixedChar(id: string, fixedDamage: number): CharacterDef {
  const c = makePlainChar(id);
  c.skills.basic = { ...c.skills.basic, multiplier: 0, fixedDamage, stabDamage: 0 };
  return c;
}

function bossRun(over: { stability?: number; passives?: PassiveDef[]; turns?: number; seed?: number; fixedDamage?: number } = {}) {
  const c = over.fixedDamage !== undefined ? makeFixedChar("fixed_hit", over.fixedDamage) : makePlainChar("plain_hit");
  const scenario: Scenario = {
    version: 1,
    seed: over.seed ?? 1,
    turns: over.turns ?? 3,
    team: [{ characterId: c.id, rotation: ["basic"], equippedFixedKeys: [] }],
    dummy: {
      id: "training_dummy",
      name: "Training Dummy",
      hp: 999999999,
      defense: 0,
      stability: over.stability ?? 9,
      weaknesses: [],
      phase: null,
      cover: "none",
      passives: over.passives ?? [],
    },
  };
  return simulateScenario(scenario, customRegistry({ [c.id]: c }));
}

test("stable boss: 80% reduction → incoming × 0.20 while Stability > 0", () => {
  const r = bossRun({ stability: 9, passives: [bossPassive(0.2)] });
  for (const e of r.log) {
    assert.equal(e.finalDamage, 200); // 1000 × 0.20
    assert.ok(Math.abs((e.reductionMult ?? 0) - 0.2) < 1e-9);
  }
});

test("broken boss: condition inactive at Stability = 0 → no reduction; returns on U6 recovery", () => {
  const r = bossRun({ stability: 2, passives: [bossPassive(0.2)] });
  // r1: pre-hit Stability 2 > 0 → reduced (200) and breaks; r2: Stability 0 → 1000;
  // r3: U6 restores Stability at the start of the turn → reduction applies again (200).
  assert.deepEqual(r.log.map((e) => e.finalDamage), [200, 1000, 200]);
  assert.equal(r.log[0].exposed, true); // the break happened on the reduced hit
});

test("break transition: the stability-breaking attack is evaluated pre-hit (no invented break rule)", () => {
  const r = bossRun({ stability: 2, passives: [bossPassive(0.2)] });
  assert.equal(r.log[0].finalDamage, 200); // "Stability > 0" held before the hit landed
  assert.equal(r.log[0].targetStabilityAfter, 0);
});

test("data-driven: a second reduction value applies generically (0.50 → ×0.50)", () => {
  const r = bossRun({ stability: 9, passives: [bossPassive(0.5)] });
  assert.equal(r.log[0].finalDamage, 500);
});

test("no boss passive → behavior unchanged (regression)", () => {
  const r = bossRun({ stability: 9, passives: [] });
  assert.equal(r.log[0].finalDamage, 1000);
});

test("U6 recovery unchanged: reduction returns after the confirmed 2-turn delay (longer window)", () => {
  const r = bossRun({ stability: 2, passives: [bossPassive(0.2)], turns: 4 });
  // r1: 200 (breaks); r2: 1000 (broken); r3: restores at turn start → 200 (and re-breaks);
  // r4: Stability 0 again (fresh break) → 1000.
  assert.deepEqual(r.log.map((e) => e.finalDamage), [200, 1000, 200, 1000]);
});

test("Fixed Damage bypasses the boss stability passive (U21: fixed is post-chain)", () => {
  const r = bossRun({ stability: 9, passives: [bossPassive(0.2)], fixedDamage: 195.8 });
  for (const e of r.log) {
    assert.equal(e.finalDamage, 196); // ceil(195.8) — unaffected by the ×0.20 passive
    assert.equal(e.fixedDamage, 196);
  }
});