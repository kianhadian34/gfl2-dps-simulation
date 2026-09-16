import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { customRegistry } from "./helpers.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import type { CharacterDef } from "../model/types.js";

/**
 * DAMAGE CATEGORY (2026, DESCRIPTIVE ONLY): `SkillDefVariant.damageCategory` is "targeted" |
 * "aoe" per the authoritative in-game skill class. It describes the DAMAGE CATEGORY — NOT
 * target selection ("first enemy within 8 tiles in the selected direction" is a separate,
 * unmodeled concept). No engine mechanic reads the field: it must never alter damage,
 * stability, weakness, crit, confectance, or support behavior. Optional; set only with
 * authoritative evidence.
 */

test("damageCategory: Guide to Victory Lv1 and Lv2 are classified 'aoe'", () => {
  assert.equal(QIONGJIU.skills.active2.levels[1].damageCategory, "aoe");
  assert.equal(QIONGJIU.skills.active2.levels[2].damageCategory, "aoe");
});

test("damageCategory: no other Qiongjiu skill carries the field (authoritative-evidence-only)", () => {
  const checked = [
    QIONGJIU.skills.basic.levels[1],
    QIONGJIU.skills.active1.levels[1],
    QIONGJIU.skills.active1.levels[2],
    QIONGJIU.skills.ultimate.levels[1],
    QIONGJIU.skills.ultimate.levels[2],
    QIONGJIU.skills.ultimate.levels[3],
    QIONGJIU.skills.support!.levels[1],
  ];
  for (const v of checked) {
    assert.equal(v.damageCategory, undefined, `${v.id} Lv.: damageCategory must stay unset without authoritative evidence`);
  }
});

/** Clone of the Qiongjiu def with `damageCategory` stripped from every variant. */
function withoutDamageCategory(def: CharacterDef): CharacterDef {
  const c = structuredClone(def);
  for (const slot of ["basic", "active1", "active2", "ultimate", "support"] as const) {
    for (const v of Object.values(c.skills[slot]?.levels ?? {})) {
      delete (v as { damageCategory?: string }).damageCategory;
    }
  }
  return c;
}

function guideRun(def: CharacterDef, fortificationLevel: number): number[] {
  const r = simulateScenario(
    {
      version: 1,
      seed: 7,
      turns: 1,
      team: [{ characterId: "qiongjiu", rotation: ["active2"], equippedFixedKeys: [] }],
      dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" },
      configOverrides: { fortificationLevel },
    },
    customRegistry({ qiongjiu: def }),
  );
  return r.log.map((e) => e.finalDamage ?? 0);
}

test("damageCategory: stripping the field produces IDENTICAL runtime damage (no consumer exists)", () => {
  const withField = QIONGJIU;
  const stripped = withoutDamageCategory(QIONGJIU);
  assert.equal(withField.skills.active2.levels[1].damageCategory, "aoe");
  assert.equal(stripped.skills.active2.levels[1].damageCategory, undefined, "strip worked");
  // Lv1 (no fortification) and Lv2 (V2) Guide executions are bit-for-bit identical:
  assert.deepEqual(guideRun(withField, 0), guideRun(stripped, 0), "Lv1 damage identical with/without damageCategory");
  assert.deepEqual(guideRun(withField, 2), guideRun(stripped, 2), "Lv2 damage identical with/without damageCategory");
  assert.ok(guideRun(withField, 0)[0] > 0, "Guide still deals damage through the normal pipeline");
});