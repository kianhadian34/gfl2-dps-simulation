import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState } from "../engine/state.js";
import { applyStatus, statModifier } from "../engine/statuses.js";
import { resolveCritStats } from "../engine/simulation.js";
import { REGISTRY } from "../data/registry.js";
import { abilities, customRegistry, scenario } from "./helpers.js";
import type { CharacterDef, StatusApplySpec } from "../model/types.js";

// stat_modifier consumption (engine, 2026):
//   effective = (base + Σ flat) × (1 + Σ pct); ATK/HP/DEF rounded UP, CritRate continuous.
// Validated anchor: ATK Up II 1933 × 1.15 = 2222.95 → 2223.
// The helper supports exactly the declared stat fields: atk | def | hp | critRate.

function makeStatChar(id: string, atk: number, selfSpecs: StatusApplySpec[], targetSpecs: StatusApplySpec[]): CharacterDef {
  return {
    id,
    name: id,
    phase: null,
    base: { atk, hp: 1000, def: 100, stability: 6, critRate: 0, critDmg: 0.2 },
    skills: abilities({
      basic: { id: `${id}_basic`, name: "Hit", type: "basic", element: null, multiplier: 1.0, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
      active1: { id: `${id}_apply`, name: "Apply", type: "active", element: null, multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0, appliesStatuses: [...selfSpecs, ...targetSpecs] },
      active2: { id: `${id}_a2`, name: "-", type: "active", element: null, multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      ultimate: { id: `${id}_ult`, name: "-", type: "ultimate", element: null, multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 3 },
    }),
    passive: { id: `${id}_passive`, name: "-", effects: [] },
    fixedKeys: [],
  };
}

test("statModifier helper: ATK% is rounded up — 1933 × 1.15 = 2222.95 → 2223 (validated)", () => {
  const state = createState(scenario({ turns: 1 }), customRegistry({}), new Set());
  const doll = state.units[0];
  applyStatus(state, doll, { statusId: "stat_atk_up_ii_pct", durationRounds: 2 });
  assert.equal(statModifier(doll, state.statusRegistry, "atk", 1933), 2223);
});

test("statModifier helper: flat DEF adds; HP% rounds up; CritRate stays continuous", () => {
  const state = createState(scenario({ turns: 1 }), customRegistry({}), new Set());
  const doll = state.units[0];
  applyStatus(state, doll, { statusId: "stat_def_flat_test", durationRounds: 2 });
  applyStatus(state, doll, { statusId: "stat_hp_pct_test", durationRounds: 2 });
  applyStatus(state, doll, { statusId: "stat_crit_rate_flat_test", durationRounds: 2 });
  assert.equal(statModifier(doll, state.statusRegistry, "def", 5000), 5100);
  assert.equal(statModifier(doll, state.statusRegistry, "hp", 1000), 1100); // ceil(1000 × 1.10)
  assert.ok(Math.abs(statModifier(doll, state.statusRegistry, "critRate", 0.2) - 0.3) < 1e-9, "critRate stays continuous");
});

test("Golden Melody Trait outcome 'Critical Rate Boost I': +10% Crit Rate (encoded via the existing stat_modifier system)", () => {
  // Documented Trait outcome (research.md §3.9): "Critical Rate Boost I — Critical Rate +10%, 1 turn."
  // This test encodes ONLY that mechanic through the existing generic stat_modifier path at its
  // EXACT value (flat +0.10 CritRate — the engine's `stat_crit_rate_flat_test` matches 1:1). It
  // does NOT test Trait selection, the random pool, probabilities, uniformity, or duplicates
  // (all UNKNOWN — nothing invented). Trait itself is not implemented; the buff is applied
  // directly. NOTE: the documented "1 turn" duration is the generic U7 own-action-end rule
  // (already validated and covered by status-timing tests); the fixture status is permanent by
  // definition, so duration expiry is not re-encoded here.
  const state = createState(scenario({ turns: 1 }), customRegistry({}), new Set());
  const doll = state.units[0]; // QJ mirror: base critRate 0.2
  applyStatus(state, doll, { statusId: "stat_crit_rate_flat_test", durationRounds: 1 });
  const buffed = statModifier(doll, state.statusRegistry, "critRate", doll.critRate);
  assert.ok(Math.abs(buffed - (doll.critRate + 0.1)) < 1e-9, `+10% Crit Rate effective (got ${buffed})`);
  const crit = resolveCritStats(buffed, doll.critDmg, doll.passives);
  assert.ok(Math.abs(crit.critRate - 0.3) < 1e-9, "the +10% feeds the existing crit machinery (0.2 + 0.1 = 0.3)");
});

test("integration: self-applied permanent ATK% changes the attacker's effective ATK on the next action (2223)", () => {
  const c = makeStatChar("stat", 1933, [{ statusId: "stat_atk_up_ii_pct", durationRounds: 2, target: "self" }], []);
  const r = simulateScenario(
    {
      version: 1,
      seed: 3,
      turns: 2,
      team: [{ characterId: c.id, rotation: ["active1", "basic"], equippedFixedKeys: [] }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 0, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ [c.id]: c }),
  );
  const hit = r.log.find((e) => e.action === "stat_basic")!;
  assert.equal(hit.attackerAtk, 2223); // 1933 × 1.15 → ceil 2223 (validated)
  // Damage recomputed from the effective ATK through the confirmed formula.
  const expected = Math.ceil(hit.baseDamage! * (hit.attackerAtk! / (hit.attackerAtk! + hit.targetDef!)));
  assert.equal(hit.finalDamage, expected);
});

test("integration: target flat DEF modifier changes the defender's effective DEF and damage (5000 → 5100)", () => {
  const c = makeStatChar("statdef", 2000, [], [{ statusId: "stat_def_flat_test", durationRounds: 2, target: "target" }]);
  const r = simulateScenario(
    {
      version: 1,
      seed: 3,
      turns: 2,
      team: [{ characterId: c.id, rotation: ["active1", "basic"], equippedFixedKeys: [] }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 0, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ [c.id]: c }),
  );
  const hit = r.log.find((e) => e.action === "statdef_basic")!;
  assert.equal(hit.targetDef, 5100); // 5000 + 100 flat
  const expected = Math.ceil(hit.baseDamage! * (hit.attackerAtk! / (hit.attackerAtk! + hit.targetDef!)));
  assert.equal(hit.finalDamage, expected);
});

test("DEF Down II: percentage DEF reduction applies directly to effective DEF — 5000 × (1 − 0.30) = 3500 (validated)", () => {
  const state = createState(scenario({ turns: 1 }), customRegistry({}), new Set());
  const doll = state.units[0];
  applyStatus(state, doll, { statusId: "stat_def_down_ii_pct", durationRounds: 2 });
  assert.equal(statModifier(doll, state.statusRegistry, "def", 5000), 3500); // ceil(5000 × 0.70)
});

test("integration: DEF Down II on the target → effective target DEF 3500, damage recomputed (validated)", () => {
  const c = makeStatChar("statdd", 2000, [], [{ statusId: "stat_def_down_ii_pct", durationRounds: 2, target: "target" }]);
  const r = simulateScenario(
    {
      version: 1,
      seed: 3,
      turns: 2,
      team: [{ characterId: c.id, rotation: ["active1", "basic"], equippedFixedKeys: [] }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 0, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ [c.id]: c }),
  );
  const hit = r.log.find((e) => e.action === "statdd_basic")!;
  assert.equal(hit.targetDef, 3500); // 5000 × (1 − 0.30) — validated DEF Down II
  const expected = Math.ceil(hit.baseDamage! * (hit.attackerAtk! / (hit.attackerAtk! + hit.targetDef!)));
  assert.equal(hit.finalDamage, expected);
});


