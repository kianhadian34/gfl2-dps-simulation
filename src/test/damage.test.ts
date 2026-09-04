import { test } from "node:test";
import assert from "node:assert/strict";
import { rollHit } from "../engine/damage.js";
import { Rng } from "../engine/rng.js";

function hit(over: Partial<{ atk: number; def: number; multiplier: number; fixedDamage: number; additiveBonus: number; phaseMult: number; weaknessMult: number; reductionMult: number; critRate: number; critMultiplier: number; glanceChance: number; seed: number }> = {}) {
  const o = { atk: 1000, def: 0, multiplier: 1, additiveBonus: 1, phaseMult: 1, weaknessMult: 1, reductionMult: 1, critRate: 0, critMultiplier: 1.2, glanceChance: 0, seed: 1, ...over };
  return rollHit({
    atk: o.atk,
    def: o.def,
    multiplier: o.multiplier,
    fixedDamage: o.fixedDamage,
    additiveBonus: o.additiveBonus,
    phaseMult: o.phaseMult,
    weaknessMult: o.weaknessMult,
    reductionMult: o.reductionMult,
    critRate: o.critRate,
    critMultiplier: o.critMultiplier,
    glanceChance: o.glanceChance,
    rng: new Rng(o.seed),
  });
}

test("reproduces the confirmed in-game damage case (1213 ATK, 194 DEF, 1.0 mult, 1.1 weakness → 1151)", () => {
  const r = hit({ atk: 1213, def: 194, weaknessMult: 1.1 });
  assert.equal(r.finalDamage, 1151); // ceil(1213/(1+194/1213) × 1 × 1.1) = 1151
});

test("defense term: ATK/(1+DEF/ATK) halves damage when DEF == ATK", () => {
  const r = hit({ atk: 1000, def: 1000, multiplier: 1 });
  assert.equal(r.finalDamage, 500);
});

test("defense 0 → no mitigation; skill multiplier applies", () => {
  assert.equal(hit({ atk: 1000, multiplier: 0.8 }).finalDamage, 800);
});

test("all additive bonuses share one bracket (1 + 0.2 + 0.15 = 1.35)", () => {
  assert.equal(hit({ additiveBonus: 1.35 }).finalDamage, 1350);
});

test("phase countering ×1.2 and ×0.8", () => {
  assert.equal(hit({ phaseMult: 1.2 }).finalDamage, 1200);
  assert.equal(hit({ phaseMult: 0.8 }).finalDamage, 800);
});

test("weakness exploit +10% per weakness (additive across weaknesses — U20)", () => {
  assert.equal(hit({ weaknessMult: 1.1 }).finalDamage, 1100);
  // U20: two exploited weaknesses = 1 + 0.10×2 = 1.20 (NOT multiplicative 1.1×1.1 = 1.21).
  assert.equal(hit({ weaknessMult: 1.2 }).finalDamage, 1200);
});

test("crit multiplies by the Crit DMG multiplier (1 + critDmg)", () => {
  const r = hit({ critRate: 1, critMultiplier: 1.2 });
  assert.equal(r.finalDamage, 1200);
  assert.equal(r.critical, true);
});

test("final damage is ceiling-rounded before glancing", () => {
  const r = hit({ atk: 1234 });
  assert.equal(r.finalDamage, 1234);
  const g = hit({ atk: 1234, glanceChance: 1 });
  assert.equal(g.glancing, true);
  assert.equal(g.finalDamage, 124); // ceil(1234 × 0.1)
});

test("U21: fixed damage bypasses EVERY normal-chain factor (independent ceil)", () => {
  // Multiplier 0 isolates the fixed component; every chain factor is non-neutral.
  const r = hit({ fixedDamage: 500, multiplier: 0, def: 9999, additiveBonus: 2.0, phaseMult: 1.2, weaknessMult: 1.1, reductionMult: 0.8, critRate: 1 });
  assert.equal(r.fixedDamage, 500);
  assert.equal(r.finalDamage, 0); // no normal-chain damage
  assert.equal(r.critical, false);
  assert.equal(r.finalDamage + r.fixedDamage, 500); // final = ceil(normal) + ceil(fixed)
});

test("U21 Overburn mirror: 195.8 → 196 independent ceil, chain factors never change it", () => {
  // In-game: 1958 ATK × 10% = 195.8 → observed 196; Burn immunity and the +20%
  // No-Cover Damage Done leave it at exactly 196.
  const hostile = hit({ fixedDamage: 195.8, multiplier: 0, def: 9999, additiveBonus: 2.0, phaseMult: 1.2, weaknessMult: 1.1, reductionMult: 0.8, critRate: 1 });
  const neutral = hit({ fixedDamage: 195.8, multiplier: 0, def: 0, additiveBonus: 1, phaseMult: 1, weaknessMult: 1, reductionMult: 1, critRate: 0 });
  assert.equal(hostile.fixedDamage, 196);
  assert.equal(neutral.fixedDamage, 196);
  assert.equal(hostile.finalDamage + hostile.fixedDamage, 196);
});

test("U21 normal + fixed: independent rounding differs from ceil(normal+fixed)", () => {
  const normal = hit({ atk: 334, multiplier: 0.3, def: 0, additiveBonus: 1, phaseMult: 1, weaknessMult: 1, reductionMult: 1, critRate: 0 });
  const fixed = hit({ atk: 0, multiplier: 0, fixedDamage: 100.7, def: 0, additiveBonus: 1, phaseMult: 1, weaknessMult: 1, reductionMult: 1, critRate: 0 });
  assert.equal(normal.finalDamage, 101); // ceil(100.2)
  assert.equal(fixed.fixedDamage, 101); // ceil(100.7)
  const total = normal.finalDamage + fixed.fixedDamage;
  assert.equal(total, 202);
  assert.equal(Math.ceil(100.2 + 100.7), 201); // combined ceil would be 201
  assert.notEqual(total, 201); // independent rounding is the confirmed model
});

test("same seed ⇒ identical rolls; different seeds diverge", () => {
  const a = hit({ critRate: 0.5 });
  const b = hit({ critRate: 0.5 });
  assert.equal(a.finalDamage, b.finalDamage);
  const r1 = new Rng(7);
  const r2 = new Rng(8);
  const s1 = [r1.next(), r1.next(), r1.next()];
  const s2 = [r2.next(), r2.next(), r2.next()];
  assert.notDeepEqual(s1, s2);
});