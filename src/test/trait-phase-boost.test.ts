import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState } from "../engine/state.js";
import { additiveDealtBonus, applyStatus, tickStatuses } from "../engine/statuses.js";
import { customRegistry, abilities } from "./helpers.js";
import type { CharacterDef, WeaponDef, Scenario, Element } from "../model/types.js";

/**
 * PHASE BOOST I (Golden Melody Trait outcome #11 — authoritative tooltip, VALIDATED 2026):
 * "Phase damage dealt +10%", lasts 1 turn.
 * - Lands in the EXISTING additive Damage Dealt % bucket, gated to PHASE attacks using the
 *   EXISTING damage taxonomy: a Phase attack has an element (`element !== null`); a
 *   phase-less attack has `element === null`. No new element/category is invented.
 * - Non-Phase damage receives nothing; no other formula component changes.
 *
 * In-sim timing (Trait rule): round 1 = unbuffed baseline; rounds 2+ buffed (re-granted each
 * action end at full HP). Oracle: atk 1000 · mult 0.8 · DEF 4000 → mitigated 160 (dummy
 * phase is null so phaseMult = 1: the burn element only selects WHICH gate applies).
 *   no modifier         : 160 · +10% Phase dealt: 176 · +20% No-Cover: 192 · both: 208.
 */

function doll(id: string, element: Element | null, noCover = 0): CharacterDef {
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
        element, // "burn" = a Phase attack; null = phase-less — the existing taxonomy
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
    team: [{ characterId: char.id, rotation: ["basic", "basic", "basic"], equippedFixedKeys: [], weaponId: "w_pb" }],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 4000, stability: 0, weaknesses: [], phase: null, cover: "none" },
  };
  return simulateScenario(sc, customRegistry({ [char.id]: char }, {}, { w_pb: weapon("w_pb", statusId) }));
}

const basics = (r: ReturnType<typeof simulateScenario>) => r.log.filter((e) => e.actionType === "basic").map((e) => e.finalDamage);

test("Phase damage receives +10% in the existing additive DMG% bucket", () => {
  const r = run(doll("pb_p", "burn"), "trait_phase_boost_i");
  assert.deepEqual(basics(r), [160, 176, 176], "round 1 unbuffed 160; rounds 2–3 buffed 160 × 1.10 = 176");
});

test("non-Phase damage with the buff is unchanged (Phase-only)", () => {
  const r = run(doll("pb_n", null), "trait_phase_boost_i");
  assert.deepEqual(basics(r), [160, 160, 160], "phase-less hits never receive the Phase bonus");
});

test("additivity: the +10% sums with another DMG% modifier (1 + 0.20 + 0.10 = 1.30, not 1.1 × 1.2)", () => {
  const r = run(doll("pb_nc", "burn", 0.2), "trait_phase_boost_i");
  assert.deepEqual(basics(r), [192, 208, 208], "unbuffed 160 × 1.20 = 192; buffed 160 × 1.30 = 208");
  assert.ok(!basics(r).includes(211), "the multiplicative result (≈211.2) never appears");
});

test("no buff leaves Damage Dealt unchanged", () => {
  const c = run(doll("pb_c", "burn"), undefined);
  assert.deepEqual(basics(c), [160, 160, 160]);
});

test("buff expires after 1 turn (unit level), and the phase gate uses the existing taxonomy", () => {
  const st = createState(
    {
      version: 1,
      seed: 7,
      turns: 3,
      team: [{ characterId: "pb_u", rotation: ["basic"], equippedFixedKeys: [], weaponId: "w_pb_u" }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 4000, stability: 0, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ pb_u: doll("pb_u", "burn") }, {}, { w_pb_u: weapon("w_pb_u", undefined) }),
    new Set(),
  );
  const u = st.units[0];
  const ctx = { supportAttack: false, targetExposed: false };
  assert.equal(additiveDealtBonus(u, st.statusRegistry, "burn", ctx), 0, "no bonus without the buff");
  applyStatus(st, u, { statusId: "trait_phase_boost_i", source: "test" });
  assert.equal(additiveDealtBonus(u, st.statusRegistry, "burn", ctx), 0.1, "+0.10 on Phase (elemental) hits");
  assert.equal(additiveDealtBonus(u, st.statusRegistry, null, ctx), 0, "no bonus on phase-less hits");
  tickStatuses(st, u, "ownActionEnd");
  assert.equal(additiveDealtBonus(u, st.statusRegistry, "burn", ctx), 0, "expired after one action end");
});

test("Targeted/Coverage Boost behavior remains unchanged (gates compose independently)", () => {
  // TAB (targeted-dealt) and Coverage (aoe-dealt) are phase-agnostic: their numbers unchanged.
  const tab = run(doll("pb_tab", "burn"), "trait_targeted_attack_boost_i");
  assert.deepEqual(basics(tab), [160, 176, 176], "TAB still boosts a Phase targeted hit");
  const cov = run(doll("pb_cov", null), "trait_coverage_boost_i");
  assert.deepEqual(basics(cov), [160, 160, 160], "Coverage still never boosts a phase-less targeted hit");
  // Direct composition: Phase +10% AND Targeted +10% both apply to one Phase targeted hit (0.2).
  const st = createState(
    {
      version: 1,
      seed: 7,
      turns: 3,
      team: [{ characterId: "pb_comp", rotation: ["basic"], equippedFixedKeys: [], weaponId: "w_pb_comp" }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 4000, stability: 0, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ pb_comp: doll("pb_comp", "burn") }, {}, { w_pb_comp: weapon("w_pb_comp", undefined) }),
    new Set(),
  );
  const u = st.units[0];
  applyStatus(st, u, { statusId: "trait_phase_boost_i", source: "test" });
  applyStatus(st, u, { statusId: "trait_targeted_attack_boost_i", source: "test" });
  assert.equal(additiveDealtBonus(u, st.statusRegistry, "burn", { supportAttack: false, targetExposed: false, isAoE: false }), 0.2, "Phase + Targeted gates compose additively");
  assert.equal(additiveDealtBonus(u, st.statusRegistry, "burn", { supportAttack: false, targetExposed: false, isAoE: true }), 0.1, "only Phase applies to an AoE hit");
});