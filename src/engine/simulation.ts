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
 * Element/Phase interactions — CORRECTED 2026: GFL2 has NO elemental counter
 * wheel and no ×1.2/×0.8 counter relationships between elements. Weakness
 * matching is the ONLY relevant element interaction (validated: +10% damage
 * and +2 stability per exploited weakness — see docs/research.md §3.4/§3.5).
 * The factor below is structurally present but always neutral (1.0); it is
 * never a counter mechanic.
 */
export function phaseMultiplier(_attack: Element, _targetPhase: Element | null): number {
  return 1.0;
}

export interface ResolvedCritStats {
  /** Effective Crit Rate — capped at the conversion threshold (default 100%). */
  critRate: number;
  /** Base Crit DMG + converted overflow. */
  critDmg: number;
  convertedCritDmg: number;
}

/**
 * U19 Crit-Rate half (CONFIRMED 2026-09-03 by in-game passive text):
 * effective Crit Rate caps at `threshold` (default 100%); overflow above the
 * threshold is discarded UNLESS the attacker's own passive converts it
 * (default 1:1) into Crit DMG. Data-driven via PassiveEffect
 * "excess_crit_conversion" — never a global rule, never character-id logic.
 * The converted Crit DMG feeds the same confirmed multiplier: 1 + Crit DMG.
 */
export function resolveCritStats(
  critRate: number,
  critDmg: number,
  effects: PassiveEffect[],
): ResolvedCritStats {
  const conv = effects.find(
    (e): e is Extract<PassiveEffect, { kind: "excess_crit_conversion" }> => e.kind === "excess_crit_conversion",
  );
  if (!conv) {
    // Confirmed rule: without the conversion passive, overflow Crit Rate is
    // simply discarded — effective Crit Rate still caps at 100% (default threshold).
    return { critRate: Math.min(critRate, 1.0), critDmg, convertedCritDmg: 0 };
  }
  const threshold = conv.threshold;
  const excess = Math.max(0, critRate - threshold);
  const converted = conv.cap === undefined ? excess * conv.ratio : Math.min(conv.cap, excess * conv.ratio);
  return {
    critRate: Math.min(critRate, threshold),
    critDmg: critDmg + converted,
    convertedCritDmg: converted,
  };
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

function passiveEffects(unit: UnitState): PassiveEffect[] {
  return unit.passives;
}

interface TakenMods {
  additive: number;
  multiplicative: number;
}

/**
 * U5: target/boss passives that modify INCOMING damage, gated on the target's state.
 * Conditional taken modifiers only apply while their condition holds; the confirmed
 * boss passive ("incoming damage × 0.20 while Stability > 0") is a multiplicative
 * taken modifier on the target. Conditions are evaluated on the target's PRE-HIT
 * state, so a stability-breaking attack is still reduced while stability > 0 at
 * evaluation time — no special break-hit rule is invented.
 */
function targetPassiveTakenMods(target: UnitState): TakenMods {
  let additive = 0;
  let multiplicative = 1;
  for (const e of target.passives) {
    if (e.kind !== "conditional_damage_modifier" || e.scope !== "taken") continue;
    const cond = e.when === "target.stabilityAboveZero" ? target.stability > 0 : target.cover === "none";
    if (!cond) continue;
    if (e.mode === "additive") additive += e.value;
    else multiplicative *= e.value;
  }
  return { additive, multiplicative };
}

function beginUnitRound(doll: UnitState): void {
  doll.actionBudget = 1; // one main action per round (research §3.15)
  doll.supportQuota = doll.def ? supportAttackQuota(doll.def) : 0;
}

/** Match the attack's element AND ammo type against the target's exposed weaknesses: +10% damage and +2 stability each (research §3.5 / U20 / 2026 ammo dimension). */
function exploitedWeaknesses(target: UnitState, skill: SkillDef): { weaknesses: string[]; mult: number; ammoExploited: boolean } {
  const elementMatches = target.weaknessElements.filter((w) => w === skill.element);
  const ammoExploited = skill.ammoType !== undefined && target.weaknessTags.includes(skill.ammoType);
  const weaknesses = ammoExploited ? [...elementMatches, skill.ammoType as string] : [...elementMatches];
  // U20 CONFIRMED 2026-09-03 (in-game: Burn → 1091; Burn + Assault Rifle ammo → 1191):
  // the weakness factor is ADDITIVE across exploited weaknesses: 1 + 0.10 × count.
  // (1 → ×1.10; 2 → ×1.20; multiplicative ×1.21 is ruled out.) Element matches AND
  // ammo-tag matches count into the SAME generic multiplier AND into the +2 stability
  // bonus per exploited weakness (validated 2026 — see §3.5). Generic — no character ids.
  const mult = 1 + 0.1 * weaknesses.length;
  return { weaknesses, mult, ammoExploited };
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
  const { weaknesses, mult: weaknessMult, ammoExploited } = exploitedWeaknesses(dummy, skill);
  // AWU trigger fires BEFORE the hit resolves: the first exploiting attack already
  // benefits from its own 2 stacks (validated T1 = 616 / 105). Phase attacks are
  // gated out by the trigger data (requiresElements) — they neither gain nor benefit.
  grantStackOnWeaknessExploit(state, dummy, skill, ammoExploited);
  const phaseMult = phaseMultiplier(skill.element, dummy.phase);
  const addDealt = additiveDealtBonus(actor, state.statusRegistry, skill.element) + conditionalNoCoverBonus(actor, dummy);
  const targetMods = targetPassiveTakenMods(dummy); // U5 boss/target stability-conditional passives
  const addTaken = additiveTakenBonus(dummy, state.statusRegistry, skill.element) + targetMods.additive;
  const { mult, red } = multiplicativeTakenMods(dummy, state.statusRegistry);
  // no stability-cover reduction: dummy has no cover (Cover permanently out of scope)
  // U3: NO universal Exposed damage multiplier — the reduction chain contains none.
  const reductionMult = mult * red * targetMods.multiplicative;
  // Confirmed rule (U1 + U19): crit multiplier = 1 + attacker Crit DMG, where Crit DMG
  // includes any passive overflow conversion; effective Crit Rate caps at 100%.
  // configOverrides.critMultiplier is a test-only alternative hypothesis.
  const crit = resolveCritStats(actor.critRate, actor.critDmg, passiveEffects(actor));
  const critMult = state.config.critMultiplier ?? 1 + crit.critDmg;
  const hit = rollHit({
    atk: actor.panelAtk,
    def: dummy.defStat,
    multiplier: skill.multiplier ?? 0,
    fixedDamage: skill.fixedDamage,
    additiveBonus: 1 + addDealt + addTaken,
    phaseMult,
    weaknessMult,
    reductionMult,
    critRate: crit.critRate,
    critMultiplier: critMult,
    rng: state.rng,
  });
  // U21: normal chain and fixed component are both final game damage —
  //  finalDamage = ceil(normalChain) + ceil(fixed).
  const totalDamage = hit.finalDamage + hit.fixedDamage;
  dummy.hp = Math.max(0, dummy.hp - totalDamage);
  // Validated 2026: Total Stability Damage = attack base stability damage
  //   + 2 × (# weaknesses exploited) — element AND ammo-tag matches both count
  //   (generic across Physical/Phase; independent of the damage multiplier; AWU untouched).
  const stabAmount = (skill.stabDamage ?? 0) + 2 * weaknesses.length;
  const { broke } = applyStabilityDamage(state, dummy, stabAmount);
  const upgrades = dummy.statuses
    .filter((s) => state.statusRegistry.get(s.statusId)?.category === "upgrade")
    .map((s) => ({ statusId: s.statusId, stacks: s.stacks }));
  if (upgrades.length > 0) ev.upgradeStacks = upgrades;
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
  ev.critMultiplier = critMult;
  ev.weaknessExploited = weaknesses;
  ev.phaseMult = phaseMult;
  ev.bonusBracket = 1 + addDealt + addTaken;
  ev.reductionMult = reductionMult;
  ev.stabilityDamage = stabAmount;
  ev.targetStabilityAfter = dummy.stability;
  ev.exposed = broke ? true : dummy.exposed;
  ev.finalDamage = totalDamage;
  if (hit.fixedDamage > 0) ev.fixedDamage = hit.fixedDamage;
  return totalDamage;
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

/**
 * Target-side stack trigger (Ammo Weakness Upgrade, validated 2026): declared
 * on the TARGET via DummyConfig.passives. Fires when the attack exploited
 * `weaknessTag` (ammo dimension) and its element is allowed by
 * `requiresElements` (AWU data: physical only — Phase/elemental exploits
 * neither receive the bonus nor advance stacks). firstGain / gainPerEvent /
 * maxStacks are data-driven — the 2/1/5 progression is NOT in the formula.
 * applyStatus keeps U7/U8 semantics (refresh; stack; cap at StatusDef.maxStacks).
 */
function grantStackOnWeaknessExploit(state: SimulationState, target: UnitState, skill: SkillDef, ammoExploited: boolean): void {
  if (!ammoExploited) return;
  for (const p of target.passives) {
    if (p.kind !== "grant_stacks_on_weakness_exploit") continue;
    if (skill.ammoType !== p.weaknessTag) continue;
    if (p.requiresElements && !p.requiresElements.includes(skill.element)) continue;
    const cur = target.statuses.find((s) => s.statusId === p.statusId);
    const next = Math.min(p.maxStacks, (cur?.stacks ?? 0) + (cur ? p.gainPerEvent : p.firstGain));
    const delta = next - (cur?.stacks ?? 0);
    if (delta > 0) applyStatus(state, target, { statusId: p.statusId, stacks: delta });
  }
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
  tickStatuses(state, doll, "ownActionEnd"); // U7 CONFIRMED 2026-09-03: normal timed buffs tick at the recipient's action end
}

function endOfRound(state: SimulationState): void {
  endOfRoundStability(state);
  for (const u of [...state.units, state.dummy]) tickStatuses(state, u, "roundEnd");
}

function collectWarnings(state: SimulationState): void {
  const c = state.config;
  const d = DEFAULT_CONFIG;
  const warn = state.warnings;
  if (c.confectanceMax !== d.confectanceMax) {
    warn.add(`confectanceMax = ${c.confectanceMax} — non-confirmed override (confirmed in-game: 6, U9)`);
  }
  if (c.confectanceStart !== d.confectanceStart) {
    warn.add(`confectanceStart = ${c.confectanceStart} — non-confirmed override (confirmed in-game: 3, U9)`);
  }
  if (c.exposedDurationRounds !== d.exposedDurationRounds && state.dummy.maxStability > 0) {
    warn.add(`exposedDurationRounds = ${c.exposedDurationRounds} — non-confirmed alternative (fixed 2-turn broken window rule, U4/U6)`);
  }
  if (c.critMultiplier !== null) {
    // Confirmed rule: crit multiplier = 1 + Crit DMG (U1 + U19 CDMG half resolved).
    warn.add(`critMultiplier override = ${c.critMultiplier} — test-only alternative hypothesis (confirmed rule: multiplier = 1 + Crit DMG)`);
  }
  const tickOverridden = Object.entries(c.statusOverrides).some(([id, ov]) => ov.tickAt !== undefined && ov.tickAt !== "ownActionEnd");
  if (tickOverridden) {
    warn.add(`a status tickAt override is not "ownActionEnd" — non-confirmed alternative (confirmed rule: normal timed buffs tick at the recipient's action end, U7 RESOLVED 2026-09-03)`);
  }
  if (c.cooldownModel !== DEFAULT_CONFIG.cooldownModel) {
    // U11 is RESOLVED (wait N full turns after the cast turn); the alternative is selectable for testing only.
    warn.add(`cooldown model = ${c.cooldownModel} — non-confirmed alternative (confirmed rule: wait N full turns after the cast turn, U11 RESOLVED 2026-09-03)`);
  }
  // No elemental counter wheel exists in GFL2 (corrected 2026) — no phase warning is emitted.
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