import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildScenario, DEFAULT_SETUP, equipmentOf, setPermanentCookingStats, type SetupState } from "../src/shared/setup.js";
import { cookingStatsLines } from "../src/shared/lists.js";
import type { ScenarioView } from "../src/shared/engine-types.js";

/**
 * PERMANENT COOKING STATS UI (2026) — DATA-LAYER + PRESENTATION CONTRACT.
 *
 * The React control layer is a thin shell over the pure helpers in setup.ts. These tests pin the UI
 * behaviour: a per-character on/off toggle that carries VERBATIM into the engine scenario and is
 * OFF by default (the engine owns the actual values — the UI never duplicates them).
 *
 * The engine tests (src/test/permanent-cooking-stats.test.ts) remain authoritative for engine math;
 * this file asserts UI plumbing only.
 */

const srcFile = (rel: string): string => join(dirname(fileURLToPath(import.meta.url)), rel);

function setupWith(charOverrides: Record<string, unknown> = {}): SetupState {
  return {
    ...DEFAULT_SETUP,
    characters: [{ id: "qiongjiu", name: "Qiongjiu", selected: true, ...charOverrides }],
    rotations: { qiongjiu: ["basic"] },
  };
}

test("cooking stats UI: the toggle is OFF by default (absent in the default setup AND the scenario)", () => {
  assert.equal(DEFAULT_SETUP.characters.length, 0, "no character defaults to cooking stats");
  const s = setupWith();
  assert.equal(equipmentOf(s.characters[0]).permanentCookingStats, undefined, "absent by default");
  const sc: ScenarioView = buildScenario(s);
  assert.equal(sc.team[0].permanentCookingStats, undefined, "not emitted into the engine scenario when never enabled");
});

test("cooking stats UI: enabling sets the flag; disabling removes it entirely (legacy shape preserved)", () => {
  let s = setupWith();
  s = setPermanentCookingStats(s, "qiongjiu", true);
  assert.equal(equipmentOf(s.characters[0]).permanentCookingStats, true);
  s = setPermanentCookingStats(s, "qiongjiu", false);
  assert.equal(equipmentOf(s.characters[0]).permanentCookingStats, undefined, "off clears the field (not `false`)");
  assert.ok(!("permanentCookingStats" in equipmentOf(s.characters[0])), "the key is removed, not set to false");
});

test("cooking stats UI: the flag carries VERBATIM into the engine scenario", () => {
  const s = setPermanentCookingStats(setupWith(), "qiongjiu", true);
  const sc: ScenarioView = buildScenario(s);
  assert.equal(sc.team[0].permanentCookingStats, true, "carried verbatim — the engine owns the values");
});

test("cooking stats UI: it is PER CHARACTER — enabling one member leaves the others untouched", () => {
  let s: SetupState = {
    ...DEFAULT_SETUP,
    characters: [
      { id: "qiongjiu", name: "Qiongjiu", selected: true },
      { id: "basic_attack_dummy", name: "Dummy", selected: true },
    ],
    rotations: { qiongjiu: ["basic"], basic_attack_dummy: ["basic"] },
  };
  s = setPermanentCookingStats(s, "qiongjiu", true);
  const sc: ScenarioView = buildScenario(s);
  const byId = Object.fromEntries(sc.team.map((m) => [m.characterId, m]));
  assert.equal(byId.qiongjiu.permanentCookingStats, true, "the enabled member carries the flag");
  assert.equal(byId.basic_attack_dummy.permanentCookingStats, undefined, "the other member is unaffected");
});

test("cooking stats UI: toggling an unknown character is a safe no-op", () => {
  const s = setupWith();
  const after = setPermanentCookingStats(s, "does_not_exist", true);
  assert.deepEqual(after, s, "unknown id → unchanged state");
});

test("cooking stats UI: the Setup screen renders a labelled toggle + the engine-sourced values in the green stat style", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("Permanent Cooking Stats"), "a labelled section exists");
  assert.ok(s.includes("Enable Permanent Cooking Stats"), "an explicit enable checkbox");
  assert.ok(s.includes('type="checkbox"'), "rendered as a checkbox (Enabled/Disabled)");
  assert.ok(s.includes("checked={equ.permanentCookingStats === true}"), "its state comes from the member's equipment");
  assert.ok(s.includes("setPermanentCookingStats(props.setup, c.id, e.target.checked)"), "wired to the shared helper");
  // The values come from the ENGINE over IPC and are rendered as GREEN stat lines (the same
  // presentation class the Affinity bonus row uses) — the UI never hardcodes the numbers.
  assert.ok(s.includes("cookingStatsLines(cookingStats)"), "the displayed lines are built from the engine-sourced values");
  assert.ok(s.includes("getPermanentCookingStats"), "the values are fetched over IPC from the engine");
  assert.ok(s.includes('className="affinity-level-bonus-stat"'), "shown with the shared green stat style");
  // The values are only shown when enabled.
  assert.ok(s.includes("equ.permanentCookingStats === true ? ("), "the values appear only while the toggle is on");
});

test("cooking stats UI: cookingStatsLines renders ATK/HP/DEF from the values (green-row content)", () => {
  assert.deepEqual(cookingStatsLines({ atk: 15, hp: 30, def: 15 }), ["ATK +15", "HP +30", "DEF +15"]);
  assert.deepEqual(cookingStatsLines(null), [], "no values → no lines");
  assert.deepEqual(cookingStatsLines(undefined), [], "undefined → no lines");
  assert.deepEqual(cookingStatsLines({ atk: 0, hp: 0, def: 0 }), [], "all-zero → no lines");
});
