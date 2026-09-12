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
    verified: true,
    note: "One buff instance, two support-scoped effects (source: Common Rail): +15% Support Action damage + +10% vs Exposed, additive in the Damage Buff Factor. VALIDATED in-game 2026: Basic Attack vs Exposed receives NO +10% (538 = 1.20 factor); persistent with no duration; stackable (each application +1 stack); one Support Action consumes exactly one stack (2→1); **stack count does NOT multiply either effect — 1 and 2 stacks deal identical damage (883 both)**; stacks are remaining activations only; the 883 support hit confirms both effects. Cannot be cleansed.",
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
    replaces: ["support_boost_i"], // VALIDATED 2026: applying SB II removes ALL SB I stacks (full replacement)
    scaleWithStacks: false, // rank-inherited from SB I: stacks = activations, never a magnitude multiplier
    // Rank 2 of Support Boost: same tooltip structure as SB I (identical Exposed component);
    // the ONLY explicit rank difference is the Support Action damage value (30% vs 15%).
    effects: [
      { kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.3, actions: "support" },
      { kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.1, actions: "support", whenTarget: "exposed" },
    ],
    verified: true,
    note: "SB II = rank 2 of Support Boost. RANK-INHERITS SB I's validated generic behavior (project rule, validation-checklist.md §0): persistent/proc-based; stackable with no invented maximum; stacks = available activations; one Support Action consumes exactly one stack; stack count does NOT multiply the modifier; Support Action scope; Basic Attack neither benefits nor consumes; cannot be cleansed. Rank-specific: +30% Support Action damage instead of +15% — SOURCE FACT (tooltip); NO in-game combat number has been validated for the 30% (do not claim one). Presents the same +10%-vs-Exposed component by identical tooltip structure (source fact / inherited). Replacement of SB I and blocking of SB I are VALIDATED 2026. No Support Boost III exists (source).",
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
    verified: true,
    note: 'Tooltip (authoritative): "Increases damage taken by 10%. This is considered a defense debuff." Target-side; V4 applies it for 1 turn (expires at the target\'s own turn-end, VALIDATED 2026); stacking/fixed-damage/cleansing interactions NOT established — do not infer.',
  },
  {
    id: "damage_up_ii",
    name: "Damage Up II",
    category: "buff",
    stackable: false,
    maxStacks: 1,
    durationRounds: null, // default duration UNKNOWN; Qiongjiu's application (Pressing the Momentum Lv3 / V5) is 1 turn
    tickAt: "ownActionEnd",
    purgeable: true, // cleansing UNKNOWN — engine default
    effects: [{ kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.2 }],
    verified: true,
    note: 'Tooltip (authoritative): "Increases damage dealt by 20%. Considered a buff." Source-side; duration/stacking/fixed-damage interactions NOT established — do not infer.',
  },
{
    id: "ammo_weakness_upgrade",
    name: "Ammo Weakness Upgrade",
    category: "upgrade",
    stackable: true,
    maxStacks: 5,
    durationRounds: null, // permanent target-side stack state (validated 2026 progression; reset rules not observed)
    tickAt: "ownActionEnd",
    purgeable: false,
    effects: [
      {
        kind: "stack_tier_modifier",
        scope: "taken",
        mode: "additive",
        // Validated in-game (2026): Physical-only; tiers 2→+7% / 3→+11% / 4→+17% / 5→+25%, capped at 5.
        tiers: { 2: 0.07, 3: 0.11, 4: 0.17, 5: 0.25 },
        when: { element: ["physical"] }, // Phase damage naturally bypasses (no AWU special-case branch)
      },
    ],
    verified: true,
    note: "Validated in-game (2026): triggered by Ammo-weakness exploits on Physical attacks; bonus additive in the DMG% bucket, post generic weakness; see docs/research.md §3.18",
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
    verified: true,
    note: "Test fixture for stat_modifier flat CritRate",
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
    verified: true,
    note: "Test fixture of the validated DEF Down II behavior (2026: 5000 × (1 − 0.30) = 3500 effective DEF); negative percentage stat modifier",
  },
];

export function statusMap(): Map<string, StatusDef> {
  return new Map(STATUS_DEFS.map((s) => [s.id, s]));
}