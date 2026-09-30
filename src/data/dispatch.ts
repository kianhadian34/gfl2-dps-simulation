import type { DollClass } from "../model/types.js";

/**
 * DISPATCH STAT BUFFS (2026, VALIDATED in-game values — permanent GLOBAL system):
 * the game's Dispatch system grants EVERY doll a flat ATK/HP/DEF bonus by its Class.
 * - Always present in real gameplay; never toggled, never a status, never interactive.
 * - A SEPARATE flat-stat SOURCE (provenance) — never merged into `CharacterDef.base`.
 * - Flows through the ONE existing panel path: finalStat(base + flat, pct), added BEFORE
 *   percentage modifiers (weapon ATK%, affinity, common keys, character affinity level).
 * - Real characters receive their class's dispatch automatically. Controlled math fixtures
 *   opt out per-membership via `ScenarioTeamMember.applyDispatchStats: false` (test-only).
 */
export const DISPATCH_STAT_BUFFS: Record<DollClass, { atk: number; hp: number; def: number }> = {
  bulwark: { atk: 168, hp: 720, def: 270 },
  vanguard: { atk: 192, hp: 576, def: 192 },
  support: { atk: 183, hp: 618, def: 240 },
  sentinel: { atk: 231, hp: 519, def: 222 },
};