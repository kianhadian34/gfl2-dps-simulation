import type { CharacterDef } from "../model/types.js";

/**
 * Qiongjiu (琼玖) — first validation character (docs/architecture.md §11).
 * Values per docs/research.md §3.11–3.14: multipliers CONFIRMED; Support Boost
 * I/II values & durations and Confectance cap UNVERIFIED (flagged at runtime).
 */
export const QIONGJIU: CharacterDef = {
  id: "qiongjiu",
  name: "Qiongjiu",
  phase: "burn",
  // Level-60 base stats (research §3.8, CONFIRMED, 2024 data).
  base: { atk: 1224, hp: 2494, def: 695, stability: 9, critRate: 0.2, critDmg: 0.2 },
  weapon: {
    id: "jinshizou",
    name: "Jinshizou (金石奏)",
    rarity: "elite",
    atkLvl1: 53,
    atkLvl60: 369,
    level: 60,
    subStats: [{ stat: "pctAtk", value: 0.15 }],
  },
  skills: {
    // ---------------------------------------------------------------- Basic (Lv1 only — never levels from Fortification)
    basic: {
      id: "qiongjiu_basic",
      name: "Fuse",
      type: "basic",
      levels: {
        1: {
          id: "qiongjiu_basic",
          name: "Fuse",
          type: "basic",
          element: "physical",
          ammoType: "medium_ammo",
          multiplier: 0.8,
          stabDamage: 2,
          cooldown: 0,
          confectanceCost: 0,
        },
      },
    },
    // ---------------------------------------------------------------- Common Rail (authoritative kit sync 2026):
    // Lv1 = 150% ATK / Burn / Stab 3 / CD1 / self Support Boost I. Lv2 (V1) adds the kill-related
    // Support Boost I change (deferred — no multiplier change; 150% belongs to Lv1, the old 'Lv2 = 150%'
    // reading was a misplacement and is corrected).
    active1: {
      id: "qiongjiu_common_rail",
      name: "Common Rail",
      type: "active",
      levels: {
        1: {
          id: "qiongjiu_common_rail",
          name: "Common Rail",
          type: "active",
          element: "burn",
          ammoType: "medium_ammo", // authoritative category: game UI shows "Ammo Type: Medium" (terminology fix 2026)
          multiplier: 1.5,
          stabDamage: 3, // Stability 3 (authoritative Lv1)
          cooldown: 1,
          confectanceCost: 0,
          appliesStatuses: [
            { statusId: "support_boost_i", durationRounds: 1, stacks: 1, target: "self" },
          ],
        },
        2: {
          id: "qiongjiu_common_rail",
          name: "Common Rail",
          type: "active",
          element: "burn",
          ammoType: "medium_ammo",
          multiplier: 1.5,
          stabDamage: 3,
          cooldown: 1,
          confectanceCost: 0,
          appliesStatuses: [
            { statusId: "support_boost_i", durationRounds: 1, stacks: 1, target: "self" },
          ],
          deferredNote: "Lv2 (V1): 'If a kill is scored, increase the damage bonus of Support Boost I to 30%.' Kill-condition behavior and the Support-Boost scoping are NOT executable by the current engine — recorded, deferred. No multiplier change at Lv2.",
        },
      },
    },
    // ---------------------------------------------------------------- Guide to Victory (authoritative kit sync 2026):
    // Lv1 = 110% ATK / Burn / Stab 3 (corrected from 0) / CD1 / Overburn 2 turns. Lv2 (V2) adds
    // +100% crit rate vs Overburn-inflicted targets (deferred — target-has-status condition not supported).
    active2: {
      id: "qiongjiu_guide_to_victory",
      name: "Guide to Victory",
      type: "active",
      levels: {
        1: {
          id: "qiongjiu_guide_to_victory",
          name: "Guide to Victory",
          type: "active",
          element: "burn",
          ammoType: "medium_ammo",
          multiplier: 1.1,
          stabDamage: 3, // Stability 3 (authoritative Lv1; previously 0 — corrected)
          cooldown: 1,
          confectanceCost: 0,
          appliesStatuses: [{ statusId: "overburn", durationRounds: 2, target: "target" }],
        },
        2: {
          id: "qiongjiu_guide_to_victory",
          name: "Guide to Victory",
          type: "active",
          element: "burn",
          ammoType: "medium_ammo",
          multiplier: 1.1,
          stabDamage: 3,
          cooldown: 1,
          confectanceCost: 0,
          appliesStatuses: [{ statusId: "overburn", durationRounds: 2, target: "target" }],
          deferredNote: "Lv2 (V2): 'If the target is inflicted with Overburn, increases the critical rate of this attack by 100%.' Target-has-status conditional crit-rate is NOT executable by the current engine (no target-status condition) — recorded, deferred. Crit-cap/stacking semantics not inferred.",
        },
      },
    },
    // ---------------------------------------------------------------- Pressing the Momentum (authoritative kit sync 2026):
    // Lv1 = cost 3, +3 Support Boost II, at-max Confectance +1 stack & +1 Support Action max (executed).
    // Lv2 (V4) Vulnerable (No-Cover-gated) and Lv3 (V5) Damage Up II (pre-ally-hit timing) are deferred.
    ultimate: {
      id: "qiongjiu_pressing_momentum",
      name: "Pressing the Momentum",
      type: "ultimate",
      levels: {
        1: {
          id: "qiongjiu_pressing_momentum",
          name: "Pressing the Momentum",
          type: "ultimate",
          element: "burn",
          ammoType: "medium_ammo",
          stabDamage: 0,
          cooldown: 0,
          confectanceCost: 3,
          appliesStatuses: [
            // SB II granted WITHOUT a duration: the established SB persistence rules apply
            // (no expiry; stacks remain until consumed by Support Actions) — corrected 2026.
            { statusId: "support_boost_ii", stacks: 3, target: "self" },
          ],
          // At max Confectance (cap 6, U9 CONFIRMED): +1 extra Support Boost II stack and
          // +1 support-attack capacity this round.
          onCastAtMaxConfectance: {
            supportQuotaBonus: 1,
            extraStatuses: [{ statusId: "support_boost_ii", stacks: 1, target: "self" }],
          },
        },
        2: {
          id: "qiongjiu_pressing_momentum",
          name: "Pressing the Momentum",
          type: "ultimate",
          element: "burn",
          ammoType: "medium_ammo",
          stabDamage: 0,
          cooldown: 0,
          confectanceCost: 3,
          appliesStatuses: [
            { statusId: "support_boost_ii", durationRounds: 1, stacks: 3, target: "self" },
          ],
          onCastAtMaxConfectance: {
            supportQuotaBonus: 1,
            extraStatuses: [{ statusId: "support_boost_ii", durationRounds: 1, stacks: 1, target: "self" }],
          },
          deferredNote: "Lv2 (V4): 'Applies Vulnerable to targets that are not protected by Cover for 1 turn.' Vulnerable I status exists (taken +10%); Cover-gated application is NOT executable by the current engine — NOT applied here (would be silent wrong behavior), recorded, deferred.",
        },
        3: {
          id: "qiongjiu_pressing_momentum",
          name: "Pressing the Momentum",
          type: "ultimate",
          element: "burn",
          ammoType: "medium_ammo",
          stabDamage: 0,
          cooldown: 0,
          confectanceCost: 3,
          appliesStatuses: [
            { statusId: "support_boost_ii", durationRounds: 1, stacks: 3, target: "self" },
          ],
          onCastAtMaxConfectance: {
            supportQuotaBonus: 1,
            extraStatuses: [{ statusId: "support_boost_ii", durationRounds: 1, stacks: 1, target: "self" }],
          },
          deferredNote: "Lv3 (V5): 'When performing Support Action, applies Damage Up II to self and the allied unit for 1 turn before the aforementioned allied unit makes their attack.' Damage Up II status exists (dealt +20%); the pre-ally-hit support timing is NOT executable (same limitation as FK3) and the ally-targeted application is unsupported — recorded, deferred.",
        },
      },
    },
    // ---------------------------------------------------------------- Support Shot: current definition held at Lv1 (default level); validated level UNKNOWN.
    support: {
      id: "qiongjiu_support",
      name: "Steady Plan — Support Shot",
      type: "support",
      levels: {
        1: {
          id: "qiongjiu_support",
          name: "Steady Plan — Support Shot",
          type: "support",
          element: "physical",
          ammoType: "medium_ammo",
          multiplier: 0.9,
          stabDamage: 2,
          cooldown: 0,
          confectanceCost: 0,
        },
      },
    },
  },
  passive: {
    id: "qiongjiu_steady_plan",
    name: "Steady Plan",
    // Baseline = Lv1 (engine fallback when no resolved level list exists).
    effects: [
      // +1 Confectance per damage event (CONFIRMED, research §3.12).
      { kind: "resource_gain", resource: "confectance", amount: 1, on: "onDamageDealt" },
      // +10% damage vs no-cover targets (CONFIRMED, research §3.11). COMPONENT 1 of 2 (Lv3 adds a second one).
      {
        kind: "conditional_damage_modifier",
        scope: "dealt",
        mode: "additive",
        value: 0.1,
        when: "target.noCover",
      },
      // Support attack: 90% ATK + 2 stab, max 3/round, never chains (CONFIRMED, research §3.14).
      {
        kind: "support_attack",
        skillId: "qiongjiu_support",
        perRoundMax: 3,
        chainable: false,
        trigger: "onAllySingleTargetHit",
      },
    ],
    // Level-aware passive (Fortification can upgrade the passive: V3 → Lv2, V6 → Lv3).
    levels: {
      1: [
        { kind: "resource_gain", resource: "confectance", amount: 1, on: "onDamageDealt" },
        {
          kind: "conditional_damage_modifier",
          scope: "dealt",
          mode: "additive",
          value: 0.1,
          when: "target.noCover",
        },
        {
          kind: "support_attack",
          skillId: "qiongjiu_support",
          perRoundMax: 3,
          chainable: false,
          trigger: "onAllySingleTargetHit",
        },
      ],
      2: [
        // Lv2 (V3): CUMULATIVE — Lv1 + Support Action damage +10% + Overburn after Support Action.
        { kind: "resource_gain", resource: "confectance", amount: 1, on: "onDamageDealt" },
        {
          kind: "conditional_damage_modifier",
          scope: "dealt",
          mode: "additive",
          value: 0.1,
          when: "always",
          actions: "support",
        },
        {
          kind: "after_support_status",
          statusId: "overburn",
          durationRounds: 2,
        },
        {
          kind: "conditional_damage_modifier",
          scope: "dealt",
          mode: "additive",
          value: 0.1,
          when: "target.noCover",
        },
        {
          kind: "support_attack",
          skillId: "qiongjiu_support",
          perRoundMax: 3,
          chainable: false,
          trigger: "onAllySingleTargetHit",
        },
      ],
      3: [
        // Lv3 (V6): CUMULATIVE — Lv2 retained + No-Cover as a SINGLE +0.20 TOTAL (the V6 screenshot
        // displays "20% No-Cover", NOT two +10% components; do not duplicate as +30%).
        { kind: "resource_gain", resource: "confectance", amount: 1, on: "onDamageDealt" },
        {
          kind: "conditional_damage_modifier",
          scope: "dealt",
          mode: "additive",
          value: 0.1,
          when: "always",
          actions: "support",
        },
        {
          kind: "after_support_status",
          statusId: "overburn",
          durationRounds: 2,
        },
        {
          kind: "conditional_damage_modifier",
          scope: "dealt",
          mode: "additive",
          value: 0.2,
          when: "target.noCover",
        },
        {
          kind: "support_attack",
          skillId: "qiongjiu_support",
          perRoundMax: 3,
          chainable: false,
          trigger: "onAllySingleTargetHit",
        },
      ],
    },
    deferredNotes: {},
  },
  // Authoritative Fortification map (character screens, 2026): each Fortification raises exactly one ability.
  fortificationMap: [
    { v: 1, ability: "active1", toLevel: 2 }, // V1 → Common Rail Lv.2
    { v: 2, ability: "active2", toLevel: 2 }, // V2 → Guide to Victory Lv.2
    { v: 3, ability: "passive", toLevel: 2 }, // V3 → Steady Plan Lv.2
    { v: 4, ability: "ultimate", toLevel: 2 }, // V4 → Pressing the Momentum Lv.2
    { v: 5, ability: "ultimate", toLevel: 3 }, // V5 → Pressing the Momentum Lv.3
    { v: 6, ability: "passive", toLevel: 3 }, // V6 → Steady Plan Lv.3
  ],
  fixedKeys: [
    {
      id: "qiongjiu_fk1_concentration",
      name: "Concentration (凝神)",
      verified: true,
      battleStartEffects: [{ resource: "confectance", amount: 3 }],
      description: "Gains 3 Confectance Index at the start of battle.",
    },
    {
      id: "qiongjiu_fk2_efficient_planning",
      name: "Efficient Planning",
      verified: true,
      battleStartEffects: [],
      description: "Before a Support Action, cleanses 1 buff from the target.",
      deferredNote: "No buff-purge mechanic exists in the MVP engine (enemy buffs are not modeled); behavior recorded, not implemented.",
    },
    {
      id: "qiongjiu_fk3_targeted_training",
      name: "Targeted Training",
      verified: true,
      battleStartEffects: [],
      description: "While in Support Mode, applies Defense Down II to the target for 1 turn before the allied unit's attack.",
      deferredNote: "Support attacks fire AFTER the triggering ally's hit resolves (simulation.ts fireSupportAttacks), so a pre-attack Defense Down II cannot be faithfully ordered; recorded, not implemented.",
    },
    {
      id: "qiongjiu_fk4_point_of_vulnerability",
      name: "Point of Vulnerability",
      verified: true,
      battleStartEffects: [],
      description: "Modifies Guide to Victory to deal damage to all enemy targets within 8 tiles in the selected direction; all enemy targets except the first receive 30% less damage.",
      deferredNote: "Multi-target/AoE targeting is out of MVP scope (single training dummy); recorded, not implemented.",
    },
    {
      id: "qiongjiu_fk5_necessary_adjustments",
      name: "Necessary Adjustments",
      verified: true,
      battleStartEffects: [],
      description: "When a phase weakness is exploited using Common Rail, gains Blazing Assault II for 2 turns.",
      deferredNote: "Requires a blazing_assault_ii status definition (magnitude UNKNOWN) and a skill-scoped (Common Rail only) weakness-exploit gain trigger; recorded, not implemented.",
    },
    {
      id: "qiongjiu_fk6_steadiness",
      name: "Steadiness",
      verified: true,
      battleStartEffects: [],
      description: "While under Support Boost, gains immunity to displacement effects applied by enemy units.",
      deferredNote: "No displacement mechanics exist in the MVP (Cover/movement out of scope) — nothing to immunize against; recorded, no engine behavior required.",
    },
  ],
  expansionKey: {
    id: "qiongjiu_exp_ruined_gem",
    name: "Ruined Gem",
    verified: true,
    battleStartEffects: [],
    description: "Support Action damage type becomes Burn damage. Damage dealt to targets with Burn debuffs is increased by 15%.",
    deferredNote: "Requires (a) mutating the support skill's element to Burn on key equip and (b) a 'target has Burn debuff' condition for the +15%; neither is representable today — the condition is deferred per the QJ content plan. Recorded, not implemented.",
  },
  affinityKey: {
    id: "qiongjiu_affinity_warm_as_jade",
    name: "Warm as Jade",
    totalLevels: 9,
    verified: true,
    levels: {
      5: { critDmg: 0.033, atk: 0.033, hp: 0.033 },
      9: { critDmg: 0.045, atk: 0.045, hp: 0.045 },
    },
    deferredNote: "Bonuses apply when equipping Qiongjiu's own Affinity Key at the given Affinity Level. Levels 6–8 are NOT assumed or interpolated (the earlier 5% Level-9 claim was incorrect; confirmed 4.5%). Engine consumption deferred: Crit Damage is not a stat_modifier stat, and affinity modifies the panel, not a combat status.",
  },
};