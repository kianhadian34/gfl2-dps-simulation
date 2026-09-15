/**
 * FINAL STAT rounding.
 *
 *      Final Stat = ceil((Initial Stat + Flat Stat) × (1 + Stat%))
 *
 * Evidence classification:
 *  - Final-stat DISPLAY (integer ATK/DEF/HP): **Validated** — the game displays final
 *    stats as integers.
 *  - The ceil formula: **Mathematically Proven** — the engine implements it here, at the
 *    single final-stat production point (computePanel in state.ts), backed by the
 *    established stat formula and deterministic regression tests.
 *  - The exact HIDDEN rounding method: **Not Tested** — the game never exposes the
 *    fractional intermediate, so ceil vs another hidden rounding cannot be distinguished
 *    by direct in-game observation.
 *
 * In-combat stat modifiers (`statModifier` in statuses.ts) use the same ceil-consistent
 * rule family (ATK Up II 2223 / DEF Down II 3500). Intermediate damage math
 * (base/ratios/multipliers) is NOT globally ceiled.
 */
export function finalStat(base: number, flat: number, pct: number): number {
  return Math.ceil((base + flat) * (1 + pct));
}