import type { RemolderBuffDef, RemolderSetBonusDef } from "../model/types.js";

/**
 * PATTERN REMOLDER (2026, "flower system") — data layer.
 *
 * The engine receives only the RESULTING buff levels the user selected (never the flowers).
 * Remolder level is ALWAYS treated as 60, so all six Set Bonuses are eligible.
 *
 * `REMOLDER_BUFFS` is intentionally EMPTY until the per-level value tables are supplied from
 * source material (project rule: never invent values). The engine architecture, category
 * totals, clamping, Unity resolution and Set Bonus activation are fully implemented and are
 * exercised with synthetic definitions injected via `Scenario.remolderBuffSet` in tests.
 * Production buff definitions, once the exact tables are available, plug straight into
 * `REMOLDER_BUFFS` with no engine changes.
 */
export const REMOLDER_BUFFS: RemolderBuffDef[] = [];

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