import type { Element } from "../model/types.js";
import type { ActionSlot, PassiveEffect, Scenario, SkillDef, SourceKind, StatusApplySpec } from "../model/types.js";
import type { LogEvent, SimulationResult } from "../model/runtime.js";
import type { Registry } from "../data/registry.js";
import { rollHit } from "./damage.js";
import { cooldownRemaining, setCooldown, tickCooldowns } from "./cooldowns.js";
import { gainConfectance, spendConfectance } from "./resources.js";
import {
  additiveDealtBonus,
  additiveTakenBonus,
  applyStatus,
  multiplicativeTakenMods,
  tickStatuses,
} from "./statuses.js";
import { applyStabilityDamage, endOfRoundStability } from "./stability.js";
import { createState, DEFAULT_CONFIG, supportAttackQuota, type SimulationState, type UnitState } from "./state.js";

/**
 * Phase countering — research §3.4 CONFIRMS ×1.2/×0.8 for counter/countered,
 * but the full phase-wheel relations are UNVERIFIED. The MVP ships no wheel
 * table, so interactions resolve neutral (1.0) and a warning is emitted.
 */
export function phaseMultiplier(_attack: Element, _targetPhase: Element | null): number {
  return 1.0;
}

/**
 * Fixed rotation as a cyclic priority list: scan forward from the current
 * pointer, use the FIRST usable slot, then advance the pointer PAST the used
 * slot (fallback to basic advances nothing). So ["ultimate", ...] retries the
 * ultimate whenever it comes back into scan range — matching user intent.
 */
export function pickAction(state: SimulationState, doll: UnitState): { slot: ActionSlot; k: number } {
  const list = doll.rotationList;
  const n = list.length;
  for (let k = 0; k < n; k++) {
    const slot = list[(doll.rotationIndex + k) % n];
    if (slotAvailable(state, doll, slot)) return { slot, k };
  }
  return { slot: "basic", k: n }; // fallback: basic, pointer unchanged
}

function slotAvailable(state: SimulationState, doll: UnitState, slot: ActionSlot): boolean {
  if (slot === "basic") return true;
  const skill = skillForSlot(doll, slot);
  if (!skill) return false;
  if (cooldownRemaining(doll, skill.id) > 0) return false;
  if (slot === "ultimate" && doll.confectance < skill.confectanceCost) return false;
  return true;
}

function skillForSlot(doll: UnitState, slot: ActionSlot): SkillDef | null {
  return doll.def?.skills[slot] ?? null;
}

function passiveEffects(doll: UnitState): PassiveEffect[] {
  return doll.def?.passive.effects ?? [];
}

function beginUnitRound(doll: UnitState): void {
  doll.actionBudget = 1; // one main action per round (research §3.15)
  doll.supportQuota = doll.def ? supportAttackQuota(doll.def) : 0;
}

/** Match the attack's element against the target's exposed weaknesses: +10% and +2 stability each (research §3.5). */
function exploitedWeaknesses(target: UnitState, element: Element): { weaknesses: string[]; mult: number } {
  const weaknesses = target.weaknessElements.filter((w) => w === element);
  const mult = weaknesses.reduce((m) => m * 1.1, 1);
  return { weaknesses, mult };
}

/** Passive "conditional_damage_modifier" bonuses (target.noCover) — Qiongjiu +10% (CONFIRMED). */
function conditionalNoCoverBonus(actor: UnitState, target: UnitState): number {
  let sum = 0;
  for (const e of passiveEffects(actor)) {
    if (e.kind === "conditional_damage_modifier" && e.when === "target.noCover" && target.cover === "none") {
      sum += e.value;
    }
  }
  return sum;
}

/** Damage + stability + Confectance-gain application for a single hit; fills the event's damage fields. */
function dealDamageHit(state: SimulationState, actor: UnitState, skill: SkillDef, ev: LogEvent): number {
  const dummy = state.dummy;
  const { weaknesses, mult: weaknessMult } = exploitedWeaknesses(dummy, skill.element);
  const phaseMult = phaseMultiplier(skill.element, dummy.phase);
  const addDealt = additiveDealtBonus(actor, state.statusRegistry) + conditionalNoCoverBonus(actor, dummy);
  const addTaken = additiveTakenBonus(dummy, state.statusRegistry);
  const { mult, red } = multiplicativeTakenMods(dummy, state.statusRegistry);
  const exposedMult = dummy.exposed ? state.config.exposedDamageMult : 1; // U3 config
  const reductionMult = mult * red * exposedMult; // no stability-cover reduction: dummy has no cover
  const hit = rollHit({
    atk: actor.panelAtk,
    def: dummy.defStat,
    multiplier: skill.multiplier ?? 0,
    fixedDamage: skill.fixedDamage,
    additiveBonus: 1 + addDealt + addTaken,
    phaseMult,
    weaknessMult,
    reductionMult,
    critRate: actor.critRate,
    critMultiplier: state.config.critMultiplier,
    glanceChance: state.config.glanceChance,
    rng: state.rng,
  });
  dummy.hp = Math.max(0, dummy.hp - hit.finalDamage);
  const stabAmount = (skill.stabDamage ?? 0) + 2 * weaknesses.length;
  const { broke } = applyStabilityDamage(state, dummy, stabAmount);
  for (const e of passiveEffects(actor)) {
    if (e.kind === "resource_gain" && e.on === "onDamageDealt") {
      gainConfectance(actor, e.amount, state.config.confectanceMax);
    }
  }
  ev.baseDamage = hit.baseDamage;
  ev.mitigatedDamage = hit.mitigatedDamage;
  ev.attackerAtk = actor.panelAtk;
  ev.targetDef = dummy.defStat;
  ev.critical = hit.critical;
  ev.critMultiplier = state.config.critMultiplier;
  ev.weaknessExploited = weaknesses;
  ev.phaseMult = phaseMult;
  ev.bonusBracket = 1 + addDealt + addTaken;
  ev.reductionMult = reductionMult;
  ev.glancing = hit.glancing;
  ev.stabilityDamage = stabAmount;
  ev.targetStabilityAfter = dummy.stability;
  ev.exposed = broke ? true : dummy.exposed;
  ev.finalDamage = hit.finalDamage;
  return hit.finalDamage;
}

function applySkillStatuses(state: SimulationState, actor: UnitState, target: UnitState, specs: StatusApplySpec[] | undefined, ev: LogEvent): void {
  for (const spec of specs ?? []) {
    const t = spec.target === "self" ? actor : target;
    applyStatus(state, t, spec);
    ev.statusesApplied.push(spec.statusId);
  }
}

function resolveMainAction(state: SimulationState, doll: UnitState, slot: ActionSlot, k: number, turn: number): void {
  const skill = skillForSlot(doll, slot);
  if (!skill) throw new Error(`Character ${doll.id} has no skill for slot ${slot}`);
  const dummy = state.dummy;
  const source: SourceKind = skill.type === "ultimate" ? "ultimate" : skill.type === "basic" ? "basic" : "active";
  const ev: LogEvent = newEvent(state, doll, skill, dummy, source, false, turn);
  const beforeConfectance = doll.confectance;

  if (skill.multiplier !== undefined || skill.fixedDamage !== undefined) {
    dealDamageHit(state, doll, skill, ev);
  }

  // Ultimate at-max-Confectance hook (research §3.12): extra statuses + support quota.
  if (slot === "ultimate" && skill.onCastAtMaxConfectance && beforeConfectance >= state.config.confectanceMax) {
    applySkillStatuses(state, doll, dummy, skill.onCastAtMaxConfectance.extraStatuses, ev);
    if (skill.onCastAtMaxConfectance.supportQuotaBonus) {
      doll.supportQuota += skill.onCastAtMaxConfectance.supportQuotaBonus;
    }
  }

  applySkillStatuses(state, doll, dummy, skill.appliesStatuses, ev);

  // Confectance cost settled AFTER the cast (research §3.12).
  const cost = skill.confectanceCost;
  if (cost > 0 && !spendConfectance(doll, cost)) {
    throw new Error(`Cannot pay Confectance cost ${cost} for ${skill.id} (has ${beforeConfectance})`);
  }
  ev.confectance = { before: beforeConfectance, after: doll.confectance, cost };

  setCooldown(doll, skill.id, skill.cooldown, state.config.cooldownModel); // model assumption U11 (overridable in scenario)
  ev.cooldownAfter = Object.fromEntries(doll.cooldowns);

  doll.rotationIndex = (doll.rotationIndex + k + 1) % doll.rotationList.length;

  accumulate(state, doll, source, ev.finalDamage);
  state.log.push(ev);
}

/**
 * Support attacks: fired after a doll's main action for every OTHER doll whose
 * passive declares a support attack with quota left (research §3.14). Support
 * attacks consume no action, no Confectance, no cooldown, and never chain
 * (the hit is not re-dispatched through this function).
 */
function fireSupportAttacks(state: SimulationState, triggerActor: UnitState, turn: number): void {
  for (const shooter of state.units) {
    if (shooter === triggerActor || !shooter.def) continue;
    const eff = shooter.def.passive.effects.find(
      (e): e is Extract<PassiveEffect, { kind: "support_attack" }> => e.kind === "support_attack",
    );
    if (!eff || eff.trigger !== "onAllySingleTargetHit") continue;
    if (shooter.supportQuota <= 0) continue;
    const skill = shooter.def.skills.support;
    if (!skill) continue;
    shooter.supportQuota -= 1;
    resolveSupportHit(state, shooter, skill, turn);
  }
}

function resolveSupportHit(state: SimulationState, shooter: UnitState, skill: SkillDef, turn: number): void {
  const dummy = state.dummy;
  const ev = newEvent(state, shooter, skill, dummy, "passive", true, turn);
  const beforeConfectance = shooter.confectance;
  if (skill.multiplier !== undefined || skill.fixedDamage !== undefined) {
    dealDamageHit(state, shooter, skill, ev);
  }
  applySkillStatuses(state, shooter, dummy, skill.appliesStatuses, ev);
  ev.confectance = { before: beforeConfectance, after: shooter.confectance, cost: 0 };
  ev.cooldownAfter = Object.fromEntries(shooter.cooldowns);
  accumulate(state, shooter, "passive", ev.finalDamage);
  state.log.push(ev);
}

function newEvent(
  state: SimulationState,
  actor: UnitState,
  skill: SkillDef,
  target: UnitState,
  source: SourceKind,
  supportAttack: boolean,
  turn: number,
): LogEvent {
  return {
    round: state.round,
    turn,
    unit: actor.id,
    action: skill.id,
    actionType: skill.type === "support" ? "support" : skill.type,
    target: target.id,
    source,
    supportAttack,
    weaknessExploited: [],
    phaseMult: 1,
    bonusBracket: 1,
    reductionMult: 1,
    finalDamage: 0,
    cooldownAfter: {},
    statusesApplied: [],
    statusesExpired: [],
  };
}

function accumulate(state: SimulationState, doll: UnitState, source: SourceKind, damage: number): void {
  state.accum.actions += 1;
  state.accum.damage += damage;
  const c = state.accum.byCharacter.get(doll.id) ?? { damage: 0, actions: 0 };
  c.damage += damage;
  c.actions += 1;
  state.accum.byCharacter.set(doll.id, c);
  const s = state.accum.bySource.get(source) ?? { damage: 0, actions: 0 };
  s.damage += damage;
  s.actions += 1;
  state.accum.bySource.set(source, s);
}

function endOfOwnTurn(state: SimulationState, doll: UnitState): void {
  tickCooldowns(doll); // U11 model assumption
  tickStatuses(state, doll, "ownActionEnd"); // U7 model assumption
}

function endOfRound(state: SimulationState): void {
  endOfRoundStability(state);
  for (const u of [...state.units, state.dummy]) tickStatuses(state, u, "roundEnd");
}

function collectWarnings(state: SimulationState): void {
  const c = state.config;
  const d = DEFAULT_CONFIG;
  const warn = state.warnings;
  if (c.confectanceMax === d.confectanceMax) {
    warn.add(`confectanceMax=${d.confectanceMax} is an UNVERIFIED model default (research U9) — set configOverrides.confectanceMax after in-game test`);
  }
  if (c.confectanceStart === d.confectanceStart) {
    warn.add(`confectanceStart=${d.confectanceStart} is an UNVERIFIED model default (research U9)`);
  }
  if (c.exposedDamageMult === d.exposedDamageMult && state.dummy.maxStability > 0) {
    warn.add(`exposedDamageMult=${d.exposedDamageMult} is an UNVERIFIED model default (research U3) — affects post-break damage`);
  }
  if (state.dummy.maxStability > 0) {
    warn.add(`exposedDurationRounds=${c.exposedDurationRounds} is a CN-beta value (research U4)`);
  }
  if (state.units.some((u) => u.def && u.def.base.critRate > 0)) {
    warn.add(`critMultiplier=${c.critMultiplier} (research §3.3); interplay with the 120% panel crit-damage stat is UNVERIFIED (U1)`);
  }
  warn.add(`buff duration tick model = ownActionEnd (research U7 model assumption) — overridable via configOverrides.statusOverrides.<id>.tickAt`);
  warn.add(`cooldown model = ${c.cooldownModel} (research U11 model assumption) — overridable via configOverrides.cooldownModel`);
  warn.add("phase wheel not populated — phase interactions resolve neutral 1.0 (research §3.4: ×1.2/×0.8 confirmed, wheel UNVERIFIED)");
  const referenced = new Set<string>();
  for (const u of state.units) {
    const def = u.def;
    if (!def) continue;
    for (const sk of [def.skills.basic, def.skills.active1, def.skills.active2, def.skills.ultimate]) {
      for (const spec of sk.appliesStatuses ?? []) referenced.add(spec.statusId);
    }
  }
  for (const id of referenced) {
    const sd = state.statusRegistry.get(id);
    if (!sd) continue;
    if (c.statusOverrides[id]) {
      warn.add(`status "${id}": config-overridden (${JSON.stringify(c.statusOverrides[id])}) — in-game value still pending verification`);
    } else if (!sd.verified) {
      warn.add(`status "${id}": ${sd.note ?? "UNVERIFIED model default (docs/research.md §4)"}`);
    }
  }
}

function buildResults(state: SimulationState, scenario: Scenario): SimulationResult {
  const damage = state.accum.damage;
  const actions = state.accum.actions;
  return {
    seed: state.seed,
    turns: scenario.turns,
    totals: {
      damage,
      damagePerRound: damage / scenario.turns,
      damagePerAction: actions > 0 ? damage / actions : 0,
      actions,
    },
    byCharacter: [...state.accum.byCharacter.entries()]
      .map(([id, v]) => ({ id, damage: v.damage, actions: v.actions }))
      .sort((a, b) => b.damage - a.damage),
    bySource: [...state.accum.bySource.entries()]
      .map(([source, v]) => ({ source, damage: v.damage, actions: v.actions }))
      .sort((a, b) => b.damage - a.damage),
    warnings: [...state.warnings].sort(),
    log: state.log,
  };
}

/**
 * Run one deterministic simulation (docs/architecture.md §7). Same scenario +
 * same seed ⇒ identical result, including the full event log.
 */
export function simulate(scenario: Scenario, registry: Registry): SimulationResult {
  const warnings = new Set<string>();
  const state = createState(scenario, registry, warnings);
  collectWarnings(state);
  let turn = 0;
  for (let round = 1; round <= scenario.turns; round++) {
    state.round = round;
    for (const doll of state.units) {
      beginUnitRound(doll);
      state.appliedThisAction = [];
      const { slot, k } = pickAction(state, doll);
      resolveMainAction(state, doll, slot, k, ++turn);
      fireSupportAttacks(state, doll, turn);
      endOfOwnTurn(state, doll);
    }
    endOfRound(state);
  }
  return buildResults(state, scenario);
}