import type { Element } from "../model/types.js";
import type { ActionSlot, EffectSourceRef, PassiveEffect, Scenario, SkillDefVariant, SourceKind, StatusApplySpec, StatusEffect } from "../model/types.js";
import type { LogEvent, SimulationResult } from "../model/runtime.js";
import type { Registry } from "../data/registry.js";
import { rollHit } from "./damage.js";
import { cooldownRemaining, setCooldown, tickCooldowns } from "./cooldowns.js";
import { gainConfectance, spendConfectance } from "./resources.js";
import { attackHeightEffect, bossFootprintTiles, legalDestinations, moveCost, resolveCardinalRayTarget, resolveCardinalRayTargets, tileKey } from "./grid.js";
import {
  additiveDealtBonus,
  additiveTakenBonus,
  applyStatus,
  cleanseDispellable,
  consumeOneOnUseStacks,
  fixedDmgMods,
  multiplicativeTakenMods,
  statModifier,
  tickStatuses,
} from "./statuses.js";
import { applyStabilityDamage, endOfRoundStability } from "./stability.js";
import { abilitySourceLabel, createState, DEFAULT_CONFIG, fortificationV, passiveSourceLabel, supportAttackQuota, type SimulationState, type UnitState } from "./state.js";

/**
 * Element/Phase interactions — CORRECTED 2026: GFL2 has NO elemental counter
 * wheel and no ×1.2/×0.8 counter relationships between elements. Weakness
 * matching is the ONLY relevant element interaction (validated: +10% damage
 * and +2 stability per exploited weakness — see docs/research.md §3.4/§3.5).
 * The factor below is structurally present but always neutral (1.0); it is
 * never a counter mechanic.
 */
export function phaseMultiplier(_attack: Element | null, _targetPhase: Element | null): number {
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

/**
 * Fixed Key 4: Point of Vulnerability (VALIDATED in-game 2026) — secondary targets of the Guide
 * line. Enumerates ALL enemy tiles on the selected cardinal ray (in order); the FIRST is the
 * already-resolved primary; every subsequent enemy receives a normal Guide hit (per-enemy DEF
 * and element weakness, same ATK/bracket/crit inputs as the primary) multiplied by 0.70, then
 * ceiled — `secondary = ceil(normal × 0.70)`. Secondary targets ALSO receive Guide's applied
 * statuses (Overburn) through the generic status system, and V2's guaranteed crit applies per
 * target (each secondary carries its own statuses). Deterministic: `critRate` 0/1 short-circuit
 * the RNG (no stream consumption).
 */
function guideLineSecondaryHits(
  state: SimulationState,
  actor: UnitState,
  skill: SkillDefVariant,
  ev: LogEvent,
  effAtk: number,
  bracket: number,
  critRate: number,
  critMult: number,
): void {
  const grid = state.grid!;
  const placement = grid.placements.get(actor.id);
  if (!placement) throw new Error(`guide targeting for ${actor.id} has no placement`);
  const targets = resolveCardinalRayTargets(grid, placement.coord, skill.targetingCardinalRay!.direction, skill.targetingCardinalRay!.effectiveArea);
  for (let i = 1; i < targets.length; i++) {
    const t = targets[i];
    const tk = tileKey(t.x, t.y);
    const unit = grid.enemyUnits.find((e) => tileKey(e.coord.x, e.coord.y) === tk);
    const defense = unit ? unit.defense : state.dummy.defStat;
    const weaknesses: Element[] = unit ? (unit.weaknesses ?? ([] as Element[])) : (state.dummy.weaknessElements as Element[]);
    const weaknessExploited = weaknesses.filter((w) => w === skill.element);
    // Per-secondary status/hit state: line enemies keep their own statuses (FK4 secondary
    // targets receive Guide's applied statuses — e.g. Overburn — via the GENERIC applyStatus).
    const enemyStatuses = unit ? (grid.enemyStatuses.get(unit.unitId) ?? []) : state.dummy.statuses;
    // Guide V2 (VALIDATED): if THIS target already carries `guaranteedCritWhenHasStatus`, it
    // crits; applied per target, exactly like the primary.
    const perTargetCrit = skill.guaranteedCritWhenHasStatus !== undefined && enemyStatuses.some((s) => s.statusId === skill.guaranteedCritWhenHasStatus) ? 1 : critRate;
    const normal = rollHit({
      atk: effAtk,
      def: defense,
      multiplier: skill.multiplier ?? 0,
      additiveBonus: bracket,
      phaseMult: 1,
      weaknessMult: 1 + 0.1 * weaknessExploited.length,
      reductionMult: 1,
      critRate: perTargetCrit,
      critMultiplier: critMult,
      rng: state.rng,
    });
    // Statuses: same handling as a normal Guide hit — apply the skill's appliesStatuses to THIS
    // target through the generic system (no FK4-only status behavior; no second Overburn impl).
    const appliedStatuses: string[] = [];
    for (const spec of skill.appliesStatuses ?? []) {
      const statusTarget = (unit ? { statuses: enemyStatuses } : state.dummy) as unknown as UnitState;
      if (applyStatus(state, statusTarget, { ...spec, applier: { id: actor.id, atk: actor.panelAtk } })) appliedStatuses.push(spec.statusId);
    }
    const secEv: LogEvent = {
      ...ev,
      target: unit ? unit.unitId : state.dummy.name,
      guideLineIndex: i,
      guideLineSecondary: true,
      finalDamage: Math.ceil(normal.finalDamage * 0.7),
      attackerAtk: effAtk,
      targetDef: defense,
      weaknessExploited,
      phaseMult: 1,
      bonusBracket: bracket,
      reductionMult: 1,
      statusesApplied: appliedStatuses,
      critical: normal.critical,
      critMultiplier: critMult,
      stabilityDamage: undefined,
      targetStabilityAfter: undefined,
      exposed: undefined,
      statusesExpired: [],
      upgradeStacks: undefined,
      effectSources: undefined,
      effectSourceRefs: undefined,
      appliedSources: undefined,
      baseDamage: undefined,
      mitigatedDamage: undefined,
      killingBlow: undefined,
      fixedDamage: undefined,
      statusTick: undefined,
      confectance: undefined,
    };
    state.log.push(secEv);
  }
}

/**
 * FK6 Steadiness (VALIDATED in-game 2026): when the holder has the key equipped AND any of the
 * key's configured statuses is currently active (Support Boost I, the +30% Support Boost I
 * variant, or Support Boost II all satisfy "under the effect of Support Boost"), the holder is
 * IMMUNE to displacement effects applied by enemy units. The gate is purely read-only: it never
 * consumes, alters, extends, or refreshes Support Boost and has no effect on SB I/II damage or
 * activation. The MVP has no enemy displacement applier — this is the condition any such
 * application would be checked against (boundary, no speculative displacement infrastructure).
 */
export function displacementImmunityActive(unit: UnitState): boolean {
  const gate = (unit.equippedKeys ?? [])
    .map((kid) => unit.def?.fixedKeys.find((k) => k.id === kid))
    .find((k) => (k?.displacementImmunityWhenStatuses?.length ?? 0) > 0);
  if (!gate) return false;
  return gate.displacementImmunityWhenStatuses!.some((id) => unit.statuses.some((s) => s.statusId === id));
}

/** Damage + stability + Confectance-gain application for a single hit; fills the event's damage fields. */
function dealDamageHit(state: SimulationState, actor: UnitState, skill: SkillDefVariant, ev: LogEvent, opts?: { exposedOverride?: boolean }): number {
  const dummy = state.dummy;
  // GRID (2026): High Ground → Ground ADDS Exposed; otherwise the normal exposed state governs.
  const targetExposed = opts?.exposedOverride === true ? true : dummy.exposed;
  const { weaknesses, mult: weaknessMult, ammoExploited } = exploitedWeaknesses(dummy, skill);
  // AWU trigger fires BEFORE the hit resolves: the first exploiting attack already
  // benefits from its own 2 stacks (validated T1 = 616 / 105). Phase attacks are
  // gated out by the trigger data (requiresElements) — they neither gain nor benefit.
  grantStackOnWeaknessExploit(state, dummy, skill, ammoExploited);
  // FK5 (VALIDATED in-game 2026): "When a phase weakness is exploited using Common Rail, gains
  // Blazing Assault II for 2 turns." A PHASE-weakness exploit (weaknesses matching the skill's
  // element — ammo-only exploits never qualify) by the keyed skill (Common Rail = active1)
  // applies the key's self-statuses BEFORE any damage computation, so the triggering hit
  // already uses the +15% ATK (validated 2000 → 2300 → 1435). Data-driven via the key def.
  const phaseExploited = weaknesses.some((w) => w === skill.element);
  if (phaseExploited) {
    const hook = (actor.equippedKeys ?? [])
      .map((kid) => actor.def?.fixedKeys.find((k) => k.id === kid))
      .find((k) => k?.phaseWeaknessExploitStatuses && actor.def?.skills[k.phaseWeaknessExploitStatuses.ability as keyof NonNullable<typeof actor.def.skills>]?.id === skill.id)
      ?.phaseWeaknessExploitStatuses;
    for (const spec of hook?.statuses ?? []) {
      if (applyStatus(state, actor, { ...spec, applier: { id: actor.id, atk: actor.panelAtk }, source: "qiongjiu-fk5-necessary-adjustments" })) {
        ev.statusesApplied.push(spec.statusId);
      }
    }
  }
  const phaseMult = phaseMultiplier(skill.element, dummy.phase);
  // Ruined Gem (VALIDATED in-game 2026): on SUPPORT ACTIONS only, when the target currently has
  // the key-declared status (Overburn = the Burn debuff), add the key's value to the SAME
  // additive bucket (0.20+0.20+0.10+0.15 = 1.65 → 934 validated). No separate multiplier; never
  // applies to own-turn attacks; no duration/stacking/activation inferred.
  const expKey = actor.def?.expansionKey;
  const expBonusTerm =
    ev.supportAttack && expKey && actor.expansionKeyId === expKey.id && expKey.supportTargetStatusDealtBonus && dummy.statuses.some((s) => s.statusId === expKey.supportTargetStatusDealtBonus!.statusId)
      ? expKey.supportTargetStatusDealtBonus.value
      : 0;
  const addDealt =
    additiveDealtBonus(actor, state.statusRegistry, skill.element, { supportAttack: ev.supportAttack, targetExposed }) +
    conditionalDealtBonus(actor, dummy, "target.noCover", ev.supportAttack) +
    conditionalDealtBonus(actor, dummy, "always", ev.supportAttack) +
    // OUT-OF-TURN DAMAGE (Common Key: Strategic Negotiation +7%, VALIDATED in-game 2026): a panel
    // stat added whenever the damage occurs OUTSIDE the attacker's own turn. NOT a support-specific
    // modifier — in the MVP Support Actions are the only out-of-turn events, so `ev.supportAttack`
    // is the generic off-turn signal; any future out-of-turn event reuses it. It lands in the SAME
    // additive bracket as QJ's passive 10% Out-of-Turn Damage (validated 1.10 → 1.17 with the key).
    (ev.supportAttack ? actor.outOfTurnDmg : 0) +
    expBonusTerm;
  const targetMods = targetPassiveTakenMods(dummy); // U5 boss/target stability-conditional passives
  const addTaken = additiveTakenBonus(dummy, state.statusRegistry, skill.element) + targetMods.additive;
  // Effect provenance (2026): deduplicated, human-readable sources of the modifiers that
  // contributed to this hit's buckets — a source (ability/passive/key) and its resulting
  // effect are ONE modifier, never double-counted just because both names appear.
  const sources = new Set<string>();
  const sourceRefs = new Map<string, EffectSourceRef>();
  const addSource = (label: string, ref: EffectSourceRef): void => {
    if (sources.has(label)) return;
    sources.add(label);
    sourceRefs.set(label, ref);
  };
  for (const s of actor.statuses) {
    const def = state.statusRegistry.get(s.statusId);
    if (!def) continue;
    const contributes = def.effects.some(
      (e) =>
        (e.kind === "damage_modifier" && e.scope === "dealt" && e.mode === "additive" && !(e.actions === "support" && !ev.supportAttack)) ||
        (e.kind === "stack_tier_modifier" && e.scope === "dealt"),
    );
    if (contributes) {
      const label = s.source ?? def.name;
      addSource(label, { kind: "status", statusId: s.statusId, label });
    }
  }
  for (const e of passiveEffects(actor)) {
    if (
      e.kind === "conditional_damage_modifier" &&
      e.scope === "dealt" &&
      e.mode === "additive" &&
      e.when !== "target.stabilityAboveZero" &&
      !(e.actions === "support" && !ev.supportAttack)
    ) {
      if (actor.def) {
        const label = passiveSourceLabel(actor.def, actor.passiveLevel);
        addSource(label, {
          kind: "passive",
          characterId: actor.def.id,
          passiveId: actor.def.passive.id,
          level: actor.passiveLevel,
          ...(fortificationV(actor.def, "passive", actor.passiveLevel) !== undefined
            ? { v: fortificationV(actor.def, "passive", actor.passiveLevel) }
            : {}),
          label,
        });
      } else {
        addSource("attacker passive", { kind: "passive", characterId: "", passiveId: "", level: actor.passiveLevel, label: "attacker passive" });
      }
    }
  }
  for (const s of dummy.statuses) {
    const def = state.statusRegistry.get(s.statusId);
    if (!def) continue;
    if (def.effects.some((e) => e.kind === "damage_modifier" && e.scope === "taken" && e.mode === "additive")) {
      const label = s.source ?? def.name;
      addSource(label, { kind: "status", statusId: s.statusId, label });
    }
  }
  if (targetMods.additive > 0) addSource("Target passive (DummyConfig)", { kind: "target", label: "Target passive (DummyConfig)" });
  if (sources.size > 0) {
    ev.effectSources = [...sources];
    ev.effectSourceRefs = [...sources].map((label) => sourceRefs.get(label)!);
  }
  const { mult, red } = multiplicativeTakenMods(dummy, state.statusRegistry);
  // no stability-cover reduction: dummy has no cover (Cover permanently out of scope)
  // U3: NO universal Exposed damage multiplier — the reduction chain contains none.
  const reductionMult = mult * red * targetMods.multiplicative;
  // Confirmed rule (U1 + U19): crit multiplier = 1 + attacker Crit DMG, where Crit DMG
  // includes any passive overflow conversion; effective Crit Rate caps at 100%.
  // configOverrides.critMultiplier is a test-only alternative hypothesis.
  const crit = resolveCritStats(statModifier(actor, state.statusRegistry, "critRate", actor.critRate), actor.critDmg, passiveEffects(actor));
  // Guide V2 (VALIDATED 2026): the target already carries `guaranteedCritWhenHasStatus` at
  // attack resolution ⇒ this attack's Crit Rate is +100% (always critical). Enforced through
  // the EXISTING crit machinery (rate = 1 ≤ the 100% cap ⇒ a normal crit with zero overflow,
  // bit-identical to the validated always-crit result); no permanent Crit Rate change.
  const critRate = skill.guaranteedCritWhenHasStatus !== undefined && dummy.statuses.some((s) => s.statusId === skill.guaranteedCritWhenHasStatus) ? 1 : crit.critRate;
  // GUIDE TO VICTORY targeting (VALIDATED 2026): with a grid, verify the selected cardinal
  // ray finds its FIRST enemy within the effective area; the (single) dummy receives the hit
  // exactly as before. Without a grid the default single-dummy path is unchanged.
  if (skill.targetingCardinalRay && state.grid) {
    const placement = state.grid.placements.get(actor.id);
    if (!placement) throw new Error(`guide targeting for ${actor.id} has no placement`);
    const t = resolveCardinalRayTarget(state.grid, placement.coord, skill.targetingCardinalRay.direction, skill.targetingCardinalRay.effectiveArea);
    if (!t) {
      throw new Error(
        `guide to victory: no enemy target within ${skill.targetingCardinalRay.effectiveArea} tiles ${skill.targetingCardinalRay.direction} of ${actor.id} (${placement.coord.x},${placement.coord.y})`,
      );
    }
  }
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
    critRate,
    critMultiplier: critMult,
    rng: state.rng,
  });
  // U21: normal chain and fixed component are both final game damage —
  //  finalDamage = ceil(normalChain) + ceil(fixed).
  const totalDamage = hit.finalDamage + hit.fixedDamage;
  const hpBefore = dummy.hp;
  dummy.hp = Math.max(0, dummy.hp - totalDamage);
  // V1 (VALIDATED 2026): a KILLING BLOW = THIS hit reduced the target from >0 to 0 HP —
  // transition-guarded so post-death follow-up hits are never misflagged.
  if (totalDamage > 0 && hpBefore > 0 && dummy.hp === 0) ev.killingBlow = true;
  // Validated 2026: Total Stability Damage = attack base stability damage
  //   + 2 × (# weaknesses exploited) — element AND ammo-tag matches both count
  //   (generic across phase-less/Phase; independent of the damage multiplier; AWU untouched).
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
  // Fixed Key 4: Point of Vulnerability (VALIDATED in-game 2026) — Guide line secondaries.
  // With the key equipped and a grid, the cardinal line CONTINUES through enemies; every
  // enemy AFTER the first takes `ceil(normalDamage × 0.70)` (its own DEF/weakness normal
  // damage; the −30% applies ONLY to secondary targets). Primary (the dummy, first in line)
  // already resolved above at 100%.
  if (skill.targetingCardinalRay && state.grid && (actor.equippedKeys ?? []).some((kid) => actor.def?.fixedKeys.some((f) => f.id === kid && f.pointOfVulnerabilityLine))) {
    guideLineSecondaryHits(state, actor, skill, ev, effAtk, 1 + addDealt, critRate, critMult);
  }
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
    // Fixed Key 3: Targeted Training (VALIDATED in-game 2026): before an ALLIED unit's main-action
    // damage resolves, if a Support-Mode-ready teammate holds the key, apply its Defense Down II
    // (1 turn) to the target FIRST — the allied hit then uses the reduced DEF (generic status).
    applyFixedKey3PreAttackDefDown(state, doll, ev);
    dealDamageHit(state, doll, skill, ev, { exposedOverride: highGroundExposes(state, doll) });
  }

  applySkillStatuses(state, doll, dummy, skill.appliesStatuses, ev, sourceLabel);
  // V1 (VALIDATED in-game 2026): skill-specific KILLING-BLOW self statuses — tied to THIS
  // skill's actual killing hit (ev.killingBlow), never to "any enemy died" (Common Rail Lv2:
  // +30% Support Boost variant). Applied AFTER the skill's normal statuses so the kill-upgrade
  // (replaces the +15% base) wins. Generic and data-driven; no character-ID conditionals.
  if (ev.killingBlow && skill.onKillStatuses) {
    applySkillStatuses(state, doll, dummy, skill.onKillStatuses, ev, sourceLabel);
  }
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
 * V5 (VALIDATED in-game 2026): immediately BEFORE an ally's damaging main action that would
 * trigger a support owner's Support Action (existing Steady Plan trigger), apply the owner's
 * resolved-ultimate `beforeSupportTrigger` statuses — Damage Up II to the owner (Qiongjiu) and
 * to the triggering ally. No new trigger, no Confectance coupling, generic (any future owner
 * may declare it). A damaging action (multiplier/fixedDamage > 0) plus owner quota left mirrors
 * the real trigger condition. Returns what was applied so the actor's event records provenance.
 */
function applyBeforeSupportTriggerStatuses(state: SimulationState, actor: UnitState, slot: ActionSlot): { statusId: string; source: string }[] {
  const skill = actor.skills[slot];
  const damaging = skill !== undefined && ((skill.multiplier ?? 0) > 0 || (skill.fixedDamage ?? 0) > 0);
  if (!damaging) return [];
  const applied: { statusId: string; source: string }[] = [];
  for (const owner of state.units) {
    if (owner.id === actor.id) continue;
    if (owner.supportQuota <= 0) continue;
    const hook = owner.skills.ultimate?.beforeSupportTrigger;
    if (!hook) continue;
    const label = abilitySourceLabel(owner.def!, "ultimate", owner.skillLevels.ultimate ?? 1);
    const pushStatus = (target: UnitState, spec: StatusApplySpec) => {
      const ok = applyStatus(state, target, {
        statusId: spec.statusId,
        stacks: spec.stacks,
        durationRounds: spec.durationRounds,
        source: spec.source ?? label,
        applier: { id: owner.id, atk: owner.panelAtk },
      });
      if (ok) applied.push({ statusId: spec.statusId, source: label });
    };
    for (const spec of hook.owner ?? []) pushStatus(owner, spec);
    for (const spec of hook.triggeringAlly ?? []) pushStatus(actor, spec);
  }
  return applied;
}

/**
 * GRID (2026): High Ground attacker vs Ground target → the target counts as EXPOSED for that
 * attack (existing Exposed pipeline; same-height / unresolved Ground→High = no effect).
 */
function highGroundExposes(state: SimulationState, actor: UnitState): boolean {
  const placement = state.grid?.placements.get(actor.id);
  if (!placement) return false; // no grid / unplaced unit → no height interaction
  const attackerHeight = placement.height ?? "ground";
  const targetHeight = state.grid!.boss.height ?? "ground";
  return attackHeightEffect(attackerHeight, targetHeight) === "exposed";
}

/**
 * GRID (2026): apply a scripted pre-action move (deterministic — no movement AI).
 * Validates legality with the pure grid API; throws on any illegal move. Action → move is
 * impossible by construction (moves are only applied here, before the unit's action).
 */
function applyScriptedMove(state: SimulationState, doll: UnitState, round: number): boolean {
  const move = state.grid?.moves?.find((m) => m.unitId === doll.id && m.round === round);
  if (!move) return false;
  const grid = state.grid!;
  const placement = grid.placements.get(doll.id);
  if (!placement) throw new Error(`grid move for ${doll.id} has no placement`);
  const mobility = doll.def?.mobility ?? 0;
  if (mobility <= 0) throw new Error(`grid move for ${doll.id} is illegal: Mobility ${mobility}`);
  const dests = legalDestinations(grid, placement.coord, mobility);
  const key = tileKey(move.to.x, move.to.y);
  if (!dests.has(key)) {
    throw new Error(
      `grid move for ${doll.id} to (${move.to.x},${move.to.y}) is illegal (cost ${moveCost(grid, placement.coord, move.to)}, Mobility ${mobility})`,
    );
  }
  const oldKey = tileKey(placement.coord.x, placement.coord.y);
  grid.allyTiles.delete(oldKey);
  grid.allyTiles.set(key, doll.id);
  grid.placements.set(doll.id, { ...placement, coord: { x: move.to.x, y: move.to.y } });
  return true;
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

/**
 * Fixed Key 3: Targeted Training (VALIDATED in-game 2026) — pre-allied-attack DEF Down.
 * Runs before an ALLIED unit's main-action damage resolves. For every OTHER doll that holds a
 * key with `alliedAttackDefDown` AND is Support-Mode-ready (an `onAllySingleTargetHit` support
 * passive with remaining quota — the MVP representation of "Support Mode"), applies that status
 * to the support target FIRST (1 turn), so the allied hit computes with the reduced DEF.
 * No DEF Down II on support hits, on the holder's own attacks, or when the holder is not ready.
 */
function applyFixedKey3PreAttackDefDown(state: SimulationState, triggerActor: UnitState, ev: LogEvent): void {
  for (const u of state.units) {
    if (u === triggerActor || u.kind !== "doll" || !u.def) continue;
    const keyDef = u.def.fixedKeys.find((f) => f.alliedAttackDefDown && u.equippedKeys.includes(f.id));
    if (!keyDef?.alliedAttackDefDown) continue;
    const ready = u.passives.some((e) => e.kind === "support_attack" && e.trigger === "onAllySingleTargetHit") && u.supportQuota > 0;
    if (!ready) continue;
    if (
      applyStatus(state, state.dummy, {
        statusId: keyDef.alliedAttackDefDown.statusId,
        durationRounds: keyDef.alliedAttackDefDown.durationRounds,
        target: "target",
      })
    ) {
      ev.statusesApplied.push(keyDef.alliedAttackDefDown.statusId);
    }
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
    // Fixed Key 2 — Efficient Planning (VALIDATED in-game 2026): cleanse `supportActionCleanse`
    // dispellable buff(s) from the support target IMMEDIATELY BEFORE the Support Action damage,
    // via the generic cleanse (StatusDef.purgeable). Nothing happens when none qualify; priority
    // across several qualifying buffs is the existing status-list order (unspecified by evidence).
    const cleanse = (shooter.equippedKeys ?? []).reduce((maxCount, kid) => {
      const fk = shooter.def?.fixedKeys.find((f) => f.id === kid);
      return fk?.supportActionCleanse ? Math.max(maxCount, fk.supportActionCleanse) : maxCount;
    }, 0);
    if (cleanse > 0) {
      const removed = cleanseDispellable(dummy, state.statusRegistry, cleanse);
      if (removed.length > 0) (ev.statusesExpired ??= []).push(...removed);
    }
    // Ruined Gem (VALIDATED in-game 2026): an equipped expansion key's `supportElementOverride`
    // resolves this SUPPORT hit with an EFFECTIVE element (Burn) — a local copy of the skill; the
    // base support-skill element (qiongjiu_support null) is never mutated, and no other ability is
    // affected (Guide's active Burn element is its own, unrelated).
    const expansionSkill =
      shooter.def?.expansionKey && shooter.expansionKeyId === shooter.def.expansionKey.id && shooter.def.expansionKey.supportElementOverride
        ? { ...skill, element: shooter.def.expansionKey.supportElementOverride }
        : skill;
    dealDamageHit(state, shooter, expansionSkill, ev, { exposedOverride: highGroundExposes(state, shooter) });
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
 * `requiresElements` (AWU data: phase-less attacks only — `[null]`; Phase/elemental
 * exploits neither receive the bonus nor advance stacks). firstGain / gainPerEvent /
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
      // GRID (2026): movement occurs BEFORE the action; action → move is impossible
      // (moves are only applied here); a unit may move and then voluntarily end its turn.
      if (applyScriptedMove(state, doll, round)) {
        const m = state.grid!.moves!.find((x) => x.unitId === doll.id && x.round === round);
        if (m!.endTurnWithoutAction) {
          endOfOwnTurn(state, doll);
          continue;
        }
      }
      const { slot, k } = pickAction(state, doll);
      // V5 (VALIDATED in-game 2026): immediately BEFORE an ally's damaging main action that will
      // trigger the support owner's Support Action, apply the owner's `beforeSupportTrigger`
      // statuses — Damage Up II to the owner (Qiongjiu) and to the triggering ally — so the
      // triggering attack and the ensuing Support Action both benefit. Uses the EXISTING trigger
      // sequence; no new trigger; no Confectance coupling.
      const preApplied = applyBeforeSupportTriggerStatuses(state, doll, slot);
      const ev = resolveMainAction(state, doll, slot, k, ++turn);
      for (const p of preApplied) {
        ev.statusesApplied.push(p.statusId);
        (ev.appliedSources ??= []).push({ statusId: p.statusId, source: p.source });
      }
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