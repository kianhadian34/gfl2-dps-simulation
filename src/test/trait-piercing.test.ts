import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState } from "../engine/state.js";
import { applyStatus, defIgnore, tickStatuses } from "../engine/statuses.js";
import { customRegistry, abilities } from "./helpers.js";
import type { CharacterDef, WeaponDef, Scenario } from "../model/types.js";

/**
 * PIERCING I (Golden Melody Trait outcome #5 — authoritative tooltip, VALIDATED 2026):
 * "Targeted damage ignores 20% of the target's DEF", lasts 1 turn.
 * - Same generic `def_ignore` infrastructure as Domain Penetration I, configured for
 *   TARGETED damage (`aoe: false`): DEF × (1 − 0.20) in the existing defense term of the
 *   normal chain, attacker-side.
 * - Applies ONLY to targeted (non-AoE) hits; AoE hits with Piercing I are unchanged.
 * - Domain Penetration I (AoE-only) behavior is untouched — both share one generic effect.
 *
 * Oracle math (atk 1000, mult 0.8, dummy DEF 4000, non-crit):
 *   no buff   : raw 800 → 800 × 1000/(1000+4000)            = 160   → ceil 160
 *   with buff : DEF 4000 × 0.8 = 3200 → 800 × 1000/(1000+3200) ≈ 190.476 → ceil 191
 */

const DEF = 4000;
const NO_BUFF = 160;
const WITH_BUFF = 191;

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
    passive: { id: `${id}_passive`, name: "-", effects: [] },
    fixedKeys: [],
  };
}

/** Fixture weapon: 0 ATK, optional TEST-ONLY Trait pool (uniform one-of-one — no invented outcome). */
function weapon(id: string, traitStatusId?: string): WeaponDef {
  const w: WeaponDef = { id, name: id, rarity: "elite", level: 1, atkLvl1: 0, atkLvl60: 0, subStats: [] };
  if (traitStatusId) w.trait = { statusIds: [traitStatusId], durationRounds: 1 };
  return w;
}

function run(char: CharacterDef, poolId: string | undefined, turns = 3): ReturnType<typeof simulateScenario> {
  const sc: Scenario = {
    version: 1,
    seed: 7,
    turns,
    team: [{ characterId: char.id, rotation: ["basic", "basic", "basic"], equippedFixedKeys: [], weaponId: `w_${poolId ?? "none"}` }],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: DEF, stability: 0, weaknesses: [], phase: null, cover: "none" },
  };
  return simulateScenario(sc, customRegistry({ [char.id]: char }, {}, { [`w_${poolId ?? "none"}`]: weapon(`w_${poolId ?? "none"}`, poolId) }));
}

const basics = (r: ReturnType<typeof simulateScenario>) => r.log.filter((e) => e.actionType === "basic");

test("targeted damage with Piercing I ignores 20% of target DEF", () => {
  // Round 1: buff granted AFTER the action (Trait timing) → unbuffed baseline; r2/r3 hit
  // with Piercing active (def 3200, 20% DEF ignore) — re-granted each action end at full HP.
  const r = run(doll("p_targeted", false), "trait_piercing_i");
  const hits = basics(r);
  assert.deepEqual(hits.map((e) => e.finalDamage), [NO_BUFF, WITH_BUFF, WITH_BUFF], "160 → 191 → 191");
  assert.equal(hits[1].targetDef, DEF * 0.8, "targeted hit uses the ignored DEF 3200");
  assert.equal(hits[1].defIgnore, 0.2, "defIgnore recorded on the targeted hit");
  assert.equal(hits[0].defIgnore, undefined, "no defIgnore before the buff exists");
});

test("targeted damage WITHOUT the buff is unchanged", () => {
  const ctrl = run(doll("p_ctrl", false), undefined);
  assert.deepEqual(basics(ctrl).map((e) => e.finalDamage), [NO_BUFF, NO_BUFF, NO_BUFF], "all unbuffed 160");
  for (const e of basics(ctrl)) {
    assert.equal(e.defIgnore, undefined);
    assert.equal(e.targetDef, DEF);
  }
});

test("AoE damage with Piercing I does NOT receive the DEF ignore (targeted-only)", () => {
  const r = run(doll("p_aoe", true), "trait_piercing_i");
  const hits = basics(r);
  assert.deepEqual(hits.map((e) => e.finalDamage), [NO_BUFF, NO_BUFF, NO_BUFF], "AoE hits never ignore DEF from Piercing I");
  for (const e of hits) {
    assert.equal(e.defIgnore, undefined, "no defIgnore on AoE hits even when Piercing is active");
    assert.equal(e.targetDef, DEF, "full DEF used on AoE hits");
  }
});

test("the buff expires after 1 turn (action end ticks)", () => {
  const st = createState(
    {
      version: 1,
      seed: 7,
      turns: 3,
      team: [{ characterId: "p_exp", rotation: ["basic"], equippedFixedKeys: [], weaponId: "w_p_exp" }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: DEF, stability: 0, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ p_exp: doll("p_exp", false) }, {}, { w_p_exp: weapon("w_p_exp", "trait_piercing_i") }),
    new Set(),
  );
  const u = st.units[0];
  applyStatus(st, u, { statusId: "trait_piercing_i", source: "test" });
  assert.equal(defIgnore(u, st.statusRegistry, false), 0.2, "active: +20% DEF ignore on targeted");
  assert.equal(defIgnore(u, st.statusRegistry, true), 0, "never applies to AoE at effect level");
  tickStatuses(st, u, "ownActionEnd");
  assert.equal(defIgnore(u, st.statusRegistry, false), 0, "expired after one action end");
});

test("Domain Penetration I behavior remains unchanged (AoE still ignores; targeted does not)", () => {
  const aoeDomain = run(doll("p_dom_aoe", true), "trait_domain_penetration_i");
  assert.deepEqual(
    basics(aoeDomain).map((e) => e.finalDamage),
    [NO_BUFF, WITH_BUFF, WITH_BUFF],
    "Domain Penetration I still grants AoE DEF ignore (160 → 191 → 191)",
  );
  const targetedDomain = run(doll("p_dom_tgt", false), "trait_domain_penetration_i");
  assert.deepEqual(
    basics(targetedDomain).map((e) => e.finalDamage),
    [NO_BUFF, NO_BUFF, NO_BUFF],
    "Domain Penetration I still never applies to targeted hits",
  );
  // Direct effect-level separation: AoE-only and targeted-only never cross-contaminate.
  const st = createState(
    {
      version: 1,
      seed: 7,
      turns: 3,
      team: [{ characterId: "p_both", rotation: ["basic"], equippedFixedKeys: [], weaponId: "w_p_both" }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: DEF, stability: 0, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ p_both: doll("p_both", true) }, {}, { w_p_both: weapon("w_p_both", undefined) }),
    new Set(),
  );
  const u = st.units[0];
  applyStatus(st, u, { statusId: "trait_domain_penetration_i", source: "test" });
  applyStatus(st, u, { statusId: "trait_piercing_i", source: "test" });
  assert.equal(defIgnore(u, st.statusRegistry, true), 0.2, "AoE sees only Domain Penetration I");
  assert.equal(defIgnore(u, st.statusRegistry, false), 0.2, "targeted sees only Piercing I");
});