import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { customRegistry } from "./helpers.js";
import type { CharacterDef } from "../model/types.js";

// U15a partial-match — VALIDATED in-game (2026).
// A target may DISPLAY many weaknesses, but the weakness multiplier counts ONLY
// the weaknesses actually MATCHED/exploited by the attack: 1 matched → ×1.10,
// 2 matched → ×1.20. Unmatched exposed weaknesses contribute nothing.
//
// Validated setup (Qiongjiu ATK 1974, Common Rail Lv.2 = Burn AR 150% ATK,
// base stab 3, no cover, bracket ×1.20 no-cover+V6 folded into the mirror):
//   target exposes ~10 weaknesses (elemental + ammo); the attack matches/exploits
//   ONLY Burn + Assault Rifle Ammo (2 matched). TARGET DEF 5000 (the damages
//   reproduce with DEF 5000; the '1295' in the source notes is Qiongjiu's own DEF).
//   Observed: normal 1207 / crit 1491 / normal 1207.
//   Math: 1974 × 1.50 × (1974/(1974+5000)) × 1.20 × 1.20 ≈ 1206.9 → 1207;
//         unrounded × 1.235 ≈ 1490.5 → 1491.
// Conclusion: TOTAL displayed weaknesses do NOT determine the multiplier — only
// matched weaknesses count.

const ATK = 1974;
const MULT = 1.5; // Common Rail
const DEF = 5000;

function makeCommonRail(id: string, critRate: number, critDmg: number): CharacterDef {
  return {
    id,
    name: id,
    phase: "burn",
    base: { atk: ATK, hp: 1000, def: 100, stability: 6, critRate, critDmg },
    weapon: { id: `${id}_w`, name: "w", rarity: "standard", atkLvl1: 0, atkLvl60: 0, level: 60, subStats: [] },
    skills: {
      basic: { id: `${id}_rail`, name: "Common Rail", type: "basic", element: "burn", ammoType: "assault_rifle_ammo", multiplier: MULT, stabDamage: 3, cooldown: 0, confectanceCost: 0 },
      active1: { id: `${id}_a1`, name: "-", type: "active", element: "burn", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      active2: { id: `${id}_a2`, name: "-", type: "active", element: "burn", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      ultimate: { id: `${id}_ult`, name: "-", type: "ultimate", element: "burn", multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 3 },
    },
    passive: {
      id: `${id}_passive`,
      name: "-",
      // 1.20 bracket = 0.10 passive no-cover + 0.10 V6 (folded explicitly, as validated).
      effects: [{ kind: "conditional_damage_modifier", scope: "dealt", mode: "additive", value: 0.2, when: "target.noCover" }],
    },
    fixedKeys: [],
  };
}

/** Target exposing MANY weaknesses (all 6 elements + both ammo types = 8 displayed), matching only Burn + AR ammo. */
function run(c: CharacterDef) {
  return simulateScenario(
    {
      version: 1,
      seed: 13,
      turns: 1,
      team: [{ characterId: c.id, rotation: ["basic"], equippedFixedKeys: [] }],
      dummy: {
        id: "training_dummy",
        name: "Training Dummy",
        hp: 999999999,
        defense: DEF,
        stability: 65,
        weaknesses: ["physical", "burn", "electric", "ice", "acid", "decay"],
        weaknessTags: ["assault_rifle_ammo", "shotgun_ammo"],
        phase: null,
        cover: "none",
      },
    },
    customRegistry({ [c.id]: c }),
  );
}

test("U15a partial-match: 8 displayed weaknesses, 2 matched (Burn + AR ammo) → ×1.20 → 1207 (validated)", () => {
  const ev = run(makeCommonRail("a", 0, 0.2)).log[0];
  assert.equal(ev.finalDamage, 1207); // validated normal
  // ONLY the matched pair is exploited — the other 6 displayed weaknesses contribute nothing.
  assert.deepEqual(ev.weaknessExploited, ["burn", "assault_rifle_ammo"]);
  // Formula identity from the logged inputs: base × ATK/(ATK+DEF) × 1.20 bracket × 1.20 matched.
  const expected = Math.ceil(ev.baseDamage! * (ev.attackerAtk! / (ev.attackerAtk! + ev.targetDef!)) * ev.bonusBracket * 1.2);
  assert.equal(ev.finalDamage, expected);
  assert.equal(ev.stabilityDamage, 7); // base 3 + 2 × 2 matched (weakness-stability rule intact)
});

test("U15a partial-match crit: unrounded × 1.235 → 1491 (validated)", () => {
  const ev = run(makeCommonRail("c", 1, 0.235)).log[0];
  assert.equal(ev.critical, true);
  assert.equal(ev.finalDamage, 1491); // validated crit
});

test("U15a partial-match sequence: 1207 / 1491 / 1207 (validated observation pattern)", () => {
  const samples = [1207, 1491, 1207];
  for (let i = 0; i < samples.length; i++) {
    const ev = run(makeCommonRail(`s${i}`, i === 1 ? 1 : 0, i === 1 ? 0.235 : 0.2)).log[0];
    assert.equal(ev.finalDamage, samples[i], `sample ${i + 1}`);
  }
});