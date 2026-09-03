import type { Rng } from "./rng.js";

/**
 * Damage pipeline — the ONLY damage code path (docs/architecture.md §6).
 * Order per docs/research.md §3.1: raw → mitigated (defense) → additive bracket
 * → phase → weakness → reductions → crit → ceil → glancing.
 * The multiplicative factors commute algebraically; grouping is what matters.
 */
export interface HitInputs {
  atk: number;
  def: number;
  /** Fraction of final ATK (used unless fixedDamage is set). */
  multiplier: number;
  /** Fixed-damage branch: no crit, no defense (research §3.10). */
  fixedDamage?: number;
  /** Already includes the base 1: 1 + Σ additive bonuses. */
  additiveBonus: number;
  phaseMult: number;
  weaknessMult: number;
  /** ∏ reductions (stability-cover reduction, damage reduction, exposed bonus). */
  reductionMult: number;
  critRate: number;
  critMultiplier: number;
  glanceChance: number;
  rng: Rng;
}

export interface HitResult {
  baseDamage: number;
  mitigatedDamage: number;
  finalDamage: number;
  critical: boolean;
  glancing: boolean;
}

export function rollHit(i: HitInputs): HitResult {
  const isFixed = i.fixedDamage !== undefined;
  const raw = isFixed ? (i.fixedDamage as number) : i.atk * i.multiplier;
  // ATK/(1 + DEF/ATK) ≡ ATK²/(ATK+DEF); degrades to raw when DEF = 0.
  // Fixed-damage branch skips defense entirely (research §3.10).
  const mitigated = isFixed ? raw : i.def <= 0 ? raw : (raw * i.atk) / (i.atk + i.def);
  let dmg = mitigated * i.additiveBonus * i.phaseMult * i.weaknessMult * i.reductionMult;
  const critical = !isFixed && i.rng.chance(i.critRate);
  if (critical) dmg *= i.critMultiplier;
  // Guard against float noise before ceil (e.g. 1000 × 1.1 = 1100.0000000000001).
  const rounded = Math.round(dmg * 1e6) / 1e6;
  let finalDamage = Math.ceil(rounded);
  const glancing = i.rng.chance(i.glanceChance);
  if (glancing) finalDamage = Math.ceil(Math.round(finalDamage * 0.1 * 1e6) / 1e6); // research §3.6
  return { baseDamage: raw, mitigatedDamage: mitigated, finalDamage, critical, glancing };
}