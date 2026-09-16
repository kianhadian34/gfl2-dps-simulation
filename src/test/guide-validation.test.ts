import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { customRegistry } from "./helpers.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import type { CharacterDef } from "../model/types.js";

/**
 * GUIDE TO VICTORY (Lv1) — VALIDATED in-game 2026.
 * 110% ATK / Burn / Medium Ammo vs the 5000-DEF, Burn-weak, No-Cover target with the V6
 * No-Cover bracket (+20%, single total — Steady Plan Lv3):
 *   ceil(ATK × 1.10 × (ATK/(ATK+5000)) × 1.20 × 1.10(burn)) =
 *     1962 ATK → 803 · 1967 ATK → 807 · 1985 ATK → 820
 * The mirror below uses a plain final ATK (no weapon pct) so the panel ATK equals the
 * validated in-game value exactly. V2's +100% crit-vs-Overburn remains recorded/deferred
 * (no engine implementation exists — not part of this validation).
 */

function guideDef(panelAtk: number): CharacterDef {
  const c = structuredClone(QIONGJIU);
  c.id = "gj";
  c.base = { ...c.base, atk: panelAtk, critRate: 0 };
  c.weapon = { ...c.weapon, atkLvl1: 0, atkLvl60: 0, subStats: [] }; // panel ATK == base ATK
  return c;
}

function guideDamage(def: CharacterDef): number {
  const r = simulateScenario(
    {
      version: 1,
      seed: 7,
      turns: 1,
      team: [{ characterId: "gj", rotation: ["active2"], equippedFixedKeys: [] }],
      dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: ["burn"], phase: null, cover: "none" },
      configOverrides: { fortificationLevel: 6 }, // V6 → Steady Plan Lv3: No-Cover as a single +20% total
    },
    customRegistry({ gj: def }),
  );
  const ev = r.log.find((e) => e.action === "qiongjiu_guide_to_victory")!;
  assert.equal(ev.critical, false, "no crit in these controlled runs (critRate 0)");
  return ev.finalDamage;
}

test("Guide to Victory Lv1: 1962 ATK → 803 (validated, in-game)", () => {
  assert.equal(guideDamage(guideDef(1962)), 803);
});

test("Guide to Victory Lv1: 1967 ATK → 807 (validated, in-game)", () => {
  assert.equal(guideDamage(guideDef(1967)), 807);
});

test("Guide to Victory Lv1: 1985 ATK → 820 (validated, in-game)", () => {
  assert.equal(guideDamage(guideDef(1985)), 820);
});

test("Guide to Victory: V2 crit-vs-Overburn remains deferred data, not engine behavior", () => {
  // The +100% crit rate vs Overburn-inflicted targets is recorded in the Lv2 variant as a
  // deferredNote (no target-has-status crit condition exists in the engine). This test pins
  // that state so nobody mistakes the recorded source fact for an implemented mechanic.
  const lv2 = QIONGJIU.skills.active2.levels[2];
  assert.equal(lv2.damageCategory, "aoe");
  assert.ok(lv2.deferredNote?.includes("critical rate of this attack by 100%"), "V2 behavior stays recorded+deferred");
  assert.equal(lv2.multiplier, 1.1, "V2 has the same damage multiplier as Lv1");
});