import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { abilities, customRegistry } from "./helpers.js";
import type { CharacterDef, PassiveEffect, StatusApplySpec } from "../model/types.js";

// Fixed DMG modifiers on FIXED damage — validated in-game (2026, docs §3.10/U21).
// fixed = ceil(scaling × (1 + Σ applier Fixed DMG Buffs) × (1 − Σ holder Final DMG Reduction))
// Ordinary Damage Reduction/Increase are SEPARATE buckets and never enter this
// product (boss −80% ordinary DR and No-Cover +20% are bypassed; validated).
// Ordering: modifier chain applied to the UNROUNDED value, then ceil.
//   Final DMG Reduction 60% only:     1931 × 0.10 × 0.40 = 77.24 → 78
//   Fixed DMG Buff +10% + red 60%:    3471 × 0.10 × 1.10 × 0.40 = 152.724 → 153
//   Fixed DMG Buff +10% only:         1931 × 0.10 × 1.10 = 212.41 → 213
//   no modifiers:                     1949 × 0.10 = 194.9 → 195
// NOTE (2026): the earlier project label "Final DMG Increase" was reclassified
// to the authoritative source term "Fixed DMG Buff"/"Fixed DMG Buffs"; the
// validated +10% Fixed DMG Key behavior is unchanged.

function makeOverburnApplier(
  id: string,
  atk: number,
  opts: { increase?: boolean; ordinaryNoCover?: number } = {},
): CharacterDef {
  const specs: StatusApplySpec[] = [{ statusId: "overburn", durationRounds: 2, target: "target" }];
  const passive: PassiveEffect[] = [];
  if (opts.increase) {
    specs.unshift({ statusId: "fixed_dmg_buff", durationRounds: 1, target: "self" });
  }
  if (opts.ordinaryNoCover) {
    passive.push({ kind: "conditional_damage_modifier", scope: "dealt", mode: "additive", value: opts.ordinaryNoCover, when: "target.noCover" });
  }
  return {
    id,
    name: id,
    phase: "burn",
    base: { atk, hp: 1000, def: 100, stability: 6, critRate: 0.8, critDmg: 0.2 },
    weapon: { id: `${id}_w`, name: "w", rarity: "standard", atkLvl1: 0, atkLvl60: 0, level: 60, subStats: [] },
    skills: abilities({
      basic: { id: `${id}_basic`, name: "Hit", type: "basic", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
      active1: { id: `${id}_apply`, name: "Apply", type: "active", element: "burn", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0, appliesStatuses: specs },
      active2: { id: `${id}_a2`, name: "-", type: "active", element: "burn", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      ultimate: { id: `${id}_ult`, name: "-", type: "ultimate", element: "burn", multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 3 },
    }),
    passive: { id: `${id}_passive`, name: "-", effects: passive },
    fixedKeys: [],
  };
}

function runOverburn(
  atk: number,
  opts: { increase?: boolean; reduction?: boolean; ordinaryDR?: boolean; ordinaryNoCover?: boolean } = {},
) {
  const specs: StatusApplySpec[] = [];
  if (opts.reduction) specs.push({ statusId: "final_dmg_reduction", durationRounds: 2, target: "target" });
  const c = makeOverburnApplier("fd", atk, { increase: opts.increase, ordinaryNoCover: opts.ordinaryNoCover ? 0.2 : 0 });
  c.skills.active1.levels[1].appliesStatuses = [...specs, ...(c.skills.active1.levels[1].appliesStatuses ?? [])];
  const dummyPassives: PassiveEffect[] = opts.ordinaryDR
    ? [{ kind: "conditional_damage_modifier", scope: "taken", mode: "multiplicative", value: 0.2, when: "target.noCover" }]
    : [];
  return simulateScenario(
    {
      version: 1,
      seed: 3,
      turns: 1,
      team: [{ characterId: c.id, rotation: ["active1"], equippedFixedKeys: [] }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 0, weaknesses: [], phase: null, cover: "none", passives: dummyPassives.length ? [{ id: "ordinary_dr", name: "Ordinary DR", effects: dummyPassives }] : [] },
    },
    customRegistry({ [c.id]: c }),
  );
}

function overburnAmounts(r: ReturnType<typeof simulateScenario>): number[] {
  return r.log.filter((e) => e.statusTick).map((e) => e.statusTick!.amount);
}

test("fixed: no final modifiers → ceil(base) (1949 × 0.10 = 195)", () => {
  assert.deepEqual(overburnAmounts(runOverburn(1949)), [195, 195]); // apply + tick
});

test("fixed: Final DMG Reduction 60% → 1931 × 0.10 × 0.40 = 77.24 → 78", () => {
  assert.deepEqual(overburnAmounts(runOverburn(1931, { reduction: true })), [78, 78]);
});

test("fixed: Fixed DMG Buff +10% and Final DMG Reduction 60% → 152.724 → 153 (unrounded chain, no early round)", () => {
  assert.deepEqual(overburnAmounts(runOverburn(3471, { increase: true, reduction: true })), [153, 153]);
});

test("fixed: Fixed DMG Buff +10% only → 193.1 × 1.10 = 212.41 → 213", () => {
  assert.deepEqual(overburnAmounts(runOverburn(1931, { increase: true })), [213, 213]);
});

test("fixed: ordinary Damage Reduction 80% is IGNORED even when Final DMG Reduction applies (still 78)", () => {
  // Dummy has ordinary 80% DR passive AND Final DMG Reduction 60%: fixed = 193.1 × 0.40 = 78,
  // NOT 78 × 0.20 = 16 — ordinary reduction never enters the fixed product.
  assert.deepEqual(overburnAmounts(runOverburn(1931, { reduction: true, ordinaryDR: true })), [78, 78]);
});

test("fixed: ordinary No-Cover Damage Increase is IGNORED, and fixed damage never crits (CR 0.8)", () => {
  const r = runOverburn(1949, { ordinaryNoCover: true });
  assert.deepEqual(overburnAmounts(r), [195, 195]); // +20% No-Cover bracket excluded
  for (const e of r.log.filter((e) => e.statusTick)) {
    assert.equal(e.critical ?? false, false); // status-tick events carry no crit flag → never a crit
  }
});

test("skill-sourced absolute fixed damage also receives the Final DMG chain (100 × 0.40 = 40)", () => {
  const c = makeOverburnApplier("sk", 1000);
  c.skills.basic.levels[1] = { ...c.skills.basic.levels[1], multiplier: 0, fixedDamage: 100 };
  c.skills.active1.levels[1].appliesStatuses = [{ statusId: "final_dmg_reduction", durationRounds: 2, target: "target" }];
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
  const basic = r.log.find((e) => e.action === "sk_basic")!;
  assert.equal(basic.finalDamage, 40); // ceil(100 × 0.40)
  assert.equal(basic.fixedDamage, 40);
  assert.equal(basic.critical, false);
});