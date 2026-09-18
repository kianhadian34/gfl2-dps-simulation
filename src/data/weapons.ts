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
    name: "Jinshizou (金石奏)",
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
  },
];