import type { ApexChassisConfig, ApexComponentDef, ApexComponentStats } from "../model/types.js";

/**
 * APEX CHASSIS CONSUMPTION (2026) — the ONE part of the Heavy Ordnance Corps system this engine
 * adapts (user-directed scope). Everything else in HOC (Armed Echelons, HOC Rank, Base Components,
 * Peripheral Battlefield, skills/energy, ammo grades) is deliberately NOT modeled.
 *
 * The Apex Chassis is SCENARIO-LEVEL (account-wide): the guide states Apex Components are set on the
 * HOC Formation and their bonuses apply to the dolls regardless of the map, so one chassis serves
 * every team member.
 *
 * Two consumption paths, both using the EXISTING generic stat/damage infrastructure:
 *  1. ALWAYS-ON STATS — `atkPct`/`hpPct`/`defPct` fold into the same panel percentage buckets as
 *     every other source (no parallel stat system). All-Element Boost is RECORDED but INERT: it only
 *     acts through the RESMult formula (enemy RES / RESPierce / RESShred / Venomfire), which this
 *     engine does not model, so it never modifies damage here.
 *  2. SECONDARY EFFECT — its terms are additive in the EXISTING DMG% dealt bucket (same bucket as
 *     the attachment sets / weapon Effect / Common Keys — no separate multiplier). The weapon-type
 *     term matches only the dealer's OWN `CharacterDef.weaponType`; the weakness term matches when
 *     the hit EXPLOITS A WEAKNESS, following the authoritative `Weak = 1 + PhaseWeak + AmmoWeak`
 *     formula (an exploited PHASE weakness OR an exploited AMMO weakness both qualify).
 *
 * No mechanics are invented: components come from the DATA table, and unknown ids are ignored.
 */

/** Resolve one component definition by id (the registry lookup; unknown id → undefined). */
export type ApexComponentLookup = (id: string) => ApexComponentDef | undefined;

/** One RESOLVED equipped component: its definition + the validated enhancement level. */
export interface ResolvedApexComponent {
  def: ApexComponentDef;
  enhancement: number;
}

/** The hit context the Apex secondary effect is evaluated against (existing signals only). */
export interface ApexDamageContext {
  /** The DEALER's own weapon type (`CharacterDef.weaponType`); undefined = none declared. */
  weaponType: string | undefined;
  /** TRUE when the hit exploits a weakness — phase OR ammo (see `exploitedWeaknesses`). */
  weaknessExploited: boolean;
}

/** Apply an enhancement level to a base stat block (Enhance N adds (N-1) × increment). */
function enhanced(base: number | undefined, increment: number | undefined, enhancement: number): number {
  const b = base ?? 0;
  const inc = increment ?? 0;
  // Round to kill IEEE drift: the increments are exact decimals (0.1% / 0.2% / +5 / +10), so
  // e.g. 0.025 + 5×0.001 must be exactly 0.03, not 0.030000000000000002.
  return Math.round((b + Math.max(0, enhancement - 1) * inc) * 1e6) / 1e6;
}

/** Enhanced stat block of one equipped component (Enhance 1 = the recorded base values). */
export function enhancedApexStats(def: ApexComponentDef, enhancement: number): ApexComponentStats {
  return {
    atkPct: enhanced(def.stats.atkPct, def.statIncrement.atkPct, enhancement),
    hpPct: enhanced(def.stats.hpPct, def.statIncrement.hpPct, enhancement),
    defPct: enhanced(def.stats.defPct, def.statIncrement.defPct, enhancement),
    allElementBoost: enhanced(def.stats.allElementBoost, def.statIncrement.allElementBoost, enhancement),
  };
}

/**
 * Resolve + VALIDATE an Apex Chassis config into concrete component defs (2026). Rules (guide): up
 * to 2 Apex Components equipped, at most ONE per `type`, each with an enhancement level in
 * 1..its `maxEnhancement`. Rejected LOUDLY — a bad config is never silently dropped or clamped.
 */
export function resolveApexChassis(
  config: ApexChassisConfig | undefined,
  lookup: ApexComponentLookup,
): ResolvedApexComponent[] {
  const components = config?.components ?? [];
  if (components.length > 2) {
    throw new Error(`Apex Chassis: at most 2 Apex Components may be equipped (got ${components.length})`);
  }
  const out: ResolvedApexComponent[] = [];
  const seenTypes = new Set<string>();
  for (const equipped of components) {
    const def = lookup(equipped.componentId);
    if (!def) throw new Error(`Apex Chassis: unknown Apex Component: ${equipped.componentId}`);
    if (seenTypes.has(def.type)) {
      throw new Error(`Apex Chassis: only ONE Apex Component of a given type may be equipped (duplicate type "${def.type}")`);
    }
    seenTypes.add(def.type);
    if (!Number.isInteger(equipped.enhancement) || equipped.enhancement < 1 || equipped.enhancement > def.maxEnhancement) {
      throw new Error(
        `Apex Chassis: component "${def.id}" enhancement must be an integer in 1..${def.maxEnhancement} (got ${equipped.enhancement})`,
      );
    }
    out.push({ def, enhancement: equipped.enhancement });
  }
  return out;
}

/**
 * Σ always-on Apex stat grants for the whole team (scenario-level). `allElementBoost` is returned so
 * it can be RECORDED/surfaced, but it is INERT — the caller must NOT fold it into any damage term.
 */
export function apexStatTotals(components: readonly ResolvedApexComponent[]): ApexComponentStats {
  const total: ApexComponentStats = { atkPct: 0, hpPct: 0, defPct: 0, allElementBoost: 0 };
  for (const { def, enhancement } of components) {
    const s = enhancedApexStats(def, enhancement);
    total.atkPct! += s.atkPct ?? 0;
    total.hpPct! += s.hpPct ?? 0;
    total.defPct! += s.defPct ?? 0;
    total.allElementBoost! += s.allElementBoost ?? 0;
  }
  return total;
}

/**
 * Σ additive DMG% dealt contributed by the Apex Chassis secondary effects for this hit (0 when no
 * chassis, no matching term). Consumed by the EXISTING `addDealt` bucket in `dealDamageHit`.
 */
export function apexDealtBonus(components: readonly ResolvedApexComponent[], ctx: ApexDamageContext): number {
  let sum = 0;
  for (const { def } of components) {
    const eff = def.secondaryEffect;
    if (!eff) continue;
    // Weapon-type term: only when the dealer's own weapon type matches.
    if (eff.weaponTypeTerm && ctx.weaponType !== undefined && eff.weaponTypeTerm.weaponType === ctx.weaponType) {
      sum += eff.weaponTypeTerm.value;
    }
    // Weakness-exploit term: phase OR ammo weakness exploited (authoritative `Weak` formula).
    if (eff.weaknessExploitValue !== undefined && ctx.weaknessExploited) {
      sum += eff.weaknessExploitValue;
    }
  }
  // Round to kill IEEE drift (0.05 + 0.07 must be exactly 0.12, not 0.12000000000000001) — the
  // source values are exact decimals.
  return Math.round(sum * 1e6) / 1e6;
}
