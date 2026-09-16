import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { abilities, customRegistry } from "./helpers.js";
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

test("Guide to Victory V2: target WITH Overburn → guaranteed critical (VALIDATED)", () => {
  // Guide has CD 1, so the ally applies / extends Overburn first; Qiongjiu's Lv2 Guide then
  // fires with the target already carrying Overburn. (a) with Overburn → always crit:
  const def = guideDef(1962);
  const r = simulateScenario(v2Run(def, 3, ["active2", "active2", "basic"]), customRegistry({ gj: def, ally: overburnAlly() }));
  const guides = r.log.filter((e) => e.action === "qiongjiu_guide_to_victory");
  assert.equal(guides.length, 2, "two Guide casts (r1 + r3, CD-gated)");
  for (const g of guides) {
    assert.equal(g.critical, true, "V2 always crits while the target has Overburn");
  }
  // (b) without Overburn → no V2 crit condition (ordinary table; critRate 0 ⇒ non-crit):
  const solo = simulateScenario(
    { ...v2Run(def, 1, ["active2"]), team: [{ characterId: "gj", rotation: ["active2"] as never, equippedFixedKeys: [] }] },
    customRegistry({ gj: def }),
  );
  const soloGuide = solo.log.find((e) => e.action === "qiongjiu_guide_to_victory")!;
  assert.equal(soloGuide.critical, false, "no Overburn on the target → no guaranteed crit");
});

test("Guide to Victory V2: +100% crit is scoped to the V2 attack only (no permanent Crit Rate change)", () => {
  const def = guideDef(1962);
  const r = simulateScenario(v2Run(def, 3, ["active2", "active2", "basic"]), customRegistry({ gj: def, ally: overburnAlly() }));
  const basic = r.log.find((e) => e.action === "qiongjiu_basic")!;
  assert.ok(basic, "a Basic runs while Overburn is still on the target (Guide on CD)");
  assert.equal(basic.critical, false, "Basic with Overburn present does NOT crit (V2 condition is attack-scoped)");
  assert.equal(QIONGJIU.base.critRate, 0.2, "Qiongjiu data Crit Rate is untouched by V2");
  assert.equal(def.base.critRate, 0, "mirror Crit Rate unchanged across the run");
});

test("Guide to Victory V2: only the Lv2 variant carries the conditional, Lv1 is unchanged", () => {
  assert.equal(QIONGJIU.skills.active2.levels[2].guaranteedCritWhenHasStatus, "overburn");
  assert.equal(QIONGJIU.skills.active2.levels[1].guaranteedCritWhenHasStatus, undefined);
  assert.equal(QIONGJIU.skills.active2.levels[2].multiplier, 1.1, "V2 has the same damage multiplier as Lv1");
  // Lv1 validated numbers are unchanged (V6 no-cover bracket):
  assert.equal(guideDamage(guideDef(1962)), 803);
});

/** Ally whose basic applies Overburn (3 turns) to the dummy so a Guide V2 attack hits an Overburned target. */
function overburnAlly(): CharacterDef {
  const base = { id: "ally", name: "ally", phase: null, base: { atk: 900, hp: 1000, def: 300, stability: 6, critRate: 0, critDmg: 0.2 }, weapon: { id: "aw", name: "w", rarity: "standard" as const, atkLvl1: 0, atkLvl60: 0, level: 60, subStats: [] } };
  const basic = { id: "ally_basic", name: "Ally Hit", type: "basic", element: null, multiplier: 1.0, stabDamage: 1, cooldown: 0, confectanceCost: 0, appliesStatuses: [{ statusId: "overburn", durationRounds: 3, target: "target" }] } as const;
  const noop = { ...basic, id: "ally_noop", multiplier: 0, appliesStatuses: undefined };
  return {
    ...base,
    fixedKeys: [],
    passive: { id: "ally_passive", name: "-", effects: [] },
    skills: abilities({ basic: basic as never, active1: noop as never, active2: noop as never, ultimate: noop as never }),
  };
}

/** V2 validation run: Qiongjiu Guide Lv2 (fortificationLevel 2) rotation; optional Overburn-provider ally. */
function v2Run(def: CharacterDef, turns: number, gjRotation: string[]): Parameters<typeof simulateScenario>[0] {
  return {
    version: 1,
    seed: 7,
    turns,
    team: [
      { characterId: "ally", rotation: ["basic", "basic", "basic"], equippedFixedKeys: [] },
      { characterId: "gj", rotation: gjRotation as never, equippedFixedKeys: [] },
    ],
    dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" },
    configOverrides: { fortificationLevel: 2 }, // V2 → Guide to Victory Lv.2
  };
}