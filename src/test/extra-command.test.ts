import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { customRegistry } from "./helpers.js";
import type { CharacterDef, Scenario, SkillDefVariant } from "../model/types.js";

/**
 * EXTRA COMMAND (2026) — a generic action-economy grant, implemented as a STATUS.
 *
 * Source: Vector's Searing Finale Lv.1 — "Vector gains Extra Command". Semantics confirmed with the
 * project owner (2026-10-09):
 *   - the holder may perform ONE ADDITIONAL main action after its current action, in the SAME
 *     unit-turn (Ultimate, then Skill 1/2 or Basic);
 *   - the holder CANNOT MOVE during the extra action (moves are applied once per unit-turn, at the
 *     pre-action point);
 *   - one extra action per stack (the engine consumes one instance per extra action);
 *   - the unit's end-of-action tick (durations, cooldowns, Trait) runs ONCE, after ALL its actions.
 *
 * Fixture: a controlled doll (panel = base = 1000 ATK, DEF-0 target, critRate 0) so each action's
 * damage is directly readable, and the log itself shows WHICH slots were used and in what order.
 */

const ATK = 1000;

/** A basic attack (100% ATK) + two actives whose multipliers identify them in the log. */
function abilities(): CharacterDef["skills"] {
  const mk = (id: string, type: SkillDefVariant["type"], mult: number): SkillDefVariant => ({
    id,
    name: id,
    type,
    element: null,
    multiplier: mult,
    stabDamage: 0,
    cooldown: 0,
    confectanceCost: 0,
  });
  const wrap = (s: SkillDefVariant) => ({ id: s.id, name: s.name, type: s.type, levels: { 1: s } });
  return {
    basic: wrap(mk("ec_basic", "basic", 1.0)),
    active1: wrap(mk("ec_a1", "active", 2.0)),
    active2: wrap(mk("ec_a2", "active", 3.0)),
    ultimate: wrap(mk("ec_ult", "ultimate", 4.0)),
  };
}

/**
 * The fixture doll. `grant` = the status the ULTIMATE applies to itself (`extra_command` when
 * testing the mechanic, absent for the control).
 */
function fixture(grant: { statusId: string; stacks: number } | undefined): CharacterDef {
  const ult: SkillDefVariant = {
    id: "ec_ult",
    name: "ec_ult",
    type: "ultimate",
    element: null,
    multiplier: 4.0,
    stabDamage: 0,
    cooldown: 0,
    confectanceCost: 0,
    ...(grant ? { appliesStatuses: [{ ...grant, target: "self" as const }] } : {}),
  };
  const skills = abilities();
  skills.ultimate = { id: ult.id, name: ult.name, type: ult.type, levels: { 1: ult } };
  return {
    id: "ec_test",
    name: "Extra Command Test",
    class: "support",
    phase: null,
    base: { atk: ATK, hp: 1000, def: 0, stability: 0, critRate: 0, critDmg: 0 },
    skills,
    passive: { id: "ec_passive", name: "-", effects: [] },
    fixedKeys: [],
  };
}

function run(def: CharacterDef, rotation: Scenario["team"][number]["rotation"], turns = 1) {
  const scenario: Scenario = {
    version: 1,
    seed: 1,
    turns,
    team: [{ characterId: "ec_test", rotation, applyDispatchStats: false, equippedFixedKeys: [] }],
    dummy: { id: "training_dummy", name: "Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    configOverrides: { confectanceStart: 6 },
  };
  return simulateScenario(scenario, customRegistry({ ec_test: def }));
}

/** CONTROL: without the grant, one action per round — the ult only, then the rotation loops. */
test("control: without Extra Command a unit acts exactly once per turn", () => {
  const r = run(fixture(undefined), ["ultimate"], 2);
  assert.deepEqual(r.log.map((e) => e.action), ["ec_ult", "ec_ult"]);
  assert.deepEqual(r.log.map((e) => e.finalDamage), [4000, 4000]);
});

/**
 * The mechanic: the Ultimate grants Extra Command, so the holder acts AGAIN in the same unit-turn —
 * and the extra action is the NEXT usable rotation slot (rotation ["ultimate","active1"] ⇒ the ult,
 * then Skill 1). `turn` increases between them (they are two distinct actions in the same round).
 */
test("Extra Command: the Ultimate grants a second action in the same turn", () => {
  const r = run(fixture({ statusId: "extra_command", stacks: 1 }), ["ultimate", "active1"], 1);
  assert.equal(r.log.length, 2, "two actions in ONE unit-turn");
  assert.deepEqual(r.log.map((e) => e.action), ["ec_ult", "ec_a1"]);
  assert.deepEqual(r.log.map((e) => e.finalDamage), [4000, 2000], "ult 400%, then Skill 1 200%");
  assert.equal(r.log[0].round, r.log[1].round, "both in the same round");
  assert.ok(r.log[1].turn > r.log[0].turn, "two distinct actions");
  // The grant is consumed by the action that USED it — recorded on that action's own event
  // (same channel as the other consumption path), so the log explains the second action.
  assert.deepEqual(r.log[0].statusesExpired ?? [], ["extra_command"]);
  assert.deepEqual(r.log[1].statusesExpired ?? [], [], "nothing left to consume");
});

/** The extra action can be ANY usable slot — here a Basic attack. */
test("Extra Command: the extra action may be a Basic attack", () => {
  const r = run(fixture({ statusId: "extra_command", stacks: 1 }), ["ultimate", "basic"], 1);
  assert.deepEqual(r.log.map((e) => e.action), ["ec_ult", "ec_basic"]);
  assert.deepEqual(r.log.map((e) => e.finalDamage), [4000, 1000]);
});

/** Stacks = activations: 2 stacks ⇒ the ult plus TWO extra actions (3 actions in one unit-turn). */
test("Extra Command: one extra action per stack (2 stacks ⇒ 3 actions)", () => {
  const r = run(fixture({ statusId: "extra_command", stacks: 2 }), ["ultimate", "active1", "active2"], 1);
  assert.equal(r.log.length, 3, "ult + 2 extra actions");
  assert.deepEqual(r.log.map((e) => e.action), ["ec_ult", "ec_a1", "ec_a2"]);
  assert.deepEqual(r.log.map((e) => e.finalDamage), [4000, 2000, 3000]);
});

/** Consumed after use: the next round is back to a single action (nothing carries over). */
test("Extra Command is consumed: the next round has a single action again", () => {
  const r = run(fixture({ statusId: "extra_command", stacks: 1 }), ["ultimate", "active1"], 2);
  assert.deepEqual(r.log.map((e) => e.action), ["ec_ult", "ec_a1", "ec_ult", "ec_a1"]);
  assert.equal(r.log.filter((e) => e.round === 1).length, 2, "round 1: ult + 1 extra");
  assert.equal(r.log.filter((e) => e.round === 2).length, 2, "round 2: the ult grants it again");
});

/**
 * The end-of-action tick runs ONCE per unit-turn — after ALL actions — so a 1-turn buff granted by
 * the Ultimate is still active for the extra action. (A second tick between the two actions would
 * expire it first and the extra action would read the unbuffed ATK.)
 */
test("the end-of-action tick runs once, after all actions (a 1-turn ult buff survives the extra action)", () => {
  const ult: SkillDefVariant = {
    id: "ec_ult",
    name: "ec_ult",
    type: "ultimate",
    element: null,
    multiplier: 4.0,
    stabDamage: 0,
    cooldown: 0,
    confectanceCost: 0,
    appliesStatuses: [
      { statusId: "extra_command", stacks: 1, target: "self" },
      // A 1-turn self ATK buff (same shape as the validated self-applied-buff timing rule).
      { statusId: "ec_atk_buff", stacks: 1, durationRounds: 1, target: "self" },
    ],
  };
  const def = fixture(undefined);
  def.skills.ultimate = { id: ult.id, name: ult.name, type: ult.type, levels: { 1: ult } };
  const scenario: Scenario = {
    version: 1,
    seed: 1,
    turns: 1,
    team: [{ characterId: "ec_test", rotation: ["ultimate", "basic"], applyDispatchStats: false, equippedFixedKeys: [] }],
    dummy: { id: "training_dummy", name: "Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    configOverrides: { confectanceStart: 6, statusOverrides: {} },
  };
  // Register the buff on the engine's status table via a fixture registry: reuse the existing
  // Attack Up I trait status (a plain +10% ATK stat_modifier, 1 turn) rather than inventing one.
  ult.appliesStatuses![1].statusId = "trait_attack_up_i";
  const r = simulateScenario(scenario, customRegistry({ ec_test: def }));
  assert.deepEqual(r.log.map((e) => e.action), ["ec_ult", "ec_basic"]);
  // The extra Basic attack still sees the ult's +10% ATK ⇒ the tick did NOT fire in between.
  assert.equal(r.log[1].attackerAtk, 1100, "the 1-turn buff is still active for the extra action");
  assert.equal(r.log[1].finalDamage, 1100);
});
