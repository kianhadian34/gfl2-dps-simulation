import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState } from "../engine/state.js";
import { additiveDealtBonus, applyStatus, tickStatuses } from "../engine/statuses.js";
import { customRegistry, abilities } from "./helpers.js";
import type { CharacterDef, WeaponDef, Scenario } from "../model/types.js";

/**
 * TARGETED ATTACK BOOST I (Golden Melody Trait outcome #9 — authoritative tooltip, VALIDATED
 * 2026): "Targeted damage dealt +10%", lasts 1 turn, cannot be cleansed.
 * - Lands in the EXISTING additive Damage Dealt % bucket (NOT multiplicative), gated to
 *   TARGETED hits only (`whenCategory: "targeted"`); AoE hits receive nothing.
 * - No other damage formula component changes.
 *
 * In-sim timing (Trait rule): the buff lands AFTER the round-1 action (round 1 = unbuffed
 * baseline; rounds 2+ buffed, re-granted each action end at full HP).
 * Oracle: atk 1000 · mult 0.8 · DEF 4000 → mitigated 160.
 *   no modifier            : 160
 *   +10% targeted dealt    : 160 × 1.10 = 176 (ceil 176)
 *   +20% No-Cover only     : 160 × 1.20 = 192
 *   +20% No-Cover + 10% T.A.: 160 × 1.30 = 208 — ADDITIVE (multiplicative would be ≈211.2)
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

function weapon(id: string, withTrait: boolean): WeaponDef {
  const w: WeaponDef = { id, name: id, rarity: "elite", level: 1, atkLvl1: 0, atkLvl60: 0, subStats: [] };
  if (withTrait) w.trait = { statusIds: ["trait_targeted_attack_boost_i"], durationRounds: 1 };
  return w;
}

function run(char: CharacterDef, withTrait: boolean, turns = 3): ReturnType<typeof simulateScenario> {
  const sc: Scenario = {
    version: 1,
    seed: 7,
    turns,
    team: [{ characterId: char.id, rotation: ["basic", "basic", "basic"], equippedFixedKeys: [], weaponId: "w_tab" }],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 4000, stability: 0, weaknesses: [], phase: null, cover: "none" },
  };
  return simulateScenario(sc, customRegistry({ [char.id]: char }, {}, { w_tab: weapon("w_tab", withTrait) }));
}

const basics = (r: ReturnType<typeof simulateScenario>) => r.log.filter((e) => e.actionType === "basic").map((e) => e.finalDamage);

test("targeted damage receives +10% in the existing DMG% bucket", () => {
  const r = run(doll("tab_t", false), true);
  assert.deepEqual(basics(r), [160, 176, 176], "round 1 unbuffed 160; rounds 2–3 buffed 160 × 1.10 = 176");
});

test("AoE damage with the buff is unchanged (targeted-only)", () => {
  const r = run(doll("tab_a", true), true);
  assert.deepEqual(basics(r), [160, 160, 160], "AoE hits never receive the targeted bonus");
});

test("additivity: the +10% sums with another DMG% modifier (1 + 0.20 + 0.10 = 1.30, not 1.1 × 1.2)", () => {
  const r = run(doll("tab_nc", false, 0.2), true);
  assert.deepEqual(basics(r), [192, 208, 208], "unbuffed 160 × 1.20 = 192; buffed 160 × 1.30 = 208");
  assert.ok(!basics(r).includes(211), "the multiplicative result (≈211.2) never appears");
});

test("no buff leaves Damage Dealt unchanged", () => {
  const c = run(doll("tab_c", false), false);
  assert.deepEqual(basics(c), [160, 160, 160]);
});

test("buff expires after 1 turn (unit level), and the category gate is exact", () => {
  const st = createState(
    {
      version: 1,
      seed: 7,
      turns: 3,
      team: [{ characterId: "tab_u", rotation: ["basic"], equippedFixedKeys: [], weaponId: "w_tab_u" }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 4000, stability: 0, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ tab_u: doll("tab_u", false) }, {}, { w_tab_u: weapon("w_tab_u", false) }),
    new Set(),
  );
  const u = st.units[0];
  const ctx = (isAoE: boolean) => ({ supportAttack: false, targetExposed: false, isAoE });
  assert.equal(additiveDealtBonus(u, st.statusRegistry, null, ctx(false)), 0, "no bonus without the buff");
  applyStatus(st, u, { statusId: "trait_targeted_attack_boost_i", source: "test" });
  assert.equal(additiveDealtBonus(u, st.statusRegistry, null, ctx(false)), 0.1, "+0.10 on targeted hits");
  assert.equal(additiveDealtBonus(u, st.statusRegistry, null, ctx(true)), 0, "no bonus on AoE hits");
  tickStatuses(st, u, "ownActionEnd");
  assert.equal(additiveDealtBonus(u, st.statusRegistry, null, ctx(false)), 0, "expired after one action end");
});

test("existing Damage Dealt behavior is unchanged (ungated modifiers still apply everywhere)", () => {
  // The No-Cover passive is UNGATED: it must still apply on BOTH categories with the
  // category-gated trait active — proving the gate never leaks into non-gated modifiers.
  const targeted = run(doll("tab_u1", false, 0.2), true);
  assert.deepEqual(basics(targeted), [192, 208, 208], "No-Cover +20% applies to targeted (additive with the buff)");
  const aoe = run(doll("tab_u2", true, 0.2), true);
  assert.deepEqual(basics(aoe), [192, 192, 192], "No-Cover +20% applies to AoE too (gate is per-effect)");
});