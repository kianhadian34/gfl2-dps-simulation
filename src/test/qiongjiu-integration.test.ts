import { test } from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import type { DummyConfig, Scenario } from "../model/types.js";
import { REGISTRY } from "../data/registry.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { customRegistry } from "./helpers.js";

/**
 * QIONGJIU — REAL-CHARACTER INTEGRATION / SANITY (layer 3).
 *
 * This is the ONE place where the tests intentionally assert Qiongjiu's LIVE panel with ALL currently
 * implemented permanent stat systems active:
 *   base 802/1893/528
 *   + Dispatch (Sentinel class)          +231 / +519 / +222
 *   + Pattern Remolder Lv.60 flats        +245 / +651 / +224
 *   + Neural Helix flat                  +196 ATK / +333 HP / +92 DEF
 *   then the percentage buckets          ×1.22 ATK (NH 10% + 12%) · ×1.12 HP · ×1.12 DEF
 *
 * These values ARE ALLOWED TO CHANGE when a legitimate permanent stat system is added — that is the
 * whole point of isolating them here. The math/system tests (final-stat-rounding, dispatch-*,
 * remolder-*, …) use controlled fixtures and must NOT be re-baselined for such a change.
 */
const dummy: DummyConfig = { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" };

function realQj(extra: Partial<Scenario["team"][number]> = {}): Scenario {
  return {
    version: 1,
    seed: 7,
    turns: 1,
    // REAL character run — production semantics (no fixture flag): every permanent source applies.
    team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], ...extra }],
    dummy,
  };
}

test("real Qiongjiu: live panel with all implemented permanent systems (ATK 1799 / HP 3804 / DEF 1194)", () => {
  const u = createState(realQj(), REGISTRY, new Set()).units[0];
  assert.equal(QIONGJIU.class, "sentinel", "Sentinel class drives the Dispatch row");
  assert.deepEqual(QIONGJIU.remolderFlat, { atk: 245, hp: 651, def: 224 }, "Remolder Lv.60 flats (character data)");
  assert.equal(QIONGJIU.neuralHelixStats?.atk, 196, "Neural Helix flat ATK (character data)");
  assert.equal(QIONGJIU.neuralHelixStats?.atkPct, 0.1, "Neural Helix character ATK% (two +5% tabs)");

  assert.equal(u.panelAtk, 1799, "ceil((802 + 231 + 245 + 196) × 1.22)");
  assert.equal(u.hp, 3804, "ceil((1893 + 519 + 651 + 333 NH) × 1.12)");
  assert.equal(u.maxHp, 3804);
  assert.equal(u.defStat, 1194, "ceil((528 + 222 + 224 + 92 NH) × 1.12)");
  assert.equal(u.stability, 9);
});

test("real Qiongjiu with the signature weapon: live panel folds weapon flat + weapon ATK% then the live ATK%", () => {
  const u = createState(realQj({ weaponId: "jinshizou" }), REGISTRY, new Set()).units[0];
  // computePanel: ceil((base 802 + dispatch 231 + Remolder 245 + NH 196 + weapon 369) × 1.15) = 2119,
  // then the live 22% ATK% bucket: ceil(2119 × 1.22) = 2587.
  assert.equal(u.panelAtk, 2587, "ceil(ceil((802 + 231 + 245 + 196 + 369) × 1.15) × 1.22)");
});

test("real Qiongjiu at Affinity Lv.5 with a +22 flat-ATK non-signature weapon: panel 1966", () => {
  // Stat sanity check: the +22 weapon flat enters the SAME flat bucket, folded BEFORE the ATK%.
  //   flat = base 802 + dispatch 231 + Remolder 245 + NH 196 + affinity Lv.5 flat 115 + weapon 22 = 1611
  //   ATK% = NH 10% + universal 12% = 22% (Affinity Lv.5 has NO percentage map)
  //   panel = ceil(1611 × 1.22) = ceil(1965.42) = 1966
  const reg = customRegistry({}); // resolves the test-only `weapon_flat22_test` fixture
  const u22 = createState(realQj({ affinityLevel: 5, weaponId: "weapon_flat22_test" }), reg, new Set()).units[0];
  assert.equal(u22.panelAtk, 1966, "ceil((802 + 231 + 245 + 196 + 115 + 22) × 1.22)");

  // Control: the SAME basis with NO weapon → 1939. The delta is exactly the +22 flat × 1.22 → +27.
  const uNo = createState(realQj({ affinityLevel: 5 }), reg, new Set()).units[0];
  assert.equal(uNo.panelAtk, 1939, "ceil((802 + 231 + 245 + 196 + 115) × 1.22)");
  assert.equal(u22.panelAtk - uNo.panelAtk, 27, "a +22 flat ATK is worth +27 panel ATK through the live 1.22 multiplier");
});
