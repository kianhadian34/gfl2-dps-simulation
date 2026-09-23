import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState } from "../engine/state.js";
import { applyStatus, stabilityDamageBonus, tickStatuses } from "../engine/statuses.js";
import { customRegistry, abilities } from "./helpers.js";
import type { CharacterDef, WeaponDef, Scenario } from "../model/types.js";

/**
 * STABILITY OFFENSIVE I (Golden Melody Trait outcome #8 — authoritative tooltip, VALIDATED
 * 2026): "Stability damage dealt +1", lasts 1 turn.
 * - Flat +1 added to the attack's TOTAL Stability damage dealt (attacker-side), through the
 *   existing stability pipeline: Total = base + 2 × (# weaknesses exploited) + bonus.
 *   Tooltip example: an attack dealing 2 Stability deals 3 with the buff.
 * - Affects Stability damage ONLY — never HP damage / DMG% / DEF / weakness / crit.
 *
 * In-sim timing (Trait rule): the buff lands AFTER the round-1 action, so round 1 is the
 * unbuffed baseline and rounds 2+ hit with +1 (re-granted each action end at full HP).
 * HP oracle: atk 1000 · mult 0.8 · DEF 4000 → finalDamage 160 unchanged in every round.
 */

function doll(id: string, stab: number): CharacterDef {
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
        multiplier: 0.8,
        stabDamage: stab,
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

function weapon(id: string, withTrait: boolean): WeaponDef {
  const w: WeaponDef = { id, name: id, rarity: "elite", level: 1, atkLvl1: 0, atkLvl60: 0, subStats: [] };
  if (withTrait) w.trait = { statusIds: ["trait_stability_offensive_i"], durationRounds: 1 };
  return w;
}

function run(char: CharacterDef, withTrait: boolean, turns = 3): ReturnType<typeof simulateScenario> {
  const sc: Scenario = {
    version: 1,
    seed: 7,
    turns,
    team: [{ characterId: char.id, rotation: ["basic", "basic", "basic"], equippedFixedKeys: [], weaponId: "w_so" }],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 4000, stability: 10, weaknesses: [], phase: null, cover: "none" },
  };
  return simulateScenario(sc, customRegistry({ [char.id]: char }, {}, { w_so: weapon("w_so", withTrait) }));
}

const basics = (r: ReturnType<typeof simulateScenario>) => r.log.filter((e) => e.actionType === "basic").map((e) => ({ stab: e.stabilityDamage, hp: e.finalDamage }));

test("base Stability 2 → 3 with the buff (tooltip example), HP damage unchanged", () => {
  const r = run(doll("so2", 2), true);
  const hits = basics(r);
  assert.deepEqual(hits.map((h) => h.stab), [2, 3, 3], "round 1 unbuffed 2; rounds 2–3 buffed 3");
  assert.deepEqual(hits.map((h) => h.hp), [160, 160, 160], "HP damage untouched by the stability bonus");
});

test("other base Stability values receive the same +1", () => {
  const r = run(doll("so5", 5), true);
  assert.deepEqual(basics(r).map((h) => h.stab), [5, 6, 6], "5 → 6 with the buff");
  const r0 = run(doll("so0", 0), true);
  assert.deepEqual(basics(r0).map((h) => h.stab), [0, 1, 1], "0 → 1 with the buff");
});

test("no buff leaves Stability damage unchanged", () => {
  const r = run(doll("so2c", 2), false);
  assert.deepEqual(basics(r).map((h) => h.stab), [2, 2, 2], "stays 2 every round without the buff");
});

test("unit-level: the bonus is +1 while active and expires after 1 turn", () => {
  const st = createState(
    {
      version: 1,
      seed: 7,
      turns: 3,
      team: [{ characterId: "so_u", rotation: ["basic"], equippedFixedKeys: [], weaponId: "w_so_u" }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 4000, stability: 10, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ so_u: doll("so_u", 2) }, {}, { w_so_u: weapon("w_so_u", false) }),
    new Set(),
  );
  const u = st.units[0];
  assert.equal(stabilityDamageBonus(u, st.statusRegistry), 0, "no bonus without the buff");
  applyStatus(st, u, { statusId: "trait_stability_offensive_i", source: "test" });
  assert.equal(stabilityDamageBonus(u, st.statusRegistry), 1, "+1 while active");
  tickStatuses(st, u, "ownActionEnd");
  assert.equal(stabilityDamageBonus(u, st.statusRegistry), 0, "expired after one action end");
});

test("stability target state accrues correctly through the existing pipeline (no break regression)", () => {
  // Dummy starts at 10 Stability; rounds deal 2, 3, 3 → 10 → 8 → 5 → 2; never breaks (0).
  const r = run(doll("so2", 2), true);
  const after = r.log.filter((e) => e.actionType === "basic").map((e) => e.targetStabilityAfter);
  assert.deepEqual(after, [8, 5, 2], "stability accrues via applyStabilityDamage; no break triggered");
});