import type { UnitState } from "./state.js";

/**
 * Cooldown model (research U11 — model assumption): skill cooldown = the number
 * of full turns to wait; decremented at the end of the actor's own turn; the
 * use-turn is not counted (cooldown 1 → usable next round).
 */
export function setCooldown(unit: UnitState, skillId: string, cooldown: number): void {
  if (cooldown > 0) unit.cooldowns.set(skillId, cooldown);
}

export function cooldownRemaining(unit: UnitState, skillId: string): number {
  return unit.cooldowns.get(skillId) ?? 0;
}

export function tickCooldowns(unit: UnitState): void {
  for (const [id, v] of unit.cooldowns) {
    if (v > 0) unit.cooldowns.set(id, v - 1);
  }
}