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
    basic: {
      id: "qiongjiu_basic",
      name: "Fuse",
      type: "basic",
      element: "physical",
      ammoType: "assault_rifle_ammo",
      multiplier: 0.8,
      stabDamage: 2,
      cooldown: 0,
      confectanceCost: 0,
    },
    active1: {
      id: "qiongjiu_common_rail",
      name: "Common Rail",
      type: "active",
      element: "burn",
      ammoType: "assault_rifle_ammo",
      multiplier: 1.5,
      stabDamage: 0,
      cooldown: 1,
      confectanceCost: 0,
      appliesStatuses: [
        { statusId: "support_boost_i", durationRounds: 1, stacks: 1, target: "self" },
      ],
    },
    active2: {
      id: "qiongjiu_guide_to_victory",
      name: "Guide to Victory",
      type: "active",
      element: "burn",
      ammoType: "assault_rifle_ammo",
      multiplier: 1.1,
      stabDamage: 0,
      cooldown: 1,
      confectanceCost: 0,
      appliesStatuses: [{ statusId: "overburn", durationRounds: 2, target: "target" }],
    },
    ultimate: {
      id: "qiongjiu_pressing_momentum",
      name: "Pressing the Momentum",
      type: "ultimate",
      element: "burn",
      ammoType: "assault_rifle_ammo",
      stabDamage: 0,
      cooldown: 0,
      confectanceCost: 3,
      appliesStatuses: [
        { statusId: "support_boost_ii", durationRounds: 1, stacks: 3, target: "self" },
      ],
      // Research §3.12: at max Confectance, +1 extra Support Boost II stack and
      // +1 support-attack capacity this round. Cap value UNVERIFIED (U9).
      onCastAtMaxConfectance: {
        supportQuotaBonus: 1,
        extraStatuses: [{ statusId: "support_boost_ii", durationRounds: 1, stacks: 1, target: "self" }],
      },
    },
    support: {
      id: "qiongjiu_support",
      name: "Steady Plan — Support Shot",
      type: "support",
      element: "physical",
      ammoType: "assault_rifle_ammo",
      multiplier: 0.9,
      stabDamage: 2,
      cooldown: 0,
      confectanceCost: 0,
    },
  },
  passive: {
    id: "qiongjiu_steady_plan",
    name: "Steady Plan",
    effects: [
      // +1 Confectance per damage event (CONFIRMED, research §3.12).
      { kind: "resource_gain", resource: "confectance", amount: 1, on: "onDamageDealt" },
      // +10% damage vs no-cover targets (CONFIRMED, research §3.11).
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
  },
  fixedKeys: [
    {
      id: "qiongjiu_fk1_concentration",
      name: "Concentration (凝神)",
      verified: true,
      battleStartEffects: [{ resource: "confectance", amount: 3 }],
    },
  ],
};