import type { CharacterDef } from "../model/types.js";

/**
 * BASIC ATTACK DUMMY (2026) — a minimal FRIENDLY team unit for engine/UI testing.
 *
 * Exactly one ability: Basic Attack (80% ATK) through the normal ability/damage pipeline.
 * Deliberately absent: weapon, affinity (key/level), expansion, common/fixed keys,
 * fortification map, passive effects, support behavior, statuses, movement gimmicks.
 * It participates in the normal turn system exactly like any other unit — the team order +
 * per-character rotation are the ONLY authority over when it acts (no hidden/forced timing,
 * no dummy-specific support wiring). Extensible: future test abilities/stats can be added here
 * as plain AbilityDef entries / base changes; the engine is never special-cased for it.
 */
export const BASIC_ATTACK_DUMMY: CharacterDef = {
  id: "basic_attack_dummy",
  name: "Basic Attack Dummy",
  phase: null,
  base: { atk: 1000, hp: 2000, def: 500, stability: 9, critRate: 0, critDmg: 0 },
  skills: {
    basic: {
      id: "basic_attack_dummy_basic",
      name: "Basic Attack",
      type: "basic",
      levels: {
        1: {
          id: "basic_attack_dummy_basic",
          name: "Basic Attack",
          type: "basic",
          element: null, // phase-less (physical-ammo attack)
          multiplier: 0.8,
          stabDamage: 2,
          cooldown: 0,
          confectanceCost: 0,
        },
      },
    },
  },
  passive: { id: "basic_attack_dummy_passive", name: "None", effects: [] },
  fixedKeys: [],
};