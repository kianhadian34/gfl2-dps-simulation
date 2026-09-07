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
    maxStacks: 9,
    durationRounds: 1,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.05 }],
    verified: false,
    note: "Per-stack additive value & duration UNVERIFIED (docs/research.md §4) — overwrite after in-game test",
  },
  {
    id: "support_boost_ii",
    name: "Support Boost II",
    category: "buff",
    stackable: true,
    maxStacks: 9,
    durationRounds: 1,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.1 }],
    verified: false,
    note: "Per-stack additive value & duration UNVERIFIED (docs/research.md §4) — overwrite after in-game test",
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
];

export function statusMap(): Map<string, StatusDef> {
  return new Map(STATUS_DEFS.map((s) => [s.id, s]));
}