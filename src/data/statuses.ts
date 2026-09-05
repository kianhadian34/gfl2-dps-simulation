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
];

export function statusMap(): Map<string, StatusDef> {
  return new Map(STATUS_DEFS.map((s) => [s.id, s]));
}