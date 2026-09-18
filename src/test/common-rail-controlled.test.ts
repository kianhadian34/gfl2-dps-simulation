import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { customRegistry } from "./helpers.js";
import type { CharacterDef } from "../model/types.js";
import type { GridConfig } from "../model/grid.js";

/**
 * CONTROLLED COMMON RAIL DAMAGE TEST (TEST ONLY — no mechanic/FK5 changes).
 * Qiongjiu: panel ATK 2022 (plain weapon), NO Fixed Keys, Common Rail Lv1 (150% ATK, Burn,
 * Medium Ammo). Target: DEF 5000, Exposed, Burn phase weakness, No Cover. No crit.
 *
 * ENGINE MATH (every applicable modifier):
 *   base         = 2022 × 1.50 = 3033
 *   defense ratio= ATK/(ATK+DEF) = 2022/7022 = 0.287952
 *   mitigated    = 3033 × 0.287952 = 873.35
 *   DMG% bracket = 1 + 0.10 (Steady Plan Lv1 No-Cover +10%; nothing else) = 1.10
 *                  (V6 run: No-Cover as a SINGLE +0.20 total → 1.20)
 *   phaseMult    = 1.0 (no element counter; structural neutral)
 *   Burn weakness= ×1.10 → weaknessMult = 1.10
 *   Exposed      = NO damage modifier (U3 resolved: no universal Exposed multiplier)
 *   Stability    = no cover/stability reduction rule (cover none)
 *   Final DMG red= none
 *   crit         = none (rate 0; runtime confirms critical:false)
 *   final        = ceil(873.35 × bracket × 1.10)
 *       Lv1: ceil(873.35 × 1.10 × 1.10)            = ceil(1056.76) = 1057
 *       V6 : ceil(873.35 × 1.20 × 1.10)            = ceil(1152.82) = 1153
 * (1153 reproduced exactly from these inputs ⇒ the earlier 1153 EXPECTATION equals the V6
 *  +20% No-Cover interpretation; it is NOT a Lv1 result. 1186 would require an extra ~2.9%
 *  modifier not present in this controlled state.)
 */

function mirror2022(): CharacterDef {
  const qj = structuredClone(QIONGJIU);
  qj.id = "qjf";
  qj.base = { ...qj.base, atk: 2022, critRate: 0 };
  return qj;
}

function run(fortificationLevel: number, grid?: GridConfig) {
  return simulateScenario(
    {
      version: 1, seed: 7, turns: 1,
      team: [{ characterId: "qjf", rotation: ["active1"], equippedFixedKeys: [] }],
      dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: ["burn"], phase: null, cover: "none" },
      configOverrides: { fortificationLevel },
      ...(grid ? { grid } : {}),
    },
    customRegistry({ qjf: mirror2022() }),
  );
}

test("controlled Common Rail: Lv1 (No-Cover +10%) → 1057", () => {
  const ev = run(0).log.find((e) => e.action === "qiongjiu_common_rail")!;
  assert.equal(ev.critical, false);
  assert.equal(ev.attackerAtk, 2022);
  assert.equal(ev.targetDef, 5000);
  assert.deepEqual(ev.weaknessExploited, ["burn"]);
  assert.equal(ev.finalDamage, 1057);
});

test("controlled Common Rail: V6 (No-Cover +20% total) → 1153 (matches the earlier expected 1153)", () => {
  const ev = run(6).log.find((e) => e.action === "qiongjiu_common_rail")!;
  assert.equal(ev.critical, false);
  assert.equal(ev.finalDamage, 1153);
});

test("controlled Common Rail: Exposed adds NO damage (U3 — no universal Exposed multiplier)", () => {
  // High-Ground attacker vs Ground target marks the target EXPOSED for the hit; with no
  // exposed-gated bonus, the damage must be identical to the non-exposed run.
  const grid: GridConfig = {
    size: 15,
    units: [{ unitId: "qjf", coord: { x: 7, y: 7 }, height: "high" }],
    boss: { center: { x: 7, y: 9 }, footprintSide: 1, height: "ground" },
    highTiles: [{ x: 7, y: 7 }], // the unit's tile must BE high ground (height-consistency rule)
    enemyUnits: [],
    blockedTiles: [],
    moves: [],
  };
  const ev = run(6, grid).log.find((e) => e.action === "qiongjiu_common_rail")!;
  // The target is treated as Exposed for the hit (High Ground vs Ground) — and since no
  // exposed-gated bonus exists on QJ, Exposed contributes NO damage (U3: no universal
  // Exposed multiplier): the damage is identical to the non-exposed V6 run.
  assert.equal(ev.finalDamage, 1153, "Exposed alone contributes no damage modifier");
});
