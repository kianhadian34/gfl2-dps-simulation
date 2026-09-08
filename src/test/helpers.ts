import type { AbilityDef, CharacterDef, ConfigOverrides, DummyConfig, Scenario, SkillDefVariant } from "../model/types.js";
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
      },
    ],
    dummy: dummy(overrides.dummy),
    configOverrides: overrides.config ?? {},
  };
}

/** Registry extended with a synthetic test ally (basic-only doll). */
export function customRegistry(extra: Record<string, CharacterDef>): Registry {
  return {
    getCharacter: (id) => (id === "qiongjiu" ? QJ : extra[id]),
    getStatus: (id) => REGISTRY.getStatus(id),
    getStatusMap: () => REGISTRY.getStatusMap(),
    characterIds: () => ["qiongjiu", ...Object.keys(extra)],
  };
}

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
    phase: "physical",
    base: { atk, hp: 1000, def: 300, stability: 6, critRate: 0, critDmg: 0.2 },
    weapon: { id: `${id}_w`, name: "w", rarity: "standard", atkLvl1: 0, atkLvl60: 0, level: 60, subStats: [] },
    skills: abilities({
      basic: { id: `${id}_basic`, name: "Hit", type: "basic", element: "physical", multiplier: 1.0, stabDamage: 1, cooldown: 0, confectanceCost: 0 },
      active1: { id: `${id}_a1`, name: "-", type: "active", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      active2: { id: `${id}_a2`, name: "-", type: "active", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      ultimate: { id: `${id}_ult`, name: "-", type: "ultimate", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 3 },
    }),
    passive: { id: `${id}_passive`, name: "-", effects: [] },
    fixedKeys: [],
  };
}