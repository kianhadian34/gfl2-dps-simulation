import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import type { Scenario } from "../model/types.js";
import { customRegistry, makeAlly } from "./helpers.js";

const ALLY = makeAlly("test_ally", 1000);

function twoDollScenario(turns: number): Scenario {
  return {
    version: 1,
    seed: 7,
    turns,
    team: [
      { characterId: "test_ally", rotation: ["basic"], equippedFixedKeys: [] },
      { characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: ["qiongjiu_fk1_concentration"] },
    ],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    configOverrides: { critMultiplier: 1.5 },
  };
}

test("ally single-target hit triggers Qiongjiu's support attack (90% ATK, +2 stab, no action cost)", () => {
  const r = simulateScenario(twoDollScenario(1), customRegistry({ test_ally: ALLY }));
  const support = r.log.filter((e) => e.supportAttack);
  assert.equal(support.length, 1);
  assert.equal(support[0].action, "qiongjiu_support");
  assert.equal(support[0].source, "passive");
  assert.equal(support[0].actionType, "support");
  assert.equal(support[0].stabilityDamage, 2);
  // Support hit = 0.9 × Qiongjiu panel ATK (1831.95) × (1 + 0.1 no-cover), crit optional:
  const min = Math.ceil(0.9 * 1831.95 * 1.1);
  const max = Math.ceil(0.9 * 1831.95 * 1.1 * 1.5);
  assert.ok(support[0].finalDamage >= min && support[0].finalDamage <= max, `support damage ${support[0].finalDamage} in [${min}, ${max}]`);
  // 3 events: ally basic (t1), qiongjiu support (t2), qiongjiu basic (t3)
  assert.equal(r.log.length, 3);
});

test("support attacks are per-round limited and do not chain from other support attacks", () => {
  const r = simulateScenario(twoDollScenario(3), customRegistry({ test_ally: ALLY }));
  const supports = r.log.filter((e) => e.supportAttack);
  // One support per round (ally hits once per round); support hits never re-trigger.
  assert.equal(supports.length, 3);
  // Quota aftermath: support damages accumulate under the "passive" source.
  const passive = r.bySource.find((s) => s.source === "passive");
  assert.ok(passive && passive.actions === 3);
});

test("a solo doll never fires support attacks (no allies)", () => {
  const r = simulateScenario({
    version: 1,
    seed: 7,
    turns: 2,
    team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [] }],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
  });
  assert.ok(r.log.every((e) => !e.supportAttack));
});