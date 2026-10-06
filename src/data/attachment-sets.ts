import type { AttachmentSetDef, AttachmentSetSlot } from "../model/types.js";

/**
 * WEAPON ATTACHMENT SETS (2026) — DATA STAGE ONLY.
 *
 * The currently CONFIRMED Attachment Sets. Attachment Sets apply to the 3 non-Muzzle slots
 * (Sight / Foregrip / Underbarrel); equipping 3 pieces of the same set activates that set's
 * 3-piece bonus. Every bonus enters the EXISTING additive DMG% bucket (`additive_dealt`) — there
 * is NO separate damage-increase bucket. A set may carry MULTIPLE additive effects (e.g. Close
 * Assault = an unconditional term + a melee-conditional term, both summed in that same bucket).
 *
 * NOT modeled here (UNCONFIRMED — do NOT invent): attachment stat rolls/values, rarity/tier,
 * inventory/equipment, generation, Muzzle set participation, or any set-stacking behavior beyond
 * the confirmed 3-piece activation. These definitions are DATA ONLY — the engine does not consume
 * them yet (see docs/research.md §3.19 / U22). The per-slot stat pools are documented in
 * docs/research.md §3.19 and are intentionally NOT encoded here (no values were supplied).
 *
 * Gates: `element` / `ammoType` / `outOfTurn` reuse the existing engine gate vocabulary (a gate
 * the engine could evaluate once attachment sets are consumed). `targetPhaseDebuff` (Phase Strike)
 * and `physicalSummonOnBattlefield` (Summon Boost) are attachment-ONLY conditions with NO engine
 * model yet — recorded DATA ONLY, consumption DEFERRED (no Summon/target-phase mechanics invented).
 *
 * The `slots` field records the confirmed set-eligible slots. The source confirmed sets apply to
 * Sight/Underbarrel/Foregrip collectively, without stating that any individual set is restricted
 * to a subset — so every set lists all three (no per-set slot restriction is invented).
 */
const SET_SLOTS: AttachmentSetSlot[] = ["sight", "foregrip", "underbarrel"];

export const ATTACHMENT_SETS: AttachmentSetDef[] = [
  {
    id: "attachment_set_phase_strike",
    implemented: true,
    name: "Phase Strike",
    slots: SET_SLOTS,
    pieces: 3,
    // 3-piece: character deals 15% increased damage to targets with Phase attribute debuffs.
    // CONSUMED + VALIDATED in-game 2026: the `targetPhaseDebuff` gate matches when the target
    // carries a status whose `StatusDef.phase` is non-null (only `overburn` → Burn is populated).
    bonuses: [{ kind: "additive_dealt", value: 0.15, gates: { targetPhaseDebuff: true } }],
  },
  {
    id: "attachment_set_freeze_boost",
    implemented: true,
    name: "Freeze Boost",
    slots: SET_SLOTS,
    pieces: 3,
    // 3-piece: when dealing Freeze damage, damage is increased by 20%.
    bonuses: [{ kind: "additive_dealt", value: 0.2, gates: { element: ["freeze"] } }],
  },
  {
    id: "attachment_set_burn_boost",
    implemented: true,
    name: "Burn Boost",
    slots: SET_SLOTS,
    pieces: 3,
    // 3-piece: when dealing Burn damage, damage is increased by 20%.
    bonuses: [{ kind: "additive_dealt", value: 0.2, gates: { element: ["burn"] } }],
  },
  {
    id: "attachment_set_hydro_boost",
    implemented: true,
    name: "Hydro Boost",
    slots: SET_SLOTS,
    pieces: 3,
    // 3-piece: when dealing Hydro damage, damage is increased by 20%.
    bonuses: [{ kind: "additive_dealt", value: 0.2, gates: { element: ["hydro"] } }],
  },
  {
    id: "attachment_set_corrosion_boost",
    implemented: true,
    name: "Corrosion Boost",
    slots: SET_SLOTS,
    pieces: 3,
    // 3-piece: when dealing Corrosion damage, damage is increased by 20%.
    bonuses: [{ kind: "additive_dealt", value: 0.2, gates: { element: ["corrosion"] } }],
  },
  {
    id: "attachment_set_summon_boost",
    implemented: false,
    name: "Summon Boost",
    slots: SET_SLOTS,
    pieces: 3,
    // 3-piece: while this unit's PHYSICAL Summon is on the battlefield, damage dealt by this unit
    // AND by that physical Summon is increased by 20%. The bonus applies to both the unit and the
    // summon (one effect, applied to each). The Summon condition is NOT evaluable by the current
    // engine (no Summon model) — recorded DATA ONLY, engine consumption DEFERRED; no Summon
    // mechanics are invented to consume it.
    bonuses: [{ kind: "additive_dealt", value: 0.2, gates: { physicalSummonOnBattlefield: true } }],
  },
  {
    id: "attachment_set_physical_boost",
    implemented: true,
    name: "Physical Boost",
    slots: SET_SLOTS,
    pieces: 3,
    // 3-piece: when dealing Physical damage, damage is increased by 20%. Physical = phase-less
    // (element null) — the existing taxonomy's representation of Physical damage.
    bonuses: [{ kind: "additive_dealt", value: 0.2, gates: { element: [null] } }],
  },
  {
    id: "attachment_set_tactical_calculus",
    implemented: true,
    name: "Tactical Calculus",
    slots: SET_SLOTS,
    pieces: 3,
    // 3-piece: damage dealt OUTSIDE this unit's turn (Support Attacks, Interceptions,
    // Counterattacks, other attacks from passive effects) is increased by 25%. Reuses the existing
    // out-of-turn gate semantics (MVP: support actions are the only out-of-turn attacker).
    bonuses: [{ kind: "additive_dealt", value: 0.25, gates: { outOfTurn: true } }],
  },
  {
    id: "attachment_set_close_assault",
    implemented: true,
    name: "Close Assault",
    slots: SET_SLOTS,
    pieces: 3,
    // 3-piece: damage dealt is increased by 12%; when dealing melee damage, additionally +24%.
    // Both terms are additive in the ONE DMG% bucket, so a melee hit receives 12% + 24% = 36%.
    // No separate bucket for the melee term.
    bonuses: [
      { kind: "additive_dealt", value: 0.12 },
      { kind: "additive_dealt", value: 0.24, gates: { ammoType: ["melee"] } },
    ],
  },
  {
    id: "attachment_set_ultimate_pursuit",
    implemented: false,
    name: "Ultimate Pursuit",
    slots: SET_SLOTS,
    pieces: 3,
    // 3-piece: Ultimate skill damage/healing/shield effects +5%; +1 stack after each Ultimate use,
    // max 4. The stack rule is recorded DATA ONLY — the exact stacking CALCULATION is NOT modeled.
    bonuses: [
      {
        kind: "ultimate_effect_boost",
        value: 0.05,
        appliesTo: ["damage", "healing", "shield"],
        stack: { perUse: 1, max: 4 },
      },
    ],
  },
  {
    id: "attachment_set_double_strategy",
    implemented: false,
    name: "Double Strategy",
    slots: SET_SLOTS,
    pieces: 3,
    // 3-piece: +10% TARGETED damage when the target is NOT near Cover; +10% AoE damage when the
    // target IS near Cover. Cover detection is NOT available in the engine (MVP = always No Cover)
    // — the `targetNearCover` condition is recorded DATA ONLY, consumption DEFERRED.
    bonuses: [
      { kind: "additive_dealt", value: 0.1, gates: { category: "targeted", targetNearCover: false } },
      { kind: "additive_dealt", value: 0.1, gates: { category: "aoe", targetNearCover: true } },
    ],
  },
  {
    id: "attachment_set_phase_resonance",
    implemented: false,
    name: "Phase Resonance",
    slots: SET_SLOTS,
    pieces: 3,
    // 3-piece: if the active skill exploits a phase weakness, gain Phase Boost for 1 turn BEFORE
    // the attack; if it exploits two phase weaknesses, +10% damage dealt. "Phase Boost" is a
    // referenced existing mechanic — NOT defined here. The phase-weakness-count condition is
    // recorded DATA ONLY (engine exposes no phase-count gate) — consumption DEFERRED.
    bonuses: [
      {
        kind: "grant_status",
        statusName: "Phase Boost",
        durationRounds: 1,
        target: "self",
        timing: "before_attack",
        gates: { skillTypes: ["active"], phaseWeaknessCount: 1 },
      },
      { kind: "additive_dealt", value: 0.1, gates: { skillTypes: ["active"], phaseWeaknessCount: 2 } },
    ],
  },
  {
    id: "attachment_set_emergency_repair",
    implemented: false,
    name: "Emergency Repair",
    slots: SET_SLOTS,
    pieces: 3,
    // 3-piece: if an ALLIED unit's HP is fully healed by an active skill, restore 2 Stability
    // Index to them; triggers at most ONCE per turn. No ally-healing/full-heal model exists in the
    // engine — the `allyFullHeal` condition is recorded DATA ONLY, consumption DEFERRED.
    bonuses: [
      { kind: "restore_stability", amount: 2, target: "allies", oncePerTurn: true, gates: { allyFullHeal: true } },
    ],
  },
  {
    id: "attachment_set_ally_support",
    implemented: false,
    name: "Ally Support",
    slots: SET_SLOTS,
    pieces: 3,
    // 3-piece: when using a DEFENSE skill, additionally apply "Area Defense II" to allied units for
    // 2 turns. "Area Defense II" is a referenced status — NOT defined here (the status definition
    // is not added by this data). The defense-skill classification is recorded DATA ONLY (the
    // engine has no defense-skill category) — consumption DEFERRED.
    bonuses: [
      { kind: "grant_status", statusName: "Area Defense II", durationRounds: 2, target: "allies", gates: { defenseSkill: true } },
    ],
  },
  {
    id: "attachment_set_shielded_recovery",
    implemented: false,
    name: "Shielded Recovery",
    slots: SET_SLOTS,
    pieces: 3,
    // 3-piece: while this unit has a shield-type effect, damage taken −15% and healing received
    // +15%. The shield condition is NOT available in the engine (no shield mechanic) — recorded
    // DATA ONLY, consumption DEFERRED. Two DISTINCT non-damage effects (a taken reduction and a
    // healing-received increase), NOT a DMG% term.
    bonuses: [
      { kind: "damage_reduction", value: 0.15, gates: { hasShield: true } },
      { kind: "healing_received", value: 0.15, gates: { hasShield: true } },
    ],
  },
];
