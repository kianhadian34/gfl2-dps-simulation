import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState, weaponAtk, weaponCalibration } from "../engine/state.js";
import { REGISTRY } from "../data/registry.js";
import { customRegistry, scenario } from "./helpers.js";
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
  assert.throws(() => simulateScenario(sc, customRegistry({})), /Unknown weapon: definitely_not_a_weapon/);
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

test("calibration C1 resolves correctly (equipped-weapon configuration), no calibration ⇒ no Effect", () => {
  const c1 = createState(
    {
      ...scenario({ turns: 1 }),
      team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], weaponId: "jinshizou", calibrationLevel: 1 }],
    },
    REGISTRY,
    new Set(),
  ).units[0];
  assert.equal(c1.weaponCalibrationLevel, 1, "member's calibrationLevel is the effective level");
  assert.deepEqual(weaponCalibration(c1.weapon, c1.weaponCalibrationLevel), {
    damageDealt: 0.1,
    charging: { perStackValue: 0.1, maxStacks: 2, stacksPerGain: 1 },
  });
  const none = createState(
    {
      ...scenario({ turns: 1 }),
      team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], weaponId: "jinshizou" }],
    },
    REGISTRY,
    new Set(),
  ).units[0];
  assert.equal(none.weaponCalibrationLevel, undefined, "no member/def calibration ⇒ no Effect");
  assert.equal(weaponCalibration(none.weapon, none.weaponCalibrationLevel), undefined);
});

test("calibration C6 resolves correctly (Damage Dealt +20%, Charging +20%/stack, max 4)", () => {
  const c6 = createState(
    {
      ...scenario({ turns: 1 }),
      team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], weaponId: "jinshizou", calibrationLevel: 6 }],
    },
    REGISTRY,
    new Set(),
  ).units[0];
  assert.equal(c6.weaponCalibrationLevel, 6);
  assert.deepEqual(weaponCalibration(c6.weapon, c6.weaponCalibrationLevel), {
    damageDealt: 0.2,
    charging: { perStackValue: 0.2, maxStacks: 4, stacksPerGain: 2 },
  });
});

test("calibration never changes the weapon's max-level base stats (panel + weapon ATK identical at C1 vs C6)", () => {
  const panelFor = (calibrationLevel: number | undefined) =>
    createState(
      {
        ...scenario({ turns: 1 }),
        team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], weaponId: "jinshizou", calibrationLevel }],
      },
      REGISTRY,
      new Set(),
    ).units[0].panelAtk;
  assert.equal(panelFor(1), 1832, "C1: ceil((1224+369)×1.15)");
  assert.equal(panelFor(6), 1832, "C6: identical max-level base stats");
  assert.equal(weaponAtk(REGISTRY.getWeapon("jinshizou")!), 369, "weapon ATK untouched by calibration");
});

test("invalid calibration levels are rejected (out of C1–C6, non-integer, or without a weaponId)", () => {
  const run = (calibrationLevel: number | undefined, weaponId?: string) =>
    createState(
      {
        ...scenario({ turns: 1 }),
        team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], weaponId, calibrationLevel }],
      },
      REGISTRY,
      new Set(),
    );
  assert.throws(() => run(0, "jinshizou"), /Invalid weapon calibrationLevel/);
  assert.throws(() => run(7, "jinshizou"), /Invalid weapon calibrationLevel/);
  assert.throws(() => run(1.5, "jinshizou"), /Invalid weapon calibrationLevel/);
  assert.throws(() => run(1), /calibrationLevel requires a weaponId/);
});

