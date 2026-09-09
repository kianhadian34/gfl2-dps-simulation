import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { abilities, makeAlly, customRegistry } from "./helpers.js";
import type { CharacterDef, Scenario, StatusApplySpec } from "../model/types.js";

/**
 * Generic Support-Action scope regression (2026):
 * `damage_modifier` and `conditional_damage_modifier` accept `actions?: "all" | "support"`.
 * - omitted/"all" → applies to normal attacks AND Support Actions
 * - "support" → applies ONLY to Support Actions (shared damage pipeline, `ev.supportAttack` context)
 * No character-specific logic; any doll can use the tag through data.
 */

/** Doll with a support_attack passive and a basic that applies `statusSpec` to SELF. */
function scopeChar(id: string, statusSpec: StatusApplySpec): CharacterDef {
  return {
    id,
    name: id,
    phase: "physical",
    base: { atk: 1000, hp: 1000, def: 100, stability: 6, critRate: 0, critDmg: 0.2 },
    weapon: { id: `${id}_w`, name: "w", rarity: "standard", atkLvl1: 0, atkLvl60: 0, level: 60, subStats: [] },
    skills: abilities({
      basic: { id: `${id}_basic`, name: "Hit", type: "basic", element: "physical", multiplier: 1.0, stabDamage: 0, cooldown: 0, confectanceCost: 0, appliesStatuses: [statusSpec] },
      active1: { id: `${id}_a1`, name: "-", type: "active", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      active2: { id: `${id}_a2`, name: "-", type: "active", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      ultimate: { id: `${id}_ult`, name: "-", type: "ultimate", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 3 },
      support: { id: `${id}_support`, name: "Support", type: "support", element: "physical", multiplier: 0.9, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
    }),
    passive: {
      id: `${id}_passive`,
      name: "-",
      effects: [{ kind: "support_attack", skillId: `${id}_support`, perRoundMax: 2, chainable: false, trigger: "onAllySingleTargetHit" }],
    },
    fixedKeys: [],
  };
}

function run(char: CharacterDef, turns = 2): ReturnType<typeof simulateScenario> {
  const sc: Scenario = {
    version: 1,
    seed: 7,
    turns,
    team: [
      { characterId: "ally", rotation: ["basic"], equippedFixedKeys: [] },
      { characterId: char.id, rotation: ["basic", "basic"], equippedFixedKeys: [] },
    ],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
  };
  return simulateScenario(sc, customRegistry({ ally: makeAlly("ally", 1000), [char.id]: char }));
}

test("A+C: an unscoped dealt modifier affects BOTH normal attacks and Support Actions (existing behavior unchanged)", () => {
  // damage_up_ii: +20% dealt, no `actions` tag → applies everywhere.
  const r = run(scopeChar("uc", { statusId: "damage_up_ii", durationRounds: 2, stacks: 1, target: "self" }), 2);
  // r1: support fires before the buff is applied → baseline 900 (0.9 × 1000).
  const sup1 = r.log.find((e) => e.supportAttack && e.round === 1)!;
  assert.equal(sup1.finalDamage, 900);
  // r2: buff alive (2 rounds, ticks at the owner's action end) → normal hit AND support both +20%.
  const main2 = r.log.find((e) => e.action === "uc_basic" && e.round === 2)!;
  const sup2 = r.log.find((e) => e.supportAttack && e.round === 2)!;
  assert.ok(Math.abs(main2.bonusBracket - 1.2) < 1e-9, `normal bracket ${main2.bonusBracket}`);
  assert.equal(main2.finalDamage, 1200);
  assert.ok(Math.abs(sup2.bonusBracket - 1.2) < 1e-9, `support bracket ${sup2.bonusBracket}`);
  assert.equal(sup2.finalDamage, 1080);
});

test("B: an `actions:'support'` dealt modifier affects ONLY Support Actions, never normal attacks", () => {
  // support_boost_i: +15% dealt with `actions: "support"` → the buffed doll's NORMAL hits must NOT increase.
  const r = run(scopeChar("sc", { statusId: "support_boost_i", durationRounds: 2, stacks: 1, target: "self" }), 2);
  const sup1 = r.log.find((e) => e.supportAttack && e.round === 1)!;
  assert.equal(sup1.finalDamage, 900); // baseline before the buff
  const main2 = r.log.find((e) => e.action === "sc_basic" && e.round === 2)!;
  const sup2 = r.log.find((e) => e.supportAttack && e.round === 2)!;
  assert.ok(Math.abs(main2.bonusBracket - 1.0) < 1e-9, `normal bracket must stay 1.0, got ${main2.bonusBracket}`);
  assert.equal(main2.finalDamage, 1000); // NOT affected by the support-scoped bonus
  assert.ok(Math.abs(sup2.bonusBracket - 1.15) < 1e-9, `support bracket ${sup2.bonusBracket}`);
  assert.equal(sup2.finalDamage, 1035); // 0.9 × 1000 × 1.15
});

test("D: Support Actions run through the shared damage pipeline with the support event context", () => {
  const r = run(scopeChar("ctx", { statusId: "damage_up_ii", durationRounds: 2, stacks: 1, target: "self" }), 2);
  const main = r.log.find((e) => e.action === "ctx_basic")!;
  const sup = r.log.find((e) => e.supportAttack)!;
  assert.equal(main.supportAttack, false);
  assert.equal(sup.supportAttack, true);
  // Both event kinds carry the same damage-pipeline fields — the scope came from the event context, not a branch.
  assert.equal(typeof sup.finalDamage, "number");
  assert.equal(typeof sup.attackerAtk, "number");
  assert.equal(typeof sup.targetDef, "number");
  assert.deepEqual(sup.weaknessExploited, []);
});

test("E: determinism — same scenario + same seed produces identical logs (no new RNG behavior)", () => {
  const c = scopeChar("det", { statusId: "support_boost_i", durationRounds: 2, stacks: 1, target: "self" });
  const a = run(c, 2);
  const b = run(c, 2);
  assert.equal(JSON.stringify(a.log), JSON.stringify(b.log));
  assert.deepEqual(a.totals, b.totals);
  assert.deepEqual(a.warnings, b.warnings);
});