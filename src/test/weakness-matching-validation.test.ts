import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { customRegistry } from "./helpers.js";
import type { AmmoType, CharacterDef, Element } from "../model/types.js";

// U15a — weakness-matching counts (validated in-game, 2026).
// One matched weakness → ×1.10; two matched weaknesses → ×1.20; the factor is
// ADDITIVE across matched weaknesses: 1 + 0.10 × matchedWeaknesses. Both
// element weaknesses and the Ammo weakness tag (assault_rifle_ammo) count into
// the SAME factor (U20 + 2026 ammo dimension). AWU stays separate (Physical-only).
//
// Validated Qiongjiu dataset (Common Rail Lv.2, Burn, 150% ATK, ATK 1958,
// no cover, non-crit unless noted, target DEF 5000, Phase-compatible dummy):
//   Test A — weaknesses: Burn + Ammo  → normal 1191, crit 1470 (123.5% CDMG)
//   Test B — weakness: Burn only      → normal 1091 (repeated 4×)
//
// TESTING LIMITATION (not claimed as validated): a zero-weakness Phase target
// and an Ammo-only Phase target are NOT testable with the available dummy tools
// (the ammo-only configuration is Phase-damage immune). No test below asserts
// those cases as validated behavior.

const ATK = 1958;
const MULT = 1.5; // Common Rail

function makeCommonRail(id: string, critRate: number, critDmg: number): CharacterDef {
  return {
    id,
    name: id,
    phase: "burn",
    base: { atk: ATK, hp: 1000, def: 100, stability: 6, critRate, critDmg },
    weapon: { id: `${id}_w`, name: "w", rarity: "standard", atkLvl1: 0, atkLvl60: 0, level: 60, subStats: [] },
    skills: {
      basic: { id: `${id}_rail`, name: "Common Rail", type: "basic", element: "burn", ammoType: "assault_rifle_ammo", multiplier: MULT, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
      active1: { id: `${id}_a1`, name: "-", type: "active", element: "burn", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      active2: { id: `${id}_a2`, name: "-", type: "active", element: "burn", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      ultimate: { id: `${id}_ult`, name: "-", type: "ultimate", element: "burn", multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 3 },
    },
    passive: {
      id: `${id}_passive`,
      name: "-",
      // 1.20 bracket = 0.10 passive no-cover + 0.10 V6 (folded explicitly, as validated).
      effects: [{ kind: "conditional_damage_modifier", scope: "dealt", mode: "additive", value: 0.2, when: "target.noCover" }],
    },
    fixedKeys: [],
  };
}

function railRun(c: CharacterDef, weaknesses: Element[], ammoTags: AmmoType[] = []) {
  return simulateScenario(
    {
      version: 1,
      seed: 3,
      turns: 1,
      team: [{ characterId: c.id, rotation: ["basic"], equippedFixedKeys: [] }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 0, weaknesses, weaknessTags: ammoTags, phase: null, cover: "none" },
    },
    customRegistry({ [c.id]: c }),
  );
}

test("U15a Test B: one matched Element weakness (Burn only) → ×1.10 → 1091, repeated 4×", () => {
  for (let i = 0; i < 4; i++) {
    const ev = railRun(makeCommonRail(`b${i}`, 0, 0.2), ["burn"]).log[0];
    assert.equal(ev.finalDamage, 1091, `repeat ${i + 1}`); // ceil(826.48 × 1.20 × 1.10) — validated
    assert.deepEqual(ev.weaknessExploited, ["burn"]);
  }
});

test("U15a Test A: two matched weaknesses (Burn element + Ammo tag) → ×1.20 → 1191", () => {
  const ev = railRun(makeCommonRail("a", 0, 0.2), ["burn"], ["assault_rifle_ammo"]).log[0];
  assert.equal(ev.finalDamage, 1191); // ceil(826.48 × 1.20 × 1.20) — validated
  assert.deepEqual(ev.weaknessExploited, ["burn", "assault_rifle_ammo"]);
  // Exactly two +10% steps: multiplicative 1.21 would give 1201 ≠ 1191 (U20 discriminant).
  assert.equal(Math.ceil(ev.mitigatedDamage! * ev.bonusBracket * 1.21), 1201);
});

test("U15a Test A crit: two matched weaknesses, 123.5% Crit DMG → 1470 (validated)", () => {
  const ev = railRun(makeCommonRail("ac", 1, 0.235), ["burn"], ["assault_rifle_ammo"]).log[0];
  assert.equal(ev.finalDamage, 1470); // 1190.13 × 1.235 → ceil 1470 — validated
  assert.equal(ev.critical, true);
});

test("U15a: weakness factor carries the matched count (additive 1 + 0.10 × count), independent of AWU", () => {
  // Baseline sanity for the factor itself: one element weakness on a Physical
  // attack with NO AWU trigger present still yields the same count rule.
  const c = makeCommonRail("x", 0, 0.2);
  const one = railRun(c, ["burn"]).log[0];
  assert.equal(one.finalDamage, 1091);
  // No AWU status/tier can appear here: a plain (non-ammo) dummy has no trigger.
  assert.ok(one.upgradeStacks === undefined);
});