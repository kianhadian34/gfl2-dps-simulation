import type { Rng } from "./rng.js";

/**
 * Damage pipeline — the ONLY damage code path (docs/architecture.md §6).
 * Order per docs/research.md §3.1: raw → mitigated (defense) → additive bracket
 * → phase → weakness → reductions → crit → ceil.
 * The multiplicative factors commute algebraically; grouping is what matters.
 *
 * Fixed Damage (U21, docs/research.md §3.1/§4): the absolute fixed component
 * bypasses EVERY normal-chain factor (DEF, crit, additive damage-buff bracket,
 * phase, weakness, reductions). It is independently ceiled and added
 * AFTER the normal chain:
 *     finalDamage = ceil(normalChain) + ceil(fixedDamage)
 * Representation: `fixedDamage` is an ALREADY-RESOLVED absolute value supplied
 * by data (SkillDef.fixedDamage); a skill is either normal-% or fixed — a
 * combined normal+fixed single hit is not representable in one roll (design:
 * such effects are separate events / statuses).
 */
export interface HitInputs {
  atk: number;
  def: number;
  /** Fraction of final ATK — the normal chain term (ignored when fixedDamage is set). */
  multiplier: number;
  /** Absolute fixed component (U21): added post-chain with its own ceil. */
  fixedDamage?: number;
  /** Already includes the base 1: 1 + Σ additive bonuses. */
  additiveBonus: number;
  phaseMult: number;
  weaknessMult: number;
  /** ∏ reductions (stability-cover reduction, damage reduction, exposed bonus). */
  reductionMult: number;
  critRate: number;
  critMultiplier: number;
  rng: Rng;
}

export interface HitResult {
  /** Normal-chain raw (atk × multiplier); 0 for fixed-only hits. */
  baseDamage: number;
  /** Normal-chain post-mitigation value; 0 for fixed-only hits. */
  mitigatedDamage: number;
  /** Independently ceiled Fixed Damage component (0 for normal-only hits). */
  fixedDamage: number;
  /** Final NORMAL-chain damage (ceiled, crits applied) — excludes fixedDamage. */
  finalDamage: number;
  critical: boolean;
}

export function rollHit(i: HitInputs): HitResult {
  const isFixed = i.fixedDamage !== undefined;
  const normalRaw = isFixed ? 0 : i.atk * i.multiplier;
  // ATK/(1 + DEF/ATK) ≡ ATK²/(ATK+DEF); degrades to raw when DEF = 0.
  const mitigated = isFixed ? 0 : i.def <= 0 ? normalRaw : (normalRaw * i.atk) / (i.atk + i.def);
  let dmg = isFixed ? 0 : mitigated * i.additiveBonus * i.phaseMult * i.weaknessMult * i.reductionMult;
  const critical = !isFixed && i.rng.chance(i.critRate);
  if (critical) dmg *= i.critMultiplier;
  // Guard against float noise before ceil (e.g. 1000 × 1.1 = 1100.0000000000001).
  const rounded = Math.round(dmg * 1e6) / 1e6;
  const finalDamage = isFixed ? 0 : Math.ceil(rounded);
  // U21: fixed component independent of every normal-chain factor; own ceil.
  const fixedDamage = isFixed ? Math.ceil(Math.round((i.fixedDamage as number) * 1e6) / 1e6) : 0;
  return { baseDamage: normalRaw, mitigatedDamage: mitigated, fixedDamage, finalDamage, critical };
}