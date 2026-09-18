import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState, weaponAtk } from "../engine/state.js";
import { REGISTRY } from "../data/registry.js";
import { scenario } from "./helpers.js";
import type { Scenario } from "../model/types.js";

/**
 * WEAPON IDENTITY / EQUIPMENT + WEAPON REGISTRY (2026):
 * - Weapons are REUSABLE registry definitions equipped via `ScenarioTeamMember.weaponId` (1
 *   Weapon Slot per character) and resolved through `Registry.getWeapon`.
 * - A character NEVER inherits a weapon from its definition; absent `weaponId` = no weapon.
 * - Unknown weapon ids are rejected with a clear error.
 */

test("Golden Melody ('jinshizou') resolves from the registry with 369 max-level ATK and +15% ATK", () => {
  const w = REGISTRY.getWeapon("jinshizou")!;
  assert.ok(w, "Golden Melody registered");
  assert.equal(w.name, "Jinshizou (金石奏)");
  assert.equal(w.rarity, "elite");
  assert.equal(w.atkLvl60, 369, "max-level ATK 369");
  assert.deepEqual(w.subStats, [{ stat: "pctAtk", value: 0.15 }], "+15% ATK sub-stat");
  assert.equal(weaponAtk(w), 369);
});

test("Qiongjiu with weaponId 'jinshizou' resolves Golden Melody and keeps the established panel (1832)", () => {
  const st = createState(
    {
      ...scenario({ turns: 1 }),
      team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], weaponId: "jinshizou" }],
    },
    REGISTRY,
    new Set(),
  );
  const u = st.units[0];
  assert.equal(u.weapon?.id, "jinshizou", "resolved through the weapon registry");
  assert.equal(u.panelAtk, 1832, "ceil((1224 + 369) × 1.15) — Golden Melody 369 ATK + 15% ATK%");
});

test("Unknown weaponId throws a clear error", () => {
  const sc: Scenario = {
    ...scenario({ turns: 1 }),
    team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], weaponId: "definitely_not_a_weapon" }],
  };
  assert.throws(() => simulateScenario(sc, REGISTRY), /Unknown weapon: definitely_not_a_weapon/);
});

test("A character WITHOUT weaponId equips NO weapon — nothing is inherited from the character", () => {
  const st = createState(
    {
      ...scenario({ turns: 1 }),
      team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [] }],
    },
    REGISTRY,
    new Set(),
  );
  const u = st.units[0];
  assert.equal(u.weapon, null, "no weapon equipped");
  assert.equal(u.panelAtk, 1224, "base panel only — no weapon ATK or ATK% sub-stat folds in");
});