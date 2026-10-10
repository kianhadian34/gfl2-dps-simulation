import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState } from "../engine/state.js";
import { skillDenied } from "../engine/simulation.js";
import { customRegistry, makeAlly, scenario } from "./helpers.js";
import { STATUS_DEFS } from "../data/statuses.js";
import type { ActionSlot, CharacterDef, Scenario, StatusDef } from "../model/types.js";

/**
 * SKILL DENIAL — "Command Prohibition" (`StatusEffect: { kind: "deny_skills" }`) — added 2026.
 *
 * Vector's Overheat: "Command Prohibition, disallows the use of active skills."
 *
 * TWO separate things are pinned here, and both matter:
 *
 * 1. THE DENIAL IS REAL ON A DOLL. `slotAvailable` consults the gate, so a denied doll genuinely
 *    loses its active skills and Ultimate and falls back to the Basic attack. Asserted through the
 *    real simulate path, not just the predicate.
 *
 * 2. THE IMMUNITY IS A LAW OF THE MECHANIC (project owner, 2026-10-10). Denial NEVER applies to a
 *    non-doll unit OR to an `isBoss` unit — enforced inside the gate, NOT by a per-status data flag,
 *    so no future status can bypass it by omitting a field. The simulator only fights
 *    bosses/dummies, so this is the behaviour that matters for every shipped scenario.
 *
 * The fixtures are synthetic and registry-injected; the production status table must stay free of
 * them. Vector's Overheat itself is NOT defined by this slice.
 */

const DENY = "sd_deny"; // the synthetic denial status

/** The denial status: a debuff carrying the `deny_skills` effect. */
const denyStatus: StatusDef = {
  id: DENY,
  name: "Command Prohibition (test)",
  category: "debuff",
  stackable: false,
  maxStacks: 1,
  durationRounds: 3,
  tickAt: "ownActionEnd",
  purgeable: true,
  effects: [{ kind: "deny_skills" }],
  verified: false,
};

/** A doll with a Basic, an active, and an Ultimate — so denial has something to take away. */
function skillDoll(id: string): CharacterDef {
  const base = makeAlly(id, 1000);
  return { ...base, base: { ...base.base, critDmg: 0 } };
}

/** A registry serving the synthetic status alongside production data. */
function registry(chars: Record<string, CharacterDef>) {
  const reg = customRegistry(chars);
  const map = new Map(reg.getStatusMap());
  map.set(DENY, denyStatus);
  return { ...reg, getStatus: (id: string) => map.get(id), getStatusMap: () => map };
}

/** A scenario whose TEAM is exactly the given characters, with optional per-character rotations. */
function teamScenario(
  team: CharacterDef[],
  opts: { dummy?: Partial<Scenario["dummy"]>; turns?: number; rotations?: Record<string, ActionSlot[]> } = {},
): Scenario {
  return {
    version: 1,
    seed: 5,
    turns: opts.turns ?? 1,
    team: team.map((c) => ({
      characterId: c.id,
      applyDispatchStats: false,
      rotation: opts.rotations?.[c.id] ?? ["active1", "ultimate", "basic"],
      equippedFixedKeys: [],
    })),
    dummy: { id: "training_dummy", name: "D", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none", ...(opts.dummy ?? {}) },
    configOverrides: { critMultiplier: 1 },
  };
}

/** The action ids a unit actually performed, in order. */
const actionsOf = (r: ReturnType<typeof simulateScenario>, unit: string) =>
  r.log.filter((e) => e.unit === unit && !e.supportAttack).map((e) => e.action);

/** A doll whose Basic inflicts the denial on the WHOLE TEAM (incl. itself) — via `all_allies`. */
function denierDoll(id: string): CharacterDef {
  const base = makeAlly(id, 0);
  const basic = base.skills.basic.levels[1];
  return {
    ...base,
    base: { ...base.base, critDmg: 0 },
    skills: {
      ...base.skills,
      basic: {
        ...base.skills.basic,
        levels: { 1: { ...basic, multiplier: 0, appliesStatuses: [{ statusId: DENY, durationRounds: 3, target: "all_allies" as const }] } },
      },
    },
  };
}

// ============================================================ 1. THE DENIAL IS REAL (doll)

test("a denied doll loses its active AND ultimate and falls back to the Basic attack", () => {
  // The denier (team slot 1) acts FIRST and applies the denial to the whole team, so the victim's
  // active1/ultimate are gone before it ever picks an action. Its rotation collapses onto Basic.
  const denier = denierDoll("sd_denier");
  const victim = skillDoll("sd_victim");
  const r = simulateScenario(
    // The denier goes Basic-first so its denial actually lands before the victim picks an action.
    teamScenario([denier, victim], { turns: 2, rotations: { sd_denier: ["basic"] } }),
    registry({ sd_denier: denier, sd_victim: victim }),
  );
  const acts = actionsOf(r, "sd_victim");
  assert.ok(acts.length >= 2, `the victim acted more than once, got ${JSON.stringify(acts)}`);
  for (const a of acts) {
    assert.equal(a, "sd_victim_basic", `denied: only Basic should remain, got ${a}`);
  }
});

test("control: WITHOUT the denial status the same doll DOES use its active skill", () => {
  const d = skillDoll("sd_free");
  const r = simulateScenario(teamScenario([d], { turns: 1 }), registry({ sd_free: d }));
  const acts = actionsOf(r, "sd_free");
  assert.ok(acts.includes("sd_free_a1"), `undenied doll uses its active, got ${JSON.stringify(acts)}`);
});

test("the Basic attack is NEVER denied (denial cannot soft-lock a unit)", () => {
  const denier = denierDoll("sd_denier2");
  const victim = skillDoll("sd_soft");
  const r = simulateScenario(
    teamScenario([denier, victim], { turns: 3, rotations: { sd_denier2: ["basic"] } }),
    registry({ sd_denier2: denier, sd_soft: victim }),
  );
  const acts = actionsOf(r, "sd_soft");
  assert.ok(acts.length >= 3, `the doll kept acting — it was never soft-locked, got ${acts.length}`);
  assert.ok(acts.every((a) => a === "sd_soft_basic"), "every action was a Basic");
});

// ============================================================ 2. THE IMMUNITY IS A LAW

/** Build a state holding a unit with the denial status, for direct gate assertions. */
function gateState(unitId: string, kind: "doll" | "dummy", isBoss: boolean) {
  const d = skillDoll(unitId);
  // NOTE: must use `registry()` — `customRegistry` resolves statuses against PRODUCTION data, so
  // the synthetic DENY status would come back undefined and the gate would skip it.
  const state = createState(scenario({ turns: 1 }), registry({ [unitId]: d }), new Set());
  const unit = kind === "doll" ? state.units[0] : state.dummy;
  unit.statuses = [{ statusId: DENY, stacks: 1, durationLeft: 3 }];
  (unit as { isBoss: boolean }).isBoss = isBoss;
  return { state, unit, slot: "active1" as const };
}

test("LAW: a DOLL carrying the denial IS denied (the positive case)", () => {
  const { state, unit, slot } = gateState("sd_law_doll", "doll", false);
  assert.equal(skillDenied(state, unit, slot), true);
});

test("LAW: a BOSS is immune, even when it carries the denial status", () => {
  const { state, unit, slot } = gateState("sd_law_boss", "doll", true);
  unit.statuses = [{ statusId: DENY, stacks: 1, durationLeft: 3 }];
  assert.equal(skillDenied(state, unit, slot), false, "isBoss ⇒ immune");
});

test("LAW: a NON-DOLL unit (the dummy) is immune, even carrying the denial", () => {
  const { state, unit, slot } = gateState("sd_law_dummy", "dummy", false);
  assert.equal(skillDenied(state, unit, slot), false, "kind !== doll ⇒ immune");
});

test("LAW: the Basic slot is never denied, for any unit kind", () => {
  const doll = gateState("sd_law_b2", "doll", false);
  assert.equal(skillDenied(doll.state, doll.unit, "basic"), false, "doll basic allowed");
  const dummy = gateState("sd_law_d2", "dummy", false);
  assert.equal(skillDenied(dummy.state, dummy.unit, "basic"), false, "dummy basic allowed");
});

test("the gate is read-only: it does not consume or alter the status", () => {
  const { state, unit, slot } = gateState("sd_ro", "doll", false);
  skillDenied(state, unit, slot);
  skillDenied(state, unit, slot);
  assert.equal(unit.statuses.length, 1, "the status is still there");
  assert.equal(unit.statuses[0].durationLeft, 3, "duration untouched");
});

test("an unrelated status never denies", () => {
  const { state, unit, slot } = gateState("sd_unrel", "doll", false);
  unit.statuses = [{ statusId: "vulnerable_i", stacks: 1, durationLeft: 3 }];
  assert.equal(skillDenied(state, unit, slot), false);
});

// ============================================================ 3. inert on real enemies

test("END-TO-END: denial is INERT on the MVP dummy (the simulator's only target)", () => {
  // Put the denial on the dummy itself and run a full fight. Nothing about the run may change:
  // the dummy never picks an action, and the law makes it immune regardless.
  const d = skillDoll("sd_e2e");
  const plain = simulateScenario(teamScenario([d], { turns: 3 }), registry({ sd_e2e: d }));

  const dummyWithStatus: StatusDef = { ...denyStatus, durationRounds: null };
  const reg = registry({ sd_e2e: d });
  const map = new Map(reg.getStatusMap());
  map.set(DENY, dummyWithStatus);
  const preDenied = { ...reg, getStatus: (id: string) => map.get(id), getStatusMap: () => map };

  const baseline = simulateScenario(teamScenario([d], { turns: 3 }), reg);
  const withDummy = simulateScenario(teamScenario([d], { turns: 3 }), preDenied);
  // The dummy carrying a denial status cannot affect the fight: it has no skills to deny and
  // takes no actions. Damage and the action sequence are identical.
  assert.equal(withDummy.totals.damage, baseline.totals.damage, "the dummy's denial changed no damage");
  assert.equal(withDummy.totals.actions, baseline.totals.actions, "and no action count");
  assert.equal(baseline.totals.damage, plain.totals.damage, "and the baseline is stable");
});

// ============================================================ 4. production data

test("the synthetic fixture stays out of the production status table", () => {
  assert.ok(!STATUS_DEFS.some((s) => s.id.startsWith("sd_")), "no sd_* fixture in STATUS_DEFS");
});

test("production data: NO shipped status carries `deny_skills` yet (Overheat is not defined)", () => {
  // The vocabulary exists; Vector's Overheat is NOT wired. A shipped status claiming it would be
  // an unearned definition.
  const offenders = STATUS_DEFS.filter((s) => s.effects.some((e) => e.kind === "deny_skills")).map((s) => s.id);
  assert.deepEqual(offenders, [], "no production status may declare deny_skills yet");
});
