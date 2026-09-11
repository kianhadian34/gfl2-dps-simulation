import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState, passiveSourceLabel, abilitySourceLabel } from "../engine/state.js";
import { REGISTRY } from "../data/registry.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { scenario, customRegistry, makeAlly, abilities } from "./helpers.js";
import type { CharacterDef, PassiveEffect, Scenario, StatusApplySpec } from "../model/types.js";

// Effect provenance (2026): every active effect carries a human-readable source
// (ability/passive/key + level + fortification tag). The source and its resulting
// effect are ONE modifier — never counted twice just because both names appear
// (e.g. V3's "+10% Support Action damage" ≡ "Out-of-Turn Damage +10%").

test("provenance: Support Boost I applied by Common Rail carries source 'Common Rail Lv.1'", () => {
  const r = simulateScenario(scenario({ turns: 1, rotation: ["active1"], keys: [] }));
  const ev = r.log.find((e) => e.action === "qiongjiu_common_rail")!;
  assert.ok(ev.statusesApplied.includes("support_boost_i"));
  assert.ok(ev.appliedSources?.some((s) => s.statusId === "support_boost_i" && s.source === "Common Rail Lv.1"), JSON.stringify(ev.appliedSources));
});

test("provenance: ability/passive labels resolve fortification indices (Steady Plan Lv.2 (V3), Lv.3 (V6))", () => {
  assert.equal(passiveSourceLabel(QIONGJIU, 2), "Steady Plan Lv.2 (V3)");
  assert.equal(passiveSourceLabel(QIONGJIU, 3), "Steady Plan Lv.3 (V6)");
  assert.equal(passiveSourceLabel(QIONGJIU, 1), "Steady Plan Lv.1"); // no fortification raised Lv1
  assert.equal(abilitySourceLabel(QIONGJIU, "active1", 2), "Common Rail Lv.2 (V1)");
  assert.equal(abilitySourceLabel(QIONGJIU, "active2", 2), "Guide to Victory Lv.2 (V2)");
});

test("provenance/dedup: each resolved Steady Plan level carries exactly ONE support-scoped +10% dealt entry (the Out-of-Turn line is it)", () => {
  // Cumulative levels: Lv2 and Lv3 EACH contain the +10% (it appears once per RESOLVED set,
  // never twice within one level; Lv1 has none). One source → one modifier.
  for (const level of [1, 2, 3] as const) {
    const list = QIONGJIU.passive.levels?.[level] ?? [];
    const supportScoped = list.filter(
      (e): e is Extract<PassiveEffect, { kind: "conditional_damage_modifier" }> =>
        e.kind === "conditional_damage_modifier" && e.actions === "support",
    );
    if (level === 1) {
      assert.equal(supportScoped.length, 0, "Lv1 has no support-scoped bonus");
    } else {
      assert.equal(supportScoped.length, 1, `Lv${level}: exactly one support-scoped +10% (V3's +10% = Out-of-Turn +10%), never two`);
      assert.equal(supportScoped[0].value, 0.1);
    }
  }
});

test("provenance: effectSources list the contributing passive sources (deduplicated) on a hit", () => {
  const state = createState(scenario({ turns: 1, rotation: ["active1"], config: { fortificationLevel: 6 } }), REGISTRY, new Set());
  assert.equal(state.units[0].passiveLevel, 3);
  // V6 Common Rail hit: the No-Cover modifiers come from Steady Plan Lv.3 (V6).
  const r = simulateScenario(scenario({ turns: 1, rotation: ["active1"], keys: [], config: { fortificationLevel: 6 } }));
  const ev = r.log.find((e) => e.action === "qiongjiu_common_rail")!;
  assert.ok(ev.effectSources?.includes("Steady Plan Lv.3 (V6)"), JSON.stringify(ev.effectSources));
});

test("provenance: support-scoped custom doll's support hit reports the passive source; normal hit unaffected", () => {
  const c: CharacterDef = {
    id: "pv",
    name: "pv",
    phase: "physical",
    base: { atk: 1000, hp: 1000, def: 100, stability: 6, critRate: 0, critDmg: 0.2 },
    weapon: { id: "pv_w", name: "w", rarity: "standard", atkLvl1: 0, atkLvl60: 0, level: 60, subStats: [] },
    skills: abilities({
      basic: { id: "pv_basic", name: "Hit", type: "basic", element: "physical", multiplier: 1.0, stabDamage: 0, cooldown: 0, confectanceCost: 0, appliesStatuses: [{ statusId: "support_boost_i", durationRounds: 2, target: "self" }] },
      active1: { id: "pv_a1", name: "-", type: "active", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      active2: { id: "pv_a2", name: "-", type: "active", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      ultimate: { id: "pv_ult", name: "-", type: "ultimate", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 3 },
      support: { id: "pv_sup", name: "Support", type: "support", element: "physical", multiplier: 0.9, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
    }),
    passive: {
      id: "pv_passive",
      name: "Provenance Passive",
      effects: [
        { kind: "conditional_damage_modifier", scope: "dealt", mode: "additive", value: 0.1, when: "always", actions: "support" },
        { kind: "support_attack", skillId: "pv_sup", perRoundMax: 2, chainable: false, trigger: "onAllySingleTargetHit" },
      ],
    },
    fixedKeys: [],
  };
  const sc: Scenario = {
    version: 1,
    seed: 7,
    turns: 2,
    team: [
      { characterId: "ally", rotation: ["basic"], equippedFixedKeys: [] },
      { characterId: "pv", rotation: ["basic", "basic"], equippedFixedKeys: [] },
    ],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
  };
  const r = simulateScenario(sc, customRegistry({ ally: makeAlly("ally", 1000), pv: c }));
  const sup = r.log.find((e) => e.supportAttack)!;
  assert.ok(sup.effectSources?.includes("Provenance Passive Lv.1"), JSON.stringify(sup.effectSources));
});

test("provenance: applying doll status source is used for the bonus's label (damage_up_ii via V5-style application not executed; status source still surfaced)", () => {
  // Uses a custom application with an explicit source on the StatusApplySpec (data-driven provenance).
  const spec: StatusApplySpec = { statusId: "damage_up_ii", durationRounds: 2, target: "self", source: "Pressing the Momentum Lv.3 (V5)" };
  const c: CharacterDef = {
    id: "pv2",
    name: "pv2",
    phase: "physical",
    base: { atk: 1000, hp: 1000, def: 100, stability: 6, critRate: 0, critDmg: 0.2 },
    weapon: { id: "pv2_w", name: "w", rarity: "standard", atkLvl1: 0, atkLvl60: 0, level: 60, subStats: [] },
    skills: abilities({
      basic: { id: "pv2_basic", name: "Hit", type: "basic", element: "physical", multiplier: 1.0, stabDamage: 0, cooldown: 0, confectanceCost: 0, appliesStatuses: [spec] },
      active1: { id: "pv2_a1", name: "-", type: "active", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      active2: { id: "pv2_a2", name: "-", type: "active", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      ultimate: { id: "pv2_ult", name: "-", type: "ultimate", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 3 },
    }),
    passive: { id: "pv2_passive", name: "-", effects: [] },
    fixedKeys: [],
  };
  const r = simulateScenario(
    { version: 1, seed: 3, turns: 2, team: [{ characterId: "pv2", rotation: ["basic", "basic"], equippedFixedKeys: [] }], dummy: { id: "d", name: "d", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" } },
    customRegistry({ pv2: c }),
  );
  const ev = r.log.find((e) => e.action === "pv2_basic" && e.round === 1)!;
  assert.ok(ev.appliedSources?.some((s) => s.statusId === "damage_up_ii" && s.source === "Pressing the Momentum Lv.3 (V5)"));
  const ev2 = r.log.find((e) => e.action === "pv2_basic" && e.round === 2)!;
  assert.ok(ev2.effectSources?.includes("Pressing the Momentum Lv.3 (V5)"), JSON.stringify(ev2.effectSources));
});