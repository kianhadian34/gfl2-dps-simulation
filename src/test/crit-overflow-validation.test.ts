import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { resolveCritStats } from "../engine/simulation.js";
import { customRegistry } from "./helpers.js";
import type { CharacterDef, PassiveEffect, Scenario } from "../model/types.js";

// U19 Crit-Rate half (CONFIRMED 2026-09-03 by in-game passive text):
// "When dealing damage, if critical rate of this attack exceeds 100%, every 1%
// of overflow critical rate is converted to 1% critical damage."
// - effective Crit Rate caps at 100%; overflow discarded unless a character
//   passive ("excess_crit_conversion") converts it (default 1:1).
// - converted Crit DMG feeds the confirmed multiplier: 1 + Crit DMG.
// - Character-specific, data-driven — never a global rule.

function makeOverflowChar(id: string, critRate: number, critDmg: number, passive: PassiveEffect[]): CharacterDef {
  return {
    id,
    name: id,
    phase: "physical",
    base: { atk: 1000, hp: 1000, def: 100, stability: 6, critRate, critDmg },
    weapon: { id: `${id}_w`, name: "w", rarity: "standard", atkLvl1: 0, atkLvl60: 0, level: 60, subStats: [] },
    skills: {
      basic: { id: `${id}_basic`, name: "Hit", type: "basic", element: "physical", multiplier: 1.0, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
      active1: { id: `${id}_a1`, name: "-", type: "active", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      active2: { id: `${id}_a2`, name: "-", type: "active", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      ultimate: { id: `${id}_ult`, name: "-", type: "ultimate", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 3 },
    },
    passive: { id: `${id}_passive`, name: "-", effects: passive },
    fixedKeys: [],
  };
}

const CONVERT = (ratio = 1.0, cap?: number): PassiveEffect => ({ kind: "excess_crit_conversion", threshold: 1.0, ratio, cap });

function run(c: CharacterDef): ReturnType<typeof simulateScenario> {
  return simulateScenario(
    {
      version: 1,
      seed: 1,
      turns: 2,
      team: [{ characterId: c.id, rotation: ["basic"], equippedFixedKeys: [] }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ [c.id]: c }),
  );
}

test("100% Crit Rate with passive: 100% effective CR, 0% overflow → multiplier = 1 + base CDMG", () => {
  const c = makeOverflowChar("cr100", 1.0, 0.2, [CONVERT()]);
  const r = run(c);
  for (const e of r.log) {
    assert.ok(e.critical, "100% effective CR always crits");
    assert.ok(Math.abs((e.critMultiplier ?? 0) - 1.2) < 1e-9);
    assert.equal(e.finalDamage, 1200);
  }
});

test("150% Crit Rate with passive → 100% effective CR + 50% Crit DMG", () => {
  const c = makeOverflowChar("cr150", 1.5, 0.2, [CONVERT()]);
  const r = run(c);
  for (const e of r.log) {
    assert.ok(Math.abs((e.critMultiplier ?? 0) - 1.7) < 1e-9, `mult=${e.critMultiplier}`);
    assert.equal(e.finalDamage, 1700);
  }
});

test("200% Crit Rate with passive → 100% effective CR + 100% Crit DMG", () => {
  const c = makeOverflowChar("cr200", 2.0, 0.0, [CONVERT()]);
  const r = run(c);
  for (const e of r.log) {
    assert.ok(Math.abs((e.critMultiplier ?? 0) - 2.0) < 1e-9);
    assert.equal(e.finalDamage, 2000);
  }
});

test("200% Crit Rate WITHOUT passive → 100% effective CR, excess discarded (no converted CDMG)", () => {
  const c = makeOverflowChar("cr200np", 2.0, 0.2, []);
  const r = run(c);
  for (const e of r.log) {
    assert.ok(e.critical, "effective CR still caps at 100% → always crit");
    assert.ok(Math.abs((e.critMultiplier ?? 0) - 1.2) < 1e-9, "no conversion without the passive");
    assert.equal(e.finalDamage, 1200);
  }
});

test("overflow conversion combines with existing Crit DMG (150% CR, base 35% CDMG)", () => {
  const c = makeOverflowChar("crcomb", 1.5, 0.35, [CONVERT()]);
  const r = run(c);
  for (const e of r.log) {
    assert.ok(Math.abs((e.critMultiplier ?? 0) - 1.85) < 1e-9);
    assert.equal(e.finalDamage, 1850);
  }
});

test("conversion ratio is data-driven (0.5 ratio at 200% CR → +50% CDMG)", () => {
  const c = makeOverflowChar("crratio", 2.0, 0.2, [CONVERT(0.5)]);
  const r = run(c);
  for (const e of r.log) {
    assert.ok(Math.abs((e.critMultiplier ?? 0) - 1.7) < 1e-9);
    assert.equal(e.finalDamage, 1700);
  }
});

test("optional conversion cap limits converted Crit DMG (cap 0.4 at 200% CR)", () => {
  const c = makeOverflowChar("crcap", 2.0, 0.2, [CONVERT(1.0, 0.4)]);
  const r = run(c);
  for (const e of r.log) {
    assert.ok(Math.abs((e.critMultiplier ?? 0) - 1.6) < 1e-9);
    assert.equal(e.finalDamage, 1600);
  }
});

test("resolveCritStats unit behavior: no overflow below 100%, cap at threshold, per-passive defaults", () => {
  const no = resolveCritStats(0.8, 0.2, [CONVERT()]);
  assert.ok(Math.abs(no.critRate - 0.8) < 1e-9 && Math.abs(no.critDmg - 0.2) < 1e-9 && no.convertedCritDmg === 0);
  const over = resolveCritStats(1.5, 0.2, [CONVERT()]);
  assert.ok(Math.abs(over.critRate - 1.0) < 1e-9 && Math.abs(over.critDmg - 0.7) < 1e-9);
  const none = resolveCritStats(1.5, 0.2, []);
  assert.ok(Math.abs(none.critRate - 1.0) < 1e-9 && Math.abs(none.critDmg - 0.2) < 1e-9, "no passive → no conversion");
});