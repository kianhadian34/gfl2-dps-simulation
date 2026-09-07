import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { scenario, customRegistry } from "./helpers.js";
import type { CharacterDef } from "../model/types.js";

/** Synthetic attacker with TWO independent onDamageDealt Confectance gains (+1 and +2). */
function multiGainChar(id: string): CharacterDef {
  return {
    id,
    name: id,
    phase: "physical",
    base: { atk: 1000, hp: 1000, def: 100, stability: 6, critRate: 0, critDmg: 0.2 },
    weapon: { id: `${id}_w`, name: "w", rarity: "standard", atkLvl1: 0, atkLvl60: 0, level: 60, subStats: [] },
    skills: {
      basic: { id: `${id}_basic`, name: "Hit", type: "basic", element: "physical", multiplier: 1.0, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
      active1: { id: `${id}_a1`, name: "-", type: "active", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      active2: { id: `${id}_a2`, name: "-", type: "active", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      ultimate: { id: `${id}_ult`, name: "-", type: "ultimate", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
    },
    passive: {
      id: `${id}_passive`,
      name: "-",
      effects: [
        { kind: "resource_gain", resource: "confectance", amount: 1, on: "onDamageDealt" },
        { kind: "resource_gain", resource: "confectance", amount: 2, on: "onDamageDealt" },
      ],
    },
    fixedKeys: [],
  };
}

test("multiple independent resource gains from one action are all applied and summed (0 + 1 + 2 = 3), cap intact", () => {
  const c = multiGainChar("mg");
  const r = simulateScenario(
    {
      version: 1,
      seed: 3,
      turns: 3,
      team: [{ characterId: c.id, rotation: ["basic"], equippedFixedKeys: [] }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
      configOverrides: { confectanceStart: 0 },
    },
    customRegistry({ [c.id]: c }),
  );
  // r1: 0 + 1 + 2 = 3; r2: 3 + 3 = 6 (cap); r3: stays 6 (overflow discarded).
  assert.deepEqual(r.log[0].confectance, { before: 0, after: 3, cost: 0 });
  assert.deepEqual(r.log[1].confectance, { before: 3, after: 6, cost: 0 });
  assert.deepEqual(r.log[2].confectance, { before: 6, after: 6, cost: 0 });
});

test("Confectance gains +1 per damage event and clamps at the configured cap", () => {
  // Start 3 (confirmed); hits clamp at cap 6: r1 3→4, r2 4→5, r3+ 6→6.
  const r = simulateScenario(scenario({ turns: 7, rotation: ["basic"], keys: [] }));
  const last = r.log[r.log.length - 1];
  assert.deepEqual(last.confectance, { before: 6, after: 6, cost: 0 });
});

test("Confectance cost is consumed immediately on activation (before damage/effects resolve)", () => {
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