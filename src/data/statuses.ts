import type { StatusDef } from "../model/types.js";

/**
 * Status definitions for the MVP milestone.
 * `verified: false` values are model defaults (flagged in results.warnings), not
 * in-game-confirmed numbers — see docs/research.md §4 (U-r register).
 */
export const STATUS_DEFS: StatusDef[] = [
  {
    id: "support_boost_i",
    name: "Support Boost I",
    category: "buff",
    stackable: true,
    // NO maxStacks: unbounded (VALIDATED 2026 — 4 stacks reached with no cap observed; never invent a cap)
    durationRounds: null, // persistent — no duration expiry (VALIDATED 2026: remains active indefinitely until used)
    tickAt: "ownActionEnd",
    purgeable: false, // authoritative: "This buff cannot be cleansed"
    consumeOneOnUse: true, // VALIDATED 2026: one Support Action consumes exactly ONE stack (stacks = activations)
    scaleWithStacks: false, // VALIDATED 2026: 1 stack and 2 stacks deal identical damage — stacks are activations only, never a magnitude multiplier
    blockedBy: ["support_boost_ii"], // VALIDATED 2026: while SB II is active, SB I applications are blocked (SB II has priority)
    // Support Boost I = ONE buff instance with TWO effects, VALIDATED 2026 (538 & 883):
    // +15% Support Action damage and +10% vs Exposed — both SUPPORT-Action-scoped
    // (Basic Attack vs Exposed showed NO +10% → 538 with factor 1.20).
    effects: [
      { kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.15, actions: "support" },
      { kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.1, actions: "support", whenTarget: "exposed" },
    ],
    playerDescription: "Support Action damage +15%. Damage against Exposed targets +10%.",
    verified: true,
    note: "One buff instance, two support-scoped effects (source: Common Rail): +15% Support Action damage + +10% vs Exposed, additive in the Damage Buff Factor. VALIDATED in-game 2026: Basic Attack vs Exposed receives NO +10% (538 = 1.20 factor); persistent with no duration; stackable (each application +1 stack); one Support Action consumes exactly one stack (2→1); **stack count does NOT multiply either effect — 1 and 2 stacks deal identical damage (883 both)**; stacks are remaining activations only; the 883 support hit confirms both effects. Cannot be cleansed.",
    // Representation edge (2026, NOT separately in-game observed): the V1 +30% member belongs to
    // the SAME in-game "Support Boost I" family, so re-applying the +15% version refreshes the
    // family (replaces the +30% member) — keeps one family buff active, never two magnitudes counted.
    replaces: ["support_boost_i_30"],
  },
  {
    id: "support_boost_i_30", // repo-internal id — the game displays this as "Support Boost I" (V1, +30%);
    // the exact in-game status id is UNSPECIFIED (no authoritative data). Representative, not an ID claim.
    name: "Support Boost I (V1 kill, +30%)",
    category: "buff",
    stackable: true, // unbounded activations — same family mechanics as SB I (no validated cap)
    durationRounds: null, // persistent — no duration (VALIDATED V1 screenshot: "Activates 1 time", no duration invented)
    tickAt: "ownActionEnd",
    purgeable: false, // authoritative: "Cannot be cleansed"
    consumeOneOnUse: true, // one Support Action consumes exactly ONE activation (family behavior)
    replaces: ["support_boost_i"], // representation edge (2026, not separately in-game observed): the +30% kill version replaces the +15% base within the family
    blockedBy: ["support_boost_ii"], // same family: SB II blocks/outranks the V1 variant too (representation edge, not separately in-game observed)
    scaleWithStacks: false, // stacks = activations, never a magnitude multiplier (family rule)
    // VALIDATED (V1 screenshot, in-game 2026): Support Action damage +30% and +10% vs Exposed —
    // both SUPPORT-Action-scoped, one buff instance / one source mechanic (dedup, not two modifiers).
    effects: [
      { kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.3, actions: "support" },
      { kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.1, actions: "support", whenTarget: "exposed" },
    ],
    playerDescription: "Support Action damage +30%. Damage against Exposed targets +10%.",
    verified: true,
    note: "V1 'support_boost_i' at +30%: granted ONLY when Common Rail itself delivers the killing blow (skill-specific onKillStatuses, VALIDATED 2026). Persistence, activation consumption, flat magnitude, un-cleansable, support-scoping, and the Exposed component follow the established Support Boost family rules (rank-inherited). Not to be confused with the normal +15% Support Boost I.",
  },
  {
    id: "support_boost_ii",
    name: "Support Boost II",
    category: "buff",
    stackable: true, // unbounded stacks — rank-inherited from SB I (no validated cap; do NOT invent one)
    durationRounds: null, // persistent proc — rank-inherited from SB I (VALIDATED 2026)
    tickAt: "ownActionEnd",
    purgeable: false, // authoritative: "This buff cannot be cleansed"
    consumeOneOnUse: true, // VALIDATED 2026: one Support Action consumes exactly ONE stack (×3 → ×2)
    replaces: ["support_boost_i", "support_boost_i_30"], // VALIDATED 2026: SB II removes ALL SB I stacks (full replacement) — extended 2026 to the V1 +30% member of the same in-game "Support Boost I" family (representation edge, not separately in-game observed)
    scaleWithStacks: false, // rank-inherited from SB I: stacks = activations, never a magnitude multiplier
    // Rank 2 of Support Boost: same tooltip structure as SB I (identical Exposed component);
    // the ONLY explicit rank difference is the Support Action damage value (30% vs 15%).
    effects: [
      { kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.3, actions: "support" },
      { kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.1, actions: "support", whenTarget: "exposed" },
    ],
    playerDescription: "Support Action damage +30%. Damage against Exposed targets +10%.",
    verified: true,
    note: "SB II = rank 2 of Support Boost. RANK-INHERITS SB I's validated generic behavior (project rule, validation-checklist.md §0): persistent/proc-based; stackable with no invented maximum; stacks = available activations; one Support Action consumes exactly one stack; stack count does NOT multiply the modifier; Support Action scope; Basic Attack neither benefits nor consumes; cannot be cleansed. Rank-specific: +30% Support Action damage instead of +15% — VALIDATED in-game 2026 by a DIRECT controlled combat number (1029: ATK 2000 · Support 90% · DEF 5000 · bucket 2.00 = 1 + DU2 0.20 + No-Cover 0.20 + SB II 0.30 + SB II +10% vs Exposed 0.10 + Out-of-Turn 0.10 + Vulnerable 0.10 → ceil = 1029; the +10%-vs-Exposed is discriminated by the no-Exposed contrast 978). Presents the same +10%-vs-Exposed component by identical tooltip structure (inherited; validated 2026 by that same run). Replacement of SB I and blocking of SB I are VALIDATED 2026. No Support Boost III exists (source).",
  },
  {
    id: "overburn",
    name: "Overburn",
    category: "debuff",
    stackable: false,
    maxStacks: 1,
    durationRounds: 2,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [
      // VALIDATED in-game (2026): fixed damage = 10% of the EFFECT APPLIER's ATK,
      // once immediately on gain (onApply), then at EACH of the holder's next two
      // action ends (onTick); the second tick fires and Overburn then expires.
      { kind: "fixed_damage", percentOfAtk: 0.1, applies: ["onApply", "onTick"] },
    ],
    playerDescription: "Burn: fixed damage equal to 10% of the applier's ATK on application and at each action end.",
    verified: true,
    note: "Validated in-game (2026): applier-ATK 1974 → 198 per trigger; sequence apply + holder action-end ×2 = 594, then expires (see docs/research.md §3.10)",
  },
  {
    id: "vulnerable_i",
    name: "Vulnerable I",
    category: "debuff",
    stackable: false,
    maxStacks: 1,
    durationRounds: 1, // VALIDATED 2026 (V4): 1 turn — disappears when the target finishes its own turn; other applications unobserved
    tickAt: "ownActionEnd",
    purgeable: true, // cleansing UNKNOWN — engine default
    effects: [{ kind: "damage_modifier", scope: "taken", mode: "additive", value: 0.1 }],
    playerDescription: "Damage taken +10%.",
    verified: true,
    note: 'Tooltip (authoritative): "Increases damage taken by 10%. This is considered a defense debuff." Target-side; V4 applies it for 1 turn (expires at the target\'s own turn-end, VALIDATED 2026); stacking/fixed-damage/cleansing interactions NOT established — do not infer.',
  },
  {
    id: "damage_up_ii",
    name: "Damage Up II",
    category: "buff",
    stackable: false,
    maxStacks: 1,
    durationRounds: 1, // VALIDATED 2026 (V5): 1 turn — holder keeps it through their turn, expires at their own turn-end (ally: its turn; Qiongjiu: her next turn); other applications unobserved
    tickAt: "ownActionEnd",
    purgeable: true, // cleansing UNKNOWN — engine default
    effects: [{ kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.2 }],
    playerDescription: "Damage dealt +20%.",
    verified: true,
    note: 'Tooltip (authoritative): "Increases damage dealt by 20%. Considered a buff." Source-side; duration/stacking/fixed-damage interactions NOT established — do not infer.',
  },
{
    id: "ammo_weakness_upgrade",
    name: "Ammo Weakness Upgrade",
    category: "upgrade",
    stackable: true,
    maxStacks: 5,
    durationRounds: null, // permanent target-side stack state — VALIDATED 2026: never resets, never removed, persists indefinitely
    tickAt: "ownActionEnd",
    purgeable: false,
    effects: [
      {
        kind: "stack_tier_modifier",
        scope: "taken",
        mode: "additive",
        // Validated in-game (2026): phase-less (physical-ammo) attacks only; tiers 2→+7% / 3→+11% / 4→+17% / 5→+25%, capped at 5.
        tiers: { 2: 0.07, 3: 0.11, 4: 0.17, 5: 0.25 },
        when: { element: [null] }, // phase-less attacks only — Phase damage naturally bypasses (no AWU special-case branch)
      },
    ],
    playerDescription: "Permanent target upgrade: exploiting an Ammo weakness adds stacks; higher tiers increase the damage taken bonus (2 to +7%, 3 to +11%, 4 to +17%, 5 to +25%).",
    verified: true,
    note: "Validated in-game (2026): triggered by Ammo-weakness exploits on phase-less (physical-ammo) attacks; bonus additive in the DMG% bucket, post generic weakness; see docs/research.md §3.18",
  },
  {
    id: "fixed_dmg_buff",
    name: "Fixed DMG Buff",
    category: "buff",
    stackable: false,
    maxStacks: 1,
    durationRounds: null, // key-like buff (permanent) — matches the validated +10% Fixed DMG Key persisting past the casting action
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "fixed_dmg_modifier", mode: "buff", value: 0.1 }],
    playerDescription: "Fixed Damage +10%.",
    verified: true,
    note: "Test fixture exemplar of the validated Fixed DMG Buff bucket (2026, +10% Fixed DMG Key example; source-named examples Common Key - Source of Pride / Ultimate Brilliance are NOT individually in-game tested); real character data supplies its own value",
  },
  {
    id: "final_dmg_reduction",
    name: "Final DMG Reduction",
    category: "debuff",
    stackable: false,
    maxStacks: 1,
    durationRounds: 2, // persists across the target's ownActionEnd ticks so both status- and skill-sourced fixed tests can read it
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "fixed_dmg_modifier", mode: "reduction", value: 0.6 }],
    playerDescription: "Final damage taken reduced by 60%.",
    verified: true,
    note: "Test fixture exemplar of the validated Final DMG Reduction bucket (2026, 60% example); real enemy/boss data supplies its own value",
  },
  {
    id: "stat_atk_up_ii_pct",
    name: "Stat ATK Up (test)",
    category: "buff",
    stackable: false,
    maxStacks: 1,
    durationRounds: null, // permanent test fixture so the cast-action tick does not expire it mid-test
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "stat_modifier", stat: "atk", mode: "pct", value: 0.15 }],
    playerDescription: "ATK +15%.",
    verified: true,
    note: "Test fixture: ATK Up II +15% percentage value (2026 validation 1933 → 2223); real character data supplies its own value",
  },
  {
    id: "stat_def_flat_test",
    name: "Stat DEF Flat (test)",
    category: "buff",
    stackable: false,
    maxStacks: 1,
    durationRounds: null,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "stat_modifier", stat: "def", mode: "flat", value: 100 }],
    playerDescription: "Test fixture: grants +100 DEF.",
    verified: true,
    note: "Test fixture for stat_modifier flat DEF; real character data supplies its own value",
  },
  {
    id: "stat_hp_pct_test",
    name: "Stat HP Pct (test)",
    category: "buff",
    stackable: false,
    maxStacks: 1,
    durationRounds: null,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "stat_modifier", stat: "hp", mode: "pct", value: 0.1 }],
    playerDescription: "Test fixture: grants HP by percentage.",
    verified: true,
    note: "Test fixture for stat_modifier HP% (HP has no combat consumer in the current MVP; helper-level coverage only)",
  },
  {
    id: "stat_crit_rate_flat_test",
    name: "Stat Crit Rate Flat (test)",
    category: "buff",
    stackable: false,
    maxStacks: 1,
    durationRounds: null,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "stat_modifier", stat: "critRate", mode: "flat", value: 0.1 }],
    playerDescription: "Test fixture: grants flat Crit Rate.",
    verified: true,
    note: "Test fixture for stat_modifier flat CritRate",
  },
  {
    id: "blazing_assault_ii",
    name: "Blazing Assault II",
    category: "buff",
    stackable: false,
    maxStacks: 1,
    durationRounds: 2,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "stat_modifier", stat: "atk", mode: "pct", value: 0.15 }],
    playerDescription: "Increases ATK by 15%.",
    verified: true,
    note: "Fixed Key 5 Necessary Adjustments self-buff (VALIDATED in-game 2026: +15% ATK, Burn-buff classification, 2 turns; the triggering Common Rail already uses the +15% ATK).",
  },
  {
    id: "stat_def_down_ii_pct",
    name: "Stat DEF Down II (test)",
    category: "debuff",
    stackable: false,
    maxStacks: 1,
    durationRounds: null,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "stat_modifier", stat: "def", mode: "pct", value: -0.3 }],
    playerDescription: "DEF -30%.",
    verified: true,
    note: "Test fixture of the validated DEF Down II behavior (2026: 5000 × (1 − 0.30) = 3500 effective DEF); negative percentage stat modifier",
  },
  // ---------------------------------------------------------------------------
  // Golden Melody Trait pool (13 outcomes, VALIDATED in-game 2026): exactly ONE is
  // granted at the end of the holder's action at full HP, uniform 1/13 selection,
  // lasts 1 turn (weapon `trait` data + engine hook in simulation.ts).
  // Effects are implemented ONLY where the engine has a generic executable mechanic
  // (def_ignore: 2 — Domain Penetration I, 20% DEF ignore on AoE; Piercing I, 20% DEF
  // ignore on TARGETED damage; stat_modifier: 3 — Crit Rate Boost I / Defense Up I /
  // Attack Up I; heal: 1 — Continuous Healing I, 10% max-HP at action end;
  // damage_reduction: 2 — Area Defense I, −10% taken from AoE; Targeted Attack
  // Defense I, −10% taken from targeted; stability_damage_bonus: 1 — Stability
  // Offensive I, +1 Stability damage dealt; damage_modifier dealt (category-gated):
  // 1 — Targeted Attack Boost I, +10% Targeted damage dealt); the other 3 outcomes
  // are RECORDED-ONLY (`deferredNote`) because the engine has no phase-gated dealt /
  // mobility mechanic — documented, never invented
  // (research §3.9). No hardcoded
  // character conditionals: the pool lives on the weapon's `trait` data, uniformly.
  // ---------------------------------------------------------------------------
  {
    id: "trait_domain_penetration_i",
    name: "Domain Penetration I",
    category: "buff",
    stackable: false,
    durationRounds: 1,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "def_ignore", value: 0.2, aoe: true }],
    playerDescription: "Area damage ignores 20% of the target's Defense.",
    verified: true,
    note: "Golden Melody Trait outcome #1 (validated in-game 2026); 20% DEF ignore on AoE damage — executable via the generic def_ignore effect (attacker-side, defense term only).",
  },
  {
    id: "trait_crit_rate_boost_i",
    name: "Critical Rate Boost I",
    category: "buff",
    stackable: false,
    durationRounds: 1,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "stat_modifier", stat: "critRate", mode: "flat", value: 0.1 }],
    playerDescription: "Critical Rate +10%.",
    verified: true,
    note: "Golden Melody Trait outcome #2 (validated in-game 2026); +10% Crit Rate — executable via the generic stat_modifier.",
  },
  {
    id: "trait_continuous_healing_i",
    name: "Continuous Healing I",
    category: "buff",
    stackable: false,
    durationRounds: 1,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "heal", percentOfMaxHp: 0.1 }],
    playerDescription: "Restores 10% of max HP at the end of each action.",
    verified: true,
    note: "Golden Melody Trait outcome #3 (validated in-game 2026); +10% max-HP restore at the holder's action end — executable via the generic heal effect (capped at max HP, 1-turn Trait duration preserved).",
  },
  {
    id: "trait_defense_up_i",
    name: "Defense Up I",
    category: "buff",
    stackable: false,
    durationRounds: 1,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "stat_modifier", stat: "def", mode: "pct", value: 0.2 }],
    playerDescription: "Defense +20%.",
    verified: true,
    note: "Golden Melody Trait outcome #4 (validated in-game 2026); +20% DEF — executable via the generic stat_modifier.",
  },
  {
    id: "trait_piercing_i",
    name: "Piercing I",
    category: "buff",
    stackable: false,
    durationRounds: 1,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "def_ignore", value: 0.2, aoe: false }],
    playerDescription: "Targeted damage ignores 20% of the target's Defense.",
    verified: true,
    note: "Golden Melody Trait outcome #5 (validated in-game 2026); 20% DEF ignore on TARGETED damage — executable via the generic def_ignore effect (attacker-side, defense term only).",
  },
  {
    id: "trait_area_defense_i",
    name: "Area Defense I",
    category: "buff",
    stackable: false,
    durationRounds: 1,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "damage_reduction", value: 0.1, whenIncomingCategory: "aoe" }],
    playerDescription: "Area damage taken −10%.",
    verified: true,
    note: "Golden Melody Trait outcome #6 (validated in-game 2026); −10% damage taken from AoE attacks ONLY — executable via the generic damage_reduction effect gated to incoming AoE.",
  },
  {
    id: "trait_targeted_attack_defense_i",
    name: "Targeted Attack Defense I",
    category: "buff",
    stackable: false,
    durationRounds: 1,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "damage_reduction", value: 0.1, whenIncomingCategory: "targeted" }],
    playerDescription: "Targeted damage taken −10%.",
    verified: true,
    note: "Golden Melody Trait outcome #7 (validated in-game 2026); −10% damage taken from TARGETED attacks ONLY — executable via the generic damage_reduction effect gated to incoming targeted damage.",
  },
  {
    id: "trait_stability_offensive_i",
    name: "Stability Offensive I",
    category: "buff",
    stackable: false,
    durationRounds: 1,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "stability_damage_bonus", value: 1 }],
    playerDescription: "Stability damage dealt +1.",
    verified: true,
    note: "Golden Melody Trait outcome #8 (validated in-game 2026); +1 flat Stability damage dealt — executable via the generic stability_damage_bonus effect (stability only, never HP/DMG%/DEF/weakness/crit).",
  },
  {
    id: "trait_targeted_attack_boost_i",
    name: "Targeted Attack Boost I",
    category: "buff",
    stackable: false,
    durationRounds: 1,
    tickAt: "ownActionEnd",
    purgeable: false,
    effects: [{ kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.1, whenCategory: "targeted" }],
    playerDescription: "Targeted damage dealt +10%.",
    verified: true,
    note: "Golden Melody Trait outcome #9 (validated in-game 2026); cannot be cleansed. +10% Targeted damage dealt — additive in the existing DMG% bucket, gated to targeted-only hits via the generic damage_modifier whenCategory gate.",
  },
  {
    id: "trait_coverage_boost_i",
    name: "Coverage Boost I",
    category: "buff",
    stackable: false,
    durationRounds: 1,
    tickAt: "ownActionEnd",
    purgeable: false,
    effects: [],
    playerDescription: "Area damage dealt +10%.",
    verified: true,
    note: "Golden Melody Trait outcome #10 (validated in-game 2026); cannot be cleansed.",
    deferredNote: "RECORDED-ONLY: the engine has no AoE-dealt category mechanic.",
  },
  {
    id: "trait_phase_boost_i",
    name: "Phase Boost I",
    category: "buff",
    stackable: false,
    durationRounds: 1,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [],
    playerDescription: "Phase damage dealt +10%.",
    verified: true,
    note: "Golden Melody Trait outcome #11 (validated in-game 2026).",
    deferredNote: "RECORDED-ONLY: the engine has no phase-gated dealt mechanic.",
  },
  {
    id: "trait_attack_up_i",
    name: "Attack Up I",
    category: "buff",
    stackable: false,
    durationRounds: 1,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "stat_modifier", stat: "atk", mode: "pct", value: 0.1 }],
    playerDescription: "Attack +10%.",
    verified: true,
    note: "Golden Melody Trait outcome #12 (validated in-game 2026); +10% ATK — executable via the generic stat_modifier.",
  },
  {
    id: "trait_movement_up_i",
    name: "Movement Up I",
    category: "buff",
    stackable: false,
    durationRounds: 1,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [],
    playerDescription: "Mobility +1 tile.",
    verified: true,
    note: "Golden Melody Trait outcome #13 (validated in-game 2026).",
    deferredNote: "RECORDED-ONLY: the engine has no mobility mechanic.",
  },
];

export function statusMap(): Map<string, StatusDef> {
  return new Map(STATUS_DEFS.map((s) => [s.id, s]));
}