/**
 * PERMANENT COOKING STATS (2026) — permanent flat ATK/HP/DEF source.
 *
 * A simple, user-toggleable permanent stat system: when enabled for a team member, the doll
 * receives a flat ATK/DEF/HP bonus. Values are FLAT (not percentages) and therefore enter the
 * EXISTING flat bucket of the ONE panel path (`computePanel`) — `Final Stat =
 * ceil((Initial + Flat) × (1 + Stat%))` — summed with the other permanent flat sources
 * (Dispatch / Remolder Lv.60 / Neural Helix / Affinity Level / Attachments) BEFORE percentage
 * modifiers. There is no second stat system and no separate formula.
 *
 * SOURCE: user-provided values (2026) — the system grants 15 Attack, 15 Defense, 30 Health.
 *
 * Gating (matches the established permanent-source convention):
 *  - OFF by default: a scenario member only receives it when `permanentCookingStats: true`.
 *  - CONTROLLED MATH FIXTURES (`ScenarioTeamMember.applyDispatchStats: false`) exclude it, so
 *    every existing number-pinning oracle (865 / 975 / 1434 / …) is unaffected.
 *  - DEBUG-AUTHORITATIVE overrides suppress it on any stat the user explicitly overrode
 *    (same rule as the other permanent sources: an overridden stat is authoritative).
 */
export const PERMANENT_COOKING_STATS: { atk: number; hp: number; def: number } = {
  atk: 15,
  def: 15,
  hp: 30,
};
