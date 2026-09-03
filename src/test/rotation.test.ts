import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { scenario } from "./helpers.js";

function actionsOf(r: { log: { action: string }[] }): string[] {
  return r.log.map((e) => e.action);
}

test("fixed rotation cycles through the declared slots", () => {
  const r = simulateScenario(scenario({ turns: 4, rotation: ["active1", "basic"] }));
  assert.deepEqual(actionsOf(r), [
    "qiongjiu_common_rail",
    "qiongjiu_basic",
    "qiongjiu_common_rail",
    "qiongjiu_basic",
  ]);
});

test("ultimate is only used when Confectance covers its cost (rotation scans ahead)", () => {
  // No FK1 key → start 0; basic deals damage → +1 per hit; ultimate costs 3.
  const r = simulateScenario(scenario({ turns: 5, rotation: ["ultimate", "basic"], keys: [] }));
  assert.deepEqual(actionsOf(r), [
    "qiongjiu_basic",
    "qiongjiu_basic",
    "qiongjiu_basic",
    "qiongjiu_pressing_momentum",
    "qiongjiu_basic",
  ]);
});

test("falls back to basic when every rotation slot is unavailable", () => {
  // Rotation has only the ultimate; with 0 Confectance the first actions fall back to basic.
  const r = simulateScenario(scenario({ turns: 3, rotation: ["ultimate"], keys: [] }));
  assert.deepEqual(actionsOf(r), ["qiongjiu_basic", "qiongjiu_basic", "qiongjiu_basic"]);
});

test("cooldown model (U11 CONFIRMED): CD-1 cast Turn N → unavailable N+1 → available N+2", () => {
  // rotation holds only the cd-1 skill; Turn 2 must fall back to basic
  // (proving unavailability), Turn 3 must be castable again.
  const r = simulateScenario(scenario({ turns: 3, rotation: ["active1"] }));
  assert.deepEqual(actionsOf(r), ["qiongjiu_common_rail", "qiongjiu_basic", "qiongjiu_common_rail"]);
});