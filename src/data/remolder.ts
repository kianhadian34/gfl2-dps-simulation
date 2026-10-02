import type { RemolderBuffDef, RemolderEffect, RemolderEffectGates, RemolderSetBonusDef } from "../model/types.js";

/**
 * PATTERN REMOLDER (2026, "flower system") — data layer.
 *
 * The engine receives only the RESULTING buff levels the user selected (never the flowers).
 * Remolder level is ALWAYS treated as 60, so all six Set Bonuses are eligible.
 *
 * Level tables below are transcribed VERBATIM from the authoritative source (Sentinel category
 * supplied 2026). Values are percentages as fractions (+0.8% → 0.008). No values are invented,
 * interpolated, or "corrected". `source` records the source NAME shown for that buff (recorded
 * data only — never a buff's in-game name and never consumed by the engine); it is omitted for
 * buffs whose source name was not supplied (Critical Boost, Follow-Up Strike, Headhunter).
 *
 * Bulwark / Vanguard / Support buff tables are NOT supplied yet (added in later tasks).
 */

/** Physical/elemental Boost — identical 5-level dealt-damage tables; only the gated element differs. */
function elementBoost(name: string, source: string, element: null | "burn" | "hydro" | "electric" | "freeze" | "corrosion"): RemolderBuffDef {
  const at = (v: number): RemolderEffect => ({ kind: "additive_dealt", value: v, gates: { element: [element] } });
  return {
    id: "remolder_sentinel_" + name.toLowerCase().replace(/ /g, "_"),
    name,
    category: "sentinel",
    source,
    maxLevel: 5,
    effects: { 1: [at(0.002)], 2: [at(0.005)], 3: [at(0.008)], 4: [at(0.011)], 5: [at(0.014)] },
  };
}

/** Same-shape dealt-bonus tables with a single gate (Sentinel damage gates). */
function table(values: number[], make: (v: number) => RemolderEffect): Record<number, RemolderEffect[]> {
  const out: Record<number, RemolderEffect[]> = {};
  values.forEach((v, i) => {
    out[i + 1] = [make(v)];
  });
  return out;
}
function dealt(values: number[], gates: RemolderEffectGates): Record<number, RemolderEffect[]> {
  return table(values, (v) => ({ kind: "additive_dealt", value: v, gates }));
}

/** Sentinel — all 15 buff definitions (authoritative source, 2026). */
export const SENTINEL_BUFFS: RemolderBuffDef[] = [
  // 1. Attack Boost — heaven Blossom. ATK% (existing stat percentage system).
  {
    id: "remolder_sentinel_attack_boost",
    name: "Attack Boost",
    category: "sentinel",
    source: "Heaven Blossom",
    maxLevel: 6,
    effects: table([0.008, 0.012, 0.022, 0.024, 0.032, 0.036], (v) => ({ kind: "stat_pct", stat: "atk", value: v })),
  },
  // 2. Critical Boost — source name not supplied (none invented). Crit rate (existing crit system).
  {
    id: "remolder_sentinel_critical_boost",
    name: "Critical Boost",
    category: "sentinel",
    maxLevel: 3,
    effects: table([0.01, 0.02, 0.03], (v) => ({ kind: "crit_rate", value: v })),
  },
  // 3–8. Physical / elemental dealt-damage boosts (element-gated additive dealt).
  elementBoost("Physical Boost", "Ballistic Ammo", null),
  elementBoost("Burn Boost", "Burn", "burn"),
  elementBoost("Hydro Boost", "Hydro", "hydro"),
  elementBoost("Electric Boost", "Electric", "electric"),
  elementBoost("Freeze Boost", "Freeze", "freeze"),
  elementBoost("Corrosion Boost", "Corrosion", "corrosion"),
  // 9. Thronebreaker — Crownsayer Blossom. Boss-target gated dealt bonus.
  {
    id: "remolder_sentinel_thronebreaker",
    name: "Thronebreaker",
    category: "sentinel",
    source: "Crownsayer Blossom",
    maxLevel: 6,
    effects: dealt([0.02, 0.025, 0.035, 0.04, 0.05, 0.055], { bossTarget: true }),
  },
  // 10. Raid Stance — Ambush. Out-of-turn dealt bonus (Support Actions are the MVP out-of-turn event).
  {
    id: "remolder_sentinel_raid_stance",
    name: "Raid Stance",
    category: "sentinel",
    source: "Ambush",
    maxLevel: 5,
    effects: dealt([0.002, 0.006, 0.011, 0.014, 0.018], { outOfTurn: true }),
  },
  // 11. Onslaught Stance — Aggressive Attack. Active-skill dealt bonus.
  {
    id: "remolder_sentinel_onslaught_stance",
    name: "Onslaught Stance",
    category: "sentinel",
    source: "Aggressive Attack",
    maxLevel: 5,
    effects: dealt([0.002, 0.006, 0.011, 0.014, 0.018], { skillTypes: ["active"] }),
  },
  // 12. Pinpoint Specialization — Sepal Bloom. Targeted dealt bonus.
  {
    id: "remolder_sentinel_pinpoint_specialization",
    name: "Pinpoint Specialization",
    category: "sentinel",
    source: "Sepal Bloom",
    maxLevel: 6,
    effects: dealt([0.02, 0.025, 0.035, 0.04, 0.05, 0.055], { category: "targeted" }),
  },
  // 13. Area Specialization — Flameflower. AoE dealt bonus.
  {
    id: "remolder_sentinel_area_specialization",
    name: "Area Specialization",
    category: "sentinel",
    source: "Flameflower",
    maxLevel: 6,
    effects: dealt([0.02, 0.025, 0.035, 0.04, 0.05, 0.055], { category: "aoe" }),
  },
  // 14. Follow-Up Strike — source name not supplied. Stability-Break (Exposed) target dealt bonus.
  {
    id: "remolder_sentinel_follow_up_strike",
    name: "Follow-Up Strike",
    category: "sentinel",
    maxLevel: 2,
    effects: dealt([0.005, 0.01], { targetExposed: true }),
  },
  // 15. Headhunter — source name not supplied. Distance > 6 tiles dealt bonus (grid only).
  {
    id: "remolder_sentinel_headhunter",
    name: "Headhunter",
    category: "sentinel",
    maxLevel: 3,
    effects: dealt([0.004, 0.008, 0.012], { minDistance: 6 }),
  },
];

/** Vanguard — 15 buffs (authoritative source, 2026). Conditional crit DMG / heal / stability. */
export const VANGUARD_BUFFS: RemolderBuffDef[] = [
  // 1. Bloodthirst — source name not supplied. HP recovery on attack (NOT a stat increase).
  {
    id: "remolder_vanguard_bloodthirst",
    name: "Bloodthirst",
    category: "vanguard",
    maxLevel: 3,
    effects: table([0.02, 0.04, 0.06], (v) => ({ kind: "heal_on_attack", pct: v })),
  },
  // 2. CQC Elite — source name not supplied. Distance-within-3-tiles dealt bonus.
  {
    id: "remolder_vanguard_cqc_elite",
    name: "CQC Elite",
    category: "vanguard",
    maxLevel: 3,
    effects: dealt([0.004, 0.008, 0.012], { maxDistance: 3 }),
  },
  // 3. Shock and Awe — source name not supplied. First-damaged-target FIXED Stability, once/turn.
  {
    id: "remolder_vanguard_shock_and_awe",
    name: "Shock and Awe",
    category: "vanguard",
    maxLevel: 2,
    effects: table([1, 2], (v) => ({ kind: "first_target_stability", amount: v })),
  },
  // 4. Precision Blow — Keen Stem. Conditional Crit DMG on targeted damage.
  {
    id: "remolder_vanguard_precision_blow",
    name: "Precision Blow",
    category: "vanguard",
    source: "Keen Stem",
    maxLevel: 6,
    effects: critDmg([0.015, 0.02, 0.03, 0.035, 0.045, 0.05], { category: "targeted" }),
  },
  // 5. Beheading Blade — Cataphyll Stem. Conditional Crit DMG vs boss units.
  {
    id: "remolder_vanguard_beheading_blade",
    name: "Beheading Blade",
    category: "vanguard",
    source: "Cataphyll Stem",
    maxLevel: 6,
    effects: critDmg([0.015, 0.02, 0.03, 0.035, 0.045, 0.05], { bossTarget: true }),
  },
  // 6. Smite Boost — Entropic Stem. UNCONDITIONAL Crit DMG (SEVEN values transcribed verbatim:
  //    1 / 2 / 1.6 / 2.4 / 2.8 / 3.6 / 4.0% — not normalized/reordered/corrected).
  {
    id: "remolder_vanguard_smite_boost",
    name: "Smite Boost",
    category: "vanguard",
    source: "Entropic Stem",
    maxLevel: 7,
    effects: critDmg([0.01, 0.02, 0.016, 0.024, 0.028, 0.036, 0.04]),
  },
  // 7. Area Smite — Fissure Stem. Conditional Crit DMG on AoE damage.
  {
    id: "remolder_vanguard_area_smite",
    name: "Area Smite",
    category: "vanguard",
    source: "Fissure Stem",
    maxLevel: 6,
    effects: critDmg([0.015, 0.02, 0.03, 0.035, 0.045, 0.05], { category: "aoe" }),
  },
  // 8–13. Element Smites — element-gated Crit DMG (identical 5-level table; 0.2/0.4/0.6/0.8/1).
  smite("Physical Smite", "Strike", null),
  smite("Burning Smite", "Ignition", "burn"),
  smite("Hydro Smite", "Desiccant", "hydro"),
  smite("Electric Smite", "Overload", "electric"),
  smite("Corrosive Smite", "Dissolve", "corrosion"),
  smite("Freezing Smite", "Glaciate", "freeze"),
  // 14. Onslaught Mastery — Assault. Conditional Crit DMG on active attacks.
  {
    id: "remolder_vanguard_onslaught_mastery",
    name: "Onslaught Mastery",
    category: "vanguard",
    source: "Assault",
    maxLevel: 5,
    effects: critDmg([0.002, 0.005, 0.008, 0.011, 0.014], { skillTypes: ["active"] }),
  },
  // 15. Ambush Mastery — Sneak Attack. Conditional Crit DMG on out-of-turn attacks.
  {
    id: "remolder_vanguard_ambush_mastery",
    name: "Ambush Mastery",
    category: "vanguard",
    source: "Sneak Attack",
    maxLevel: 5,
    effects: critDmg([0.002, 0.005, 0.008, 0.011, 0.014], { outOfTurn: true }),
  },
];

/** Element Smite — identical 5-level gated Crit DMG table; only the element gate differs. */
function smite(name: string, source: string, element: null | "burn" | "hydro" | "electric" | "freeze" | "corrosion"): RemolderBuffDef {
  return {
    id: "remolder_vanguard_" + name.toLowerCase().replace(/ /g, "_"),
    name,
    category: "vanguard",
    source,
    maxLevel: 5,
    effects: critDmg([0.002, 0.004, 0.006, 0.008, 0.01], { element: [element] }),
  };
}
/** Gated Crit-DMG table helper. */
function critDmg(values: number[], gates?: RemolderEffectGates): Record<number, RemolderEffect[]> {
  return table(values, (v) => ({ kind: "crit_dmg_gated", value: v, ...(gates ? { gates } : {}) }));
}

/** SUPPORT — 15 buffs (authoritative source, 2026): stat boosts, recoveries, Ichor, Unity. */
function unityStat(label: string, stat: "atk" | "hp", values: number[]): Record<number, RemolderEffect[]> {
  const out: Record<number, RemolderEffect[]> = {};
  values.forEach((v, i) => {
    out[i + 1] = [{ kind: "unity", label, stat, target: "all_allies" }, { kind: "stat_pct", stat, value: v }];
  });
  return out;
}
function unityDealtBuff(label: string, element: null | "burn" | "hydro" | "electric" | "freeze" | "corrosion", values: number[]): Record<number, RemolderEffect[]> {
  const gates: RemolderEffectGates = { element: [element] };
  const out: Record<number, RemolderEffect[]> = {};
  values.forEach((v, i) => {
    out[i + 1] = [{ kind: "unity_dealt", label, gates, target: "all_allies" }, { kind: "additive_dealt", value: v, gates }];
  });
  return out;
}
const UNITY_HP_ATK = [0.003, 0.004, 0.006, 0.007, 0.009];
const UNITY_DMG = [0.001, 0.003, 0.005, 0.007, 0.009];
/** Fighting Spirit: BOTH ATK% and max-HP% at each level (two stat_pct effects). */
const FIGHTING_SPIRIT: Record<number, RemolderEffect[]> = {};
[0.004, 0.006, 0.01, 0.012, 0.016, 0.018].forEach((v, i) => {
  FIGHTING_SPIRIT[i + 1] = [
    { kind: "stat_pct", stat: "atk", value: v },
    { kind: "stat_pct", stat: "hp", value: v },
  ];
});
export const SUPPORT_BUFFS: RemolderBuffDef[] = [
  // 1. Fighting Spirit — Reverse-Thorned Leaf. ATK% AND max-HP% (both, existing stat pipeline).
  { id: "remolder_support_fighting_spirit", name: "Fighting Spirit", category: "support", source: "Reverse-Thorned Leaf", maxLevel: 6, effects: FIGHTING_SPIRIT },
  // 2. Healing Boost — Dewdrop Leaf. Scales healing/shield the holder applies (heal pipeline only).
  { id: "remolder_support_healing_boost", name: "Healing Boost", category: "support", source: "Dewdrop Leaf", maxLevel: 6, effects: table([0.015, 0.02, 0.03, 0.035, 0.04, 0.05], (v) => ({ kind: "heal_bonus", value: v })) },
  // 3. Life Recovery — source name not supplied. End-of-action HP recovery (once/turn).
  { id: "remolder_support_life_recovery", name: "Life Recovery", category: "support", maxLevel: 3, effects: table([0.005, 0.01, 0.015], (v) => ({ kind: "heal_end_of_action", pct: v })) },
  // 4. Equilibrium Recovery — source name not supplied. End-of-action Stability restore (once/turn).
  { id: "remolder_support_equilibrium_recovery", name: "Equilibrium Recovery", category: "support", maxLevel: 2, effects: table([1, 2], (v) => ({ kind: "stability_recovery", amount: v })) },
  // 5. Ichor Resonance — Immersion Therapy. Flat HP = pct × INITIAL ATK.
  { id: "remolder_support_ichor_resonance", name: "Ichor Resonance", category: "support", source: "Immersion Therapy", maxLevel: 5, effects: table([0.002, 0.004, 0.006, 0.008, 0.01], (v) => ({ kind: "flat_hp_from_base_atk", pct: v })) },
  // 6. Ichor Conversion — Bloodthirst. Flat ATK = pct × INITIAL max HP.
  { id: "remolder_support_ichor_conversion", name: "Ichor Conversion", category: "support", source: "Bloodthirst", maxLevel: 5, effects: table([0.002, 0.004, 0.006, 0.008, 0.01], (v) => ({ kind: "flat_atk_from_base_hp", pct: v })) },
  // 7. Purification Feedback — source name not supplied. RECORDED; trigger unsupported (see report).
  { id: "remolder_support_purification_feedback", name: "Purification Feedback", category: "support", maxLevel: 3, effects: table([0.01, 0.02, 0.03], (v) => ({ kind: "ally_cleanse_stat_pct", atk: v, hp: v, durationRounds: 2 })) },
  // 8–15. Unity (8 total): HP/Attack stat Unity + physical/elemental damage Unity. "Does not stack".
  { id: "remolder_support_hp_unity", name: "HP Unity", category: "support", source: "Matrix Leaf", maxLevel: 5, effects: unityStat("hp_unity", "hp", UNITY_HP_ATK) },
  { id: "remolder_support_attack_unity", name: "Attack Unity", category: "support", source: "Emerald Leaf", maxLevel: 5, effects: unityStat("attack_unity", "atk", UNITY_HP_ATK) },
  { id: "remolder_support_physical_unity", name: "Physical Unity", category: "support", source: "Potential Energy", maxLevel: 5, effects: unityDealtBuff("physical_unity", null, UNITY_DMG) },
  { id: "remolder_support_burn_unity", name: "Burn Unity", category: "support", source: "Ignition", maxLevel: 5, effects: unityDealtBuff("burn_unity", "burn", UNITY_DMG) },
  { id: "remolder_support_hydro_unity", name: "Hydro Unity", category: "support", source: "Flood", maxLevel: 5, effects: unityDealtBuff("hydro_unity", "hydro", UNITY_DMG) },
  { id: "remolder_support_electric_unity", name: "Electric Unity", category: "support", source: "Electrified or Charge", maxLevel: 5, effects: unityDealtBuff("electric_unity", "electric", UNITY_DMG) },
  { id: "remolder_support_freeze_unity", name: "Freeze Unity", category: "support", source: "Frost Halo", maxLevel: 5, effects: unityDealtBuff("freeze_unity", "freeze", UNITY_DMG) },
  { id: "remolder_support_corrosion_unity", name: "Corrosion Unity", category: "support", source: "Catalyst", maxLevel: 5, effects: unityDealtBuff("corrosion_unity", "corrosion", UNITY_DMG) },
];

/** BULWARK — 15 buffs (authoritative source, 2026): taken-damage reductions, stat boosts, Lex Talionis. */
function taken(values: number[], gates: RemolderEffectGates): Record<number, RemolderEffect[]> {
  return table(values, (v) => ({ kind: "multiplicative_taken", value: v, gates }));
}
export const BULWARK_BUFFS: RemolderBuffDef[] = [
  // 1. Annular Defense — Thousand-Strand Root. AoE damage taken reduction (category gate).
  { id: "remolder_bulwark_annular_defense", name: "Annular Defense", category: "bulwark", source: "Thousand-Strand Root", maxLevel: 6, effects: taken([0.02, 0.025, 0.035, 0.04, 0.05, 0.055], { category: "aoe" }) },
  // 2. Pinpoint Defense — Marrow Root. Targeted damage taken reduction (category gate).
  { id: "remolder_bulwark_pinpoint_defense", name: "Pinpoint Defense", category: "bulwark", source: "Marrow Root", maxLevel: 6, effects: taken([0.02, 0.025, 0.035, 0.04, 0.05, 0.055], { category: "targeted" }) },
  // 3. Lex Talionis — source name NOT supplied (none invented). Reactive damage on taking damage.
  { id: "remolder_bulwark_lex_talionis", name: "Lex Talionis", category: "bulwark", maxLevel: 3, effects: table([0.02, 0.04, 0.06], (v) => ({ kind: "reactive_damage", pctOfMaxHp: v, capAtAtk: true })) },
  // 4. HP Boost — Sanguine Root. Max HP% (existing stat pipeline).
  { id: "remolder_bulwark_hp_boost", name: "HP Boost", category: "bulwark", source: "Sanguine Root", maxLevel: 6, effects: table([0.008, 0.012, 0.02, 0.024, 0.032, 0.036], (v) => ({ kind: "stat_pct", stat: "hp", value: v })) },
  // 5. Defense Boost — Stratified Root. Defense% (existing stat pipeline).
  { id: "remolder_bulwark_defense_boost", name: "Defense Boost", category: "bulwark", source: "Stratified Root", maxLevel: 6, effects: table([0.008, 0.012, 0.02, 0.024, 0.032, 0.036], (v) => ({ kind: "stat_pct", stat: "def", value: v })) },
  // 6. Boss Countermeasures — source name NOT supplied. Damage taken from boss units reduced.
  { id: "remolder_bulwark_boss_countermeasures", name: "Boss Countermeasures", category: "bulwark", maxLevel: 3, effects: taken([0.004, 0.008, 0.012], { bossTarget: true }) },
  // 7. Breakout Countermeasures — Lone Rider. ≥2 enemies within 3 tiles.
  { id: "remolder_bulwark_breakout_countermeasures", name: "Breakout Countermeasures", category: "bulwark", source: "Lone Rider", maxLevel: 5, effects: taken([0.002, 0.005, 0.008, 0.011, 0.014], { enemiesWithin3: { atLeast: 2 } }) },
  // 8. Lone Rider Countermeasures — Eradication or Cull. Exactly 1 enemy within 3 tiles.
  { id: "remolder_bulwark_lone_rider_countermeasures", name: "Lone Rider Countermeasures", category: "bulwark", source: "Eradication or Cull", maxLevel: 5, effects: taken([0.002, 0.005, 0.008, 0.011, 0.014], { enemiesWithin3: { atLeast: 1, atMost: 1 } }) },
  // 9. Melee Countermeasures — source name NOT supplied. Attacker within 3 tiles.
  { id: "remolder_bulwark_melee_countermeasures", name: "Melee Countermeasures", category: "bulwark", maxLevel: 3, effects: taken([0.003, 0.006, 0.009], { maxDistance: 3 }) },
  // 10–15. Elemental/physical Resistance — element-specific taken reduction.
  { id: "remolder_bulwark_physical_resistance", name: "Physical Resistance", category: "bulwark", source: "Fortress", maxLevel: 5, effects: taken([0.002, 0.004, 0.006, 0.008, 0.01], { element: [null] }) },
  { id: "remolder_bulwark_burn_resistance", name: "Burn Resistance", category: "bulwark", source: "Fireproof", maxLevel: 5, effects: taken([0.002, 0.004, 0.006, 0.008, 0.01], { element: ["burn"] }) },
  { id: "remolder_bulwark_hydro_resistance", name: "Hydro Resistance", category: "bulwark", source: "Desiccant", maxLevel: 5, effects: taken([0.002, 0.004, 0.006, 0.008, 0.01], { element: ["hydro"] }) },
  { id: "remolder_bulwark_electric_resistance", name: "Electric Resistance", category: "bulwark", source: "Insulation", maxLevel: 5, effects: taken([0.002, 0.004, 0.006, 0.008, 0.01], { element: ["electric"] }) },
  { id: "remolder_bulwark_freeze_resistance", name: "Freeze Resistance", category: "bulwark", source: "Winterized", maxLevel: 5, effects: taken([0.002, 0.004, 0.006, 0.008, 0.01], { element: ["freeze"] }) },
  { id: "remolder_bulwark_corrosion_resistance", name: "Corrosion Resistance", category: "bulwark", source: "Antivenom", maxLevel: 5, effects: taken([0.002, 0.004, 0.006, 0.008, 0.01], { element: ["corrosion"] }) },
];

/** Qiongjiu: the six Pattern Remolder Set Bonus definitions (VALIDATED source requirements/effects). */
export const QIONGJIU_SET_BONUSES: RemolderSetBonusDef[] = [
  {
    id: "qiongjiu_set_embryo",
    name: "Embryo",
    remolderLevel: 1,
    requires: { bulwark: 0, vanguard: 2, support: 0, sentinel: 4 },
    effects: [{ kind: "additive_dealt", value: 0.05, gates: { actions: "support" } }],
  },
  {
    id: "qiongjiu_set_seedling",
    name: "Seedling",
    remolderLevel: 10,
    requires: { bulwark: 1, vanguard: 3, support: 0, sentinel: 6 },
    effects: [{ kind: "multiplicative_taken", value: 0.05, gates: { element: [null], anyPhase: true } }],
  },
  {
    id: "qiongjiu_set_sprout",
    name: "Sprout",
    remolderLevel: 20,
    requires: { bulwark: 2, vanguard: 5, support: 0, sentinel: 7 },
    effects: [{ kind: "additive_dealt", value: 0.05, gates: { element: ["burn"] } }],
  },
  {
    id: "qiongjiu_set_shoot",
    name: "Shoot",
    remolderLevel: 30,
    requires: { bulwark: 3, vanguard: 6, support: 0, sentinel: 9 },
    effects: [{ kind: "additive_dealt", value: 0.1, gates: { targetExposed: true } }],
  },
  {
    id: "qiongjiu_set_bud",
    name: "Bud",
    remolderLevel: 45,
    requires: { bulwark: 4, vanguard: 6, support: 0, sentinel: 13 },
    effects: [{ kind: "stat_pct", stat: "atk", value: 0.08 }],
  },
  {
    id: "qiongjiu_set_blossom",
    name: "Blossom",
    remolderLevel: 60,
    requires: { bulwark: 5, vanguard: 9, support: 0, sentinel: 15 },
    // "At the start of the battle, the 2 allied units with the highest attack have their ATK
    // increased by 3%. Does not stack." → start-of-battle allied selection (top-N by ATK).
    effects: [{ kind: "allied_stat_pct_battle_start", stat: "atk", value: 0.03, select: "highest_attack", count: 2 }],
  },
];

/**
 * ALL Pattern Remolder buff definitions (global, shared by every character). Sentinel + Vanguard
 * categories are supplied; Bulwark / Support are added in later tasks.
 */
export const REMOLDER_BUFFS: RemolderBuffDef[] = [...SENTINEL_BUFFS, ...VANGUARD_BUFFS, ...SUPPORT_BUFFS, ...BULWARK_BUFFS];