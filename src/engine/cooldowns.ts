import type { UnitState } from "./state.js";

/**
 * Cooldown model (research U11 — model assumption, overridable per scenario):
 * - "endOfOwnTurn" (default): cooldown = full turns to wait; decrement at the
 *   end of the actor's own turn; the use-turn is not counted (cd-1 usable next round).
 * - "nextOwnTurnEnd": cooldown behaves as cd+1 (cd-1 skips one round).
 */
export type CooldownModel = "endOfOwnTurn" | "nextOwnTurnEnd";

export function setCooldown(unit: UnitState, skillId: string, cooldown: number, model: CooldownModel): void {
  if (cooldown <= 0) return;
  unit.cooldowns.set(skillId, model === "nextOwnTurnEnd" ? cooldown + 1 : cooldown);
}

export function cooldownRemaining(unit: UnitState, skillId: string): number {
  return unit.cooldowns.get(skillId) ?? 0;
}

export function tickCooldowns(unit: UnitState): void {
  for (const [id, v] of unit.cooldowns) {
    if (v > 0) unit.cooldowns.set(id, v - 1);
  }
}