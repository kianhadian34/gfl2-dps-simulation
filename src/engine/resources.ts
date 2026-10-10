import type { UnitState } from "./state.js";

/**
 * Event-driven Confectance resource (research §3.12): gains written in skill/passive data, cost settled after cast.
 *
 * EXTRA SLOTS (2026 — Vector's Perception Block Lv.3/V5): a character may own a SECOND Confectance
 * pool (`unit.extraConfectanceMax`, granted by `turn_start_confectance_drain.extraSlots`) that is
 * SEPARATE from the normal gauge. A gain that would push the normal gauge past `max` (U9 = 6) flows
 * into that pool instead, capped at its own capacity. `max` itself is NEVER raised — U9 is unchanged.
 */
export function gainConfectance(unit: UnitState, amount: number, max: number): void {
  if (amount <= 0) return;
  const total = unit.confectance + amount;
  unit.confectance = Math.min(max, total);
  // Overflow beyond the normal cap fills the SEPARATE extra pool (capacity 0 ⇒ no-op for everyone else).
  const overflow = total - max;
  if (overflow > 0 && unit.extraConfectanceMax > 0) {
    unit.extraConfectance = Math.min(unit.extraConfectanceMax, unit.extraConfectance + overflow);
  }
}

/**
 * Drain BOTH Confectance pools (normal gauge + extra slots) to 0 and return the total consumed.
 * Used by the at-max turn-start drain (`turn_start_confectance_drain`): the source states the holder
 * "consumes ALL points of Confectance Index", and clause 5 itself calls the extra points "points of
 * Confectance Index above the maximum", so the extras are consumed too.
 */
export function drainAllConfectance(unit: UnitState): number {
  const total = unit.confectance + unit.extraConfectance;
  unit.confectance = 0;
  unit.extraConfectance = 0;
  return total;
}

export function spendConfectance(unit: UnitState, cost: number): boolean {
  if (cost <= 0) return true;
  if (unit.confectance < cost) return false;
  unit.confectance -= cost;
  return true;
}