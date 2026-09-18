import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { abilities, customRegistry } from "./helpers.js";
import type { CharacterDef, Element, SkillDefVariant } from "../model/types.js";

/**
 * ELEMENT TAXONOMY (2026) — terminology + the new Hydro phase element.
 * Renames (mechanics preserved exactly): ice → freeze, acid → corrosion.
 * New: hydro, a distinct phase element added to the established generic Phase
 * Weakness rules — NO special Hydro mechanics.
 * physical/decay are REMOVED from the element vocabulary (Physical = the Ammo dimension;
 * decay is not part of the taxonomy) — the tests below confirm they are not phase weaknesses.
 *
 * Test math: ATK 1000, DEF 0, multiplier 1.0 → base = 1000.
 * makeElem carries NO no-cover dealt bonus → bracket = 1.0.
 * A matched phase weakness adds ×1.10 (count-driven additive) and +2 stability.
 * No weakness: 1000, stab 1. One matched: 1000 × 1.10 = 1100, stab 3.
 */

/** Minimal elemental action builder (mirrors helpers.abilities' SkillDefVariant shape). */
function elemSkill(id: string, name: string, element: Element, multiplier: number, stabDamage: number): SkillDefVariant {
  return { id, name, type: "basic", element, multiplier, stabDamage, cooldown: 0, confectanceCost: 0 };
}

/** Doll whose basic attack carries the given element (everything else minimal). */
function makeElem(id: string, element: Element): CharacterDef {
  return {
    id,
    name: id,
    phase: element,
    base: { atk: 1000, hp: 1000, def: 300, stability: 6, critRate: 0, critDmg: 0.2 },
    skills: abilities({
      basic: elemSkill(`${id}_basic`, "Hit", element, 1.0, 1),
      active1: elemSkill(`${id}_a1`, "-", element, 0, 0),
      active2: elemSkill(`${id}_a2`, "-", element, 0, 0),
      ultimate: elemSkill(`${id}_ult`, "-", element, 0, 0),
    }),
    passive: { id: `${id}_passive`, name: "-", effects: [] },
    fixedKeys: [],
  };
}

function run(c: CharacterDef, weaknesses: string[]): { finalDamage: number; weaknessExploited: string[]; stabilityDamage: number } {
  const r = simulateScenario(
    {
      version: 1,
      seed: 7,
      turns: 1,
      team: [{ characterId: c.id, rotation: ["basic"], equippedFixedKeys: [] }],
      dummy: { id: "d", name: "d", hp: 999999999, defense: 0, stability: 65, weaknesses: weaknesses as never, phase: null, cover: "none" },
    },
    customRegistry({ [c.id]: c }),
  );
  const ev = r.log.find((e) => e.action === `${c.id}_basic`)!;
  assert.ok(ev.finalDamage !== undefined, "basic hit records final damage");
  assert.ok(ev.stabilityDamage !== undefined, "basic hit records stability damage");
  return { finalDamage: ev.finalDamage, weaknessExploited: ev.weaknessExploited, stabilityDamage: ev.stabilityDamage };
}

test("freeze (renamed from ice): freeze attack matches Freeze weakness → ×1.10, stab+2", () => {
  const hit = run(makeElem("fz", "freeze"), ["freeze"]);
  assert.deepEqual(hit.weaknessExploited, ["freeze"]);
  assert.equal(hit.finalDamage, 1100); // 1000 × 1.10 (matched phase weakness)
  assert.equal(hit.stabilityDamage, 3); // 1 base + 2 matched
});

test("freeze without the weakness: no exploit, plain hit", () => {
  const hit = run(makeElem("fz", "freeze"), []);
  assert.deepEqual(hit.weaknessExploited, []);
  assert.equal(hit.finalDamage, 1000); // bracket 1.0, no weakness
  assert.equal(hit.stabilityDamage, 1);
});

test("corrosion (renamed from acid): corrosion attack matches Corrosion weakness → ×1.10, stab+2", () => {
  const hit = run(makeElem("cr", "corrosion"), ["corrosion"]);
  assert.deepEqual(hit.weaknessExploited, ["corrosion"]);
  assert.equal(hit.finalDamage, 1100);
  assert.equal(hit.stabilityDamage, 3);
});

test("hydro (NEW distinct element): hydro attack matches Hydro weakness → ×1.10, stab+2", () => {
  const hit = run(makeElem("hy", "hydro"), ["hydro"]);
  assert.deepEqual(hit.weaknessExploited, ["hydro"]);
  assert.equal(hit.finalDamage, 1100);
  assert.equal(hit.stabilityDamage, 3);
});

test("hydro is a DISTINCT element: hydro attack does NOT match Burn weakness", () => {
  const hit = run(makeElem("hy", "hydro"), ["burn"]);
  assert.deepEqual(hit.weaknessExploited, []);
  assert.equal(hit.finalDamage, 1000);
  assert.equal(hit.stabilityDamage, 1);
});

test("no cross-matching between the phase elements (freeze vs corrosion, burn attack vs hydro weakness)", () => {
  assert.deepEqual(run(makeElem("fz", "freeze"), ["corrosion"]).weaknessExploited, []);
  assert.deepEqual(run(makeElem("bu", "burn"), ["hydro"]).weaknessExploited, []);
});

test("burn matches Burn → ×1.10, stab+2", () => {
  const hit = run(makeElem("bu", "burn"), ["burn"]);
  assert.deepEqual(hit.weaknessExploited, ["burn"]);
  assert.equal(hit.finalDamage, 1100);
  assert.equal(hit.stabilityDamage, 3);
});

test("electric matches Electric → ×1.10, stab+2", () => {
  const hit = run(makeElem("el", "electric"), ["electric"]);
  assert.deepEqual(hit.weaknessExploited, ["electric"]);
  assert.equal(hit.finalDamage, 1100);
  assert.equal(hit.stabilityDamage, 3);
});
