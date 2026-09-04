import type { StatusApplySpec } from "../model/types.js";
import type { EffectiveStatusDef, SimulationState, UnitState } from "./state.js";

/** Status expiry bookkeeping. Tick timing is a model assumption (research U7), config-overridable per scenario. */
export function applyStatus(state: SimulationState, target: UnitState, spec: StatusApplySpec): void {
  const def = state.statusRegistry.get(spec.statusId);
  if (!def) throw new Error(`Unknown status: ${spec.statusId}`);
  // Applied duration = per-status config override (validation mode) else the skill's spec.
  const dur = def.effectiveDurationRounds ?? spec.durationRounds;
  const stacks = spec.stacks ?? 1;
  const existing = target.statuses.find((s) => s.statusId === spec.statusId);
  if (existing) {
    // Re-apply: refresh duration; stack if stackable (convention — research U8).
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
 * OWNER's action phase; statuses applied during that same action are skipped
 * (a 1-round status cast on turn N covers the owner's turn N+1).
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

/** Σ additive damage-dealt bonuses from the unit's own statuses. */
export function additiveDealtBonus(unit: UnitState, statusRegistry: Map<string, EffectiveStatusDef>): number {
  let sum = 0;
  for (const s of unit.statuses) {
    const def = statusRegistry.get(s.statusId);
    if (!def) continue;
    for (const e of def.effects) {
      if (e.kind === "damage_modifier" && e.scope === "dealt" && e.mode === "additive") {
        sum += e.value * s.stacks;
      }
    }
  }
  return sum;
}

/** Σ additive damage-taken bonuses from the target's own statuses. */
export function additiveTakenBonus(unit: UnitState, statusRegistry: Map<string, EffectiveStatusDef>): number {
  let sum = 0;
  for (const s of unit.statuses) {
    const def = statusRegistry.get(s.statusId);
    if (!def) continue;
    for (const e of def.effects) {
      if (e.kind === "damage_modifier" && e.scope === "taken" && e.mode === "additive") {
        sum += e.value * s.stacks;
      }
    }
  }
  return sum;
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