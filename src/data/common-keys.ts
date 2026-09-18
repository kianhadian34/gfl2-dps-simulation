import type { CommonKeyDef } from "../model/types.js";

/**
 * Common Keys registry data (REUSABLE definitions — the game's Common Key system is a
 * game-wide table, not a per-character embedding; 2026). Every key — character-specific
 * (Character Edition) or generic — lives here and is resolved via `Registry.getCommonKey`.
 * Slot structure (SOURCE FACTS): every character has 3 Common Key Slots (regulars are
 * enforced by the engine: max 3 selected, fewer allowed). Categories: Gold Key (3 stats +
 * secondary effect; 5★ Character Edition), Epic Key — 4★ Character Edition (3 stats +
 * secondary effect), Epic Key — Generic Edition (3 stats, no secondary), Rare Key (2 stats,
 * no secondary). No invented rules beyond these facts.
 *
 * See docs/research.md §3.13.
 */
export const COMMON_KEYS: CommonKeyDef[] = [
  {
    id: "qiongjiu_common_strategic_negotiation",
    name: "Strategic Negotiation",
    // Descriptive in-game type line (display metadata only) — NOT the edition taxonomy.
    // Edition: UNKNOWN for this key — no Gold/Epic/Rare classification is asserted (never invented).
    type: "Universal Key: Skill",
    verified: true,
    description:
      "Crit Rate +5.0%, Critical Damage +5.0%, Attack Boost +5.0%; increase damage dealt outside of the unit's own turn by 7%.",
    // Strategic Negotiation (VALIDATED in-game 2026, IMPLEMENTED). The +5% ATK / Crit Rate /
    // Crit DMG are NORMAL stat increases (ATK folds via the proven Final Stat formula; the
    // others are additive). The +7% adds to Qiongjiu's EXISTING Out-of-Turn Damage stat (her
    // validated 10% passive Out-of-Turn support damage → 17% total) inside the SAME additive
    // bracket — NOT a support-specific modifier: the engine consumes the outOfTurnDmg panel
    // stat for ANY event outside the unit's own turn (in the MVP, Support Actions are the only
    // such events). Own-turn attacks never receive it. No secondary effect is validated for SN
    // (none invented). DIRECT in-game match: SN + V6 + DU2 → bucket 1.57 → 865.
    stats: { atkPct: 0.05, critRate: 0.05, critDmg: 0.05, outOfTurnDmg: 0.07 },
  },
];