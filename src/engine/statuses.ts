import type { Element, StatusApplySpec } from "../model/types.js";
import type { EffectiveStatusDef, SimulationState, UnitState } from "./state.js";

/** Status expiry bookkeeping. Tick timing is CONFIRMED (U7, in-game 2026-09-03: normal timed buffs tick at the recipient's action end); the tick point stays config-overridable per scenario for alternative testing. */
export function applyStatus(state: SimulationState, target: UnitState, spec: StatusApplySpec): void {
  const def = state.statusRegistry.get(spec.statusId);
  if (!def) throw new Error(`Unknown status: ${spec.statusId}`);
  // Applied duration = per-status config override (validation mode) else the skill's spec.
  // Permanent statuses (def.durationRounds === null) never tick (tickStatuses skips them).
  const dur = def.effectiveDurationRounds ?? spec.durationRounds ?? (def.durationRounds === null ? Infinity : def.durationRounds);
  const stacks = spec.stacks ?? 1;
  const existing = target.statuses.find((s) => s.statusId === spec.statusId);
  if (existing) {
    // Re-apply: refresh duration; stack if stackable — CONFIRMED (U8, in-game 2026-09-03,
    // Attack Up II): same-tier reapplication refreshes the duration and does NOT add a stack.
    existing.durationLeft = Math.max(existing.durationLeft, dur);
    if (def.stackable) existing.stacks = Math.min(def.maxStacks, existing.stacks + stacks);
  } else {
    const active = { statusId: spec.statusId, stacks: Math.min(def.maxStacks, stacks), durationLeft: dur };
    target.statuses.push(active);
    state.appliedThisAction.push(active);
  }
}

/**
 * Tick durations for one unit. `ownActionEnd`: decremented at the end of the
 * OWNER's action phase (CONFIRMED for normal timed buffs — U7, in-game 2026-09-03);
 * statuses applied during that same action are skipped (a 1-round status cast on
 * turn N covers the owner's turn N+1).
 */
export function tickStatuses(state: SimulationState, unit: UnitState, at: "ownActionEnd" | "roundEnd"): string[] {
  const expired: string[] = [];
  const isRoundEnd = at === "roundEnd";
  for (const s of unit.statuses) {
    const def = state.statusRegistry.get(s.statusId);
    if (!def) continue;
    const matches = isRoundEnd ? def.tickAt === "roundEnd" : def.tickAt === "ownActionEnd";
    if (!matches) continue;
    if (!isRoundEnd && state.appliedThisAction.includes(s)) continue; // applied this action
    if (def.durationRounds === null) continue; // permanent
    s.durationLeft -= 1;
    if (s.durationLeft <= 0) expired.push(s.statusId);
  }
  if (expired.length > 0) {
    unit.statuses = unit.statuses.filter((s) => !expired.includes(s.statusId));
  }
  return expired;
}

/** Σ additive damage-dealt bonuses from the unit's own statuses (tier effects gated on the hit element). */
export function additiveDealtBonus(unit: UnitState, statusRegistry: Map<string, EffectiveStatusDef>, element: Element): number {
  let sum = 0;
  for (const s of unit.statuses) {
    const def = statusRegistry.get(s.statusId);
    if (!def) continue;
    for (const e of def.effects) {
      if (e.kind === "damage_modifier" && e.scope === "dealt" && e.mode === "additive") {
        sum += e.value * s.stacks;
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
export function additiveTakenBonus(unit: UnitState, statusRegistry: Map<string, EffectiveStatusDef>, element: Element): number {
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