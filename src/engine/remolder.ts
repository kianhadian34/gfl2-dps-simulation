import type { Element, RemolderBuffDef, RemolderCategory, RemolderEffect, RemolderEffectGates, RemolderModifier, RemolderSetBonusDef } from "../model/types.js";

/**
 * PATTERN REMOLDER ENGINE (2026) — resolution layer.
 *
 * Responsibilities (pure, deterministic, no IO):
 *  - clamp user-supplied buff levels to each buff's max (level 0 = inactive, > max = clamp),
 *  - compute the four category totals (sum of active levels per category),
 *  - activate every qualifying per-character Set Bonus (requirements = totals only, all
 *    qualifying bonuses active simultaneously — Remolder is always level 60),
 *  - produce the resolved modifier list with source identity (buff/set bonus + level) so the
 *    combat pipeline consumes them via the EXISTING buckets (never a parallel formula),
 *  - expose Unity claims (strongest-level resolution at team level) and start-of-battle
 *    allied-% claims.
 */

export interface UnityClaim {
  label: string; // unity identity (buff id) — per buff, not per character
  stat: "atk" | "hp" | "def";
  value: number;
  /** The buff level that produced this claim — Unity resolves on the HIGHEST active LEVEL. */
  level: number;
}

export interface AlliedPctClaim {
  stat: "atk" | "hp" | "def";
  value: number;
  count: number;
}

export interface RemolderUnitPlan {
  /** Character-specific Lv.60 Remolder FLAT stats (separate source; absent = 0). */
  flat: { atk: number; hp: number; def: number };
  /** Active (clamped, >0) buffs with their resolved levels. */
  activeBuffs: { buffId: string; level: number; category: RemolderCategory }[];
  categoryTotals: Record<RemolderCategory, number>;
  activeSetBonusIds: string[];
  /** Self/conditional modifiers from buffs AND set bonuses (gates intact). */
  modifiers: RemolderModifier[];
  unityClaims: UnityClaim[];
  alliedPctClaims: AlliedPctClaim[];
  /** Self percentage-stat sums from buffs + set bonuses (existing panel chain). */
  selfPct: { atk: number; hp: number; def: number };
  critRate: number;
  critDmg: number;
  outOfTurnDmg: number;
}

export interface RemolderTeamGrants {
  /** Strongest Unity % granted TO this unit by allies (per stat). */
  unityPct: { atk: number; hp: number; def: number };
  /** Start-of-battle allied % granted TO this unit (strongest value, once). */
  alliedPct: { atk: number; hp: number; def: number };
}

export function emptyRemolderPlan(): RemolderUnitPlan {
  return {
    flat: { atk: 0, hp: 0, def: 0 },
    activeBuffs: [],
    categoryTotals: { bulwark: 0, vanguard: 0, support: 0, sentinel: 0 },
    activeSetBonusIds: [],
    modifiers: [],
    unityClaims: [],
    alliedPctClaims: [],
    selfPct: { atk: 0, hp: 0, def: 0 },
    critRate: 0,
    critDmg: 0,
    outOfTurnDmg: 0,
  };
}

/** Resolve one unit's Pattern Remolder from its supplied buff levels + character definitions. */
export function resolveRemolderUnit(
  buffLevels: Record<string, number> | undefined,
  buffDefs: RemolderBuffDef[],
  setBonusDefs: RemolderSetBonusDef[] | undefined,
  flat: { atk?: number; hp?: number; def?: number } | undefined,
): RemolderUnitPlan {
  const plan = emptyRemolderPlan();
  plan.flat = { atk: flat?.atk ?? 0, hp: flat?.hp ?? 0, def: flat?.def ?? 0 };
  const totals: Record<RemolderCategory, number> = { bulwark: 0, vanguard: 0, support: 0, sentinel: 0 };

  for (const [buffId, rawLevel] of Object.entries(buffLevels ?? {})) {
    if (rawLevel <= 0) continue; // level 0 = inactive
    const def = buffDefs.find((b) => b.id === buffId);
    if (!def) throw new Error(`Pattern Remolder: unknown buff "${buffId}" (not in Scenario.remolderBuffSet)`);
    const level = Math.min(rawLevel, def.maxLevel); // clamp to the buff's maximum
    const levelEffects = def.effects[level];
    if (!levelEffects) {
      throw new Error(
        `Pattern Remolder: buff "${buffId}" level ${level} has no effect table entry (available: ${Object.keys(def.effects).join(", ")})`,
      );
    }
    plan.activeBuffs.push({ buffId, level, category: def.category });
    totals[def.category] += level;
    const unityLevel = levelEffects.some((e) => e.kind === "unity");
    for (const effect of levelEffects) {
      // Unity strength marker (same-level stat_pct) is NOT a self-buff — it feeds the team grant.
      if (unityLevel && effect.kind === "stat_pct") continue;
      // Unity strength comes from the same level's stat_pct for the unity's stat.
      if (effect.kind === "unity") {
        const self = levelEffects.find((e): e is Extract<RemolderEffect, { kind: "stat_pct" }> => e.kind === "stat_pct" && e.stat === effect.stat);
        if (!self) throw new Error(`Pattern Remolder: unity "${effect.label}" level ${level} requires a same-level stat_pct for "${effect.stat}"`);
        plan.unityClaims.push({ label: effect.label, stat: effect.stat, value: self.value, level });
        continue;
      }
      pushEffect(plan, "buff", def.id, def.name, level, effect);
    }
  }
  plan.categoryTotals = totals;

  // Set Bonuses: activation from category totals only; ALL qualifying bonuses active together.
  for (const set of setBonusDefs ?? []) {
    const req = set.requires;
    if (totals.bulwark >= req.bulwark && totals.vanguard >= req.vanguard && totals.support >= req.support && totals.sentinel >= req.sentinel) {
      plan.activeSetBonusIds.push(set.id);
      for (const effect of set.effects) pushEffect(plan, "set_bonus", set.id, set.name, set.remolderLevel, effect);
    }
  }
  return plan;
}

function pushEffect(plan: RemolderUnitPlan, sourceType: "buff" | "set_bonus", sourceId: string, name: string, level: number, effect: RemolderEffect): void {
  switch (effect.kind) {
    case "additive_dealt":
    case "additive_taken":
    case "multiplicative_taken":
      plan.modifiers.push({ sourceType, sourceId, level, label: name, effect });
      return;
    case "stat_pct":
      plan.selfPct[effect.stat] += effect.value;
      return;
    case "crit_rate":
      plan.critRate += effect.value;
      return;
    case "crit_dmg":
      plan.critDmg += effect.value;
      return;
    case "out_of_turn_dmg":
      plan.outOfTurnDmg += effect.value;
      return;
    case "allied_stat_pct_battle_start":
      plan.alliedPctClaims.push({ stat: effect.stat, value: effect.value, count: effect.count });
      return;
    case "unity":
      // Handled during the buff scan (needs the same-level stat_pct); a set bonus with unity
      // is not part of the current source material.
      throw new Error(`Pattern Remolder: unity "${effect.label}" must come from a buff level, not ${sourceType} "${sourceId}"`);
  }
}

/**
 * TEAM-LEVEL resolution (2026). UNITY — CONFIRMED in-game (not an assumption):
 *  - Unity buffs do NOT stack; every active instance of the same unity COMPETES.
 *  - The HIGHEST active level takes effect; every lower level is ignored.
 *  - If two or more characters hold the SAME highest level, exactly ONE instance takes effect
 *    (tied instances never combine) ⇒ exactly one active instance per unity type.
 *  - That single winning instance is granted to every unit that does NOT itself hold a winning
 *    instance (the strongest owner's allies; weaker claimers are recipients).
 * Start-of-battle allied % claims (e.g. Blossom: top-`count` allied highest-ATK units) resolve
 * per owner; strongest value wins per target stat.
 * `rawAtk` = each unit's pre-affinity/common panel ATK (base + dispatch + remolder flat +
 * weapon flat+pct) — used only for the "highest attack" selection.
 */
export function resolveRemolderTeam(plans: RemolderUnitPlan[], rawAtk: number[]): RemolderTeamGrants[] {
  const n = plans.length;
  const grants: RemolderTeamGrants[] = plans.map(() => ({ unityPct: { atk: 0, hp: 0, def: 0 }, alliedPct: { atk: 0, hp: 0, def: 0 } }));

  // CONFIRMED RULE: the HIGHEST active unity LEVEL wins; ties resolve to exactly ONE instance;
  // lower levels are ignored and NEVER combine. Compared by level; the single winner is granted
  // to every unit that does NOT itself hold the winning level (Math.max = idempotent, no stacking).
  const strongest = new Map<string, { stat: "atk" | "hp" | "def"; value: number; level: number }>();
  for (const claim of plans.flatMap((p) => p.unityClaims)) {
    const cur = strongest.get(claim.label);
    if (cur === undefined || claim.level > cur.level) strongest.set(claim.label, { stat: claim.stat, value: claim.value, level: claim.level });
  }
  for (const [label, win] of strongest) {
    // Every unit holding the WINNING LEVEL is a claimer (tied instances grant nothing extra).
    const winners = new Set<number>();
    plans.forEach((p, i) => {
      if (p.unityClaims.some((c) => c.label === label && c.level === win.level)) winners.add(i);
    });
    for (let i = 0; i < n; i++) {
      if (winners.has(i)) continue;
      grants[i].unityPct[win.stat] = Math.max(grants[i].unityPct[win.stat], win.value);
    }
  }

  // Start-of-battle allied % (e.g. Blossom): per owner, top-count allied highest-ATK units.
  const alliedBest = new Map<"atk" | "hp" | "def", { value: number; count: number }>();
  plans.forEach((plan) => {
    for (const claim of plan.alliedPctClaims) {
      const cur = alliedBest.get(claim.stat);
      if (!cur || claim.value > cur.value) alliedBest.set(claim.stat, { value: claim.value, count: claim.count });
    }
  });
  const order = [...rawAtk.keys()].sort((a, b) => rawAtk[b] - rawAtk[a]);
  for (const [stat, best] of alliedBest) {
    plans.forEach((plan, ownerIdx) => {
      // Only owners that actually claim this % stat grant it (owner is never a target).
      if (!plan.alliedPctClaims.some((c) => c.stat === stat)) return;
      for (const ti of order.filter((i) => i !== ownerIdx).slice(0, best.count)) {
        grants[ti].alliedPct[stat] = Math.max(grants[ti].alliedPct[stat], best.value);
      }
    });
  }
  return grants;
}

/** Gate matching for a damage event (existing engine vocabulary). */
export function remolderGatesMatch(
  gates: RemolderEffectGates | undefined,
  ctx: { element: Element | null; supportAttack: boolean; targetExposed: boolean; isAoE: boolean },
): boolean {
  if (!gates) return true;
  if (gates.actions === "support" && !ctx.supportAttack) return false;
  if (gates.category !== undefined) {
    const matches = gates.category === "aoe" ? ctx.isAoE : !ctx.isAoE;
    if (!matches) return false;
  }
  if (gates.targetExposed === true && !ctx.targetExposed) return false;
  // Element dimension = OR: hit matches the element list OR is any-phase (Seedling:
  // "physical AND phase" = physical (element null) hits AND phase hits are both covered).
  if (gates.element !== undefined || gates.anyPhase === true) {
    const inList = gates.element !== undefined && gates.element.includes(ctx.element);
    const anyPhase = gates.anyPhase === true && ctx.element !== null;
    if (inList === false && anyPhase === false) return false;
  }
  if (gates.outOfTurn === true && !ctx.supportAttack) return false; // MVP: support actions are the only out-of-turn attacker
  return true;
}

interface RemolderUnitLike {
  remolder?: { modifiers: RemolderModifier[] };
}

/** Σ additive dealt from a unit's Remolder modifiers (existing additive DMG% bucket). */
export function remolderDealtBonus(
  unit: RemolderUnitLike,
  ctx: { element: Element | null; supportAttack: boolean; targetExposed: boolean; isAoE: boolean },
): number {
  let sum = 0;
  for (const mod of unit.remolder?.modifiers ?? []) {
    if (mod.effect.kind === "additive_dealt" && remolderGatesMatch(mod.effect.gates, ctx)) sum += mod.effect.value;
  }
  return sum;
}

/** Σ additive taken from a unit's Remolder modifiers (existing additive taken bucket). */
export function remolderTakenBonus(unit: RemolderUnitLike, element: Element | null): number {
  let sum = 0;
  for (const mod of unit.remolder?.modifiers ?? []) {
    if (mod.effect.kind === "additive_taken") {
      // additive_taken gates currently inspect element-level restrictions only (resistances are
      // implemented via multiplicative_taken); keep the same gate matcher for consistency.
      if (remolderGatesMatch(mod.effect.gates, { element, supportAttack: false, targetExposed: false, isAoE: false })) sum += mod.effect.value;
    }
  }
  return sum;
}

/** Σ multiplicative damage-taken REDUCTION from a unit's Remolder modifiers (incoming category + element gated). */
export function remolderReductionBonus(unit: RemolderUnitLike, element: Element | null, isAoE: boolean): number {
  let sum = 0;
  for (const mod of unit.remolder?.modifiers ?? []) {
    if (mod.effect.kind === "multiplicative_taken" && remolderGatesMatch(mod.effect.gates, { element, supportAttack: false, targetExposed: false, isAoE })) sum += mod.effect.value;
  }
  return sum;
}