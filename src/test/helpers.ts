import type { AbilityDef, CharacterDef, CommonKeyDef, ConfigOverrides, DummyConfig, Scenario, SkillDefVariant, WeaponDef } from "../model/types.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import type { Registry } from "../data/registry.js";
import { REGISTRY } from "../data/registry.js";

export const QJ = QIONGJIU;

function dummy(overrides: Partial<DummyConfig> = {}): DummyConfig {
  return {
    id: "training_dummy",
    name: "Training Dummy",
    hp: 999999999,
    defense: 0,
    stability: 0,
    weaknesses: [],
    phase: null,
    cover: "none",
    ...overrides,
  };
}

export function scenario(overrides: {
  turns?: number;
  seed?: number;
  rotation?: Scenario["team"][number]["rotation"];
  keys?: string[];
  dummy?: Partial<DummyConfig>;
  config?: ConfigOverrides;
} = {}): Scenario {
  return {
    version: 1,
    seed: overrides.seed ?? 1,
    turns: overrides.turns ?? 7,
    team: [
      {
        characterId: "qiongjiu",
        rotation: overrides.rotation ?? ["basic"],
        equippedFixedKeys: overrides.keys ?? ["qiongjiu_fk1_concentration"],
        // Qiongjiu's established default loadout: a NON-signature fixture weapon with the SAME max-level
        // stats as Golden Melody (panel ceil((1224+369)×1.15) = 1832 preserved) but NO
        // ownerCharacterId/Imprint — so default scenarios do NOT activate the Imprint (activation
        // is derived automatically from signature ownership: weapon.ownerCharacterId === dealer id).
        weaponId: "weapon_qj_panel_test",
      },
    ],
    dummy: dummy(overrides.dummy),
    configOverrides: overrides.config ?? {},
  };
}

/** Registry extended with a synthetic test ally (basic-only doll), optional fixture Common Keys, and optional fixture Weapons. */
export function customRegistry(extra: Record<string, CharacterDef>, extraCommonKeys: Record<string, CommonKeyDef> = {}, extraWeapons: Record<string, WeaponDef> = {}): Registry {
  return {
    getCharacter: (id) => (id === "qiongjiu" ? QJ : extra[id]),
    getStatus: (id) => REGISTRY.getStatus(id),
    getStatusMap: () => REGISTRY.getStatusMap(),
    characterIds: () => ["qiongjiu", ...Object.keys(extra)],
    getAffinityKey: (id) => {
      const own = QJ.affinityKey?.id === id ? QJ.affinityKey : undefined;
      if (own) return own;
      for (const c of Object.values(extra)) if (c.affinityKey?.id === id) return c.affinityKey;
      return REGISTRY.getAffinityKey(id);
    },
    // Common Keys are REUSABLE registry definitions (2026): fixture keys provided by tests
    // take precedence, everything else falls through to the base registry table.
    getCommonKey: (id) => extraCommonKeys[id] ?? REGISTRY.getCommonKey(id),
    // Weapons are REUSABLE registry definitions (2026): fixture weapons provided by tests take
    // precedence, then the central TEST fixture weapons (non-game, panel-only), then the base
    // registry table (real game weapons only — see src/data/weapons.ts).
    getWeapon: (id) => extraWeapons[id] ?? TEST_WEAPONS[id] ?? REGISTRY.getWeapon(id),
  };
}

/**
 * TEST-ONLY weapon fixtures (2026) — NOT game weapons and NOT part of production data
 * (`src/data/weapons.ts` contains real game weapons only). `weapon_qj_panel_test` mirrors
 * Golden Melody's max-level stats (ATK 53 → 369, +15% ATK%) with NO ownerCharacterId / Imprint /
 * calibrations, so fixtures can represent Qiongjiu's established panel WITHOUT activating the
 * Imprint (activation is derived automatically from signature ownership).
 */
export const TEST_WEAPONS: Record<string, WeaponDef> = {
  weapon_qj_panel_test: {
    id: "weapon_qj_panel_test",
    name: "Qiongjiu Panel Rifle (test)",
    rarity: "elite",
    atkLvl1: 53,
    atkLvl60: 369,
    level: 60,
    subStats: [{ stat: "pctAtk", value: 0.15 }],
  },
};

/** Wrap a flat per-slot skill object into the level-based AbilityDef shape (all at level 1, test default). */
export function abilities(skills: {
  basic: SkillDefVariant;
  active1: SkillDefVariant;
  active2: SkillDefVariant;
  ultimate: SkillDefVariant;
  support?: SkillDefVariant;
}): CharacterDef["skills"] {
  const wrap = (s: SkillDefVariant): AbilityDef => ({ id: s.id, name: s.name, type: s.type, levels: { 1: s } });
  return {
    basic: wrap(skills.basic),
    active1: wrap(skills.active1),
    active2: wrap(skills.active2),
    ultimate: wrap(skills.ultimate),
    ...(skills.support ? { support: wrap(skills.support) } : {}),
  };
}

/** A minimal basic-only doll used to trigger Qiongjiu's support attacks in tests. */
export function makeAlly(id: string, atk: number): CharacterDef {
  return {
    id,
    name: id,
    phase: null,
    base: { atk, hp: 1000, def: 300, stability: 6, critRate: 0, critDmg: 0.2 },
    skills: abilities({
      basic: { id: `${id}_basic`, name: "Hit", type: "basic", element: null, multiplier: 1.0, stabDamage: 1, cooldown: 0, confectanceCost: 0 },
      active1: { id: `${id}_a1`, name: "-", type: "active", element: null, multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      active2: { id: `${id}_a2`, name: "-", type: "active", element: null, multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      ultimate: { id: `${id}_ult`, name: "-", type: "ultimate", element: null, multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 3 },
    }),
    passive: { id: `${id}_passive`, name: "-", effects: [] },
    fixedKeys: [],
  };
}
