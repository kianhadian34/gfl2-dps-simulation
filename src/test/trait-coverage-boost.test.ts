import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState } from "../engine/state.js";
import { additiveDealtBonus, applyStatus, tickStatuses } from "../engine/statuses.js";
import { customRegistry, abilities } from "./helpers.js";
import type { CharacterDef, WeaponDef, Scenario } from "../model/types.js";

/**
 * COVERAGE BOOST I (Golden Melody Trait outcome #10 — authoritative tooltip, VALIDATED 2026):
 * "AoE damage dealt +10%", lasts 1 turn, cannot be cleansed.
 * - The AoE mirror of Targeted Attack Boost I: SAME generic pipeline (`damage_modifier`
 *   dealt additive) with the category gate `whenCategory: "aoe"`. +10% lands in the
 *   existing additive DMG% bucket; targeted hits receive nothing.
 * - No other damage formula component changes.
 *
 * In-sim timing (Trait rule): round 1 = unbuffed baseline; rounds 2+ buffed (re-granted each
 * action end at full HP). Oracle: atk 1000 · mult 0.8 · DEF 4000 → mitigated 160.
 *   no modifier         : 160 · +10% AoE dealt: 176 · +20% No-Cover: 192 · both: 208.
 */

function doll(id: string, aoe: boolean, noCover = 0): CharacterDef {
  return {
    id,
    name: id,
    phase: null,
    base: { atk: 1000, hp: 1000, def: 100, stability: 6, critRate: 0, critDmg: 0.2 },
    skills: abilities({
      basic: {
        id: `${id}_basic`,
        name: "Hit",
        type: "basic",
        element: null,
        damageCategory: aoe ? "aoe" : undefined, // absent = targeted damage
        multiplier: 0.8,
        stabDamage: 0,
        cooldown: 0,
        confectanceCost: 0,
      },
      active1: { id: `${id}_a1`, name: "-", type: "active", element: null, multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      active2: { id: `${id}_a2`, name: "-", type: "active", element: null, multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      ultimate: { id: `${id}_ult`, name: "-", type: "ultimate", element: null, multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 3 },
    }),
    passive: {
      id: `${id}_passive`,
      name: "-",
      effects: noCover > 0 ? [{ kind: "conditional_damage_modifier", scope: "dealt", mode: "additive", value: noCover, when: "target.noCover" }] : [],
    },
    fixedKeys: [],
  };
}

function weapon(id: string, traitStatusId?: string): WeaponDef {
  const w: WeaponDef = { id, name: id, rarity: "elite", level: 1, atkLvl1: 0, atkLvl60: 0, subStats: [] };
  if (traitStatusId) w.trait = { statusIds: [traitStatusId], durationRounds: 1 };
  return w;
}

function run(char: CharacterDef, statusId: string | undefined, turns = 3): ReturnType<typeof simulateScenario> {
  const sc: Scenario = {
    version: 1,
    seed: 7,
    turns,
    team: [{ characterId: char.id, rotation: ["basic", "basic", "basic"], equippedFixedKeys: [], weaponId: "w_cb" }],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 4000, stability: 0, weaknesses: [], phase: null, cover: "none" },
  };
  return simulateScenario(sc, customRegistry({ [char.id]: char }, {}, { w_cb: weapon("w_cb", statusId) }));
}

const basics = (r: ReturnType<typeof simulateScenario>) => r.log.filter((e) => e.actionType === "basic").map((e) => e.finalDamage);

test("AoE damage receives +10% in the existing additive DMG% bucket", () => {
  const r = run(doll("cb_a", true), "trait_coverage_boost_i");
  assert.deepEqual(basics(r), [160, 176, 176], "round 1 unbuffed 160; rounds 2–3 buffed 160 × 1.10 = 176");
});

test("targeted damage with the buff is unchanged (AoE-only)", () => {
  const r = run(doll("cb_t", false), "trait_coverage_boost_i");
  assert.deepEqual(basics(r), [160, 160, 160], "targeted hits never receive the AoE bonus");
});

test("additivity: the +10% sums with another DMG% modifier (1 + 0.20 + 0.10 = 1.30, not 1.1 × 1.2)", () => {
  const r = run(doll("cb_nc", true, 0.2), "trait_coverage_boost_i");
  assert.deepEqual(basics(r), [192, 208, 208], "unbuffed 160 × 1.20 = 192; buffed 160 × 1.30 = 208");
  assert.ok(!basics(r).includes(211), "the multiplicative result (≈211.2) never appears");
});

test("no buff leaves Damage Dealt unchanged", () => {
  const c = run(doll("cb_c", true), undefined);
  assert.deepEqual(basics(c), [160, 160, 160]);
});

test("buff expires after 1 turn (unit level), and the category gate is exact", () => {
  const st = createState(
    {
      version: 1,
      seed: 7,
      turns: 3,
      team: [{ characterId: "cb_u", rotation: ["basic"], equippedFixedKeys: [], weaponId: "w_cb_u" }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 4000, stability: 0, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ cb_u: doll("cb_u", true) }, {}, { w_cb_u: weapon("w_cb_u", undefined) }),
    new Set(),
  );
  const u = st.units[0];
  const ctx = (isAoE: boolean) => ({ supportAttack: false, targetExposed: false, isAoE });
  assert.equal(additiveDealtBonus(u, st.statusRegistry, null, ctx(true)), 0, "no bonus without the buff");
  applyStatus(st, u, { statusId: "trait_coverage_boost_i", source: "test" });
  assert.equal(additiveDealtBonus(u, st.statusRegistry, null, ctx(true)), 0.1, "+0.10 on AoE hits");
  assert.equal(additiveDealtBonus(u, st.statusRegistry, null, ctx(false)), 0, "no bonus on targeted hits");
  tickStatuses(st, u, "ownActionEnd");
  assert.equal(additiveDealtBonus(u, st.statusRegistry, null, ctx(true)), 0, "expired after one action end");
});

test("Targeted Attack Boost I behavior remains unchanged (category gates are independent)", () => {
  // TAB (+10% targeted): targeted 176, AoE 160.
  const tabTgt = run(doll("cb_tab_t", false), "trait_targeted_attack_boost_i");
  assert.deepEqual(basics(tabTgt), [160, 176, 176], "TAB still boosts targeted");
  const tabAoe = run(doll("cb_tab_a", true), "trait_targeted_attack_boost_i");
  assert.deepEqual(basics(tabAoe), [160, 160, 160], "TAB still never boosts AoE");
  // Coverage (+10% AoE): AoE 176, targeted 160 — the observed mirror behavior.
  const covAoe = run(doll("cb_cov_a", true), "trait_coverage_boost_i");
  assert.deepEqual(basics(covAoe), [160, 176, 176], "Coverage boosts AoE");
  const covTgt = run(doll("cb_cov_t", false), "trait_coverage_boost_i");
  assert.deepEqual(basics(covTgt), [160, 160, 160], "Coverage never boosts targeted");
});