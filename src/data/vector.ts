import type { CharacterDef, KeyDef } from "../model/types.js";

/**
 * VECTOR (琼/Vector) — doll data (2026, slice B4).
 *
 * ## What this file is, and what it deliberately is NOT
 * This registers Vector with the subset of her kit that the engine can **honestly** express today.
 * Every clause that needs a mechanic the engine lacks is **recorded** — in the ability's
 * `deferredNote`, on the key's `deferredNote`, or in the passive's comment — and **NOT approximated**.
 * Project rules forbid inventing mechanics; the established precedent is the 7 inert attachment sets
 * and the RECORDED-ONLY weapon-trait outcome.
 *
 * **Consequence, stated plainly: her damage reads LOW compared with the real game.** Missing pieces
 * include skill-level tile generation, skill Confectance gain, an ability-sourced percent-of-ATK
 * fixed-damage AoE, and three undefined statuses (Smolder, Overheat Combustion, Accelerant). None of
 * those is silently dropped — each is named where it belongs.
 *
 * ## Evidence
 * - **Base stats: `Validated`** — in-game character sheet (user-provided, 2026-10-09), the same basis
 *   as Qiongjiu's own base stats.
 * - **Everything else: `[SOURCE]` / Not Tested** — the community database (`docs/dolls/vector.md`).
 *   A validated *stat* is not a validated *behaviour*: no Vector behaviour has been tested.
 *
 * Owning documents: `docs/dolls/vector.md` (her source record + gap inventory §7, §7.1),
 * `docs/research.md` §3.23–§3.33 (the mechanics her kit touches), `docs/tiles.md` (the tile system),
 * `docs/project.md` §8 backlog B4.
 */

// ------------------------------------------------------------------ Fixed Keys (6)
//
// FK1/FK3/FK4/FK6 are RECORDED-ONLY (see each `deferredNote`): every one of them needs a mechanic the
// engine does not have. FK2 and FK5 are expressible.

const VECTOR_FK2: KeyDef = {
  id: "vector_fk2_splattering_pessimism",
  name: "Splattering Pessimism",
  verified: false,
  // Exactly Qiongjiu's FK1 Concentration shape (+3 Confectance at battle start).
  battleStartEffects: [{ resource: "confectance", amount: 3 }],
  description: "Gains 3 points of Confectance Index at the start of the battle.",
};

const VECTOR_FK5: KeyDef = {
  id: "vector_fk5_unfortunate_jinx",
  name: "Unfortunate Jinx",
  verified: false,
  battleStartEffects: [],
  // T9's mechanism (2026): a taken-side reduction gated on the holder's POSITION. The source states
  // it for a "Burn tile", so `elements: ["burn"]` is the gate; 20% ⇒ value 0.2.
  damageReductionWhileOnTile: { value: 0.2, elements: ["burn"] },
  description: "While on a Burn tile, damage taken is reduced by 20%. At the end of the action, restores 2 points of stability index and 10% of max HP.",
  deferredNote:
    "PARTIAL (B4, 2026). The 'while on a Burn tile, damage taken −20%' half IS wired (T9's `damageReductionWhileOnTile`), though it is INERT end to end in the MVP — the damage path only targets the dummy, which carries no Fixed Keys, and the doll-damage path bypasses the taken-reduction chain. The SECOND half — 'at the end of the action, restores 2 points of stability index and 10% of max HP' — is NOT modelled: the engine has no per-key end-of-action self-restore (its `heal`/`restore_stability` effects belong to the STATUS/attachment-set paths, not Fixed Keys), and allied/self healing beyond `heal` is a recorded gap (vector.md G8). Not implemented rather than approximated.",
};

const VECTOR_FK1: KeyDef = {
  id: "vector_fk1_hospice_care",
  name: "Hospice Care",
  verified: false,
  battleStartEffects: [],
  description: "If Dead End Meltdown kills its main target, generates Incineration tiles within 3 tiles of the target for 2 turns.",
  deferredNote:
    "RECORDED-ONLY (B4, 2026). Needs TWO things the engine lacks: (1) skill/passive-driven TILE GENERATION — nothing outside the tile subsystem can call `generateTiles` today (`docs/tiles.md` §10, T8/T12); and (2) the clause is armed by a KILLING BLOW on the skill's main target, and the MVP training dummy is deliberately unkillable (`hp 999999999`, never removed), so the condition is unreachable by construction. Note `onKillStatuses` exists but applies STATUSES on a killing blow — it cannot generate tiles.",
};

const VECTOR_FK3: KeyDef = {
  id: "vector_fk3_dispassionate_support",
  name: "Dispassionate Support",
  verified: false,
  battleStartEffects: [],
  description: "Before the attack, cleanses 2 buffs from the enemy target.",
  deferredNote:
    "RECORDED-ONLY (B4, 2026). The existing cleanse (`cleanseDispellable` + `KeyDef.supportActionCleanse`) is scoped to SUPPORT ACTIONS and removes exactly 1 dispellable buff (`vector.md` G11); this clause needs 2 buffs removed before ANY attack, on the enemy target. Different scope and count — not implemented rather than stretched from the support-scoped mechanic.",
};

const VECTOR_FK4: KeyDef = {
  id: "vector_fk4_proliferating_despair",
  name: "Proliferating Despair",
  verified: false,
  battleStartEffects: [],
  description: "Before dealing damage to a large target with an active attack, additionally deals 1 instance of fixed damage equal to 15% of attack.",
  deferredNote:
    "RECORDED-ONLY (B4, 2026). Needs the 'large target' CLASSIFICATION, which the engine does not model (`vector.md` G10) — the boss's 3×3 footprint exists on the grid, but no 'large target' flag exists on a unit. It also needs a per-attack extra fixed-damage instance sourced from a KEY (the engine's `fixed_damage` is a STATUS effect). Both missing.",
};

const VECTOR_FK6: KeyDef = {
  id: "vector_fk6_negative_motivation",
  name: "Negative Motivation",
  verified: false,
  battleStartEffects: [],
  description: "When an enemy unit within range is inflicted with Overburn, launches Emergency Support, dealing Burn damage equal to 60% of attack and 1 point of stability damage. Triggers once per turn.",
  deferredNote:
    "RECORDED-ONLY (B4, 2026). The TRIGGER is engine-supported (`support_attack.trigger: \"onEnemyStatusApplied\"` + `statusId`, research §3.30) — but it launches **Emergency Support**, which is an UNDEFINED status (`vector.md` §7.1 row 8). The trigger has no payload to fire, so the key is inert until Emergency Support is defined.",
};

// ------------------------------------------------------------------ the doll

export const VECTOR: CharacterDef = {
  id: "vector",
  name: "Vector",
  // Support class (source: identity record). The Support Dispatch flat is applied by the existing
  // panel path — no per-doll work (docs/dolls/vector.md §3).
  class: "support",
  // Signature weapon Banshee's Whisper is a SUBMACHINE GUN (source). NOTE: the Apex Chassis
  // component recorded in this repo is gated on `weaponType: "ar"`, so Vector correctly does NOT
  // match it — recorded in her source doc to prevent a wrong assumption later.
  weaponType: "smg",
  phase: "burn",
  // VALIDATED (in-game character sheet, user-provided 2026-10-09): HP 1819 / ATK 748 / DEF 569 /
  // Stability 10 / Crit Rate 20% / Crit DMG 120% (critDmg 0.2 — the multiplier is `1 + critDmg`).
  base: { atk: 748, hp: 1819, def: 569, stability: 10, critRate: 0.2, critDmg: 0.2 },
  // Movement 6 (in-game sheet, corroborated by the source's `movement: 6`).
  mobility: 6,
  // PATTERN REMOLDER (source §2.2): Lv.60 Remolder FLAT stats. The SET BONUS definitions are NOT in
  // the source, so `remolderSetBonuses` is deliberately ABSENT rather than invented.
  remolderFlat: { atk: 224, hp: 651, def: 245 },

  skills: {
    // ---------------------------------------------------------------- Basic — COMPLETE
    basic: {
      id: "vector_basic",
      name: "Depressive Mentality",
      playerDescription: "Selects 1 enemy target within 7 tiles, dealing Physical damage equal to 80% of attack.",
      type: "basic",
      levels: {
        1: {
          id: "vector_basic",
          name: "Depressive Mentality",
          type: "basic",
          // Physical = PHASE-LESS. `element: null` is an explicit phase-less ATTACK (distinct from an
          // ABSENT element, which means no attack attribute at all — research §3.4).
          element: null,
          ammoType: "light_ammo",
          multiplier: 0.8,
          // Stability 3 — Vector's Basic differs from Qiongjiu's (2).
          stabDamage: 3,
          cooldown: 0,
          confectanceCost: 0,
          range: 7,
        },
      },
    },

    // ---------------------------------------------------------------- Skill 1 — damage half only
    active1: {
      id: "vector_dead_end_meltdown",
      name: "Dead End Meltdown",
      playerDescription: "Selects 1 enemy target within 7 tiles and deals Burn damage equal to 120% of attack to it.",
      type: "active",
      levels: {
        1: {
          id: "vector_dead_end_meltdown",
          name: "Dead End Meltdown",
          type: "active",
          element: "burn",
          ammoType: "light_ammo",
          multiplier: 1.2,
          stabDamage: 3,
          cooldown: 1,
          confectanceCost: 0,
          range: 7,
          deferredNote:
            "PARTIAL (B4, 2026) — the DAMAGE half is modelled. MISSING, in source order: (1) the CONDITIONAL FIXED DAMAGE — 'if the target has any Burn type debuffs, also deals fixed damage equal to 50% of attack to all enemy targets within 3 tiles of the target' — needs an ability-sourced percent-of-ATK fixed damage (the engine's `percentOfAtk` exists only on STATUS `fixed_damage`) AND multi-enemy targeting (the damage path only ever hits the single dummy); (2) 'applies Overburn for 2 turns' — expressible, but it is CONDITIONAL on the same Burn-debuff clause and targets the AROUND-TARGET area, so it is omitted with the condition rather than applied unconditionally; (3) 'Vector gains 2 points of Confectance Index' — the engine's `resource_gain` is a PASSIVE effect with `on: \"onDamageDealt\"`; there is no skill-level Confectance grant. V3 raises multiplier to 150% and fixed damage to 80% and removes the Burn-debuff condition (derived arithmetic in her source doc).",
          // Lv.2 (Fortification V3) — see the fortificationMap; the level carries the SAME missing
          // clauses (it inherits this deferredNote's scope).
        },
        2: {
          id: "vector_dead_end_meltdown",
          name: "Dead End Meltdown",
          type: "active",
          element: "burn",
          ammoType: "light_ammo",
          // V3: "damage multiplier is increased by 30%" ⇒ 120% → 150% (source's own arithmetic).
          multiplier: 1.5,
          stabDamage: 3,
          cooldown: 1,
          confectanceCost: 0,
          range: 7,
          deferredNote:
            "PARTIAL (B4, 2026) — as Lv.1, plus V3's own additions NOT modelled: fixed damage 50% → 80% and the Burn-debuff condition REMOVED (still needs ability-sourced percent-of-ATK fixed damage + multi-target), 'additionally applies Overheat Combustion for 2 turns' (Overheat Combustion is UNDEFINED — vector.md §7.1 row 3), and '+2 more Confectance' (no skill-level grant).",
        },
      },
    },

    // ---------------------------------------------------------------- Skill 2 — damage half only
    active2: {
      id: "vector_portent_of_doom",
      name: "Portent of Doom",
      playerDescription: "Selects 1 enemy target within 7 tiles and deals Burn damage equal to 100% of attack to them.",
      type: "active",
      levels: {
        1: {
          id: "vector_portent_of_doom",
          name: "Portent of Doom",
          type: "active",
          element: "burn",
          // The source's structured record shows NO ammo type (`ammoTypes: "[]"`) while its sibling
          // actives show Light Ammo (vector.md §7, an open question). Left ABSENT — no ammo attribute —
          // rather than assumed either way.
          multiplier: 1.0,
          stabDamage: 3,
          cooldown: 1,
          confectanceCost: 0,
          range: 7,
          deferredNote:
            "PARTIAL (B4, 2026) — the DAMAGE half is modelled. MISSING: (1) 'applies Smolder for 2 turns' — Smolder is UNDEFINED (vector.md §7.1 row 4); its V4 'each Burn debuff increases damage taken by 3%' clause COULD be expressed today (`damage_modifier.perMatching`, research §3.29) but the status as a whole needs its tile-generation clause, so it is not half-defined; (2) 'Vector gains 2 points of Confectance Index' — no skill-level Confectance grant exists. V4 raises the multiplier to 130% and adds Overheat 1t (Overheat is UNDEFINED — row 5).",
        },
        2: {
          id: "vector_portent_of_doom",
          name: "Portent of Doom",
          type: "active",
          element: "burn",
          // V4: "damage multiplier is increased by 30%" ⇒ 100% → 130%.
          multiplier: 1.3,
          stabDamage: 3,
          cooldown: 1,
          confectanceCost: 0,
          range: 7,
          deferredNote:
            "PARTIAL (B4, 2026) — as Lv.1, plus V4's own additions NOT modelled: the Smolder upgrade, 'applies Overheat for 1 turn' (UNDEFINED), and '+2 more Confectance' (no skill-level grant).",
        },
      },
    },

    // ---------------------------------------------------------------- Ultimate — damage + Extra Command
    ultimate: {
      id: "vector_searing_finale",
      name: "Searing Finale",
      playerDescription: "Selects a tile within 7 tiles, dealing AoE Burn damage equal to 60% of attack to all enemy units within 7 tiles of the target tile. Vector gains Extra Command.",
      type: "ultimate",
      levels: {
        1: {
          id: "vector_searing_finale",
          name: "Searing Finale",
          type: "ultimate",
          element: "burn",
          // AoE class (authoritative in-game class). NOTE: `damageCategory` is descriptive — the
          // engine's ONLY consumer is the AoE-gated DEF-ignore; multi-enemy target SELECTION is not
          // modelled, so this resolves against the single dummy like every other attack.
          damageCategory: "aoe",
          multiplier: 0.6,
          stabDamage: 1,
          cooldown: 4,
          confectanceCost: 3,
          range: 7,
          // "Vector gains Extra Command" — IMPLEMENTED 2026 (`extra_command` → `extra_action`).
          appliesStatuses: [{ statusId: "extra_command", target: "self", durationRounds: 2 }],
          deferredNote:
            "PARTIAL (B4, 2026) — the DAMAGE half and the Extra Command grant are modelled. MISSING: (1) 'generates Incineration tiles, lasting 2 turns' — no skill can generate a tile today (`docs/tiles.md` §10); (2) 'applies Accelerant to ALL ALLIED UNITS, lasting 2 turns' — all-allies targeting IS supported (`StatusApplySpec.target: \"all_allies\"`, research §3.28) but **Accelerant is UNDEFINED** (vector.md §7.1 row 6), so there is no status to apply. V2/V6 change Accelerant and add Blazing Assault II + an ally cleanse / Apathetic Resistance — see those levels.",
        },
        2: {
          id: "vector_searing_finale",
          name: "Searing Finale",
          type: "ultimate",
          element: "burn",
          damageCategory: "aoe",
          multiplier: 0.6,
          stabDamage: 1,
          cooldown: 4,
          confectanceCost: 3,
          range: 7,
          // V2 adds "applies Blazing Assault II to all allied units for 2 turns" — that status EXISTS,
          // so this half IS wired. (The Accelerant change and the 2-debuff ally cleanse are not.)
          appliesStatuses: [
            { statusId: "extra_command", target: "self", durationRounds: 2 },
            { statusId: "blazing_assault_ii", target: "all_allies", durationRounds: 2 },
          ],
          deferredNote:
            "PARTIAL (B4, 2026). WIRED: the damage half (unchanged at V2 — the source states no multiplier delta), Extra Command, and 'applies Blazing Assault II to all allied units for 2 turns' (V2). NOT MODELLED: the tile generation, Accelerant itself, 'the effect of Accelerant changes (Burn damage +20%)' (Accelerant undefined), and 'cleanses 2 debuffs from all allied units' — the engine's `cleanseDispellable` is scoped to a single dispellable TARGET buff before a Support Action and has no all-allies ×2 form.",
        },
        3: {
          id: "vector_searing_finale",
          name: "Searing Finale",
          type: "ultimate",
          element: "burn",
          damageCategory: "aoe",
          multiplier: 0.6,
          stabDamage: 1,
          cooldown: 4,
          confectanceCost: 3,
          range: 7,
          // V6 adds "Vector gains Apathetic Resistance, lasting for 2 turns" — that status EXISTS.
          appliesStatuses: [
            { statusId: "extra_command", target: "self", durationRounds: 2 },
            { statusId: "blazing_assault_ii", target: "all_allies", durationRounds: 2 },
            { statusId: "apathetic_resistance", target: "self", durationRounds: 2 },
          ],
          deferredNote:
            "PARTIAL (B4, 2026) — as V2, plus V6's own additions NOT modelled: 'Accelerant gains: on Burn damage, critical damage +15%; every Burn buff increases damage dealt by 5%' (an ACCELERANT upgrade — Accelerant is undefined; note its per-Burn-buff count clause COULD be expressed today via `damage_modifier.perMatching`, research §3.29, but the status itself cannot).",
        },
      },
    },
  },

  // ---------------------------------------------------------------- Passive (Perception Block)
  //
  // Clauses, as the source states them (5 at Lv.3; Lv.1 carries clauses 1–4):
  //   1. Immune to negative effects inflicted by Burn tiles.           → IMPLEMENTED (T9 mechanism)
  //   2. Before dealing Burn damage, if the target has Overburn,
  //      applies Overheat Combustion for 2 turns.                       → BLOCKED (status undefined)
  //   3. At the start of the battle, increases the number of all of
  //      Support Attacks dealing Burn damage by 1 (2 at Lv.3).          → BLOCKED (G6: a Burn-damage
  //                                                                       support classification does
  //                                                                       not exist)
  //   4. At the start of the turn, if Confectance Index is at maximum,
  //      consumes ALL points to increase attack by 10% for the round.    → IMPLEMENTED (2026,
  //                                                                       `turn_start_confectance_drain`)
  //   5. (Lv.3/V5) for each point of Confectance Index ABOVE the
  //      maximum, +10% attack, up to 20%.                              → IMPLEMENTED (2026, the
  //                                                                       extra-slot pool + perExtraSlotAtkPct)
  passive: {
    id: "vector_perception_block",
    name: "Perception Block",
    playerDescription:
      "Immune to negative effects inflicted by Burn tiles. At the start of the turn, if Confectance Index is at maximum, consumes all points of Confectance Index to increase attack by 10% until the end of the round.",
    // Baseline = Lv.1 effects. Clause 2 (Overheat Combustion) and clause 3 (Burn support count) are
    // RECORDED-ONLY — see the comment block above and `levels[3]` below.
    effects: [
      // Clause 1 — the T9 tile-debuff immunity. "Burn tiles" ⇒ elements ["burn"].
      { kind: "tile_debuff_immunity", elements: ["burn"] },
      // Clause 4 — at max Confectance, drain everything for a ROUND-SCOPED +10% ATK.
      // `extraSlots`/`perExtraSlotAtkPct` are the V5 (Lv.3) half — set only at that level.
      { kind: "turn_start_confectance_drain", atkPct: 0.1 },
    ],
    levels: {
      3: [
        { kind: "tile_debuff_immunity", elements: ["burn"] },
        // V5 grants the 2 EXTRA Confectance slots: clause 5 is ADDITIVE on clause 4 ⇒ the totals are
        // +10% / +20% / +30% for 0 / 1 / 2 FILLED extras (user-provided in-game evidence, 2026-10-09).
        // `confectanceMax` stays 6 (U9) — the extras are a SEPARATE pool.
        { kind: "turn_start_confectance_drain", atkPct: 0.1, extraSlots: 2, perExtraSlotAtkPct: 0.1 },
      ],
    },
    // READ ME BEFORE EXTENDING: clauses 2 and 3 are NOT modelled and are NOT omitted by oversight.
    // Clause 2 needs Overheat Combustion, an UNDEFINED status (vector.md §7.1 row 3) whose own
    // "allies within a 1-tile area" portion is a HOLDER-side area clause — DEFERRED (research §3.33 /
    // G14). Clause 3 needs a "Support Attacks dealing Burn damage" classification the engine does not
    // have (G6). Defining a placeholder here would approximate her kit, which the project forbids.
    //
    // Per-level authoritative text that is NOT executable (the `PassiveDef` convention): Lv.1 carries
    // clauses 1–4 and Lv.3 replaces clause 3's "+1" with "+2".
    deferredNotes: {
      1: "PARTIAL (B4, 2026). Clauses 1 (Burn-tile debuff immunity) and 4 (the at-max Confectance drain) ARE wired. Clause 2 ('before dealing Burn damage, if the target has Overburn, applies Overheat Combustion 2t') is NOT: Overheat Combustion is UNDEFINED (vector.md §7.1 row 3), and its area portion is holder-side/DEFERRED (research §3.33). Clause 3 ('at battle start, +1 Support Attack dealing Burn damage') is NOT: the engine has no Burn-damage support classification (G6).",
      3: "PARTIAL (B4, 2026). Clauses 1, 4 and 5 (V5's 2 extra Confectance slots ⇒ +10/+20/+30% ATK for 0/1/2 filled) ARE wired. Clause 2 (Overheat Combustion) and clause 3 ('+2 Support Attacks dealing Burn damage' — raised from 1 at this level) remain NOT modelled, for the same reasons as Lv.1.",
    },
  },

  // ---------------------------------------------------------------- Fortification map
  //
  // The source's own order (V1→passive Lv2, V2→ultimate Lv2, V3→active1 Lv2, V4→active2 Lv2,
  // V5→passive Lv3, V6→ultimate Lv3). NOTE this differs from Qiongjiu's ordering — each character's
  // map is its own data (docs/dolls/vector.md §5).
  fortificationMap: [
    { v: 1, ability: "passive", toLevel: 2 },
    { v: 2, ability: "ultimate", toLevel: 2 },
    { v: 3, ability: "active1", toLevel: 2 },
    { v: 4, ability: "active2", toLevel: 2 },
    { v: 5, ability: "passive", toLevel: 3 },
    { v: 6, ability: "ultimate", toLevel: 3 },
  ],

  // FK2 and FK5 are wired; FK1/FK3/FK4/FK6 are RECORDED-ONLY with their reasons (see their defs).
  fixedKeys: [VECTOR_FK1, VECTOR_FK2, VECTOR_FK3, VECTOR_FK4, VECTOR_FK5, VECTOR_FK6],
};
