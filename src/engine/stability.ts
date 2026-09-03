import type { SimulationState, UnitState } from "./state.js";

/**
 * Stability is a separate resource from HP (research §3.7): per-hit fixed
 * stability damage, independent of ATK/DEF/crit. Break → Exposed window.
 *
 * Rule chosen for the MVP: expose only triggers on a real transition
 * (stability > 0 → 0). A dummy configured with stability 0 from the start
 * never "breaks" — avoids inventing collapsed-at-start semantics (research §3.7).
 */
export function applyStabilityDamage(state: SimulationState, target: UnitState, amount: number): { broke: boolean } {
  if (amount <= 0) return { broke: false };
  const prev = target.stability;
  if (prev <= 0) return { broke: false };
  target.stability = Math.max(0, prev - amount);
  if (target.stability === 0 && !target.exposed) {
    target.exposed = true;
    target.exposedRoundsLeft = state.config.exposedDurationRounds; // U4 (CN beta value)
    return { broke: true };
  }
  return { broke: false };
}

/**
 * Round-end: exposed-window expiry and stability recovery.
 * Recovery amount is data-driven (DummyConfig.stabilityRecovery); when
 * stability returns above 0 the exposed state ends (research §3.7: recovery).
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
  if (d.stabilityRecoveryPerRound > 0 && d.stability < d.maxStability) {
    d.stability = Math.min(d.maxStability, d.stability + d.stabilityRecoveryPerRound);
  }
  if (d.exposed && d.stability > 0) {
    d.exposed = false;
    d.exposedRoundsLeft = 0;
  }
}