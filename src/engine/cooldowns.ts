import type { UnitState } from "./state.js";

/**
 * Cooldown model (research U11 — CONFIRMED in-game 2026-09-03):
 * a skill with cooldown N requires N full turns to pass after its cast turn:
 *   cast Turn N → unavailable Turn N+1 … → available Turn N+2 (for N=1).
 * Implemented as "nextOwnTurnEnd": the cooldown is set at cast and decremented
 * at the end of each of the actor's own turns — i.e. effectively cd+1 rounds.
 * - "nextOwnTurnEnd" (DEFAULT): confirmed behavior (cd-1 skips one round).
 * - "endOfOwnTurn": alternative hypothesis ("usable next turn") kept
 *   selectable via configOverrides.cooldownModel for testing only.
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