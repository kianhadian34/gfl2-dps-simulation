import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { customRegistry, makeAlly } from "./helpers.js";
import { STATUS_DEFS } from "../data/statuses.js";
import type { AbilityDef, CharacterDef, PassiveEffect, Scenario, SkillDefVariant, StatusDef } from "../model/types.js";

/**
 * ENEMY-STATUS SUPPORT TRIGGER (`support_attack.trigger: "onEnemyStatusApplied"`) — added 2026.
 *
 * Vector's FK6: "When an enemy unit within range is inflicted with Overburn, launches Emergency
 * Support, dealing Burn damage equal to 60% of attack and 1 point of stability damage. Triggers
 * once per turn."
 *
 * The vocabulary is GENERIC (any status id, any holder). NEITHER Vector nor her FK6 is implemented
 * here — fixtures are synthetic and injected through the registry, so this pins the TRIGGER
 * independently of her kit data. The production status table must stay free of these fixtures.
 *
 * The decisions this encodes (project owner, 2026-10-10):
 *  - it fires at the EXISTING post-action point, reusing the support flow wholesale;
 *  - it fires REGARDLESS of who inflicted the status, INCLUDING the holder itself (the
 *    "another unit acted" rule belongs to `onAllySingleTargetHit` only);
 *  - FK6's "once per turn" is expressed as the holder's per-ROUND quota (`perRoundMax`).
 */

const MARKER = "es_marker"; // the status whose infliction fires the support
const MINION = "es_minion"; // an unrelated status — the trigger CONTROL
const ATK = 1000;

const plainStatus = (id: string): StatusDef => ({
  id,
  name: id,
  category: "debuff",
  stackable: false,
  maxStacks: 1,
  durationRounds: 5,
  tickAt: "ownActionEnd",
  purgeable: true,
  effects: [],
  verified: false,
});

/** One doll builder, so every fixture has an explicit, fully-typed shape. */
function doll(
  id: string,
  opts: {
    support?: SkillDefVariant;
    basicStatus?: string;
    supportStatus?: string;
    trigger?: PassiveEffect;
    basicMultiplier?: number;
  } = {},
): CharacterDef {
  const base = makeAlly(id, ATK);
  const wrap = (s: SkillDefVariant): AbilityDef => ({ id: s.id, name: s.name, type: s.type, levels: { 1: s } });
  const basic = base.skills.basic.levels[1];
  const support: SkillDefVariant =
    opts.support ?? {
      id: `${id}_support`,
      name: "Emergency Support",
      type: "support",
      element: "burn",
      multiplier: 0.6,
      stabDamage: 1,
      cooldown: 0,
      confectanceCost: 0,
    };
  return {
    ...base,
    phase: "burn",
    base: { ...base.base, critDmg: 0 },
    skills: {
      ...base.skills,
      basic: wrap({
        ...basic,
        multiplier: opts.basicMultiplier ?? basic.multiplier,
        ...(opts.basicStatus ? { appliesStatuses: [{ statusId: opts.basicStatus, durationRounds: 5, target: "target" as const }] } : {}),
      }),
      support: wrap({
        ...support,
        ...(opts.supportStatus ? { appliesStatuses: [{ statusId: opts.supportStatus, durationRounds: 5, target: "target" as const }] } : {}),
      }),
    },
    passive: { id: `${id}_passive`, name: "P", effects: opts.trigger ? [opts.trigger] : [] },
  };
}

const enemyStatusTrigger = (statusId: string, perRoundMax: number): PassiveEffect => ({
  kind: "support_attack",
  skillId: "es_holder_support",
  perRoundMax,
  chainable: false,
  trigger: "onEnemyStatusApplied",
  statusId,
});

const allyHitTrigger = (perRoundMax: number): PassiveEffect => ({
  kind: "support_attack",
  skillId: "es_holder_support",
  perRoundMax,
  chainable: false,
  trigger: "onAllySingleTargetHit",
});

/** Registry carrying the synthetic characters AND statuses (never production data). */
function registry(chars: Record<string, CharacterDef>) {
  const reg = customRegistry(chars);
  const map = new Map(reg.getStatusMap());
  map.set(MARKER, plainStatus(MARKER));
  map.set(MINION, plainStatus(MINION));
  return { ...reg, getStatus: (id: string) => map.get(id), getStatusMap: () => map };
}

function scenario(team: CharacterDef[], turns = 1): Scenario {
  return {
    version: 1,
    seed: 3,
    turns,
    team: team.map((c) => ({ characterId: c.id, applyDispatchStats: false, rotation: ["basic"] as const, equippedFixedKeys: [] })),
    dummy: { id: "training_dummy", name: "D", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    configOverrides: { critMultiplier: 1 },
  };
}

/** The standard fixture: an inflictor acts, then the trigger holder. */
function run(opts: { quota: number; inflicts: string; damage?: boolean; turns?: number }) {
  const holder = doll("es_holder", { trigger: enemyStatusTrigger(MARKER, opts.quota) });
  const inflictor = doll("es_inflictor", { basicStatus: opts.inflicts, basicMultiplier: opts.damage === false ? 0 : 1 });
  const r = simulateScenario(scenario([inflictor, holder], opts.turns ?? 1), registry({ es_holder: holder, es_inflictor: inflictor }));
  return r.log.filter((e) => e.supportAttack);
}

// ------------------------------------------------------------------ the core case

test("enemy-status trigger: inflicting the declared status fires the Support Attack", () => {
  const supports = run({ quota: 1, inflicts: MARKER });
  assert.equal(supports.length, 1, "exactly one Emergency Support");
  assert.equal(supports[0].action, "es_holder_support");
  // 0.6 × ATK exactly — the fixture holder carries NO No-Cover passive (unlike Qiongjiu's Steady
  // Plan), and critMultiplier 1 removes crit variance.
  assert.equal(supports[0].finalDamage, Math.ceil(0.6 * ATK), "60% ATK Burn damage");
  assert.equal(supports[0].stabilityDamage, 1, "1 stability damage");
});

test("control: an UNRELATED status infliction does NOT fire it", () => {
  assert.equal(run({ quota: 1, inflicts: MINION }).length, 0, "no matching infliction ⇒ no support");
});

test("control: a REFRESH of an already-held status is not a new infliction", () => {
  // Two consecutive inflictor turns apply the SAME status. Only the FIRST is a new infliction, so
  // even with quota 3 there must be exactly ONE support across two rounds.
  assert.equal(run({ quota: 3, inflicts: MARKER, turns: 2 }).length, 1, "re-application refreshes; it does not re-fire");
});

// ------------------------------------------------------------------ damage independence

test("it does NOT require the inflicting action to deal damage (unlike the ally-hit trigger)", () => {
  // The inflictor's basic deals 0 damage but still inflicts the marker. The ally-hit rule's
  // `finalDamage > 0` fidelity must not be inherited by the enemy-status rule.
  assert.equal(run({ quota: 1, inflicts: MARKER, damage: false }).length, 1, "a 0-damage infliction still fires it");
});

// ------------------------------------------------------------------ self-infliction

test("it fires when the HOLDER ITSELF inflicted the status (no applier restriction)", () => {
  // A SOLO holder that inflicts the marker with its own basic. `onAllySingleTargetHit` excludes
  // the acting unit; this trigger must NOT.
  const solo = doll("es_solo", { trigger: enemyStatusTrigger(MARKER, 2), basicStatus: MARKER });
  const r = simulateScenario(scenario([solo]), registry({ es_solo: solo }));
  assert.equal(r.log.filter((e) => e.supportAttack).length, 1, "a solo holder still fires on its own infliction");
});

test("control: the ally-hit trigger STILL excludes the acting unit (that rule is not loosened)", () => {
  // Identical solo shape with the ESTABLISHED trigger: it must NOT fire, because no OTHER unit acted.
  const solo = doll("es_solo2", { trigger: allyHitTrigger(2) });
  const r = simulateScenario(scenario([solo]), registry({ es_solo2: solo }));
  assert.equal(r.log.filter((e) => e.supportAttack).length, 0, "the acting unit never supports its own hit");
});

// ------------------------------------------------------------------ quota

test("per-round quota bounds it", () => {
  assert.equal(run({ quota: 1, inflicts: MARKER }).length, 1, "quota 1 + one new infliction ⇒ 1");
  assert.equal(run({ quota: 0, inflicts: MARKER }).length, 0, "perRoundMax 0 ⇒ inert");
});

// ------------------------------------------------------------------ no chaining

test("a Support Attack's own status applications do not re-trigger it (no chaining)", () => {
  // The support hit itself inflicts the marker. If supports could chain this would recurse; the
  // support is resolved outside the action loop, so it must not.
  const holder = doll("es_holder3", { trigger: enemyStatusTrigger(MARKER, 3), supportStatus: MARKER });
  const inflictor = doll("es_inflictor3", { basicStatus: MARKER });
  const r = simulateScenario(
    scenario([inflictor, holder]),
    registry({ es_holder3: holder, es_inflictor3: inflictor }),
  );
  assert.equal(r.log.filter((e) => e.supportAttack).length, 1, "exactly one — the support does not chain");
});

// ------------------------------------------------------------------ production data

test("the synthetic fixtures stay out of the production status table", () => {
  assert.ok(!STATUS_DEFS.some((s) => s.id.startsWith("es_")), "no es_* fixture in STATUS_DEFS");
});

test("production data: no shipped character declares the new trigger yet", () => {
  // The vocabulary exists; Vector's FK6 is NOT wired. Nothing in the shipped data may claim it.
  const qj = customRegistry({}).getCharacter("qiongjiu")!;
  const supports = qj.passive.effects.filter((e) => e.kind === "support_attack");
  assert.ok(supports.length > 0, "Qiongjiu still declares support attacks");
  for (const eff of supports) {
    assert.equal(eff.trigger, "onAllySingleTargetHit", "Qiongjiu keeps the established trigger");
  }
});
