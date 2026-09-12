import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { abilities, customRegistry } from "./helpers.js";
import type { CharacterDef, ConfigOverrides, Scenario } from "../model/types.js";

/**
 * Steady Plan — AUTHORITATIVE cumulative levels (in-game screenshots, SOURCE):
 *   Lv1:   No-Cover +10%.
 *   Lv2/V3: No-Cover +10% · Support Action +10% · Overburn (2 turns) after Support Action.
 *   Lv3/V6: No-Cover +20% TOTAL (single component per the V6 display) · Support Action +10%
 *           retained · Overburn retained — cumulative, not mutual-exclusive.
 */

const ALLY: CharacterDef = {
  id: "sp_ally",
  name: "sp_ally",
  phase: "physical",
  base: { atk: 1000, hp: 1000, def: 100, stability: 6, critRate: 0, critDmg: 0.2 },
  weapon: { id: "sp_ally_w", name: "w", rarity: "standard", atkLvl1: 0, atkLvl60: 0, level: 60, subStats: [] },
  skills: abilities({
    basic: { id: "sp_ally_basic", name: "Hit", type: "basic", element: "physical", multiplier: 1.0, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
    active1: { id: "sp_ally_a1", name: "-", type: "active", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
    active2: { id: "sp_ally_a2", name: "-", type: "active", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
    ultimate: { id: "sp_ally_ult", name: "-", type: "ultimate", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
  }),
  passive: { id: "sp_ally_p", name: "-", effects: [] },
  fixedKeys: [],
};

function sc(fLevel: number): Scenario {
  const cfg: ConfigOverrides = { fortificationLevel: fLevel };
  return {
    version: 1,
    seed: 7,
    turns: 1,
    team: [
      { characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [] },
      { characterId: "sp_ally", rotation: ["basic"], equippedFixedKeys: [] },
    ],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 0, weaknesses: [], phase: null, cover: "none" },
    configOverrides: cfg,
  };
}

const reg = customRegistry({ sp_ally: ALLY });
const run = (fLevel: number) => simulateScenario(sc(fLevel), reg);

test("A — Steady Plan Lv1: No-Cover bonus is +10% (normal hit), no Support bonus, no Overburn", () => {
  const r = run(0);
  const norm = r.log.find((e) => e.action === "qiongjiu_basic")!;
  assert.ok(Math.abs(norm.bonusBracket - 1.1) < 1e-9, `Lv1 normal bracket ${norm.bonusBracket}`);
  const sup = r.log.find((e) => e.supportAttack)!;
  assert.ok(Math.abs(sup.bonusBracket - 1.1) < 1e-9, `Lv1 support bracket ${sup.bonusBracket}`); // no support +10%
  assert.equal((sup.appliedSources ?? []).filter((s) => s.statusId === "overburn").length, 0, "no Overburn at Lv1");
});

test("B — Steady Plan V3/Lv2: No-Cover +10%, Support Action +10%, Overburn applied after Support", () => {
  const r = run(3);
  const norm = r.log.find((e) => e.action === "qiongjiu_basic")!;
  assert.ok(Math.abs(norm.bonusBracket - 1.1) < 1e-9, `V3 normal bracket ${norm.bonusBracket}`);
  const sup = r.log.find((e) => e.supportAttack)!;
  assert.ok(Math.abs(sup.bonusBracket - 1.2) < 1e-9, `V3 support bracket ${sup.bonusBracket}`); // 1 + 0.10 + 0.10
  const ob = (sup.appliedSources ?? []).filter((s) => s.statusId === "overburn");
  assert.equal(ob.length, 1, `Overburn not applied by V3 support: ${JSON.stringify(sup.appliedSources)}`);
});

test("C — Steady Plan V6/Lv3: No-Cover +20% TOTAL, Support Action +10% and Overburn retained (cumulative, not exclusive)", () => {
  const r = run(6);
  const norm = r.log.find((e) => e.action === "qiongjiu_basic")!;
  assert.ok(Math.abs(norm.bonusBracket - 1.2) < 1e-9, `V6 normal bracket ${norm.bonusBracket}`); // +0.20 total, single
  const sup = r.log.find((e) => e.supportAttack)!;
  // 1 + 0.20 (No-Cover total) + 0.10 (support) = 1.30 — proves cumulative AND no +10% duplication (would be 1.40).
  assert.ok(Math.abs(sup.bonusBracket - 1.3) < 1e-9, `V6 support bracket ${sup.bonusBracket}`);
  const ob = (sup.appliedSources ?? []).filter((s) => s.statusId === "overburn");
  assert.equal(ob.length, 1, `Overburn not applied by V6 support: ${JSON.stringify(sup.appliedSources)}`);
  // Timing (VALIDATED in-game 2026): the Support Action event is the FIRST place Overburn appears —
  // applied at/after the support resolution, never before it (no earlier event carries it).
  const firstOb = r.log.findIndex((e) => (e.appliedSources ?? []).some((s) => s.statusId === "overburn"));
  const supIdx = r.log.findIndex((e) => e.supportAttack);
  assert.equal(firstOb, supIdx);
});