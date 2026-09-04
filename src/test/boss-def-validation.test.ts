import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { customRegistry } from "./helpers.js";
import type { CharacterDef, DummyConfig } from "../model/types.js";

// U14 — current boss DEF data validation (in-game displayed stats, 2026):
//   HP 17,671,507 · ATK 1,490 · DEF 5,001 · Stability 175 · CR 0% · CDMG 100% · Mobility 0 · Stability DMG Reduction 60%.
// Only DEF (5,001) is U14 scope. The other displayed stats are recorded here as
// target DATA and are NOT asserted — they belong to other items (e.g. Stability).
// DEF is a TARGET-SPECIFIC value: boss rotations change data, never engine code.
const CURRENT_BOSS: DummyConfig = {
  id: "current_boss",
  name: "Current Boss",
  hp: 17_671_507,
  defense: 5_001, // U14 CONFIRMED in-game (current tested target)
  stability: 175,
  weaknesses: [],
  phase: null,
  cover: "none",
};

/** Plain, deterministic attacker: critRate 0, no passive → bracket 1.0, no crits. */
function makeAttacker(id: string, atk: number): CharacterDef {
  return {
    id,
    name: id,
    phase: "physical",
    base: { atk, hp: 1000, def: 100, stability: 6, critRate: 0, critDmg: 0.2 },
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

const ATK = 1958; // mirrors the in-game character ATK so the DEF factor is exact: 1958/(1958+5001) = 1958/6959

function run(def: number): ReturnType<typeof simulateScenario> {
  const attacker = makeAttacker("u14_a", ATK);
  return simulateScenario(
    {
      version: 1,
      seed: 1,
      turns: 1,
      team: [{ characterId: attacker.id, rotation: ["basic"], equippedFixedKeys: [] }],
      dummy: { ...CURRENT_BOSS, defense: def },
    },
    customRegistry({ [attacker.id]: attacker }),
  );
}

test("U14: current boss DEF 5,001 is represented as target data and applied by the engine", () => {
  const r = run(5_001);
  const ev = r.log[0];
  assert.equal(ev.targetDef, 5_001, "the engine records the configured target DEF (5,001)");
  assert.equal(ev.attackerAtk, ATK);
  // U14 does not change the confirmed DEF factor — ATK/(ATK+DEF) — it pins the DATA point.
  const expected = Math.ceil(ATK * (ATK / (ATK + 5_001)));
  assert.equal(ev.finalDamage, expected, "final = ceil(ATK × ATK/(ATK+5001))");
  assert.equal(ev.finalDamage > 0, true);
});

test("U14: boss DEF is per-target data — a different DEF flows through without engine changes", () => {
  const r0 = run(0);
  assert.equal(r0.log[0].targetDef, 0);
  assert.equal(r0.log[0].finalDamage, ATK); // DEF 0 → factor 1.0
  const rLow = run(100);
  assert.equal(rLow.log[0].targetDef, 100);
  assert.notEqual(rLow.log[0].finalDamage, r0.log[0].finalDamage);
  // Same engine, same attacker — only the target data changed (future boss rotation).
  assert.equal(rLow.log[0].targetDef > 0, true);
});