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
  // Confirmed start = 3 → the ultimate is castable on turn 1; after the cost is
  // spent (0), damage gains (+1 per hit) rebuild: r4→3 → r5 ultimate again.
  const r = simulateScenario(scenario({ turns: 5, rotation: ["ultimate", "basic"], keys: [] }));
  assert.deepEqual(actionsOf(r), [
    "qiongjiu_pressing_momentum",
    "qiongjiu_basic",
    "qiongjiu_basic",
    "qiongjiu_basic",
    "qiongjiu_pressing_momentum",
  ]);
});

test("falls back to basic when every rotation slot is unavailable", () => {
  // Rotation holds only the ultimate; a non-default start of 0 forces it
  // unavailable every turn → fallback basic (override honored).
  const r = simulateScenario(scenario({ turns: 3, rotation: ["ultimate"], keys: [], config: { confectanceStart: 0 } }));
  assert.deepEqual(actionsOf(r), ["qiongjiu_basic", "qiongjiu_basic", "qiongjiu_basic"]);
});

test("cooldown model (U11 CONFIRMED): CD-1 cast Turn N → unavailable N+1 → available N+2", () => {
  // rotation holds only the cd-1 skill; Turn 2 must fall back to basic
  // (proving unavailability), Turn 3 must be castable again.
  const r = simulateScenario(scenario({ turns: 3, rotation: ["active1"] }));
  assert.deepEqual(actionsOf(r), ["qiongjiu_common_rail", "qiongjiu_basic", "qiongjiu_common_rail"]);
});