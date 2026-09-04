import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { customRegistry } from "./helpers.js";
import type { CharacterDef, Element, Scenario } from "../model/types.js";

// U21 engine-level (docs/research.md §3.1/§4):
// - Fixed Damage is an absolute, already-resolved component (SkillDef.fixedDamage).
// - It bypasses EVERY normal-chain factor (buff bracket, phase, weakness,
//   reductions, DEF, crit) and is independently ceiled, then ADDED
//   post-chain: finalDamage = ceil(normalChain) + ceil(fixed). The log keeps
//   the fixed component separately (ev.fixedDamage).
// - In-game mirror: Overburn = 10% of applier ATK → 1958 × 0.10 = 195.8 → 196,
//   unchanged by Burn immunity or Qiongjiu's +20% No-Cover bonus.

function makeFixedChar(id: string, fixedDamage: number, element: Element): CharacterDef {
  return {
    id,
    name: id,
    phase: "physical",
    base: { atk: 1000, hp: 1000, def: 100, stability: 6, critRate: 0.8, critDmg: 0.2 },
    weapon: { id: `${id}_w`, name: "w", rarity: "standard", atkLvl1: 0, atkLvl60: 0, level: 60, subStats: [] },
    skills: {
      basic: { id: `${id}_basic`, name: "Fixed Hit", type: "basic", element, multiplier: 0, fixedDamage, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
      active1: { id: `${id}_a1`, name: "-", type: "active", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      active2: { id: `${id}_a2`, name: "-", type: "active", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      ultimate: { id: `${id}_ult`, name: "-", type: "ultimate", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 3 },
    },
    passive: {
      id: `${id}_passive`,
      name: "-",
      effects: [{ kind: "conditional_damage_modifier", scope: "dealt", mode: "additive", value: 0.1, when: "target.noCover" }],
    },
    fixedKeys: [],
  };
}

function fixedRun(fixedDamage: number, weaknesses: Element[] = [], seed = 1): ReturnType<typeof simulateScenario> {
  const c = makeFixedChar("fixed_test", fixedDamage, "burn");
  const scenario: Scenario = {
    version: 1,
    seed,
    turns: 2,
    team: [{ characterId: c.id, rotation: ["basic"], equippedFixedKeys: [] }],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses, phase: null, cover: "none" },
  };
  return simulateScenario(scenario, customRegistry({ fixed_test: c }));
}

test("U21 fixed-only skill at engine level: post-chain ceil + separate log component + aggregation", () => {
  const r = fixedRun(195.8);
  for (const e of r.log) {
    assert.equal(e.finalDamage, 196); // ceil(195.8)
    assert.equal(e.fixedDamage, 196); // component recorded separately
    assert.equal(e.critical, false); // fixed never crits (critRate 0.8 in data)
  }
  assert.equal(r.totals.actions, 2);
  const logSum = r.log.reduce((a, e) => a + e.finalDamage, 0);
  assert.equal(r.totals.damage, logSum);
  assert.equal(r.byCharacter[0].damage, logSum);
});

test("U21 invariance: weakness exploit and the no-cover damage buff never change the fixed component", () => {
  const plain = fixedRun(100, []);
  const weak = fixedRun(100, ["burn"]); // Burn weakness matches the fixed skill's element
  for (const run of [plain, weak]) {
    for (const e of run.log) {
      assert.equal(e.finalDamage, 100);
      assert.equal(e.fixedDamage, 100);
    }
  }
  // The weakness WAS exploited (normal chain is 0, so it only affects the unused chain):
  assert.deepEqual(weak.log[0].weaknessExploited, ["burn"]);
  // The +10% no-cover passive feeds the additive bracket; the fixed component ignores it.
  assert.ok(Math.abs((weak.log[0].bonusBracket ?? 0) - 1.1) < 1e-9);
});

test("deterministic: identical fixed-damage runs produce identical logs", () => {
  const a = fixedRun(195.8);
  const b = fixedRun(195.8);
  assert.equal(JSON.stringify(a.log), JSON.stringify(b.log));
  assert.deepEqual(a.log.map((e) => e.finalDamage), [196, 196]);
});