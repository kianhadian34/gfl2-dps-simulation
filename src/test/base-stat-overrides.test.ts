import { test } from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { REGISTRY } from "../data/registry.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { simulateScenario } from "../simulate.js";
import type { Scenario, ScenarioTeamMember } from "../model/types.js";

/**
 * DEBUG / CONTROLLED-TESTING — per-member base-stat overrides (2026).
 * `ScenarioTeamMember.baseStatOverrides` replaces the character's OWN `CharacterDef.base`
 * value for each supplied field, applied BEFORE weapon/equipment/stat-modifier calculation;
 * `computePanel` remains the single calculation path. Validated: finite, >= 0 (rejected, never
 * clamped). Never mutates registry CharacterDef objects.
 */

function scenario(member: Partial<ScenarioTeamMember> & { characterId: string }, dummyOverride: Record<string, unknown> = {}): Scenario {
  return {
    version: 1,
    seed: 7,
    turns: 2,
    team: [{ rotation: ["basic"], equippedFixedKeys: [], ...member }],
    dummy: {
      id: "training_dummy",
      name: "Training Dummy",
      hp: 999999999,
      defense: 5000,
      stability: 6,
      weaknesses: [],
      phase: null,
      cover: "none",
      ...dummyOverride,
    },
  };
}

function unit(member: Partial<ScenarioTeamMember> & { characterId: string }, dummyOverride?: Record<string, unknown>) {
  return createState(scenario(member, dummyOverride), REGISTRY, new Set()).units[0];
}

test("no baseStatOverrides preserves existing behavior exactly (identical panel)", () => {
  const a = unit({ characterId: "qiongjiu" });
  const b = unit({ characterId: "qiongjiu", baseStatOverrides: {} });
  assert.equal(b.panelAtk, a.panelAtk);
  assert.equal(b.hp, a.hp);
  assert.equal(b.defStat, a.defStat);
  assert.equal(b.stability, a.stability);
  assert.equal(b.critRate, a.critRate);
  assert.equal(b.critDmg, a.critDmg);
  assert.equal(a.panelAtk, QIONGJIU.base.atk, "no weapon = the character's own base ATK (sanity)");
});

test("ATK override changes panel ATK before any weapon effect", () => {
  const u = unit({ characterId: "qiongjiu", baseStatOverrides: { atk: 1500 } });
  assert.equal(u.panelAtk, 1500, "finalStat(1500, 0, 0) — the override replaces the base ATK");
});

test("HP override changes base HP (pool)", () => {
  const u = unit({ characterId: "qiongjiu", baseStatOverrides: { hp: 1234 } });
  assert.equal(u.hp, 1234);
  assert.equal(u.maxHp, 1234);
});

test("DEF override changes base DEF", () => {
  const u = unit({ characterId: "qiongjiu", baseStatOverrides: { def: 700 } });
  assert.equal(u.defStat, 700);
});

test("Stability override changes base stability", () => {
  const u = unit({ characterId: "qiongjiu", baseStatOverrides: { stability: 9 } });
  assert.equal(u.stability, 9);
  assert.equal(u.maxStability, 9);
});

test("Crit Rate override changes base crit rate", () => {
  const u = unit({ characterId: "qiongjiu", baseStatOverrides: { critRate: 0.25 } });
  assert.equal(u.critRate, 0.25, "base critRate replaced (common-key/affinity additions still apply on top)");
});

test("Crit DMG override changes base crit damage", () => {
  const u = unit({ characterId: "qiongjiu", baseStatOverrides: { critDmg: 0.8 } });
  assert.equal(u.critDmg, 0.8);
});

test("partial overrides preserve the unspecified CharacterDef.base fields", () => {
  const u = unit({ characterId: "qiongjiu", baseStatOverrides: { atk: 1500 } });
  assert.equal(u.panelAtk, 1500);
  assert.equal(u.hp, QIONGJIU.base.hp, "hp untouched");
  assert.equal(u.defStat, QIONGJIU.base.def, "def untouched");
  assert.equal(u.stability, QIONGJIU.base.stability);
  assert.equal(u.critRate, QIONGJIU.base.critRate);
  assert.equal(u.critDmg, QIONGJIU.base.critDmg);
});

test("weapon ATK/sub-stats still apply after the base override", () => {
  // Golden Melody: +369 flat ATK, +15% ATK — applied on top of the OVERRIDE base.
  const u = unit({ characterId: "qiongjiu", weaponId: "jinshizou", baseStatOverrides: { atk: 1500 } });
  assert.equal(u.panelAtk, Math.ceil((1500 + 369) * 1.15), "finalStat(override + weapon flat, weapon pct)");
});

test("keys still apply after the base override (FK1 battle-start Confectance)", () => {
  const u = unit({ characterId: "qiongjiu", equippedFixedKeys: ["qiongjiu_fk1_concentration"], baseStatOverrides: { atk: 1500 } });
  assert.equal(u.panelAtk, 1500, "override applied");
  assert.equal(u.confectance, 6, "FK1 +3 Confectance still applied alongside the override (baseline 3 + 3)");
});

test("invalid negative values are rejected (never clamped)", () => {
  assert.throws(
    () => createState(scenario({ characterId: "qiongjiu", baseStatOverrides: { atk: -1 } }), REGISTRY, new Set()),
    /baseStatOverrides\.atk must be a finite number >= 0/,
  );
  assert.throws(
    () => createState(scenario({ characterId: "qiongjiu", baseStatOverrides: { stability: -0.5 } }), REGISTRY, new Set()),
    /baseStatOverrides\.stability/,
  );
});

test("NaN / Infinity are rejected", () => {
  assert.throws(
    () => createState(scenario({ characterId: "qiongjiu", baseStatOverrides: { atk: Number.NaN } }), REGISTRY, new Set()),
    /finite number/,
  );
  assert.throws(
    () => createState(scenario({ characterId: "qiongjiu", baseStatOverrides: { def: Number.POSITIVE_INFINITY } }), REGISTRY, new Set()),
    /finite number/,
  );
});

test("registry CharacterDef objects are NOT mutated", () => {
  const before = {
    atk: REGISTRY.getCharacter("qiongjiu")!.base.atk,
    hp: REGISTRY.getCharacter("qiongjiu")!.base.hp,
    def: REGISTRY.getCharacter("qiongjiu")!.base.def,
    stability: REGISTRY.getCharacter("qiongjiu")!.base.stability,
    critRate: REGISTRY.getCharacter("qiongjiu")!.base.critRate,
    critDmg: REGISTRY.getCharacter("qiongjiu")!.base.critDmg,
  };
  unit({ characterId: "qiongjiu", baseStatOverrides: { atk: 1, hp: 2, def: 3, stability: 4, critRate: 0.1, critDmg: 0.2 } });
  const after = {
    atk: REGISTRY.getCharacter("qiongjiu")!.base.atk,
    hp: REGISTRY.getCharacter("qiongjiu")!.base.hp,
    def: REGISTRY.getCharacter("qiongjiu")!.base.def,
    stability: REGISTRY.getCharacter("qiongjiu")!.base.stability,
    critRate: REGISTRY.getCharacter("qiongjiu")!.base.critRate,
    critDmg: REGISTRY.getCharacter("qiongjiu")!.base.critDmg,
  };
  assert.deepEqual(after, before);
});

test("overrides flow through the real simulation path (damage uses the overridden ATK)", () => {
  // Qiongjiu ATK 1500 → basic 0.8 → DEF 5000: ceil((1500 × 0.8) × 1500/(1500+5000)).
  const sc: Scenario = scenario({ characterId: "qiongjiu", baseStatOverrides: { atk: 1500 } }, { hp: 999999999 });
  const r = simulateScenario(sc, REGISTRY);
  const basic = r.log.find((e) => e.actionType === "basic")!;
  assert.equal(basic.attackerAtk, 1500, "overridden ATK reaches the damage pipeline");
});