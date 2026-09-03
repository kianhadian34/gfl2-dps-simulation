import { test } from "node:test";
import assert from "node:assert/strict";
import { rollHit } from "../engine/damage.js";
import { Rng } from "../engine/rng.js";

// In-game validation 2026-09-03 — Burn weakness (docs/research.md §3.5):
// Qiongjiu Lv.60 V6, Retired OTs-14 R1 Lv.2, no keys, ATK 1958, CDMG 120%,
// no damage buffs (no Damage Up II). Target: Drone – Blaze Master Lv.60,
// DEF 5000, stability 65/65, Burn weakness, Unaffiliated/Mechanicals, No Cover.
// Attack: Common Rail Lv.2 (Burn, 150% ATK).
//
// base = 1958 × 1.50 × (1958/(1958+5000)) ≈ 826.48
// bracket = 1 + 0.10 (passive no-cover) + 0.10 (V6) = 1.20
// normal  = ceil(826.48 × 1.20 × 1.10 [Burn weakness]) = 1091   (×1.10 is multiplicative)
// crit    = ceil(826.48 × 1.20 × 1.10 × 1.20 [CDMG]) = 1310     (CDMG before final ceil)
//
// NOTE: Qiongjiu's V-shape (椎体) no-cover bonus is not yet modeled in the
// character data; the combined 1.20 bracket is passed explicitly (same approach
// as crit-validation.test.ts). Overburn contributed nothing in this test.

const ATK = 1958;
const DEF = 5000;
const MULT = 1.5; // Common Rail
const BRACKET = 1.2; // 1 + 0.10 passive + 0.10 V6
const BURN_WEAKNESS = 1.1; // multiplicative, NOT in the additive bucket
const CDMG = 1.2; // 120%

function commonRail(crit: boolean, seed = 1) {
  return rollHit({
    atk: ATK,
    def: DEF,
    multiplier: MULT,
    additiveBonus: BRACKET,
    phaseMult: 1,
    weaknessMult: BURN_WEAKNESS,
    reductionMult: 1,
    critRate: crit ? 1 : 0,
    critMultiplier: CDMG,
    glanceChance: 0,
    rng: new Rng(seed),
  });
}

test("regression: Burn-weakness Common Rail normal = 1091 (confirmed in-game)", () => {
  const h = commonRail(false);
  assert.equal(h.finalDamage, 1091);
  // Documented intermediate values for manual cross-check.
  assert.equal(h.baseDamage, 1958 * 1.5);
  assert.ok(Math.abs(h.mitigatedDamage - ((1958 * 1.5) * 1958) / (1958 + DEF)) < 1e-9);
});

test("regression: Burn-weakness Common Rail crit = 1310 (confirmed in-game)", () => {
  assert.equal(commonRail(true).finalDamage, 1310);
});

test("Burn weakness is multiplicative OUTSIDE the additive +DMG bucket", () => {
  // Folding the ×1.10 into the additive bracket (1 + 0.2 + 0.1 = 1.3) must NOT
  // reproduce the observed 1091 — it yields 1075.
  const folded = rollHit({
    atk: ATK,
    def: DEF,
    multiplier: MULT,
    additiveBonus: 1.3,
    phaseMult: 1,
    weaknessMult: 1,
    reductionMult: 1,
    critRate: 0,
    critMultiplier: CDMG,
    glanceChance: 0,
    rng: new Rng(1),
  });
  assert.notEqual(folded.finalDamage, 1091);
  assert.equal(folded.finalDamage, 1075);
  assert.equal(commonRail(false).finalDamage, 1091);
});

test("without the Burn weakness the hit is 992 (isolates the ×1.10 term)", () => {
  const noWeakness = rollHit({
    atk: ATK,
    def: DEF,
    multiplier: MULT,
    additiveBonus: BRACKET,
    phaseMult: 1,
    weaknessMult: 1,
    reductionMult: 1,
    critRate: 0,
    critMultiplier: CDMG,
    glanceChance: 0,
    rng: new Rng(1),
  });
  assert.equal(noWeakness.finalDamage, 992); // ceil(826.48 × 1.20) = 992
});

test("deterministic: identical inputs reproduce the observed repeats exactly", () => {
  // Emulates the in-game repetition pattern 1091 ×3 + crit 1310.
  const seq = [commonRail(false), commonRail(false), commonRail(false), commonRail(true)];
  const again = [commonRail(false), commonRail(false), commonRail(false), commonRail(true)];
  assert.deepEqual(seq.map((h) => h.finalDamage), [1091, 1091, 1091, 1310]);
  assert.deepEqual(seq.map((h) => h.finalDamage), again.map((h) => h.finalDamage));
});