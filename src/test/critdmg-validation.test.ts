import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { rollHit } from "../engine/damage.js";
import { Rng } from "../engine/rng.js";
import { DEFAULT_CONFIG } from "../engine/state.js";
import { customRegistry } from "./helpers.js";
import type { CharacterDef, Scenario } from "../model/types.js";

// U19 — CDMG portion confirmed in-game (2026-09-03, docs/research.md §3.3/§4):
//   baseline CDMG 120.0% → crit multiplier ×1.20 (Basic crit 635)
//   elevated CDMG 123.5% → crit multiplier ×1.235 (Basic crit 654, observed 654×4)
// Rule: crit multiplier = 1 + Crit DMG, linear, applied before the final ceil.
// CR system (universal cap 100% + passive-driven 1:1 overflow conversion) is
// RESOLVED (U19 2026-09-03) — locked numerically in crit-overflow-validation.test.ts.

const ATK = 1958; // Qiongjiu, Retired OTs-14 R1 Lv.2, no keys
const DEF = 5000; // dummy, No Cover, no weakness for Basic (physical)
const MULT = 0.8; // Basic Attack
const BRACKET = 1.2; // 1 + 0.10 passive no-cover + 0.10 V6

function basic(critRate: number, cdmg: number): ReturnType<typeof rollHit> {
  return rollHit({
    atk: ATK,
    def: DEF,
    multiplier: MULT,
    additiveBonus: BRACKET,
    phaseMult: 1,
    weaknessMult: 1,
    reductionMult: 1,
    critRate,
    critMultiplier: cdmg,
    rng: new Rng(1),
  });
}

test("120% CDMG behavior: normal 529, crit 635 (confirmed baseline)", () => {
  assert.equal(basic(0, 1.2).finalDamage, 529);
  assert.equal(basic(1, 1.2).finalDamage, 635);
});

test("123.5% CDMG behavior: crit 654, reproduced 4x (confirmed in-game)", () => {
  for (let i = 0; i < 4; i++) {
    assert.equal(basic(1, 1.235).finalDamage, 654);
  }
});

test("linear scaling: crit multiplier is exactly 1 + Crit DMG on the unrounded damage", () => {
  const normal = basic(0, 1.2);
  const pre = normal.mitigatedDamage * BRACKET; // × phase × weakness × reduction (all 1)
  for (const cdmg of [1.2, 1.235, 1.3, 1.5]) {
    const expected = Math.ceil(Math.round(pre * cdmg * 1e6) / 1e6);
    assert.equal(basic(1, cdmg).finalDamage, expected, `cdmg=${cdmg}`);
  }
});

// --- engine derivation (no hardcoded default) ---

function makeCritDmgChar(id: string, critDmg: number, critRate = 1): CharacterDef {
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
    passive: { id: `${id}_passive`, name: "-", effects: [] },
    fixedKeys: [],
  };
}

function charRun(c: CharacterDef, config?: Scenario["configOverrides"]): Scenario {
  return {
    version: 1,
    seed: 1,
    turns: 2,
    team: [{ characterId: c.id, rotation: ["basic"], equippedFixedKeys: [] }],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    configOverrides: config,
  };
}

test("engine derives crit multiplier = 1 + Crit DMG (120% → ×1.20); no hardcoded 1.5 default", () => {
  assert.equal(DEFAULT_CONFIG.critMultiplier, null);
  const c = makeCritDmgChar("cd120", 0.2);
  const r = simulateScenario(charRun(c), customRegistry({ cd120: c }));
  for (const e of r.log) {
    assert.equal(e.critMultiplier, 1.2);
    assert.equal(e.finalDamage, 1200); // 1000 ATK × 1.0 mult × 1.2
    assert.equal(e.critical, true);
  }
});

test("engine derives for any Crit DMG (123.5% → ×1.235)", () => {
  const c = makeCritDmgChar("cd1235", 0.235);
  const r = simulateScenario(charRun(c), customRegistry({ cd1235: c }));
  for (const e of r.log) {
    // 1 + 0.235 in floating point is 1.2349999999999999 — compare with tolerance.
    const m = e.critMultiplier;
    assert.ok(m !== undefined, "critMultiplier recorded on every damaging action");
    assert.ok(Math.abs(m - 1.235) < 1e-9, `critMultiplier=${m}`);
    assert.equal(e.finalDamage, 1235);
  }
});

test("configOverrides.critMultiplier remains a test-only alternative hypothesis", () => {
  const c = makeCritDmgChar("cdalt", 0.2);
  const r = simulateScenario(charRun(c, { critMultiplier: 1.3 }), customRegistry({ cdalt: c }));
  for (const e of r.log) {
    assert.equal(e.critMultiplier, 1.3);
    assert.equal(e.finalDamage, 1300);
  }
  assert.ok(r.warnings.some((w) => w.includes("alternative hypothesis") && w.includes("1 + Crit DMG")));
});