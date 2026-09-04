import type { SimulationState, UnitState } from "./state.js";

/**
 * Stability is a separate resource from HP (research §3.7): per-hit fixed
 * stability damage, independent of ATK/DEF/crit. Break → Exposed window.
 *
 * Confirmed recovery rule (in-game 2026-09-03, research §3.7 / U6):
 *   stability breaks during turn N  →  restored at the start of turn N+2
 * (exactly 2 full rounds later), restoring stability to max.
 * The Exposed/Broken state is a pure STATE: there is NO generic Exposed damage
 * multiplier (U3 resolved — no universal modifier); it exists so Stability-
 * dependent boss passives can stop applying at stability 0 and future
 * character-specific Broken-target effects can condition on it.
 *
 * Expose triggers only on a real transition (stability > 0 → 0). A dummy
 * configured with stability 0 from the start never "breaks" — no invented
 * collapsed-at-start semantics.
 */
export const STABILITY_RECOVERY_DELAY = 2;

export function applyStabilityDamage(state: SimulationState, target: UnitState, amount: number): { broke: boolean } {
  if (amount <= 0) return { broke: false };
  const prev = target.stability;
  if (prev <= 0) return { broke: false };
  target.stability = Math.max(0, prev - amount);
  if (target.stability === 0 && !target.exposed) {
    target.exposed = true;
    target.exposedRoundsLeft = state.config.exposedDurationRounds; // U4 (CN beta value)
    target.stabilityRecoveryRoundsLeft = STABILITY_RECOVERY_DELAY; // U6 confirmed: 2-turn delay
    return { broke: true };
  }
  return { broke: false };
}

/**
 * Round-end: exposed-window expiry and the confirmed 2-turn recovery delay.
 * The delay ticks at the end of each round; when it elapses (start of round
 * N+2 for a break during round N) stability is restored to max and the
 * exposed state ends — matching the confirmed "break Turn 1 → restored Turn 3".
 */
export function endOfRoundStability(state: SimulationState): void {
  const d = state.dummy;
  if (d.exposed) {
    d.exposedRoundsLeft -= 1;
    if (d.exposedRoundsLeft <= 0) {
      d.exposed = false;
      d.exposedRoundsLeft = 0;
    }
  }
  if (d.stabilityRecoveryRoundsLeft > 0) {
    d.stabilityRecoveryRoundsLeft -= 1;
    if (d.stabilityRecoveryRoundsLeft === 0) {
      d.stability = d.maxStability; // confirmed: restored to max
      d.exposed = false;
      d.exposedRoundsLeft = 0;
    }
  }
}