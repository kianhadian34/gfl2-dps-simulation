import type { WeaponDef } from "../model/types.js";

/**
 * Weapon registry data (REUSABLE definitions, 2026). Weapons are a character equipment system
 * with ONE Weapon Slot per character: a scenario equips a weapon via `ScenarioTeamMember.weaponId`
 * and the engine resolves it here (`Registry.getWeapon`) — weapons are NOT embedded in
 * `CharacterDef`. Max-level-only model (per-level progression curves are OUT OF SCOPE).
 * `calibrationLevel` is ABSENT by default on registered weapons ⇒ NO weapon Effect unless a
 * scenario/test activates one (calibration changes ONLY the Effect). See docs/research.md §3.9.
 */
export const WEAPONS: WeaponDef[] = [
  {
    id: "jinshizou",
    // PLAYER-FACING name (authoritative, 2026): "Golden Melody". The id "jinshizou" is ONLY
    // the stable internal engine/asset id — never displayed to the player. The in-game CN
    // name (金石奏) is not part of the UI contract either.
    name: "Golden Melody",
    rarity: "elite",
    atkLvl1: 53,
    atkLvl60: 369,
    level: 60,
    subStats: [{ stat: "pctAtk", value: 0.15 }],
    // Golden Melody — per-calibration WEAPON EFFECT (SOURCE FACTS 2026): calibration changes
    // ONLY the Effect, never the max-level base stats. `calibrationLevel` is intentionally
    // ABSENT (no Effect by default — every established pre-weapon validation was observed WITHOUT
    // the calibration Effect active; set it to activate one). C1 Damage Dealt (+10%, → 975) and
    // C1 Charging (+10% SA/stack, max 2, → 1434) are VALIDATED in combat; C2–C6 values are the
    // documented calibration table, consumed by the same generic path (no separate branches /
    // no separate combat validation required).
    calibrations: {
      // Golden Melody Charging — established mechanic (2026): each qualifying buff GAIN grants
      // `stacksPerGain` (Activations: C1–C4 = 1, C5–C6 = 2) Charging stacks, clamped to
      // `maxStacks`; per-stack Support Action damage = the calibration's perStackValue.
      1: { damageDealt: 0.1, charging: { perStackValue: 0.1, maxStacks: 2, stacksPerGain: 1 } },
      2: { damageDealt: 0.1, charging: { perStackValue: 0.15, maxStacks: 2, stacksPerGain: 1 } },
      3: { damageDealt: 0.15, charging: { perStackValue: 0.15, maxStacks: 3, stacksPerGain: 1 } },
      4: { damageDealt: 0.2, charging: { perStackValue: 0.15, maxStacks: 3, stacksPerGain: 1 } },
      5: { damageDealt: 0.2, charging: { perStackValue: 0.2, maxStacks: 4, stacksPerGain: 2 } },
      6: { damageDealt: 0.2, charging: { perStackValue: 0.2, maxStacks: 4, stacksPerGain: 2 } },
    },
    // Golden Melody Imprint (SOURCE FACT 2026, owner-gated): +2.5% Damage Dealt vs ELID targets;
    // +2.5% more when the target is not protected by Cover — additive in the existing DMG% bucket.
    // `ownerCharacterId` is DATA (the engine never hardcodes a character): the Imprint applies
    // only when the damage dealer IS this owner.
    ownerCharacterId: "qiongjiu",
    imprint: { targetType: "elid", bonus: 0.025, noCoverBonus: 0.025 },
    // Golden Melody Trait (VALIDATED in-game 2026): at the end of the holder's action, at FULL
    // HP, exactly ONE of the 13 buffs below is granted — uniform 1/13 (deterministic seeded RNG,
    // no weights/priorities invented), lasting 1 turn. The pool below is DATA; the engine hook
    // (simulation.ts applyWeaponTrait) is generic.
    trait: {
      statusIds: [
        "trait_domain_penetration_i",
        "trait_crit_rate_boost_i",
        "trait_continuous_healing_i",
        "trait_defense_up_i",
        "trait_piercing_i",
        "trait_area_defense_i",
        "trait_targeted_attack_defense_i",
        "trait_stability_offensive_i",
        "trait_targeted_attack_boost_i",
        "trait_coverage_boost_i",
        "trait_phase_boost_i",
        "trait_attack_up_i",
        "trait_movement_up_i",
      ],
      durationRounds: 1,
    },
  },
];