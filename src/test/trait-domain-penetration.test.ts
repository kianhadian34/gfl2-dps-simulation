import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState } from "../engine/state.js";
import { applyStatus, defIgnore, tickStatuses } from "../engine/statuses.js";
import { customRegistry, abilities } from "./helpers.js";
import type { CharacterDef, WeaponDef, Scenario } from "../model/types.js";

/**
 * DOMAIN PENETRATION I (Golden Melody Trait outcome #1 — authoritative tooltip, VALIDATED
 * 2026): "AoE damage ignores 20% of the target's DEF", lasts 1 turn.
 * - Modeled in the EXISTING defense term of the normal chain: DEF × (1 − 0.20), attacker-side.
 * - Applies ONLY to AoE hits (`SkillDefVariant.damageCategory === "aoe"`); targeted hits with
 *   the buff are unchanged. No other conditions or mechanics are invented.
 * - Fixed damage / stability / weakness / crit / reductions are untouched.
 *
 * Oracle math (atk 1000, mult 0.8, dummy DEF 4000, non-crit):
 *   no buff   : raw 800 → 800 × 1000/(1000+4000)            = 160   → ceil 160
 *   with buff : DEF 4000 × 0.8 = 3200 → 800 × 1000/(1000+3200) ≈ 190.476 → ceil 191
 */

const DEF = 4000;
const AOE_NO_BUFF = 160;
const AOE_WITH_BUFF = 191;

function doll(id: string, aoe: boolean): CharacterDef {
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
        damageCategory: aoe ? "aoe" : undefined,
        multiplier: 0.8,
        stabDamage: 0,
        cooldown: 0,
        confectanceCost: 0,
      },
      active1: { id: `${id}_a1`, name: "-", type: "active", element: null, multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      active2: { id: `${id}_a2`, name: "-", type: "active", element: null, multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      ultimate: { id: `${id}_ult`, name: "-", type: "ultimate", element: null, multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 3 },
    }),
    passive: { id: `${id}_passive`, name: "-", effects: [] },
    fixedKeys: [],
  };
}

/** Fixture weapon: 0 ATK, optional TEST-ONLY Trait pool (uniform one-of-one — no invented outcome). */
function weapon(id: string, withTrait: boolean): WeaponDef {
  const w: WeaponDef = {
    id,
    name: id,
    rarity: "elite",
    level: 1,
    atkLvl1: 0,
    atkLvl60: 0,
    subStats: [],
  };
  if (withTrait) w.trait = { statusIds: ["trait_domain_penetration_i"], durationRounds: 1 };
  return w;
}

function run(char: CharacterDef, weaponId: string, withTrait: boolean, turns = 3): ReturnType<typeof simulateScenario> {
  const sc: Scenario = {
    version: 1,
    seed: 7,
    turns,
    team: [{ characterId: char.id, rotation: ["basic", "basic", "basic"], equippedFixedKeys: [], weaponId }],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: DEF, stability: 0, weaknesses: [], phase: null, cover: "none" },
  };
  return simulateScenario(sc, customRegistry({ [char.id]: char }, {}, { [weaponId]: weapon(weaponId, withTrait) }));
}

const basics = (r: ReturnType<typeof simulateScenario>) => r.log.filter((e) => e.actionType === "basic");

test("AoE damage with Domain Penetration I ignores 20% of target DEF", () => {
  // Round 1: buff is granted AFTER the first action (Trait timing), so r1 is the unbuffed
  // baseline; r2/r3 hit with the buff active (def 3200, +20% DEF ignore) — every action end
  // at full HP re-grants the 1-turn buff.
  const r = run(doll("dp_aoe", true), "w_dp_trait", true);
  const hits = basics(r);
  assert.deepEqual(hits.map((e) => e.finalDamage), [AOE_NO_BUFF, AOE_WITH_BUFF, AOE_WITH_BUFF], "160 → 191 → 191");
  assert.equal(hits[1].targetDef, DEF * 0.8, "hit uses the ignored DEF 3200");
  assert.equal(hits[1].defIgnore, 0.2, "defIgnore recorded on the AoE hit");
  assert.equal(hits[0].defIgnore, undefined, "no defIgnore before the buff exists");
  assert.equal(AOE_WITH_BUFF, Math.ceil((800 * 1000) / (1000 + DEF * 0.8)), "191 = ceil(800 × 1000/(1000+3200))");
});

test("AoE damage WITHOUT the buff is unchanged", () => {
  const ctrl = run(doll("dp_aoe_ctrl", true), "w_dp_notrait", false);
  assert.deepEqual(basics(ctrl).map((e) => e.finalDamage), [AOE_NO_BUFF, AOE_NO_BUFF, AOE_NO_BUFF], "all unbuffed 160");
  for (const e of basics(ctrl)) {
    assert.equal(e.defIgnore, undefined, "no defIgnore without the buff");
    assert.equal(e.targetDef, DEF);
  }
});

test("targeted damage WITH the buff is unchanged (buff is AoE-only)", () => {
  const r = run(doll("dp_tgt", false), "w_dp_trait", true);
  const hits = basics(r);
  assert.deepEqual(hits.map((e) => e.finalDamage), [AOE_NO_BUFF, AOE_NO_BUFF, AOE_NO_BUFF], "targeted hits never ignore DEF");
  for (const e of hits) {
    assert.equal(e.defIgnore, undefined, "no defIgnore on targeted hits even when buffed");
    assert.equal(e.targetDef, DEF, "full DEF used on targeted hits");
  }
});

test("the buff expires after 1 turn (action end ticks)", () => {
  const st = createState(
    {
      version: 1,
      seed: 7,
      turns: 3,
      team: [{ characterId: "dp_aoe2", rotation: ["basic"], equippedFixedKeys: [], weaponId: "w_dp_trait2" }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: DEF, stability: 0, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ dp_aoe2: doll("dp_aoe2", true) }, {}, { w_dp_trait2: weapon("w_dp_trait2", true) }),
    new Set(),
  );
  const u = st.units[0];
  applyStatus(st, u, { statusId: "trait_domain_penetration_i", source: "test" });
  assert.equal(defIgnore(u, st.statusRegistry, true), 0.2, "active: +20% DEF ignore on AoE");
  assert.equal(defIgnore(u, st.statusRegistry, false), 0, "never applies to non-AoE at effect level");
  tickStatuses(st, u, "ownActionEnd");
  assert.equal(defIgnore(u, st.statusRegistry, true), 0, "expired after one action end");
});