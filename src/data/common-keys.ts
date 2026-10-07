import type { CommonKeyDef, CommonKeyStat } from "../model/types.js";

/**
 * RUNTIME pool of the PLAYER-SELECTABLE Common Key stat kinds, in CANONICAL display order
 * (2026, user-confirmed): Crit Rate, Crit Damage, Health Boost, Defense Boost, Attack Boost —
 * all at 5.0%. The player picks from this pool for a key's SELECTABLE stat slots (slots after
 * the fixed first one); the engine validates choices against it AND rejects duplicates (all 3
 * stat kinds on a key must differ). Out-of-Turn Damage is NOT here — it is a key's EFFECT
 * (secondary effect), not a stat.
 */
export const COMMON_KEY_SELECTABLE_STAT_KINDS: CommonKeyStat[] = ["critRate", "critDmg", "hpPct", "defPct", "atkPct"];

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
    // Strategic Negotiation (VALIDATED in-game 2026, IMPLEMENTED). CORRECTED model (2026): a
    // Common Key has 3 STAT SLOTS — only the FIRST is hardcoded; the rest are PLAYER-CHOSEN
    // kinds (the key fixes their VALUE, the player picks the KIND at equip time). Strategic Negotiation's in-game
    // description lists Crit Rate first → slot #0 = Crit Rate +5% (FIXED, `kind` present);
    // slots #1/#2 are SELECTABLE (`kind` ABSENT — the player chooses; each grants the slot's
    // value 0.05 for the chosen kind). The "+7% damage dealt outside the unit's own turn"
    // (semicolon-separated in the description) is the key's SECONDARY EFFECT — modeled as an
    // EXECUTED panel-stat addition (`secondaryEffect.stats`) so it still folds into the
    // `outOfTurnDmg` panel stat (Qiongjiu's 10% passive → 17% on out-of-turn events), inside the
    // SAME additive DMG% bracket — NOT a support-specific modifier. Own-turn attacks never
    // receive it. DIRECT in-game match (Strategic Negotiation + V6 + DU2 → 865) is reproduced when the player picks
    // Crit DMG + Attack Boost for the two selectable slots (see strategic-negotiation.test.ts).
    stats: [
      { kind: "critRate", value: 0.05 }, // slot #0 — FIXED (hardcoded) stat
      { value: 0.05 }, // slot #1 — player-chosen kind
      { value: 0.05 }, // slot #2 — player-chosen kind
    ],
    secondaryEffect: {
      type: "stat",
      stats: { outOfTurnDmg: 0.07 },
      description: "Increase damage dealt outside of the unit's own turn by 7%.",
    },
  },
];