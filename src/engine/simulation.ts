import type { Element } from "../model/types.js";
import type { ActionSlot, PassiveEffect, Scenario, SkillDefVariant, SourceKind, StatusApplySpec, StatusEffect } from "../model/types.js";
import type { LogEvent, SimulationResult } from "../model/runtime.js";
import type { Registry } from "../data/registry.js";
import { rollHit } from "./damage.js";
import { cooldownRemaining, setCooldown, tickCooldowns } from "./cooldowns.js";
import { gainConfectance, spendConfectance } from "./resources.js";
import {
  additiveDealtBonus,
  additiveTakenBonus,
  applyStatus,
  consumeOneOnUseStacks,
  fixedDmgMods,
  multiplicativeTakenMods,
  statModifier,
  tickStatuses,
} from "./statuses.js";
import { applyStabilityDamage, endOfRoundStability } from "./stability.js";
import { abilitySourceLabel, createState, DEFAULT_CONFIG, passiveSourceLabel, supportAttackQuota, type SimulationState, type UnitState } from "./state.js";

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

function skillForSlot(doll: UnitState, slot: ActionSlot): SkillDefVariant | null {
  return doll.skills[slot] ?? null;
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
  doll.supportQuota = doll.def ? supportAttackQuota(doll.passives) : 0;
}

/** Match the attack's element AND ammo type against the target's exposed weaknesses: +10% damage and +2 stability each (research §3.5 / U20 / 2026 ammo dimension). */
function exploitedWeaknesses(target: UnitState, skill: SkillDefVariant): { weaknesses: string[]; mult: number; ammoExploited: boolean } {
  const elementMatches = target.weaknessElements.filter((w) => w === skill.element);
  const ammoExploited = skill.ammoType !== undefined && target.weaknessTags.includes(skill.ammoType);
  const weaknesses = ammoExploited ? [...elementMatches, skill.ammoType as string] : [...elementMatches];
  // U20 CONFIRMED 2026-09-03 (in-game: Burn → 1091; Burn + Medium ammo (Qiongjiu) → 1191):
  // the weakness factor is ADDITIVE across exploited weaknesses: 1 + 0.10 × count.
  // (1 → ×1.10; 2 → ×1.20; multiplicative ×1.21 is ruled out.) Element matches AND
  // ammo-tag matches count into the SAME generic multiplier AND into the +2 stability
  // bonus per exploited weakness (validated 2026 — see §3.5). Generic — no character ids.
  const mult = 1 + 0.1 * weaknesses.length;
  return { weaknesses, mult, ammoExploited };
}

/**
 * Passive conditional dealt bonuses for one condition (generic — reusable by any character).
 * `when: "target.noCover"` requires the target to have no cover (MVP: dummy always "none");
 * `when: "always"` is unconditional. `actions: "support"` entries only count for Support Actions.
 */
function conditionalDealtBonus(actor: UnitState, target: UnitState, when: "target.noCover" | "always", supportAttack: boolean): number {
  let sum = 0;
  for (const e of passiveEffects(actor)) {
    if (e.kind !== "conditional_damage_modifier" || e.scope !== "dealt" || e.mode !== "additive") continue;
    if (e.when !== when) continue;
    if (e.actions === "support" && !supportAttack) continue;
    if (when === "target.noCover" && target.cover !== "none") continue;
    sum += e.value;
  }
  return sum;
}

/** Damage + stability + Confectance-gain application for a single hit; fills the event's damage fields. */
function dealDamageHit(state: SimulationState, actor: UnitState, skill: SkillDefVariant, ev: LogEvent): number {
  const dummy = state.dummy;
  const { weaknesses, mult: weaknessMult, ammoExploited } = exploitedWeaknesses(dummy, skill);
  // AWU trigger fires BEFORE the hit resolves: the first exploiting attack already
  // benefits from its own 2 stacks (validated T1 = 616 / 105). Phase attacks are
  // gated out by the trigger data (requiresElements) — they neither gain nor benefit.
  grantStackOnWeaknessExploit(state, dummy, skill, ammoExploited);
  const phaseMult = phaseMultiplier(skill.element, dummy.phase);
  const addDealt =
    additiveDealtBonus(actor, state.statusRegistry, skill.element, { supportAttack: ev.supportAttack, targetExposed: dummy.exposed }) +
    conditionalDealtBonus(actor, dummy, "target.noCover", ev.supportAttack) +
    conditionalDealtBonus(actor, dummy, "always", ev.supportAttack);
  const targetMods = targetPassiveTakenMods(dummy); // U5 boss/target stability-conditional passives
  const addTaken = additiveTakenBonus(dummy, state.statusRegistry, skill.element) + targetMods.additive;
  // Effect provenance (2026): deduplicated, human-readable sources of the modifiers that
  // contributed to this hit's buckets — a source (ability/passive/key) and its resulting
  // effect are ONE modifier, never double-counted just because both names appear.
  const sources = new Set<string>();
  for (const s of actor.statuses) {
    const def = state.statusRegistry.get(s.statusId);
    if (!def) continue;
    const contributes = def.effects.some(
      (e) =>
        (e.kind === "damage_modifier" && e.scope === "dealt" && e.mode === "additive" && !(e.actions === "support" && !ev.supportAttack)) ||
        (e.kind === "stack_tier_modifier" && e.scope === "dealt"),
    );
    if (contributes) sources.add(s.source ?? def.name);
  }
  for (const e of passiveEffects(actor)) {
    if (
      e.kind === "conditional_damage_modifier" &&
      e.scope === "dealt" &&
      e.mode === "additive" &&
      e.when !== "target.stabilityAboveZero" &&
      !(e.actions === "support" && !ev.supportAttack)
    ) {
      sources.add(actor.def ? passiveSourceLabel(actor.def, actor.passiveLevel) : "attacker passive");
    }
  }
  for (const s of dummy.statuses) {
    const def = state.statusRegistry.get(s.statusId);
    if (!def) continue;
    if (def.effects.some((e) => e.kind === "damage_modifier" && e.scope === "taken" && e.mode === "additive")) {
      sources.add(s.source ?? def.name);
    }
  }
  if (targetMods.additive > 0) sources.add("Target passive (DummyConfig)");
  if (sources.size > 0) ev.effectSources = [...sources];
  const { mult, red } = multiplicativeTakenMods(dummy, state.statusRegistry);
  // no stability-cover reduction: dummy has no cover (Cover permanently out of scope)
  // U3: NO universal Exposed damage multiplier — the reduction chain contains none.
  const reductionMult = mult * red * targetMods.multiplicative;
  // Confirmed rule (U1 + U19): crit multiplier = 1 + attacker Crit DMG, where Crit DMG
  // includes any passive overflow conversion; effective Crit Rate caps at 100%.
  // configOverrides.critMultiplier is a test-only alternative hypothesis.
  const crit = resolveCritStats(statModifier(actor, state.statusRegistry, "critRate", actor.critRate), actor.critDmg, passiveEffects(actor));
  const critMult = state.config.critMultiplier ?? 1 + crit.critDmg;
  const effAtk = statModifier(actor, state.statusRegistry, "atk", actor.panelAtk);
  const effDef = statModifier(dummy, state.statusRegistry, "def", dummy.defStat);
  const hit = rollHit({
    atk: effAtk,
    def: effDef,
    multiplier: skill.multiplier ?? 0,
    // Final DMG modifier chain applied to the UNROUNDED absolute fixed value;
    // rollHit then ceils (validated 2026). Ordinary factors are never applied.
    fixedDamage: skill.fixedDamage !== undefined ? skill.fixedDamage * fixedDmgMods(actor, dummy, state.statusRegistry) : undefined,
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
  // Consumption-of-use statuses (Support Boost I/II, VALIDATED 2026): a status that
  // contributed to THIS Support Action consumes exactly ONE stack and is removed at 0.
  const consumed = consumeOneOnUseStacks(state, actor, ev.supportAttack);
  if (consumed.length > 0) (ev.statusesExpired ??= []).push(...consumed);
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
  ev.attackerAtk = effAtk;
  ev.targetDef = effDef;
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

function applySkillStatuses(state: SimulationState, actor: UnitState, target: UnitState, specs: StatusApplySpec[] | undefined, ev: LogEvent, sourceLabel: string): void {
  for (const spec of specs ?? []) {
    const t = spec.target === "self" ? actor : target;
    // Capture the applier (id + ATK at cast) so applier-ATK fixed damage works (Overburn 2026),
    // and the human-readable provenance (sourceLabel) of the granting ability/passive/key.
    const full = { ...spec, applier: spec.applier ?? { id: actor.id, atk: actor.panelAtk }, source: spec.source ?? sourceLabel };
    const removedBefore = t.statuses.map((s) => s.statusId);
    const created = applyStatus(state, t, full);
    // Report statuses REPLACED by this application (VALIDATED 2026: SB II replaces SB I).
    const replaced = removedBefore.filter((id) => !t.statuses.some((s) => s.statusId === id));
    if (replaced.length > 0) (ev.statusesExpired ??= []).push(...replaced);
    // Only report an actual application: a BLOCKED application (VALIDATED 2026: SB II blocks
    // SB I) neither adds the status nor records provenance.
    if (t.statuses.some((s) => s.statusId === spec.statusId)) {
      ev.statusesApplied.push(spec.statusId);
      (ev.appliedSources ??= []).push({ statusId: spec.statusId, source: full.source });
    }
    // Validated (2026): gaining Overburn immediately deals fixed damage = 10% of the APPLIER's ATK.
    if (created) applyStatusFixedDamage(state, t, spec.statusId, "onApply", state.round);
  }
}

/**
 * Status-sourced fixed damage (Overburn, validated 2026): absolute damage =
 * ceil(percentOfAtk × applier ATK captured at application time), applied to the
 * status HOLDER, logged as a status_tick event, and added to totals WITHOUT
 * counting an action (aggregations stay consistent with the log). Data-driven —
 * no per-status branch.
 */
function applyStatusFixedDamage(state: SimulationState, holder: UnitState, statusId: string, applies: "onApply" | "onTick", turn: number): void {
  const def = state.statusRegistry.get(statusId);
  if (!def) return;
  const active = holder.statuses.find((s) => s.statusId === statusId);
  const applier = active?.applier;
  if (!applier) return;
  const eff = def.effects.find(
    (e): e is Extract<StatusEffect, { kind: "fixed_damage" }> => e.kind === "fixed_damage" && e.applies.includes(applies),
  );
  if (!eff) return;
  // Fixed DMG modifier chain (validated 2026): apply to the UNROUNDED value
  // before the final ceil. Applier-side Fixed DMG Buffs, holder-side Final
  // DMG Reduction — ordinary damage increase/reduction never enter this product.
  const actorUnit = state.units.find((u) => u.id === applier.id);
  const finalMult = fixedDmgMods(actorUnit, holder, state.statusRegistry);
  const raw = applier.atk * eff.percentOfAtk * finalMult;
  const amount = Math.ceil(Math.round(raw * 1e6) / 1e6); // same round6 guard as the damage pipeline
  holder.hp = Math.max(0, holder.hp - amount);
  accumulateDamage(state, applier.id, amount);
  state.log.push({
    round: state.round,
    turn,
    unit: applier.id,
    action: def.id,
    actionType: "status_tick",
    target: holder.id,
    source: "passive",
    supportAttack: false,
    weaknessExploited: [],
    phaseMult: 1,
    bonusBracket: 1,
    reductionMult: 1,
    attackerAtk: applier.atk,
    targetDef: holder.defStat,
    finalDamage: amount,
    fixedDamage: amount,
    statusTick: { statusId: def.id, amount },
    cooldownAfter: {},
    statusesApplied: [],
    statusesExpired: [],
  });
}

/** Add damage to aggregates WITHOUT consuming an action (status-sourced damage, 2026). */
function accumulateDamage(state: SimulationState, unitId: string, damage: number): void {
  state.accum.damage += damage;
  const c = state.accum.byCharacter.get(unitId) ?? { damage: 0, actions: 0 };
  c.damage += damage;
  state.accum.byCharacter.set(unitId, c);
  const s = state.accum.bySource.get("passive") ?? { damage: 0, actions: 0 };
  s.damage += damage;
  state.accum.bySource.set("passive", s);
}

function resolveMainAction(state: SimulationState, doll: UnitState, slot: ActionSlot, k: number, turn: number): LogEvent {
  const skill = skillForSlot(doll, slot);
  if (!skill) throw new Error(`Character ${doll.id} has no skill for slot ${slot}`);
  const dummy = state.dummy;
  const source: SourceKind = skill.type === "ultimate" ? "ultimate" : skill.type === "basic" ? "basic" : "active";
  const sourceLabel = abilitySourceLabel(doll.def!, slot, doll.skillLevels[slot] ?? 1);
  const ev: LogEvent = newEvent(state, doll, skill, dummy, source, false, turn);
  const beforeConfectance = doll.confectance;

  // Activation-time at-max hook (research §3.12): extra statuses + support quota.
  // Checked against the PRE-spend value (the unit was at cap when activating).
  if (slot === "ultimate" && skill.onCastAtMaxConfectance && beforeConfectance >= state.config.confectanceMax) {
    applySkillStatuses(state, doll, dummy, skill.onCastAtMaxConfectance.extraStatuses, ev, sourceLabel);
    if (skill.onCastAtMaxConfectance.supportQuotaBonus) {
      doll.supportQuota += skill.onCastAtMaxConfectance.supportQuotaBonus;
    }
  }

  // Confectance is consumed IMMEDIATELY on activation (VALIDATED in-game 2026),
  // BEFORE the action's damage/status/other effects resolve (research §3.12).
  const cost = skill.confectanceCost;
  if (cost > 0 && !spendConfectance(doll, cost)) {
    throw new Error(`Cannot pay Confectance cost ${cost} for ${skill.id} (has ${beforeConfectance})`);
  }

  if (skill.multiplier !== undefined || skill.fixedDamage !== undefined) {
    dealDamageHit(state, doll, skill, ev);
  }

  applySkillStatuses(state, doll, dummy, skill.appliesStatuses, ev, sourceLabel);
  // Log the end-of-action value: `before` = activation-time, `after` = post-spend + any gains from this action.
  ev.confectance = { before: beforeConfectance, after: doll.confectance, cost };

  setCooldown(doll, skill.id, skill.cooldown, state.config.cooldownModel); // model assumption U11 (overridable in scenario)
  ev.cooldownAfter = Object.fromEntries(doll.cooldowns);

  doll.rotationIndex = (doll.rotationIndex + k + 1) % doll.rotationList.length;

  accumulate(state, doll, source, ev.finalDamage);
  state.log.push(ev);
  return ev;
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
    const eff = shooter.passives.find(
      (e): e is Extract<PassiveEffect, { kind: "support_attack" }> => e.kind === "support_attack",
    );
    if (!eff || eff.trigger !== "onAllySingleTargetHit") continue;
    if (shooter.supportQuota <= 0) continue;
    const skill = shooter.skills.support;
    if (!skill) continue;
    shooter.supportQuota -= 1;
    resolveSupportHit(state, shooter, skill, turn);
  }
}

function resolveSupportHit(state: SimulationState, shooter: UnitState, skill: SkillDefVariant, turn: number): void {
  const dummy = state.dummy;
  const ev = newEvent(state, shooter, skill, dummy, "passive", true, turn);
  const beforeConfectance = shooter.confectance;
  // "BEFORE Support Action" statuses (V4 Vulnerable I, VALIDATED in-game 2026): declared on the
  // RESOLVED ultimate variant (generic `beforeSupportStatuses`), applied to the support target
  // immediately before the Support Action resolves — the target already carries them when the
  // support hit lands (taken modifiers contribute to that hit). Independent of Confectance level.
  const ult = shooter.skills.ultimate;
  if (ult?.beforeSupportStatuses) {
    const label = abilitySourceLabel(shooter.def!, "ultimate", shooter.skillLevels.ultimate ?? 1);
    for (const spec of ult.beforeSupportStatuses) {
      const appliedId = applyStatus(state, dummy, {
        statusId: spec.statusId,
        durationRounds: spec.durationRounds,
        stacks: spec.stacks,
        target: spec.target,
        applier: { id: shooter.id, atk: shooter.panelAtk },
        source: spec.source ?? label,
      });
      if (appliedId) {
        ev.statusesApplied.push(spec.statusId);
        (ev.appliedSources ??= []).push({ statusId: spec.statusId, source: label });
      }
    }
  }
  if (skill.multiplier !== undefined || skill.fixedDamage !== undefined) {
    dealDamageHit(state, shooter, skill, ev);
  }
  // "After Support Action" passive statuses (Steady Plan Lv2/Lv3: Overburn 2r, SOURCE 2026):
  // applied to the support target whenever a Support Action is performed — no extra gate
  // (the generic trigger flow already ensures supports fire on qualifying ally damage).
  for (const pe of shooter.passives) {
    if (pe.kind !== "after_support_status") continue;
    const label = passiveSourceLabel(shooter.def!, shooter.passiveLevel);
    const appliedId = applyStatus(state, dummy, {
      statusId: pe.statusId,
      durationRounds: pe.durationRounds,
      stacks: pe.stacks,
      applier: { id: shooter.id, atk: shooter.panelAtk },
      source: label,
    });
    if (appliedId) {
      ev.statusesApplied.push(pe.statusId);
      (ev.appliedSources ??= []).push({ statusId: pe.statusId, source: label });
    }
  }
  applySkillStatuses(state, shooter, dummy, skill.appliesStatuses, ev, abilitySourceLabel(shooter.def!, "support", shooter.skillLevels.support ?? 1));
  ev.confectance = { before: beforeConfectance, after: shooter.confectance, cost: 0 };
  ev.cooldownAfter = Object.fromEntries(shooter.cooldowns);
  accumulate(state, shooter, "passive", ev.finalDamage);
  state.log.push(ev);
}

function newEvent(
  state: SimulationState,
  actor: UnitState,
  skill: SkillDefVariant,
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
 *
 * INTENTIONAL PROVENANCE EXCEPTION (2026): AWU applies via this direct applyStatus path
 * WITHOUT a granting source — it is a generic target-side upgrade, not a per-ability/key
 * grant, so it deliberately carries no `source` label and records no `appliedSources`
 * entry (see docs/validation-checklist.md §0). Do NOT "fix" this by threading a source.
 */
function grantStackOnWeaknessExploit(state: SimulationState, target: UnitState, skill: SkillDefVariant, ammoExploited: boolean): void {
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

function endOfOwnTurn(state: SimulationState, unit: UnitState): void {
  tickCooldowns(unit); // U11 model assumption
  // U7 CONFIRMED 2026-09-03: normal timed buffs tick at the recipient's action end.
  // onTick fires status-sourced fixed damage (Overburn, 2026) before each decrement.
  tickStatuses(state, unit, "ownActionEnd", (st, u, def, active) => {
    if (active.applier) applyStatusFixedDamage(st, u, def.id, "onTick", st.round);
  });
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
  if (c.fortificationLevel > 0) {
    warn.add(`fortificationLevel = ${c.fortificationLevel} — Fortification→ability mappings not yet collected/validated (QJ fortificationMap is empty); levels resolve to 1 or an ability's baseline`);
  }
  // No elemental counter wheel exists in GFL2 (corrected 2026) — no phase warning is emitted.
  const referenced = new Set<string>();
  for (const u of state.units) {
    const def = u.def;
    if (!def) continue;
    for (const ability of [def.skills.basic, def.skills.active1, def.skills.active2, def.skills.ultimate]) {
      for (const sk of Object.values(ability.levels)) {
        for (const spec of sk.appliesStatuses ?? []) referenced.add(spec.statusId);
      }
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
      const { slot, k } = pickAction(state, doll);
      const ev = resolveMainAction(state, doll, slot, k, ++turn);
      // Trigger fidelity (2026): Support Action fires only when an ally's action actually
      // dealt damage to an enemy (source fact: "receives targeted damage from an ally") —
      // a non-damaging ally action (e.g. a 0-damage ultimate) must NOT trigger it.
      if (ev.finalDamage > 0) fireSupportAttacks(state, doll, turn);
      endOfOwnTurn(state, doll);
    }
    // Dummy pass-turn (validated 2026): the stationary dummy advances through a
    // no-op action cycle (no attacks/skills/resources/AI) so target-side
    // ownActionEnd statuses (e.g. Overburn) tick naturally. Invisible otherwise.
    endOfOwnTurn(state, state.dummy);
    endOfRound(state);
  }
  return buildResults(state, scenario);
}