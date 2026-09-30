import test from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { REGISTRY } from "../data/registry.js";
import type { Scenario } from "../model/types.js";

/**
 * OVERBURN ON-APPLICATION FROM SUPPORT ATTACK (2026 fix).
 * Validated rule: gaining Overburn deals fixed damage = 10% of the APPLIER's ATK ON APPLICATION,
 * then again at each of the holder's next two action ends. The Support path now fires the
 * immediate on-application damage right AFTER the Support Attack event (previously only the
 * holder's action-end ticks ran, so the target never took Overburn damage immediately).
 */

const TARGET = {
  id: "training_dummy",
  name: "Training Dummy",
  hp: 999999999,
  defense: 5000,
  stability: 100,
  weaknesses: [],
  phase: null,
  cover: "none",
};

function run(fortificationLevel = 6): ReturnType<typeof simulateScenario> {
  return simulateScenario(
    {
      version: 1,
      seed: 7,
      turns: 2,
      team: [
        { characterId: "basic_attack_dummy", rotation: ["basic", "basic"], equippedFixedKeys: [] },
        { characterId: "qiongjiu",
         baseStatOverrides: { atk: 1224, hp: 2494, def: 695 }, rotation: ["basic", "basic"], equippedFixedKeys: [] },
      ],
      dummy: TARGET,
      configOverrides: { fortificationLevel },
    } as Scenario,
    REGISTRY,
  );
}

test("support-attack Overburn fires immediate fixed damage right AFTER the Support Attack (V6)", () => {
  const r = run();
  const supportIdx = r.log.findIndex((e) => e.action === "qiongjiu_support" && e.round === 1);
  assert.ok(supportIdx >= 0, "round-1 Support Attack present");
  const next = r.log[supportIdx + 1];
  assert.equal(next?.action, "overburn", "the immediate Overburn tick directly follows the Support Attack");
  assert.equal(next?.statusTick?.statusId, "overburn");
  assert.equal(next?.finalDamage, 123, "ceil(0.1 × 1224 panel ATK) — 10% of the applier's ATK on application");
});

test("re-applying Overburn on a LATER Support Attack does NOT re-fire on-application damage", () => {
  const r = run();
  const support2Idx = r.log.findIndex((e) => e.action === "qiongjiu_support" && e.round === 2);
  assert.ok(support2Idx >= 0, "round-2 Support Attack present");
  const after = r.log[support2Idx + 1];
  assert.notEqual(after?.action, "overburn", "refresh application → no immediate tick (only the action-end ticks)");
});

test("training dummy emits an explicit pass event (results.passes) for its turn — the why-behind-the-tick line", () => {
  const r = run();
  const pass = r.passes.find((p) => p.round === 2);
  assert.ok(pass, "round-2 pass event present in the separate passes channel");
  assert.equal(pass.unit, "training_dummy");
  assert.equal(pass.actorName, "Training Dummy");
  assert.equal(pass.action, "pass");
});

test("with the Support Attack the rounds still end with the holder's action-end Overburn ticks", () => {
  const r = run();
  // Round 2's only overburn damage is its action-end tick (123), logged at round 2.
  const round2Overburns = r.log.filter((e) => e.action === "overburn" && e.round === 2);
  assert.equal(round2Overburns.length, 1);
  assert.equal(round2Overburns[0].finalDamage, 123);
});