import { test } from "node:test";
import assert from "node:assert/strict";
import { rollHit } from "../engine/damage.js";
import { Rng } from "../engine/rng.js";

// In-game validation 2026-09-03 — U1 RESOLVED (docs/research.md §3.3):
// Qiongjiu Lv.60 V6, Retired OTs-14 R1 (weapon Lv1→Lv2 control: ATK 1956→1958),
// dummy DEF 5000, no cover, no ammo weakness, Burn weakness only (Basic is
// Physical → no weakness applies), no break, no temp buffs, CDMG 120%,
// total no-cover DMG bonus 20%.
//
// Confirmed: crit multiplier = Crit DMG stat (×1.20 at 120%); crit multiplies
// the UNROUNDED damage before the final ceiling round; crit is never derived
// from the rounded normal hit.

const DEF = 5000;
const MULT = 0.8; // Qiongjiu Basic Attack
const BONUS = 1.2; // 1 + 0.20 no-cover damage bonus
const CDMG = 1.2; // 120% Crit Damage

function hit(atk: number, crit: boolean, seed = 1) {
  return rollHit({
    atk,
    def: DEF,
    multiplier: MULT,
    additiveBonus: BONUS,
    phaseMult: 1,
    weaknessMult: 1,
    reductionMult: 1,
    critRate: crit ? 1 : 0,
    critMultiplier: CDMG,
    glanceChance: 0,
    rng: new Rng(seed),
  });
}

test("regression: ATK 1958 → normal 529, crit 635 (confirmed in-game)", () => {
  assert.equal(hit(1958, false).finalDamage, 529);
  assert.equal(hit(1958, true).finalDamage, 635);
});

test("regression: ATK 1956 → normal 529, crit 634 (confirmed in-game)", () => {
  assert.equal(hit(1956, false).finalDamage, 529);
  assert.equal(hit(1956, true).finalDamage, 634);
});

test("crit multiplies the UNROUNDED damage, never the rounded normal hit (ordering discriminator)", () => {
  // Wrong order: ceil(529 × 1.2) = 635 — but the game shows 634 for ATK 1956,
  // proving the crit is computed from the underlying unrounded 528.0… × 1.2 → ceil = 634.
  assert.equal(Math.ceil(529 * 1.2), 635);
  assert.notEqual(hit(1956, true).finalDamage, Math.ceil(529 * 1.2));
  // ATK 1958 is the control that validates the transition (528.947 × 1.2 = 634.736 → 635);
  // there both orderings coincide, which is exactly why 1956 is the discriminator.
  assert.equal(hit(1958, true).finalDamage, Math.ceil(529 * 1.2));
});

test("documented formula reproduces through the pipeline (raw → mitigation × 1.20 → ceil)", () => {
  const normal = hit(1958, false);
  assert.ok(Math.abs(normal.baseDamage - 1958 * 0.8) < 1e-9, `baseDamage=${normal.baseDamage}`);
  assert.ok(Math.abs(normal.mitigatedDamage - ((1958 * 0.8) * 1958) / (1958 + DEF)) < 1e-9);
  assert.equal(normal.finalDamage, 529);
  assert.equal(hit(1958, true).finalDamage, 635);
});