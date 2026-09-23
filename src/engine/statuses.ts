import type { Element, StatusApplySpec } from "../model/types.js";
import type { ActiveStatus } from "../model/runtime.js";
import type { EffectiveStatusDef, SimulationState, UnitState } from "./state.js";
import { weaponCalibration } from "./state.js";

/**
 * GENERIC CLEANSE (2026, FK2 Efficient Planning): remove up to `max` statuses from `target`
 * whose definitions are `purgeable` (dispellable), in the target's existing status-list order.
 * Statuses with `purgeable: false` (e.g. Overburn, Support Boost) are never removed; statuses
 * without a registry entry are left untouched. Returns the removed status ids. Selection
 * priority when several buffs qualify is deliberately UNSPECIFIED (not evidence-constrained —
 * no priority rule is invented beyond the existing list order).
 */
export function cleanseDispellable(target: UnitState, statusRegistry: Map<string, EffectiveStatusDef>, max: number): string[] {
  const removed: string[] = [];
  if (max <= 0) return removed;
  for (let i = target.statuses.length - 1; i >= 0 && removed.length < max; i--) {
    const s = target.statuses[i];
    const def = statusRegistry.get(s.statusId);
    if (!def || !def.purgeable) continue;
    target.statuses.splice(i, 1);
    removed.push(s.statusId);
  }
  return removed;
}

/** Status expiry bookkeeping. Tick timing is CONFIRMED (U7, in-game 2026-09-03: normal timed buffs tick at the recipient's action end); the tick point stays config-overridable per scenario for alternative testing. Returns true when a NEW active status was created. */
export function applyStatus(state: SimulationState, target: UnitState, spec: StatusApplySpec): boolean {
  const def = state.statusRegistry.get(spec.statusId);
  if (!def) throw new Error(`Unknown status: ${spec.statusId}`);
  // Cross-buff relations (VALIDATED 2026, Support Boost I/II): a status listed in `blockedBy`
  // that is currently active BLOCKS this application entirely (SB II blocks SB I).
  if (def.blockedBy && def.blockedBy.some((id) => target.statuses.some((s) => s.statusId === id))) {
    return false;
  }
  // Applied duration = per-status config override (validation mode) else the skill's spec.
  // Permanent statuses (def.durationRounds === null) never tick (tickStatuses skips them).
  const dur = def.effectiveDurationRounds ?? spec.durationRounds ?? (def.durationRounds === null ? Infinity : def.durationRounds);
  const stacks = spec.stacks ?? 1;
  const cap = (n: number) => (def.maxStacks === undefined ? n : Math.min(def.maxStacks, n)); // absent maxStacks = unbounded
  // Applying this status REPLACES the listed statuses (SB II removes all SB I stacks).
  if (def.replaces && def.replaces.length > 0) {
    target.statuses = target.statuses.filter((s) => !def.replaces!.includes(s.statusId));
  }
  const existing = target.statuses.find((s) => s.statusId === spec.statusId);
  if (existing) {
    // Re-apply: refresh duration; stack if stackable — CONFIRMED (U8, in-game 2026-09-03,
    // Attack Up II): same-tier reapplication refreshes the duration and does NOT add a stack.
    existing.durationLeft = Math.max(existing.durationLeft, dur);
    if (def.stackable) existing.stacks = cap(existing.stacks + stacks);
    return false;
  } else {
    const active = { statusId: spec.statusId, stacks: cap(stacks), durationLeft: dur, applier: spec.applier, source: spec.source };
    target.statuses.push(active);
    // WEAPON EFFECT — Charging (Golden Melody, VALIDATED in-game 2026): when the unit GAINS A
    // BUFF (a NEW buff application — refreshes of an already-held buff do not re-trigger), a
    // weapon whose resolved calibration declares `charging` grants `stacksPerGain` charges
    // (Activations: C1–C4 = 1, C5–C6 = 2), capped by the calibration's maxStacks. Data-driven
    // and generic (only the HOLDER's own weapon matters; allies/dummy without one are
    // unaffected); NOT an invented event system.
    if (target.def && def.category === "buff") {
      const wcal = weaponCalibration(target.weapon, target.weaponCalibrationLevel);
      if (wcal?.charging) {
        target.weaponCharges = Math.min(wcal.charging.maxStacks, (target.weaponCharges ?? 0) + (wcal.charging.stacksPerGain ?? 1));
      }
    }
    return true;
  }
}

/**
 * Consumption-of-use (Support Boost I/II "Activates 1 time", VALIDATED 2026):
 * each qualifying damage event the status contributes to consumes exactly ONE STACK
 * (stacks = activations; e.g. 2 stacks + one Support Action → 1 stack), and the
 * status is removed when the last stack is consumed. Only Support-Action-scoped
 * events consume; Basic Attacks and other non-qualifying hits never do.
 * Returns the ids of statuses that expired.
 */
export function consumeOneOnUseStacks(state: SimulationState, unit: UnitState, supportAttack: boolean): string[] {
  const expired: string[] = [];
  for (const s of [...unit.statuses]) {
    const def = state.statusRegistry.get(s.statusId);
    if (!def || !def.consumeOneOnUse) continue;
    // Only statuses that actually contributed to THIS event consume a stack.
    const contributed = def.effects.some(
      (e) => e.kind === "damage_modifier" && e.scope === "dealt" && !(e.actions === "support" && !supportAttack),
    );
    if (!contributed) continue;
    const left = s.stacks - 1;
    if (left <= 0) {
      unit.statuses = unit.statuses.filter((x) => x !== s);
      expired.push(s.statusId);
    } else {
      s.stacks = left;
    }
  }
  return expired;
}

/**
 * Tick durations for one unit. `ownActionEnd`: decremented at the end of the
 * OWNER's action phase (CONFIRMED for normal timed buffs — U7, in-game 2026-09-03;
 * and for SELF-applied buffs, in-game 2026: a buff a unit applies to itself is
 * ticked at the END of that same action — e.g. Positive Charge 3 → 2 at the
 * caster's action end; the old same-action skip was removed). `onTick` (optional)
 * fires per status right before it is decremented — used for status-sourced
 * fixed damage on the tick (Overburn, 2026) including the finally-expiring tick.
 */
export function tickStatuses(
  state: SimulationState,
  unit: UnitState,
  at: "ownActionEnd" | "roundEnd",
  onTick?: (state: SimulationState, unit: UnitState, def: EffectiveStatusDef, active: ActiveStatus) => void,
): string[] {
  const expired: string[] = [];
  const isRoundEnd = at === "roundEnd";
  for (const s of unit.statuses) {
    const def = state.statusRegistry.get(s.statusId);
    if (!def) continue;
    const matches = isRoundEnd ? def.tickAt === "roundEnd" : def.tickAt === "ownActionEnd";
    if (!matches) continue;
    if (def.durationRounds === null && def.effectiveDurationRounds === undefined) continue; // permanently-applied (never ticks)
    if (onTick) onTick(state, unit, def, s);
    s.durationLeft -= 1;
    if (s.durationLeft <= 0) expired.push(s.statusId);
  }
  if (expired.length > 0) {
    unit.statuses = unit.statuses.filter((s) => !expired.includes(s.statusId));
  }
  return expired;
}

/** Σ additive damage-dealt bonuses from the unit's own statuses (tier effects gated on the hit element).
 *  `ctx.supportAttack` distinguishes a Support Action so `actions: "support"` modifiers apply only there;
 *  `ctx.targetExposed` gates `whenTarget: "exposed"` bonuses (Support Boost I's +10% vs Exposed, 2026). */
export function additiveDealtBonus(
  unit: UnitState,
  statusRegistry: Map<string, EffectiveStatusDef>,
  element: Element | null,
  ctx: { supportAttack: boolean; targetExposed: boolean },
): number {
  let sum = 0;
  for (const s of unit.statuses) {
    const def = statusRegistry.get(s.statusId);
    if (!def) continue;
    for (const e of def.effects) {
      if (e.kind === "damage_modifier" && e.scope === "dealt" && e.mode === "additive") {
        if (e.actions === "support" && !ctx.supportAttack) continue;
        if (e.whenTarget === "exposed" && !ctx.targetExposed) continue;
        // scaleWithStacks === false → the bonus applies ONCE per status (Support Boost I:
        // stacks are remaining activations, NOT a magnitude multiplier — VALIDATED 2026).
        sum += def.scaleWithStacks === false ? e.value : e.value * s.stacks;
      }
      if (e.kind === "stack_tier_modifier" && e.scope === "dealt") {
        if (e.when && e.when.element && !e.when.element.includes(element)) continue;
        sum += tierValue(e.tiers, s.stacks);
      }
    }
  }
  return sum;
}

/** Σ additive damage-taken bonuses from the target's own statuses (tier effects gated on the hit element). */
export function additiveTakenBonus(unit: UnitState, statusRegistry: Map<string, EffectiveStatusDef>, element: Element | null): number {
  let sum = 0;
  for (const s of unit.statuses) {
    const def = statusRegistry.get(s.statusId);
    if (!def) continue;
    for (const e of def.effects) {
      if (e.kind === "damage_modifier" && e.scope === "taken" && e.mode === "additive") {
        sum += e.value * s.stacks;
      }
      if (e.kind === "stack_tier_modifier" && e.scope === "taken") {
        if (e.when && e.when.element && !e.when.element.includes(element)) continue;
        sum += tierValue(e.tiers, s.stacks);
      }
    }
  }
  return sum;
}

/**
 * Σ defense-ignore fractions from the unit's own statuses (Domain Penetration I,
 * VALIDATED in-game tooltip 2026): summed `def_ignore.value` for effects whose
 * `aoe` flag matches the CURRENT attack's category (`isAoE` = `damageCategory === "aoe"`).
 * The caller applies `DEF × (1 − Σ)` inside the existing defense term of the normal
 * chain — never fixed damage / stability / weakness / crit / reductions. Attacker-side.
 */
export function defIgnore(unit: UnitState, statusRegistry: Map<string, EffectiveStatusDef>, isAoE: boolean): number {
  let sum = 0;
  for (const s of unit.statuses) {
    const def = statusRegistry.get(s.statusId);
    if (!def) continue;
    for (const e of def.effects) {
      if (e.kind === "def_ignore" && e.aoe === isAoE) sum += e.value;
    }
  }
  return sum;
}

/**
 * Non-linear per-stack tier lookup (Ammo Weakness Upgrade, validated 2026):
 * exact tier for the stack count; stacks above the highest tier stay at the top
 * tier; stacks below the lowest tier contribute 0. Data-driven — no hardcoded
 * 2/1/5 or 7/11/17/25 logic in the engine.
 */
export function tierValue(tiers: Record<number, number>, stacks: number): number {
  const keys = Object.keys(tiers)
    .map(Number)
    .sort((a, b) => a - b);
  if (keys.length === 0) return 0;
  let best = 0;
  for (const k of keys) {
    if (k > stacks) break;
    best = tiers[k];
  }
  return best;
}

/**
 * Effective combat stat from active `stat_modifier` status effects (2026):
 *   effective = (baseStat + Σ flat) × (1 + Σ pct)
 * ATK/HP/DEF are rounded UP (validated 2026 — e.g. ATK Up II: 1933 × 1.15 =
 * 2222.95 → 2223); CritRate stays continuous (no established integer rule).
 * Only the stat fields declared by the type are consumed; character/weapon
 * data and out-of-combat panel rules are untouched.
 */
export function statModifier(
  unit: UnitState,
  statusRegistry: Map<string, EffectiveStatusDef>,
  stat: "atk" | "def" | "hp" | "critRate",
  base: number,
): number {
  let flat = 0;
  let pct = 0;
  for (const s of unit.statuses) {
    const def = statusRegistry.get(s.statusId);
    if (!def) continue;
    for (const e of def.effects) {
      if (e.kind !== "stat_modifier" || e.stat !== stat) continue;
      if (e.mode === "flat") flat += e.value * s.stacks;
      else pct += e.value * s.stacks;
    }
  }
  // No modifiers → preserve the exact base/panel value (no spurious rounding).
  if (flat === 0 && pct === 0) return base;
  const combined = (base + flat) * (1 + pct);
  return stat === "critRate" ? combined : Math.ceil(Math.round(combined * 1e6) / 1e6);
}

/**
 * Fixed DMG modifier chain for FIXED damage ONLY (validated 2026):
 *   fixed = ceil(scaling × (1 + Σ applier-side Fixed DMG Buffs) × (1 − Σ holder-side Final DMG Reduction))
 * Buff and reduction are DISTINCT buckets (fixed_dmg_modifier) — ordinary
 * damage increase/reduction never enter this product. Reduction effects are
 * SUMMED (source: "Final DMG Reduction = sum of enemy final DMG reduction
 * effects") and clamped so the multiplier cannot go negative.
 */
export function fixedDmgMods(
  applier: UnitState | undefined,
  holder: UnitState,
  statusRegistry: Map<string, EffectiveStatusDef>,
): number {
  let buff = 0;
  for (const s of applier?.statuses ?? []) {
    const def = statusRegistry.get(s.statusId);
    if (!def) continue;
    for (const e of def.effects) {
      if (e.kind === "fixed_dmg_modifier" && e.mode === "buff") buff += e.value * s.stacks;
    }
  }
  let red = 0;
  for (const s of holder.statuses) {
    const def = statusRegistry.get(s.statusId);
    if (!def) continue;
    for (const e of def.effects) {
      if (e.kind === "fixed_dmg_modifier" && e.mode === "reduction") red += e.value * s.stacks;
    }
  }
  return (1 + buff) * Math.max(0, 1 - red);
}

/** Multiplicative taken modifiers (e.g. boss Stability passives, U5) or reductions. */
export function multiplicativeTakenMods(
  unit: UnitState,
  statusRegistry: Map<string, EffectiveStatusDef>,
): { mult: number; red: number } {
  let mult = 1;
  let red = 1;
  for (const s of unit.statuses) {
    const def = statusRegistry.get(s.statusId);
    if (!def) continue;
    for (const e of def.effects) {
      if (e.kind === "damage_modifier" && e.scope === "taken" && e.mode === "multiplicative") {
        mult *= Math.pow(e.value, s.stacks);
      }
      if (e.kind === "damage_reduction") red *= Math.pow(1 - e.value, s.stacks);
    }
  }
  return { mult, red };
}

