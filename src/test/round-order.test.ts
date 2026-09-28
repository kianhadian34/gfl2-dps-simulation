import test from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { REGISTRY } from "../data/registry.js";
import type { Scenario } from "../model/types.js";

/**
 * PER-ROUND ACTION ORDER (2026) — the ORDER OF ACTIONS MAY CHANGE each round:
 * roundOrder[round] is a permutation of the team; absent → team order. Validated: every
 * member exactly once per listed round (no skips — Pass is not a feature).
 */

const TARGET = {
  id: "training_dummy",
  name: "Training Dummy",
  hp: 999999999,
  defense: 5000,
  stability: 100,
  weaknesses: [],
  phase: null,
  cover: "none",
};

function run(roundOrder?: Record<number, string[]>): ReturnType<typeof simulateScenario> {
  return simulateScenario(
    {
      version: 1,
      seed: 7,
      turns: 2,
      team: [
        { characterId: "qiongjiu", rotation: ["basic", "basic"], equippedFixedKeys: [] },
        { characterId: "basic_attack_dummy", rotation: ["basic", "basic"], equippedFixedKeys: [] },
      ],
      dummy: TARGET,
      ...(roundOrder ? { roundOrder } : {}),
    } as Scenario,
    REGISTRY,
  );
}

test("round order defaults to team order every round (Qiongjiu then dummy)", () => {
  const r = run();
  const mains = r.log.filter((e) => ["qiongjiu_basic", "basic_attack_dummy_basic"].includes(e.action)).map((e) => e.action);
  assert.deepEqual(mains, ["qiongjiu_basic", "basic_attack_dummy_basic", "qiongjiu_basic", "basic_attack_dummy_basic"], "team order both rounds");
});

test("per-round order: round 1 Qiongjiu first, round 2 dummy first — roundOrder[2] swaps them", () => {
  const r = run({ 2: ["basic_attack_dummy", "qiongjiu"] });
  const mains = r.log
    .filter((e) => ["qiongjiu_basic", "basic_attack_dummy_basic"].includes(e.action))
    .map((e) => e.action);
  assert.deepEqual(mains, ["qiongjiu_basic", "basic_attack_dummy_basic", "basic_attack_dummy_basic", "qiongjiu_basic"], "round 1: QJ first; round 2: dummy first");
  // Support chain reflects the round-2 order: the round-2 dummy hit happens BEFORE QJ's round-2 basic.
  const round2 = r.log.filter((e) => e.round === 2);
  const seq = round2.map((e) => e.action);
  assert.ok(seq.indexOf("basic_attack_dummy_basic") < seq.indexOf("qiongjiu_basic"), "round 2 dummy acts first → its hit can trigger support");
  assert.ok(round2.some((e) => e.action === "qiongjiu_support"), "support fires in round 2 via the existing ally-hit pipeline");
});

test("round order must be a full permutation — missing member is a clear error (no implicit skip)", () => {
  assert.throws(
    () => run({ 1: ["qiongjiu"] }),
    /roundOrder must list every team unit exactly once/,
  );
});

test("round order must be a full permutation — duplicate member is rejected", () => {
  assert.throws(
    () => run({ 1: ["qiongjiu", "qiongjiu"] }),
    /roundOrder must list every team unit exactly once/,
  );
});