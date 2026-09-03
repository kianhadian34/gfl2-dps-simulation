import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { scenario } from "./helpers.js";

// Confirmed in-game (2026-09-03, research §3.11 / U11):
//   Common Rail has Cooldown 1. Manual cast Turn 1 → unavailable Turn 2 →
//   available Turn 3. A CD-N skill requires N full turns to pass after the
//   cast turn — NOT "available on the next turn".
// Engine: DEFAULT cooldownModel = "nextOwnTurnEnd" implements this (cd+1
// effective); "endOfOwnTurn" remains as a selectable alternative hypothesis.

// rotation ["active1"] alone: Turn 2 must fall back to basic (skill on CD),
// Turn 3 must cast again — the exact confirmed Turn 1 → Turn 3 behavior.
const CD1_RUN = () => scenario({ turns: 3, seed: 11, rotation: ["active1"], keys: [] });

test("CD 1 cast Turn 1 → unavailable Turn 2 → available Turn 3 (confirmed in-game)", () => {
  const r = simulateScenario(CD1_RUN());
  assert.deepEqual(
    r.log.map((e) => e.action),
    ["qiongjiu_common_rail", "qiongjiu_basic", "qiongjiu_common_rail"],
  );
  // Turn 2 is a fallback basic (rotation contains only the cd-1 skill).
  assert.equal(r.log[1].actionType, "basic");
  // Turn 3 casts Common Rail again.
  assert.equal(r.log[2].action, "qiongjiu_common_rail");
});

test("explicit nextOwnTurnEnd override is identical to the confirmed default", () => {
  const dflt = simulateScenario(CD1_RUN());
  const explicit = simulateScenario(scenario({ turns: 3, seed: 11, rotation: ["active1"], keys: [], config: { cooldownModel: "nextOwnTurnEnd" } }));
  assert.equal(JSON.stringify(dflt.log), JSON.stringify(explicit.log));
});

test("endOfOwnTurn alternative hypothesis is still selectable (testing only)", () => {
  const alt = simulateScenario(scenario({ turns: 3, seed: 11, rotation: ["active1"], keys: [], config: { cooldownModel: "endOfOwnTurn" } }));
  assert.deepEqual(alt.log.map((e) => e.action), ["qiongjiu_common_rail", "qiongjiu_common_rail", "qiongjiu_common_rail"]);
});

test("deterministic: identical inputs reproduce the confirmed Turn 1→Turn 3 sequence exactly", () => {
  const a = simulateScenario(CD1_RUN());
  const b = simulateScenario(CD1_RUN());
  assert.equal(JSON.stringify(a.log), JSON.stringify(b.log));
  assert.deepEqual(a.log.map((e) => e.action), ["qiongjiu_common_rail", "qiongjiu_basic", "qiongjiu_common_rail"]);
});