import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { abilities, customRegistry, makeAlly } from "./helpers.js";
import { ATTACHMENT_SETS } from "../data/attachment-sets.js";
import type { AmmoType, CharacterDef, Element, Scenario, SkillDefVariant } from "../model/types.js";

/**
 * ATTACHMENT SET CONSUMPTION (2026) — first implemented batch.
 *
 * The ACTIVE Attachment Set is a loadout-level selection (`ScenarioTeamMember.activeAttachmentSet`)
 * whose `additive_dealt` bonuses enter the EXISTING additive DMG% dealt bucket (no separate bucket,
 * no formula change). Implemented sets: Close Assault · Physical Boost · Freeze/Burn/Hydro/Corrosion
 * Boost · Tactical Calculus (Support Actions only — the only out-of-turn attacker the engine models).
 * Phase Strike + the other complex sets stay INERT (their gates are not engine-evaluable).
 *
 * All scenarios below are CONTROLLED fixtures (applyDispatchStats:false + pinned base) so they do NOT
 * depend on Qiongjiu's live panel and do NOT touch any existing math oracle.
 */

const dummy = { id: "d", name: "d", hp: 999999999, defense: 0, stability: 0, weaknesses: [] as Element[], phase: null, cover: "none" as const };
const set = (name: string) => ATTACHMENT_SETS.find((s) => s.name === name)!.id;

/** A controlled single-hit doll with a chosen attack element + ammo (base 1000 ATK, mult 1.0, no crit). */
function hitter(id: string, element: Element | null, ammo: AmmoType | undefined): CharacterDef {
  const base = makeAlly(id, 1000);
  const skill: SkillDefVariant = { id: `${id}_basic`, name: "Hit", type: "basic", element, multiplier: 1.0, stabDamage: 0, cooldown: 0, confectanceCost: 0 };
  if (ammo !== undefined) skill.ammoType = ammo;
  const noop: SkillDefVariant = { ...skill, id: `${id}_noop`, multiplier: 0 };
  return { ...base, id, name: id, skills: abilities({ basic: skill, active1: noop, active2: noop, ultimate: noop }) };
}

/** Run a controlled single attacker (own turn, 1 turn) with an optional active set. */
function hit(char: CharacterDef, activeSetId?: string) {
  const scenario: Scenario = {
    version: 1,
    seed: 7,
    turns: 1,
    team: [{ characterId: char.id, applyDispatchStats: false, baseStatOverrides: { atk: 1000, hp: 1000, def: 300, critRate: 0, critDmg: 0 }, rotation: ["basic"], equippedFixedKeys: [], ...(activeSetId !== undefined ? { activeAttachmentSet: activeSetId } : {}) }],
    dummy,
  };
  return simulateScenario(scenario, customRegistry({ [char.id]: char })).log.find((e) => e.action === `${char.id}_basic`)!;
}

// 1. Active set selection ------------------------------------------------------------------

test("active set selection: a selected set activates; no set = no bonus; a different set does not activate another", () => {
  const phys = hitter("phys", null, undefined);
  const none = hit(phys);
  const withPhys = hit(phys, set("Physical Boost"));
  const withFreeze = hit(phys, set("Freeze Boost")); // wrong set for a physical hit

  assert.equal(withPhys.bonusBracket, none.bonusBracket + 0.2, "Physical Boost adds +20% to the DMG% bracket");
  assert.equal(withFreeze.bonusBracket, none.bonusBracket, "a non-matching set adds nothing");
  assert.equal(hit(phys, "attachment_set_does_not_exist").bonusBracket, none.bonusBracket, "unknown set id = no bonus");
});

// 2. Close Assault -------------------------------------------------------------------------

test("Close Assault: non-melee +12%, melee +36%, both in the existing additive DMG% bucket", () => {
  const ranged = hitter("ranged", null, "medium_ammo");
  const melee = hitter("melee", null, "melee");
  const noneR = hit(ranged);
  const noneM = hit(melee);

  assert.equal(hit(ranged, set("Close Assault")).bonusBracket, noneR.bonusBracket + 0.12, "non-melee: +12% only");
  assert.equal(hit(melee, set("Close Assault")).bonusBracket, noneM.bonusBracket + 0.36, "melee: +12% + 24% = +36% (same bucket)");
});

// 3. Physical Boost ------------------------------------------------------------------------

test("Physical Boost: phase-less hit +20%; elemental hit gets no Physical bonus", () => {
  const physical = hitter("physical", null, undefined);
  const burn = hitter("burner", "burn", undefined);
  assert.equal(hit(physical, set("Physical Boost")).bonusBracket, hit(physical).bonusBracket + 0.2, "phase-less +20%");
  assert.equal(hit(burn, set("Physical Boost")).bonusBracket, hit(burn).bonusBracket, "elemental hit: no Physical bonus");
});

// 4-7. Element boosts ----------------------------------------------------------------------

for (const [name, element] of [["Freeze Boost", "freeze"], ["Burn Boost", "burn"], ["Hydro Boost", "hydro"], ["Corrosion Boost", "corrosion"]] as [string, Element][]) {
  test(`${name}: a ${element} hit +20%; a non-${element} hit gets no bonus`, () => {
    const on = hitter("on", element, undefined);
    const off = hitter("off", null, undefined);
    assert.equal(hit(on, set(name)).bonusBracket, hit(on).bonusBracket + 0.2, `${element} hit +20%`);
    assert.equal(hit(off, set(name)).bonusBracket, hit(off).bonusBracket, `non-${element} hit: no bonus`);
  });
}

// 8. Tactical Calculus (Support Actions only) ----------------------------------------------

test("Tactical Calculus: a Support Action gets +25%; a normal own-turn attack does not", () => {
  // Controlled support fixture: an ally's basic triggers Qiongjiu's Support Action (the only
  // out-of-turn attacker the engine models). The permanent bundle is OFF and the base pinned.
  const ally = makeAlly("tc_ally", 1000);
  const qj = { ...makeAlly("tc_qj", 1000), id: "tc_qj", name: "tc_qj" };
  const base: Scenario = {
    version: 1,
    seed: 7,
    turns: 1,
    team: [
      { characterId: "tc_ally", applyDispatchStats: false, rotation: ["basic"], equippedFixedKeys: [] },
      { characterId: "tc_qj", applyDispatchStats: false, baseStatOverrides: { atk: 1000, hp: 1000, def: 300, critRate: 0, critDmg: 0 }, rotation: ["basic"], equippedFixedKeys: [] },
    ],
    dummy,
  };
  // Qiongjiu needs a support skill to fire; give the controlled doll one (90% ATK, like Guide).
  const qjDef: CharacterDef = {
    ...qj,
    skills: {
      ...qj.skills,
      support: { id: "tc_qj_support", name: "Support", type: "support", levels: { 1: { id: "tc_qj_support", name: "Support", type: "support", element: null, multiplier: 0.9, stabDamage: 0, cooldown: 0, confectanceCost: 0 } } },
    },
    passive: { ...qj.passive, effects: [{ kind: "support_attack", skillId: "tc_qj_support", perRoundMax: 3, chainable: false, trigger: "onAllySingleTargetHit" }] },
  };

  const run = (activeSetId?: string) =>
    simulateScenario(
      { ...base, team: base.team.map((m) => (m.characterId === "tc_qj" && activeSetId !== undefined ? { ...m, activeAttachmentSet: activeSetId } : m)) },
      customRegistry({ tc_ally: ally, tc_qj: qjDef }),
    );

  const noneSup = run().log.find((e) => e.supportAttack)!;
  const withSup = run(set("Tactical Calculus")).log.find((e) => e.supportAttack)!;
  const noneOwn = run().log.find((e) => e.action === "tc_qj_basic")!;
  const withOwn = run(set("Tactical Calculus")).log.find((e) => e.action === "tc_qj_basic")!;

  assert.equal(withSup.bonusBracket, noneSup.bonusBracket + 0.25, "Support Action +25%");
  assert.equal(withOwn.bonusBracket, noneOwn.bonusBracket, "own-turn attack: no bonus (MVP = Support Actions only)");
});

// Deferred sets stay inert (their gates are not engine-evaluable) ---------------------------

test("deferred sets (Phase Strike + the complex sets) stay INERT — no bonus on a normal hit", () => {
  const phys = hitter("phys2", null, undefined);
  const none = hit(phys);
  for (const name of ["Phase Strike", "Summon Boost", "Ultimate Pursuit", "Double Strategy", "Phase Resonance", "Emergency Repair", "Ally Support", "Shielded Recovery"]) {
    assert.equal(hit(phys, set(name)).bonusBracket, none.bonusBracket, `${name} must add nothing (gate not evaluable)`);
  }
});

// In-game validated number pinned through the engine (controlled fixture) --------------------

test("in-game validated (Burn Boost): ATK 2898 · DEF 5000 · Burn weak ×1.10 · No-Cover 1.20 · Burn Boost 1.20 → 2457", () => {
  // A controlled Burn attacker (Common Rail 150%, no crit) + a No-Cover +20% passive reproduces the
  // exact in-game observation: ceil(2898 × 1.5 × (2898/7898) × 1.40 × 1.10) = 2457.
  const base = makeAlly("bb_qj", 2898);
  const cr: SkillDefVariant = { id: "bb_qj_cr", name: "Common Rail", type: "active", element: "burn", multiplier: 1.5, stabDamage: 0, cooldown: 0, confectanceCost: 0 };
  const noop: SkillDefVariant = { ...cr, id: "bb_qj_noop", name: "-", multiplier: 0 };
  const char: CharacterDef = {
    ...base,
    id: "bb_qj",
    name: "bb_qj",
    base: { ...base.base, atk: 2898, critRate: 0, critDmg: 0 },
    skills: abilities({ basic: noop, active1: cr, active2: noop, ultimate: noop }),
    passive: { id: "bb_qj_passive", name: "-", effects: [{ kind: "conditional_damage_modifier", scope: "dealt", mode: "additive", value: 0.2, when: "target.noCover" }] },
  };
  const burnDummy = { ...dummy, weaknesses: ["burn"] as Element[], defense: 5000 };
  const run = (activeSetId?: string) =>
    simulateScenario(
      { version: 1, seed: 7, turns: 1, team: [{ characterId: "bb_qj", applyDispatchStats: false, baseStatOverrides: { atk: 2898, hp: 1000, def: 300, critRate: 0, critDmg: 0 }, rotation: ["active1"], equippedFixedKeys: [], ...(activeSetId !== undefined ? { activeAttachmentSet: activeSetId } : {}) }], dummy: burnDummy },
      customRegistry({ bb_qj: char }),
    ).log.find((e) => e.action === "bb_qj_cr")!;

  assert.equal(run().bonusBracket, 1.2, "No-Cover +20% only (control)");
  const withSet = run(set("Burn Boost"));
  assert.equal(withSet.bonusBracket, 1.4, "No-Cover +20% + Burn Boost +20% (same additive bucket)");
  assert.equal(withSet.finalDamage, 2457, "matches the in-game observation exactly");
});
