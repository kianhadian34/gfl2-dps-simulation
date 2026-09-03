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
    effects: [],
    verified: false,
    note: "Overburn applied for 2 rounds (research §3.11); its damage/effect values are UNVERIFIED (docs/research.md §4)",
  },
];

export function statusMap(): Map<string, StatusDef> {
  return new Map(STATUS_DEFS.map((s) => [s.id, s]));
}