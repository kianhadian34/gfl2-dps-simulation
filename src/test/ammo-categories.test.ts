import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { abilities, customRegistry, makeAlly } from "./helpers.js";
import type { AmmoType, CharacterDef, Element, SkillDefVariant } from "../model/types.js";

/**
 * Ammo weakness CATEGORIES — authoritative game terminology (2026):
 * heavy / medium / light / shotgun / melee. These tests prove the newly
 * representable categories work through the generic tag-equality pipeline
 * (no new mechanics) and that the attack/target distinction is preserved
 * (an attack without an ammo category never exploits `melee`).
 */

function makeAmmoChar(id: string, ammo: AmmoType | undefined, mult = 1.0): CharacterDef {
  const base = makeAlly("base", 1000);
  const skill: SkillDefVariant = {
    id: `${id}_basic`,
    name: "Hit",
    type: "basic",
    element: "physical",
    multiplier: mult,
    stabDamage: 0,
    cooldown: 0,
    confectanceCost: 0,
  };
  if (ammo !== undefined) skill.ammoType = ammo;
  const noop: SkillDefVariant = { ...skill, id: `${id}_noop`, name: "-", multiplier: 0 };
  return {
    ...base,
    id,
    name: id,
    skills: abilities({ basic: skill, active1: noop, active2: noop, ultimate: noop }),
  };
}

function run(char: CharacterDef, weaknessTags: AmmoType[], weaknesses: Element[] = []) {
  const reg = customRegistry({ [char.id]: char });
  return simulateScenario(
    {
      version: 1,
      seed: 7,
      turns: 1,
      team: [{ characterId: char.id, rotation: ["basic"], equippedFixedKeys: [] }],
      dummy: { id: "dummy", name: "d", hp: 999999999, defense: 5000, stability: 0, weaknesses, weaknessTags, phase: null, cover: "none" },
    },
    reg,
  );
}

const BASE = 167; // def_ratio = 1000/(1+5000/1000) = 500/3 = 166.6667 → ceil = 167 (no weakness)
function expected(factor: number): number {
  // Exact rational: def_ratio = 500/3 per 1.0 multiplier → ceil(500×factor/3). Avoids fp edge cases.
  return Math.ceil((500 * factor) / 3);
}

test("newly representable categories: heavy and light ammo exploit their target weakness via generic tag equality", () => {
  const heavy = run(makeAmmoChar("heavy_doll", "heavy_ammo"), ["heavy_ammo"]);
  const hv = heavy.log.find((e) => e.action === "heavy_doll_basic")!;
  assert.deepEqual(hv.weaknessExploited, ["heavy_ammo"], "heavy tag matched via includes()");
  assert.equal(hv.finalDamage, expected(1.1), "heavy: ×1.10 single weakness");
  assert.ok(hv.finalDamage > BASE, "exploited weakness deals more than the no-weakness baseline");

  const light = run(makeAmmoChar("light_doll", "light_ammo"), ["light_ammo"], ["physical"]);
  const lv = light.log.find((e) => e.action === "light_doll_basic")!;
  assert.deepEqual(lv.weaknessExploited, ["physical", "light_ammo"], "element + ammo categories co-exploit");
  assert.equal(lv.finalDamage, expected(1.2), "light: 1 + 0.10×2 additive");
});

test("melee: valid TARGET weakness category only — an attack without ammoType never exploits it", () => {
  const r = run(makeAmmoChar("no_ammo_doll", undefined), ["melee"]);
  const ev = r.log.find((e) => e.action === "no_ammo_doll_basic")!;
  assert.deepEqual(ev.weaknessExploited, [], "no ammo → no ammo-weakness exploit");
  assert.equal(ev.finalDamage, BASE, "melee-target-only weakness ignored without an ammo category");
  // A melee-typed attack DOES exploit it through the ordinary tag-equality path:
  const melee = run(makeAmmoChar("melee_doll", "melee"), ["melee"]);
  const mv = melee.log.find((e) => e.action === "melee_doll_basic")!;
  assert.deepEqual(mv.weaknessExploited, ["melee"]);
  assert.equal(mv.finalDamage, expected(1.1), "melee ammo exploit ×1.10");
});