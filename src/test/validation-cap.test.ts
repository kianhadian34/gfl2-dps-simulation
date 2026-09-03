import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { MAX_TURNS } from "../engine/state.js";
import { scenario } from "./helpers.js";

test("1-turn simulation works", () => {
  const r = simulateScenario(scenario({ turns: 1, rotation: ["basic"] }));
  assert.equal(r.totals.actions, 1);
  assert.equal(r.log.length, 1);
  assert.equal(r.totals.damagePerRound, r.totals.damage);
});

test("7-turn simulation works (MVP cap)", () => {
  const r = simulateScenario(scenario({ turns: 7, rotation: ["basic"] }));
  assert.equal(r.totals.actions, 7);
  assert.equal(r.log.length, 7);
});

test("durations 8 and above are rejected with a clear error, never clamped", () => {
  for (const t of [8, 9, 100]) {
    assert.throws(() => simulateScenario(scenario({ turns: t })), /between 1 and 7/, `turns=${t} must be rejected`);
  }
});

test("durations 0, negative, and non-integers are rejected", () => {
  for (const t of [0, -3, 2.5]) {
    assert.throws(() => simulateScenario(scenario({ turns: t })), /between 1 and 7/);
  }
});

test("MAX_TURNS is exactly 7 and is a single source of truth", () => {
  assert.equal(MAX_TURNS, 7);
});

test("fixed-rotation behavior across all 7 turns is deterministic", () => {
  const run = () => scenario({ turns: 7, seed: 99, rotation: ["active1", "basic"], keys: [] });
  const a = simulateScenario(run());
  const b = simulateScenario(run());
  assert.equal(JSON.stringify(a.log), JSON.stringify(b.log));
  assert.equal(a.log.length, 7);
  assert.deepEqual(
    a.log.map((e) => e.action),
    [
      "qiongjiu_common_rail",
      "qiongjiu_basic",
      "qiongjiu_common_rail",
      "qiongjiu_basic",
      "qiongjiu_common_rail",
      "qiongjiu_basic",
      "qiongjiu_common_rail",
    ],
  );
});

test("manual 4-turn rotation: Skill1 → Skill2 → Basic → Ultimate (validation walkthrough)", () => {
  const r = simulateScenario(
    scenario({ turns: 4, rotation: ["active1", "active2", "basic", "ultimate"], keys: ["qiongjiu_fk1_concentration"] }),
  );
  assert.deepEqual(
    r.log.map((e) => e.action),
    [
      "qiongjiu_common_rail", // Turn 1: Skill 1
      "qiongjiu_guide_to_victory", // Turn 2: Skill 2
      "qiongjiu_basic", // Turn 3: Basic
      "qiongjiu_pressing_momentum", // Turn 4: Ultimate (Confectance 6 ≥ cost 3)
    ],
  );
});